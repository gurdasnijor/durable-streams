/**
 * Stream data-plane router. Routes are composed with `HttpRouter` (the Effect
 * web-framework abstraction); the module exports a `router`, not handler
 * constants. Request->store mapping and store-decision->response lowering are
 * private route-local functions beside the routes that use them. The pure wire
 * schemas/constants live in `../schema.ts` + `../headers.ts` (Store-free); this
 * module is the only place the wire meets `Store`.
 */
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform"
import { Effect, Option } from "effect"
import * as ProtocolError from "../ProtocolError.ts"
import * as Wire from "../schema.ts"
import {
  PRODUCER_EPOCH,
  PRODUCER_EXPECTED_SEQ,
  PRODUCER_RECEIVED_SEQ,
  PRODUCER_SEQ,
  REQ_CONTENT_TYPE,
  STREAM_CLOSED,
  STREAM_NEXT_OFFSET,
  STREAM_UP_TO_DATE,
} from "../headers.ts"
import * as Store from "../Store.ts"

const RESERVED = `__ds`

/** Read the wildcard stream path from the route context, guarding reserved `__ds`. */
const streamPath = Effect.gen(function* () {
  const { params } = yield* HttpRouter.RouteContext
  const splat = params[`*`] ?? ``
  if (splat === RESERVED || splat.startsWith(`${RESERVED}/`)) {
    return yield* new ProtocolError.NotFound({ path: splat })
  }
  return splat
})

/** Raw request bytes (the data plane is raw bytes; a transport failure is a defect). */
const rawBody = HttpServerRequest.HttpServerRequest.pipe(
  Effect.flatMap((request) => Effect.orDie(request.arrayBuffer)),
  Effect.map((buffer) => new Uint8Array(buffer))
)

const lowerError = (
  error: ProtocolError.ProtocolError
): HttpServerResponse.HttpServerResponse => {
  switch (error._tag) {
    case `NotFound`:
      return HttpServerResponse.empty({ status: 404 })
    case `BadRequest`:
      return HttpServerResponse.empty({ status: 400 })
    case `CreateConflict`:
      return HttpServerResponse.empty({ status: 409 })
    case `RetentionGone`:
      return HttpServerResponse.empty({ status: 410 })
  }
}

const handle = <R>(
  effect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    ProtocolError.ProtocolError,
    R
  >
) => effect.pipe(Effect.catchAll((e) => Effect.succeed(lowerError(e))))

// --- request -> store input (private) -------------------------------------

const toAppendInput = (path: Store.StreamPath, body: Uint8Array) =>
  HttpServerRequest.schemaHeaders(Wire.AppendHeaders).pipe(
    Effect.mapError(
      () => new ProtocolError.BadRequest({ reason: `invalid request headers` })
    ),
    Effect.flatMap((h) => {
      // All three producer headers are required together (PRODUCERS).
      let producer: Option.Option<Store.Producer>
      if (
        h.producerId !== undefined &&
        h.producerEpoch !== undefined &&
        h.producerSeq !== undefined
      ) {
        producer = Option.some({
          id: h.producerId,
          epoch: h.producerEpoch,
          seq: h.producerSeq,
        })
      } else if (
        h.producerId !== undefined ||
        h.producerEpoch !== undefined ||
        h.producerSeq !== undefined
      ) {
        return Effect.fail(
          new ProtocolError.BadRequest({
            reason: `incomplete producer headers`,
          })
        )
      } else {
        producer = Option.none()
      }
      return Effect.succeed({
        path,
        contentType: Wire.normalizeContentType(h.contentType),
        body,
        close: (h.streamClosed ?? ``).toLowerCase() === `true`,
        streamSeq: Option.fromNullable(h.streamSeq),
        producer,
      } satisfies Store.AppendInput)
    })
  )

const toCreateInput = (path: Store.StreamPath, body: Uint8Array) =>
  HttpServerRequest.schemaHeaders(Wire.CreateHeaders).pipe(
    Effect.mapError(
      () => new ProtocolError.BadRequest({ reason: `invalid request headers` })
    ),
    Effect.map(
      (h) =>
        ({
          path,
          contentType: Wire.normalizeContentType(h.contentType),
          body,
          close: (h.streamClosed ?? ``).toLowerCase() === `true`,
        }) satisfies Store.CreateInput
    )
  )

// --- store decision -> response (private) ---------------------------------

const toAppendResponse = (
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
      // F1 (PRODUCERS.8): epoch advance with non-zero seq -> "new epoch must
      // start at seq 0" is a malformed request (400). A normal in-epoch gap has
      // expected >= 1 -> 409 with expected/received headers.
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

const toCreateResponse = (
  decision: Store.CreateDecision,
  contentType: string
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.empty({
    // 201 on fresh create, 200 on idempotent create with matching config.
    status: decision._tag === `Created` ? 201 : 200,
    headers: {
      [STREAM_NEXT_OFFSET]: decision.tail,
      ...(contentType ? { [REQ_CONTENT_TYPE]: contentType } : {}),
      ...(decision.closed ? { [STREAM_CLOSED]: `true` } : {}),
    },
  })

/** A weak ETag that varies with closure status (READS.2). */
const etagFor = (chunk: Store.ReadChunk, start: string): string =>
  `"${start}:${chunk.nextOffset}:${chunk.closed ? `c` : `o`}"`

const toReadResponse = (
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

const toHeadResponse = (
  tail: Store.StreamTail
): HttpServerResponse.HttpServerResponse =>
  HttpServerResponse.empty({
    status: 200,
    headers: {
      [STREAM_NEXT_OFFSET]: tail.tailOffset,
      ...(tail.contentType ? { [REQ_CONTENT_TYPE]: tail.contentType } : {}),
      ...(tail.closed ? { [STREAM_CLOSED]: `true` } : {}),
    },
  })

// --- routes (private handlers) --------------------------------------------

const create = handle(
  Effect.gen(function* () {
    const path = yield* streamPath
    const body = yield* rawBody
    const input = yield* toCreateInput(path, body)
    const decision = yield* Store.Store.pipe(
      Effect.flatMap((store) => store.createStream(input)),
      Effect.tap((d) =>
        Effect.annotateCurrentSpan(`ds.create.decision`, d._tag)
      ),
      Effect.withSpan(`stream.create`, { attributes: { "ds.stream": path } })
    )
    return toCreateResponse(decision, input.contentType)
  })
)

const append = handle(
  Effect.gen(function* () {
    const path = yield* streamPath
    const body = yield* rawBody
    const input = yield* toAppendInput(path, body)
    // Observation seam: the append DECISION (producer validation + epoch/seq
    // outcome) is annotated on the `stream.append` span.
    const result = yield* Store.Store.pipe(
      Effect.flatMap((store) => store.append(input)),
      Effect.tap((r) =>
        Effect.annotateCurrentSpan(`ds.append.decision`, r.append._tag)
      ),
      Effect.withSpan(`stream.append`, {
        attributes: {
          "ds.stream": path,
          "ds.close": input.close,
          "ds.producer": Option.isSome(input.producer),
        },
      })
    )
    return toAppendResponse(result.append)
  })
)

const head = handle(
  Effect.gen(function* () {
    const path = yield* streamPath
    const tail = yield* Store.Store.pipe(
      Effect.flatMap((store) => store.head(path))
    )
    return toHeadResponse(tail)
  })
)

const read = handle(
  Effect.gen(function* () {
    const path = yield* streamPath
    const offset = yield* HttpServerRequest.schemaSearchParams(
      Wire.ReadParams
    ).pipe(
      Effect.map((p) => p.offset ?? `-1`),
      Effect.orDie
    )
    const chunk = yield* Store.Store.pipe(
      Effect.flatMap((store) => store.read(path, offset)),
      Effect.withSpan(`stream.read`, {
        attributes: { "ds.stream": path, "ds.offset": offset },
      })
    )
    return toReadResponse(chunk, offset)
  })
)

const remove = handle(
  Effect.gen(function* () {
    const path = yield* streamPath
    yield* Store.Store.pipe(Effect.flatMap((store) => store.deleteStream(path)))
    return HttpServerResponse.empty({ status: 204 })
  })
)

/**
 * The stream data-plane router. The wildcard `/v1/stream/*` carries the full
 * slash-containing stream path; the reserved `__ds` guard (in `streamPath`)
 * rejects unmatched control paths so they never create a user stream
 * (HTTP.7 / CONFORMANCE.9).
 */
export const router = HttpRouter.empty.pipe(
  HttpRouter.put(`/v1/stream/*`, create),
  HttpRouter.post(`/v1/stream/*`, append),
  HttpRouter.head(`/v1/stream/*`, head),
  HttpRouter.get(`/v1/stream/*`, read),
  HttpRouter.del(`/v1/stream/*`, remove)
)
