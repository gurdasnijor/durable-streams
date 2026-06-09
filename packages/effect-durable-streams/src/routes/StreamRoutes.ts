/**
 * Thin stream-plane route handlers: decode the request, call the `Store`, lower
 * the decision to a response. No protocol state lives here.
 *
 * Reserved-path guard (HTTP.7 / CONFORMANCE.9): the wildcard `/v1/stream/*`
 * carries the full slash-containing stream path in `params["*"]` (verified
 * against the installed find-my-way-ts router). A stream path whose first
 * stream-root-relative segment is `__ds` is a reserved control path; this slice
 * has no control handlers, so any `__ds/*` request is rejected with 404 and
 * never creates a user stream. Normal slash-containing paths
 * (`rooms/general/messages`) pass through untruncated.
 */
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"
import * as ProtocolError from "../ProtocolError.ts"
import * as Protocol from "../protocol.ts"
import * as Store from "../Store.ts"

const RESERVED_SEGMENT = "__ds"

/** True when the resolved stream path is under the reserved control namespace. */
const isReserved = (path: string): boolean =>
  path === RESERVED_SEGMENT || path.startsWith(`${RESERVED_SEGMENT}/`)

/** Read the wildcard-matched stream path, guarding reserved control paths. */
const resolvePath = Effect.gen(function* () {
  const ctx = yield* HttpRouter.RouteContext
  const splat = ctx.params["*"] ?? ""
  if (isReserved(splat)) {
    return yield* new ProtocolError.NotFound({ path: splat })
  }
  return splat
})

const readBody = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  // A body-read transport failure is a defect, not a protocol error; do not
  // widen the route's typed error channel.
  return new Uint8Array(yield* Effect.orDie(request.arrayBuffer))
})

/** Lower a `ProtocolError` to its HTTP status. */
const protocolErrorToResponse = (
  error: ProtocolError.ProtocolError
): HttpServerResponse.HttpServerResponse => {
  switch (error._tag) {
    case "NotFound":
      return HttpServerResponse.empty({ status: 404 })
    case "BadRequest":
      return HttpServerResponse.empty({ status: 400 })
    case "CreateConflict":
      return HttpServerResponse.empty({ status: 409 })
    case "RetentionGone":
      return HttpServerResponse.empty({ status: 410 })
  }
}

const handle = <A>(
  effect: Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    ProtocolError.ProtocolError,
    A
  >
) => effect.pipe(Effect.catchAll((e) => Effect.succeed(protocolErrorToResponse(e))))

export const create = handle(
  Effect.gen(function* () {
    const path = yield* resolvePath
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* readBody
    const input = yield* Protocol.decodeCreate(request, path, body)
    const decision = yield* Store.Store.pipe(
      Effect.flatMap((store) => store.createStream(input))
    )
    return Protocol.createDecisionToResponse(decision, input.contentType)
  })
)

export const append = handle(
  Effect.gen(function* () {
    const path = yield* resolvePath
    const request = yield* HttpServerRequest.HttpServerRequest
    const body = yield* readBody
    const input = yield* Protocol.decodeAppend(request, path, body)
    const result = yield* Store.Store.pipe(
      Effect.flatMap((store) => store.append(input))
    )
    return Protocol.appendDecisionToResponse(result.append)
  })
)

export const head = handle(
  Effect.gen(function* () {
    const path = yield* resolvePath
    const tail = yield* Store.Store.pipe(
      Effect.flatMap((store) => store.head(path))
    )
    return Protocol.headToResponse(tail)
  })
)

export const read = handle(
  Effect.gen(function* () {
    const path = yield* resolvePath
    const params = yield* HttpServerRequest.HttpServerRequest.pipe(
      Effect.map((r) => new URL(r.url, "http://localhost").searchParams)
    )
    const offset = params.get("offset") ?? "-1"
    const chunk = yield* Store.Store.pipe(
      Effect.flatMap((store) => store.read(path, offset))
    )
    return Protocol.readChunkToResponse(chunk, offset)
  })
)

export const remove = handle(
  Effect.gen(function* () {
    const path = yield* resolvePath
    yield* Store.Store.pipe(Effect.flatMap((store) => store.deleteStream(path)))
    return HttpServerResponse.empty({ status: 204 })
  })
)
