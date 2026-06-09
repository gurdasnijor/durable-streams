import { HttpRouter, HttpServerRequest } from "@effect/platform"
import { Effect, Option, Schema } from "effect"
import * as ProtocolError from "../ProtocolError.ts"
import * as Wire from "../schema.ts"
import type * as Store from "../Store.ts"

const RESERVED = `__ds`

const PathParams = Schema.Struct({
  "*": Schema.optional(Schema.String),
})

export const path = HttpRouter.schemaPathParams(PathParams).pipe(
  Effect.map((params) => params[`*`] ?? ``),
  Effect.flatMap((splat) =>
    splat === RESERVED || splat.startsWith(`${RESERVED}/`)
      ? Effect.fail(new ProtocolError.NotFound({ path: splat }))
      : Effect.succeed(splat)
  )
)

export const body = HttpServerRequest.HttpServerRequest.pipe(
  Effect.flatMap((request) => Effect.orDie(request.arrayBuffer)),
  Effect.map((buffer) => new Uint8Array(buffer))
)

export const readOffset = HttpServerRequest.schemaSearchParams(
  Wire.ReadParams
).pipe(Effect.map((params) => params.offset ?? `-1`))

export const createInput = (streamPath: Store.StreamPath, bytes: Uint8Array) =>
  HttpServerRequest.schemaHeaders(Wire.CreateHeaders).pipe(
    Effect.mapError(
      () => new ProtocolError.BadRequest({ reason: `invalid request headers` })
    ),
    Effect.map(
      (headers) =>
        ({
          path: streamPath,
          contentType: Wire.normalizeContentType(headers.contentType),
          body: bytes,
          close: (headers.streamClosed ?? ``).toLowerCase() === `true`,
        }) satisfies Store.CreateInput
    )
  )

export const appendInput = (streamPath: Store.StreamPath, bytes: Uint8Array) =>
  HttpServerRequest.schemaHeaders(Wire.AppendHeaders).pipe(
    Effect.mapError(
      () => new ProtocolError.BadRequest({ reason: `invalid request headers` })
    ),
    Effect.flatMap((headers) => {
      const hasProducer =
        headers.producerId !== undefined &&
        headers.producerEpoch !== undefined &&
        headers.producerSeq !== undefined
      const hasPartialProducer =
        headers.producerId !== undefined ||
        headers.producerEpoch !== undefined ||
        headers.producerSeq !== undefined

      if (!hasProducer && hasPartialProducer) {
        return Effect.fail(
          new ProtocolError.BadRequest({
            reason: `incomplete producer headers`,
          })
        )
      }

      return Effect.succeed({
        path: streamPath,
        contentType: Wire.normalizeContentType(headers.contentType),
        body: bytes,
        close: (headers.streamClosed ?? ``).toLowerCase() === `true`,
        streamSeq: Option.fromNullable(headers.streamSeq),
        producer: hasProducer
          ? Option.some({
              id: headers.producerId,
              epoch: headers.producerEpoch,
              seq: headers.producerSeq,
            })
          : Option.none(),
      } satisfies Store.AppendInput)
    })
  )
