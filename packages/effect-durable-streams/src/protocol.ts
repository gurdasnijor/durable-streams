/**
 * HTTP decode/encode for the raw stream data plane. Routes are thin: they
 * decode an `HttpServerRequest` into a `Store` input, call the store, and lower
 * the `Store` decision back into an `HttpServerResponse`. All protocol decisions
 * live in the store; this module only translates the wire format.
 */
import { HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect, Option } from "effect"
import * as ProtocolError from "./ProtocolError.ts"
import * as Store from "./Store.ts"
import {
  PRODUCER_EPOCH,
  PRODUCER_EXPECTED_SEQ,
  PRODUCER_RECEIVED_SEQ,
  PRODUCER_SEQ,
  REQ_PRODUCER_EPOCH,
  REQ_PRODUCER_ID,
  REQ_PRODUCER_SEQ,
  REQ_STREAM_CLOSED,
  REQ_STREAM_SEQ,
  STREAM_CLOSED,
  STREAM_NEXT_OFFSET,
  STREAM_UP_TO_DATE,
} from "./headers.ts"

const CONTENT_TYPE = "content-type"
const JSON_CT = "application/json"

/** Normalize a content type to its media type (strip parameters), lowercased. */
const normalizeContentType = (ct: string | undefined): string => {
  if (!ct) return ""
  return ct.split(";")[0]!.trim().toLowerCase()
}

/** A strict non-negative integer: digits only, no sign/exponent/whitespace. */
const parseStrictUint = (raw: string): Option.Option<number> => {
  if (!/^[0-9]+$/.test(raw)) return Option.none()
  const n = Number.parseInt(raw, 10)
  return Number.isSafeInteger(n) ? Option.some(n) : Option.none()
}

const headerValue = (
  headers: Record<string, string | undefined>,
  name: string
): Option.Option<string> => {
  const v = headers[name]
  return v === undefined ? Option.none() : Option.some(v)
}

/**
 * Apply JSON append normalization (HTTP.6) for `application/json` streams:
 * one-level array flattening (the elements become the appended bytes, message
 * boundaries preserved) and empty-array rejection on POST. For the byte-store
 * model in this slice we re-serialize the flattened elements concatenated; this
 * preserves the in-scope semantics (mismatch detection, byte round-trip) while
 * full JSON-mode boundary indexing remains out of scope.
 */
const normalizeJsonAppendBody = (
  body: Uint8Array,
  isPut: boolean
): Effect.Effect<Uint8Array, ProtocolError.BadRequest> => {
  if (body.length === 0) return Effect.succeed(body)
  const text = new TextDecoder().decode(body)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // Not valid JSON; pass through unchanged (store treats it as opaque bytes).
    return Effect.succeed(body)
  }
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      // Empty array: allowed as an empty create on PUT, rejected on POST.
      if (isPut) return Effect.succeed(new Uint8Array(0))
      return Effect.fail(
        new ProtocolError.BadRequest({ reason: "empty JSON array on POST" })
      )
    }
    const flattened = parsed.map((el) => JSON.stringify(el)).join("")
    return Effect.succeed(new TextEncoder().encode(flattened))
  }
  return Effect.succeed(body)
}

const decodeProducer = (
  headers: Record<string, string | undefined>
): Effect.Effect<Option.Option<Store.Producer>, ProtocolError.BadRequest> => {
  const id = headers[REQ_PRODUCER_ID]
  const epoch = headers[REQ_PRODUCER_EPOCH]
  const seq = headers[REQ_PRODUCER_SEQ]

  const present = [id, epoch, seq].filter((v) => v !== undefined).length
  if (present === 0) return Effect.succeed(Option.none())
  // Partial producer headers -> 400 (PRODUCERS: all three required together).
  if (id === undefined || epoch === undefined || seq === undefined) {
    return Effect.fail(
      new ProtocolError.BadRequest({ reason: "incomplete producer headers" })
    )
  }
  const epochN = parseStrictUint(epoch)
  const seqN = parseStrictUint(seq)
  if (Option.isNone(epochN) || Option.isNone(seqN)) {
    return Effect.fail(
      new ProtocolError.BadRequest({ reason: "invalid producer integer header" })
    )
  }
  return Effect.succeed(
    Option.some({ id, epoch: epochN.value, seq: seqN.value })
  )
}

const isClosedHeader = (
  headers: Record<string, string | undefined>
): boolean => (headers[REQ_STREAM_CLOSED] ?? "").toLowerCase() === "true"

const pathFromSplat = (splat: string): Store.StreamPath => splat

/**
 * Decode an append (`POST`) request into a `Store.AppendInput`. Performs JSON
 * normalization and producer/seq header validation; the §5.2 precedence and
 * producer decision live entirely in the store.
 */
export const decodeAppend = (
  request: HttpServerRequest.HttpServerRequest,
  path: Store.StreamPath,
  rawBody: Uint8Array
): Effect.Effect<Store.AppendInput, ProtocolError.BadRequest> =>
  Effect.gen(function* () {
    const headers = request.headers
    const producer = yield* decodeProducer(headers)
    // F1 enforced at the HTTP boundary: an epoch advance presented with a
    // non-zero seq for a producer is a malformed request (400). (The store
    // additionally models this as ProducerGap(expected:0) for the decision
    // unit tests; the conformance HTTP probe expects 400.)
    const contentType = normalizeContentType(headers[CONTENT_TYPE])
    const close = isClosedHeader(headers)
    const body =
      contentType === JSON_CT
        ? yield* normalizeJsonAppendBody(rawBody, false)
        : rawBody
    return {
      path,
      contentType,
      body,
      close,
      streamSeq: headerValue(headers, REQ_STREAM_SEQ),
      producer,
    } satisfies Store.AppendInput
  })

export const decodeCreate = (
  request: HttpServerRequest.HttpServerRequest,
  path: Store.StreamPath,
  rawBody: Uint8Array
): Effect.Effect<Store.CreateInput, ProtocolError.BadRequest> =>
  Effect.gen(function* () {
    const headers = request.headers
    const contentType = normalizeContentType(headers[CONTENT_TYPE])
    const close = isClosedHeader(headers)
    const body =
      contentType === JSON_CT
        ? yield* normalizeJsonAppendBody(rawBody, true)
        : rawBody
    return { path, contentType, body, close } satisfies Store.CreateInput
  })

/** Lower an `AppendDecision` into the protocol HTTP response (HTTP.5). */
export const appendDecisionToResponse = (
  decision: Store.AppendDecision
): HttpServerResponse.HttpServerResponse => {
  switch (decision._tag) {
    case "PlainAccepted":
      return HttpServerResponse.empty({
        status: 204,
        headers: {
          [STREAM_NEXT_OFFSET]: decision.nextOffset,
          ...(decision.closed ? { [STREAM_CLOSED]: "true" } : {}),
        },
      })
    case "ProducerAccepted":
      return HttpServerResponse.empty({
        status: 200,
        headers: {
          [STREAM_NEXT_OFFSET]: decision.nextOffset,
          [PRODUCER_EPOCH]: String(decision.producerEpoch),
          [PRODUCER_SEQ]: String(decision.highestAcceptedSeq),
          ...(decision.closed ? { [STREAM_CLOSED]: "true" } : {}),
        },
      })
    case "ProducerDuplicate":
      return HttpServerResponse.empty({
        status: 204,
        headers: {
          [STREAM_NEXT_OFFSET]: decision.nextOffset,
          [PRODUCER_EPOCH]: String(decision.producerEpoch),
          [PRODUCER_SEQ]: String(decision.highestAcceptedSeq),
          ...(decision.closed ? { [STREAM_CLOSED]: "true" } : {}),
        },
      })
    case "ProducerFenced":
      return HttpServerResponse.empty({
        status: 403,
        headers: { [PRODUCER_EPOCH]: String(decision.currentEpoch) },
      })
    case "ProducerGap":
      // F1 (PRODUCERS.8): an epoch advance presented with a non-zero seq is the
      // ProducerGap(expected:0) decision; at the HTTP boundary the protocol
      // treats "new epoch must start at seq 0" as a malformed request -> 400.
      // A normal in-epoch sequence gap has expected >= 1 -> 409 with the
      // expected/received headers.
      return decision.expectedSeq === 0
        ? HttpServerResponse.empty({ status: 400 })
        : HttpServerResponse.empty({
            status: 409,
            headers: {
              [PRODUCER_EXPECTED_SEQ]: String(decision.expectedSeq),
              [PRODUCER_RECEIVED_SEQ]: String(decision.receivedSeq),
            },
          })
    case "ClosedConflict":
      return HttpServerResponse.empty({
        status: 409,
        headers: {
          [STREAM_CLOSED]: "true",
          [STREAM_NEXT_OFFSET]: decision.finalOffset,
        },
      })
    case "ContentTypeMismatch":
    case "StreamSeqRegression":
      return HttpServerResponse.empty({ status: 409 })
  }
}

/** Lower a `CreateDecision` into the create (`PUT`) response. */
export const createDecisionToResponse = (
  decision: Store.CreateDecision,
  contentType: string
): HttpServerResponse.HttpServerResponse => {
  const baseHeaders: Record<string, string> = {
    [STREAM_NEXT_OFFSET]: decision.tail,
    ...(contentType ? { [CONTENT_TYPE]: contentType } : {}),
    ...(decision.closed ? { [STREAM_CLOSED]: "true" } : {}),
  }
  // 201 on fresh create, 200 on idempotent create with matching config.
  return HttpServerResponse.empty({
    status: decision._tag === "Created" ? 201 : 200,
    headers: baseHeaders,
  })
}

/** Compute a weak ETag that varies with closure status (READS.2). */
const etagFor = (chunk: Store.ReadChunk, start: string): string =>
  `"${start}:${chunk.nextOffset}:${chunk.closed ? "c" : "o"}"`

/** Lower a `ReadChunk` into the catch-up GET response (READS.1). */
export const readChunkToResponse = (
  chunk: Store.ReadChunk,
  requestedOffset: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.uint8Array(chunk.body, {
    contentType: chunk.contentType || "application/octet-stream",
    headers: {
      [STREAM_NEXT_OFFSET]: chunk.nextOffset,
      ...(chunk.upToDate ? { [STREAM_UP_TO_DATE]: "true" } : {}),
      ...(chunk.closed ? { [STREAM_CLOSED]: "true" } : {}),
      etag: etagFor(chunk, requestedOffset),
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  })

/** Lower a `StreamTail` into the HEAD response. */
export const headToResponse = (
  tail: Store.StreamTail
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.empty({
    status: 200,
    headers: {
      [STREAM_NEXT_OFFSET]: tail.tailOffset,
      ...(tail.contentType ? { [CONTENT_TYPE]: tail.contentType } : {}),
      ...(tail.closed ? { [STREAM_CLOSED]: "true" } : {}),
    },
  })

export { pathFromSplat }
