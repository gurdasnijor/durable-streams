import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "@effect/platform"
import { Schema } from "effect"

export class ProtocolError extends Schema.TaggedError<ProtocolError>()(
  `ProtocolError`,
  {
    code: Schema.String,
    message: Schema.optional(Schema.String),
    current_holder: Schema.optional(Schema.String),
    generation: Schema.optional(Schema.Number),
  },
  HttpApiSchema.annotations({ status: 400 })
) {}

export class ConfigConflict extends Schema.TaggedError<ConfigConflict>()(
  `ConfigConflict`,
  {
    code: Schema.Literal(`CONFIG_CONFLICT`),
    message: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class Fenced extends Schema.TaggedError<Fenced>()(
  `Fenced`,
  {
    code: Schema.Literal(`FENCED`),
    generation: Schema.optional(Schema.Number),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class AlreadyClaimed extends Schema.TaggedError<AlreadyClaimed>()(
  `AlreadyClaimed`,
  {
    code: Schema.Literal(`ALREADY_CLAIMED`),
    current_holder: Schema.optional(Schema.String),
    generation: Schema.optional(Schema.Number),
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

export class LinkedStream extends Schema.Class<LinkedStream>(`LinkedStream`)({
  path: Schema.String,
  link_type: Schema.Literal(`glob`, `explicit`),
  acked_offset: Schema.String,
}) {}

export class PendingStream extends Schema.Class<PendingStream>(`PendingStream`)(
  {
    path: Schema.String,
    link_type: Schema.Literal(`glob`, `explicit`),
    acked_offset: Schema.String,
    tail_offset: Schema.String,
    has_pending: Schema.Boolean,
  }
) {}

export class CelFilter extends Schema.Class<CelFilter>(`CelFilter`)({
  language: Schema.Literal(`cel`),
  expression: Schema.String,
  self: Schema.optional(Schema.Unknown),
}) {}

export class WebhookConfig extends Schema.Class<WebhookConfig>(`WebhookConfig`)(
  {
    url: Schema.String,
  }
) {}

export class PullWakeSubscription extends Schema.Class<PullWakeSubscription>(
  `PullWakeSubscription`
)({
  type: Schema.Literal(`pull-wake`),
  pattern: Schema.optional(Schema.String),
  streams: Schema.optional(Schema.Array(Schema.String)),
  wake_stream: Schema.String,
  filter: Schema.optional(CelFilter),
  lease_ttl_ms: Schema.optional(Schema.Number),
  description: Schema.optional(Schema.String),
}) {}

export class WebhookSubscription extends Schema.Class<WebhookSubscription>(
  `WebhookSubscription`
)({
  type: Schema.Literal(`webhook`),
  pattern: Schema.optional(Schema.String),
  streams: Schema.optional(Schema.Array(Schema.String)),
  webhook: WebhookConfig,
  filter: Schema.optional(CelFilter),
  lease_ttl_ms: Schema.optional(Schema.Number),
  description: Schema.optional(Schema.String),
}) {}

export const SubscriptionConfig = Schema.Union(
  PullWakeSubscription,
  WebhookSubscription
)

export class SubscriptionInfo extends Schema.Class<SubscriptionInfo>(
  `SubscriptionInfo`
)({
  id: Schema.String,
  subscription_id: Schema.String,
  type: Schema.Literal(`webhook`, `pull-wake`),
  pattern: Schema.optional(Schema.String),
  streams: Schema.Array(LinkedStream),
  webhook: Schema.optional(WebhookConfig),
  wake_stream: Schema.NullOr(Schema.String),
  filter: Schema.optional(CelFilter),
  lease_ttl_ms: Schema.Number,
  status: Schema.Literal(`active`, `failed`),
  description: Schema.optional(Schema.String),
}) {}

export class ClaimRequest extends Schema.Class<ClaimRequest>(`ClaimRequest`)({
  worker: Schema.String,
}) {}

export class ClaimResponse extends Schema.Class<ClaimResponse>(`ClaimResponse`)(
  {
    wake_id: Schema.String,
    generation: Schema.Number,
    token: Schema.String,
    streams: Schema.Array(PendingStream),
    lease_ttl_ms: Schema.Number,
  }
) {}

export class AckOffset extends Schema.Class<AckOffset>(`AckOffset`)({
  stream: Schema.String,
  offset: Schema.String,
}) {}

export class AckRequest extends Schema.Class<AckRequest>(`AckRequest`)({
  wake_id: Schema.String,
  generation: Schema.Number,
  acks: Schema.optional(Schema.Array(AckOffset)),
  done: Schema.optional(Schema.Boolean),
}) {}

export class AckResponse extends Schema.Class<AckResponse>(`AckResponse`)({
  ok: Schema.Boolean,
  next_wake: Schema.Boolean,
}) {}

export class ReleaseRequest extends Schema.Class<ReleaseRequest>(
  `ReleaseRequest`
)({
  wake_id: Schema.String,
  generation: Schema.Number,
}) {}

export class ScheduleProducer extends Schema.Class<ScheduleProducer>(
  `ScheduleProducer`
)({
  id: Schema.String,
  epoch: Schema.Number,
  seq: Schema.Number,
}) {}

export class SchedulePutRequest extends Schema.Class<SchedulePutRequest>(
  `SchedulePutRequest`
)({
  at: Schema.String,
  stream: Schema.String,
  content_type: Schema.String,
  body: Schema.optional(Schema.Unknown),
  body_base64: Schema.optional(Schema.String),
  producer: Schema.optional(ScheduleProducer),
  close: Schema.optional(Schema.Boolean),
}) {}

export class ScheduleInfo extends Schema.Class<ScheduleInfo>(`ScheduleInfo`)({
  id: Schema.String,
  status: Schema.Literal(`pending`, `fired`, `cancelled`, `failed`),
  at: Schema.String,
  stream: Schema.String,
}) {}

export class Jwk extends Schema.Class<Jwk>(`Jwk`)({
  kty: Schema.String,
  crv: Schema.optional(Schema.String),
  kid: Schema.String,
  use: Schema.optional(Schema.String),
  alg: Schema.optional(Schema.String),
  x: Schema.optional(Schema.String),
}) {}

export class JwksResponse extends Schema.Class<JwksResponse>(`JwksResponse`)({
  keys: Schema.Array(Jwk),
}) {}

const subscriptionId = HttpApiSchema.param(`id`, Schema.String)
const scheduleId = HttpApiSchema.param(`id`, Schema.String)

export class DeleteStreamUrlParams extends Schema.Class<DeleteStreamUrlParams>(
  `DeleteStreamUrlParams`
)({
  path: Schema.String,
}) {}

export class SubscriptionsApi extends HttpApiGroup.make(`subscriptions`)
  .add(
    HttpApiEndpoint.put(`put`)`/${subscriptionId}`
      .setPayload(SubscriptionConfig)
      .addSuccess(SubscriptionInfo, { status: 201 })
      .addSuccess(SubscriptionInfo)
      .addError(ConfigConflict)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.get(`get`)`/${subscriptionId}`
      .addSuccess(SubscriptionInfo)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.del(`delete`)`/${subscriptionId}`.addSuccess(
      HttpApiSchema.NoContent
    )
  )
  .add(
    HttpApiEndpoint.post(`addStreams`)`/${subscriptionId}/streams`
      .setPayload(Schema.Struct({ streams: Schema.Array(Schema.String) }))
      .addSuccess(HttpApiSchema.NoContent)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.del(`deleteStream`)`/${subscriptionId}/streams`
      .setUrlParams(DeleteStreamUrlParams)
      .addSuccess(HttpApiSchema.NoContent)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.post(`claim`)`/${subscriptionId}/claim`
      .setPayload(ClaimRequest)
      .addSuccess(ClaimResponse)
      .addError(AlreadyClaimed)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.post(`ack`)`/${subscriptionId}/ack`
      .setPayload(AckRequest)
      .addSuccess(AckResponse)
      .addError(Fenced)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.post(`release`)`/${subscriptionId}/release`
      .setPayload(ReleaseRequest)
      .addSuccess(HttpApiSchema.NoContent)
      .addError(Fenced)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.post(`callback`)`/${subscriptionId}/callback`
      .setPayload(AckRequest)
      .addSuccess(AckResponse)
      .addError(Fenced)
      .addError(ProtocolError)
  )
  .prefix(`/__ds/subscriptions`) {}

export class SchedulesApi extends HttpApiGroup.make(`schedules`)
  .add(
    HttpApiEndpoint.put(`put`)`/${scheduleId}`
      .setPayload(SchedulePutRequest)
      .addSuccess(ScheduleInfo, { status: 201 })
      .addSuccess(ScheduleInfo)
      .addError(ConfigConflict)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.get(`get`)`/${scheduleId}`
      .addSuccess(ScheduleInfo)
      .addError(ProtocolError)
  )
  .add(
    HttpApiEndpoint.del(`delete`)`/${scheduleId}`
      .addSuccess(HttpApiSchema.NoContent)
      .addError(ProtocolError)
  )
  .prefix(`/__ds/schedules`) {}

export class JwksApi extends HttpApiGroup.make(`jwks`).add(
  HttpApiEndpoint.get(`get`, `/__ds/jwks.json`).addSuccess(JwksResponse)
) {}

export class DurableStreamsApi extends HttpApi.make(`durable-streams`)
  .add(SubscriptionsApi)
  .add(SchedulesApi)
  .add(JwksApi) {}
