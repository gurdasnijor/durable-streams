import { HttpServerResponse } from "@effect/platform"
import { Context, Effect, Layer, Option } from "effect"
import * as Request from "./http/StreamRequest.ts"
import * as Response from "./http/StreamResponse.ts"
import * as Store from "./Store.ts"
import type * as ProtocolError from "./ProtocolError.ts"
import type { HttpRouter, HttpServerRequest } from "@effect/platform"
import type * as ParseResult from "effect/ParseResult"

export type StreamHttpHandler = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  ProtocolError.ProtocolError | ParseResult.ParseError,
  | HttpRouter.RouteContext
  | HttpServerRequest.HttpServerRequest
  | HttpServerRequest.ParsedSearchParams
>

export interface StreamHttpShape {
  readonly create: StreamHttpHandler
  readonly append: StreamHttpHandler
  readonly head: StreamHttpHandler
  readonly read: StreamHttpHandler
  readonly remove: StreamHttpHandler
}

export class StreamHttp extends Context.Tag(
  `@durable-streams/effect-server/StreamHttp`
)<StreamHttp, StreamHttpShape>() {}

const make = (store: Store.StoreShape): StreamHttpShape => ({
  create: Effect.gen(function* () {
    const path = yield* Request.path
    const body = yield* Request.body
    const input = yield* Request.createInput(path, body)
    const decision = yield* store.createStream(input).pipe(
      Effect.tap((d) =>
        Effect.annotateCurrentSpan(`ds.create.decision`, d._tag)
      ),
      Effect.withSpan(`stream.create`, { attributes: { "ds.stream": path } })
    )
    return Response.create(decision, input.contentType)
  }),

  append: Effect.gen(function* () {
    const path = yield* Request.path
    const body = yield* Request.body
    const input = yield* Request.appendInput(path, body)
    const result = yield* store.append(input).pipe(
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
    return Response.append(result.append)
  }),

  head: Effect.gen(function* () {
    const path = yield* Request.path
    const tail = yield* store.head(path)
    return Response.head(tail)
  }),

  read: Effect.gen(function* () {
    const path = yield* Request.path
    const offset = yield* Request.readOffset
    const chunk = yield* store.read(path, offset).pipe(
      Effect.withSpan(`stream.read`, {
        attributes: { "ds.stream": path, "ds.offset": offset },
      })
    )
    return Response.read(chunk, offset)
  }),

  remove: Effect.gen(function* () {
    const path = yield* Request.path
    yield* store.deleteStream(path)
    return HttpServerResponse.empty({ status: 204 })
  }),
})

export const layer: Layer.Layer<StreamHttp, never, Store.Store> = Layer.effect(
  StreamHttp,
  Store.Store.pipe(Effect.map(make))
)
