import { FetchHttpClient, HttpApiClient, HttpClient } from "@effect/platform"
import {
  DurableStreamsApi,
  AlreadyClaimed as ProtocolAlreadyClaimed,
  ConfigConflict as ProtocolConfigConflict,
  ProtocolError,
  Fenced as ProtocolFenced,
} from "durable-streams-protocol/Api"
import { Effect, Schema } from "effect"
import {
  AlreadyClaimed,
  ConfigConflict,
  Fenced,
  TransportError,
} from "./errors.ts"

export const makeControlClient = (baseUrl: string) =>
  HttpApiClient.make(DurableStreamsApi, {
    baseUrl,
    transformClient: HttpClient.mapRequest((request) => request),
  }).pipe(Effect.provide(FetchHttpClient.layer))

export type ControlClient = Effect.Effect.Success<
  ReturnType<typeof makeControlClient>
>

export const lowerControlError = (
  error: unknown
): ConfigConflict | AlreadyClaimed | Fenced | TransportError => {
  if (Schema.is(ProtocolConfigConflict)(error)) {
    return new ConfigConflict({ reason: error.message })
  }
  if (Schema.is(ProtocolAlreadyClaimed)(error)) {
    return new AlreadyClaimed({
      currentHolder: error.current_holder,
      generation: error.generation,
    })
  }
  if (Schema.is(ProtocolFenced)(error)) {
    return new Fenced({ generation: error.generation })
  }
  if (Schema.is(ProtocolError)(error)) {
    return new TransportError({
      cause: new Error(error.message),
    })
  }
  return new TransportError({ cause: error })
}
