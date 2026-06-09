/**
 * Route HTTP codec (the boundary ADAPTER): decode an `HttpServerRequest` into a
 * `Store` input and lower a `Store` decision into an `HttpServerResponse`. This
 * module deliberately depends on BOTH the wire schemas (`../schema.ts`,
 * `../headers.ts`) and `Store` — that is what makes it the adapter. The
 * dependency direction is: wire schema -> route adapter (this) -> store. The
 * pure wire schemas/constants live in `../schema.ts` and `../headers.ts`; no
 * `Store` type leaks into those.
 */
import { HttpServerResponse } from "@effect/platform"
import { Effect, Option, Schema } from "effect"
import * as ProtocolError from "../ProtocolError.ts"
import { UintFromString } from "../schema.ts"
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
} from "../headers.ts"
import type * as Store from "../Store.ts"
import type { HttpServerRequest } from "@effect/platform"

const CONTENT_TYPE = `content-type`

/** Normalize a content type to its media type (strip parameters), lowercased. */
const normalizeContentType = (ct: string | undefined): string => {
  if (!ct) return ``
  return ct.split(`;`)[0]!.trim().toLowerCase()
}

const headerValue = (
  headers: Record<string, string | undefined>,
  name: string
): Option.Option<string> => {
  const v = headers[name]
  return v === undefined ? Option.none() : Option.some(v)
}

// NOTE: HTTP.6 (JSON append normalization — one-level array flattening with
// preserved message boundaries) is DEFERRED / out of scope for this slice. The
// memory store is a flat byte buffer with no per-message boundary index, so it
// cannot preserve JSON message boundaries; request bodies are stored as opaque
// bytes. Full JSON mode is a separate, later piece of work.

/**
 * The producer tuple as a `Schema` over the request headers: header names map to
 * fields via `fromKey`, and `Producer-Epoch`/`Producer-Seq` decode through the
 * strict-uint transform (a malformed integer is a `ParseError`). Excess headers
 * are ignored by default. The all-or-none rule is applied after decode.
 */
const ProducerHeaders = Schema.Struct({
  id: Schema.optional(Schema.String).pipe(Schema.fromKey(REQ_PRODUCER_ID)),
  epoch: Schema.optional(UintFromString).pipe(
    Schema.fromKey(REQ_PRODUCER_EPOCH)
  ),
  seq: Schema.optional(UintFromString).pipe(Schema.fromKey(REQ_PRODUCER_SEQ)),
})
const decodeProducerHeaders = Schema.decodeUnknown(ProducerHeaders)

const decodeProducer = (
  headers: Record<string, string | undefined>
): Effect.Effect<Option.Option<Store.Producer>, ProtocolError.BadRequest> =>
  decodeProducerHeaders(headers).pipe(
    Effect.mapError(
      () =>
        new ProtocolError.BadRequest({
          reason: `invalid producer integer header`,
        })
    ),
    Effect.flatMap(({ id, epoch, seq }) => {
      const present = [id, epoch, seq].filter((v) => v !== undefined).length
      if (present === 0) return Effect.succeed(Option.none<Store.Producer>())
      // All three producer headers are required together (PRODUCERS).
      if (id === undefined || epoch === undefined || seq === undefined) {
        return Effect.fail(
          new ProtocolError.BadRequest({
            reason: `incomplete producer headers`,
          })
        )
      }
      return Effect.succeed(Option.some({ id, epoch, seq }))
    })
  )

const isClosedHeader = (headers: Record<string, string | undefined>): boolean =>
  (headers[REQ_STREAM_CLOSED] ?? ``).toLowerCase() === `true`

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
    const contentType = normalizeContentType(headers[CONTENT_TYPE])
    const close = isClosedHeader(headers)
    // Body is stored as opaque bytes (HTTP.6 JSON normalization deferred).
    return {
      path,
      contentType,
      body: rawBody,
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
  Effect.sync(() => {
    const headers = request.headers
    const contentType = normalizeContentType(headers[CONTENT_TYPE])
    const close = isClosedHeader(headers)
    // Body is stored as opaque bytes (HTTP.6 JSON normalization deferred).
    return {
      path,
      contentType,
      body: rawBody,
      close,
    } satisfies Store.CreateInput
  })

/** Lower an `AppendDecision` into the protocol HTTP response (HTTP.5). */
export const appendDecisionToResponse = (
  decision: Store.AppendDecision
): HttpServerResponse.HttpServerResponse => {
  switch (decision._tag) {
    case `PlainAccepted`:
      return HttpServerResponse.empty({
        status: 204,
        headers: {
          [STREAM_NEXT_OFFSET]: decision.nextOffset,
          ...(decision.closed ? { [STREAM_CLOSED]: `true` } : {}),
        },
      })
    case `ProducerAccepted`:
      return HttpServerResponse.empty({
        status: 200,
        headers: {
          [STREAM_NEXT_OFFSET]: decision.nextOffset,
          [PRODUCER_EPOCH]: String(decision.producerEpoch),
          [PRODUCER_SEQ]: String(decision.highestAcceptedSeq),
          ...(decision.closed ? { [STREAM_CLOSED]: `true` } : {}),
        },
      })
    case `ProducerDuplicate`:
      return HttpServerResponse.empty({
        status: 204,
        headers: {
          [STREAM_NEXT_OFFSET]: decision.nextOffset,
          [PRODUCER_EPOCH]: String(decision.producerEpoch),
          [PRODUCER_SEQ]: String(decision.highestAcceptedSeq),
          ...(decision.closed ? { [STREAM_CLOSED]: `true` } : {}),
        },
      })
    case `ProducerFenced`:
      return HttpServerResponse.empty({
        status: 403,
        headers: { [PRODUCER_EPOCH]: String(decision.currentEpoch) },
      })
    case `ProducerGap`:
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
    case `ClosedConflict`:
      return HttpServerResponse.empty({
        status: 409,
        headers: {
          [STREAM_CLOSED]: `true`,
          [STREAM_NEXT_OFFSET]: decision.finalOffset,
        },
      })
    case `ContentTypeMismatch`:
    case `StreamSeqRegression`:
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
    ...(decision.closed ? { [STREAM_CLOSED]: `true` } : {}),
  }
  // 201 on fresh create, 200 on idempotent create with matching config.
  return HttpServerResponse.empty({
    status: decision._tag === `Created` ? 201 : 200,
    headers: baseHeaders,
  })
}

/** Compute a weak ETag that varies with closure status (READS.2). */
const etagFor = (chunk: Store.ReadChunk, start: string): string =>
  `"${start}:${chunk.nextOffset}:${chunk.closed ? `c` : `o`}"`

/** Lower a `ReadChunk` into the catch-up GET response (READS.1). */
export const readChunkToResponse = (
  chunk: Store.ReadChunk,
  requestedOffset: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.uint8Array(chunk.body, {
    contentType: chunk.contentType || `application/octet-stream`,
    headers: {
      [STREAM_NEXT_OFFSET]: chunk.nextOffset,
      ...(chunk.upToDate ? { [STREAM_UP_TO_DATE]: `true` } : {}),
      ...(chunk.closed ? { [STREAM_CLOSED]: `true` } : {}),
      etag: etagFor(chunk, requestedOffset),
      "cache-control": `no-store`,
      "x-content-type-options": `nosniff`,
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
      ...(tail.closed ? { [STREAM_CLOSED]: `true` } : {}),
    },
  })
