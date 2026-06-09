# Effect-native client SDD

Status: draft
Target repo: `gurdasnijor/durable-streams`
Protocol source of truth: `PROTOCOL.md`
Feature spec: `features/durable-streams/effect-client.feature.yaml`
Companion server SDD: `docs/sdds/effect-native-server-sdd.md`
Companion execution SDD: `docs/sdds/effect-durable-execution-sdd.md`
Semantic reference: `packages/effect-durable-client/docs/client-curr.md`

## Purpose

This SDD defines the concrete build shape for the Effect-native Durable Streams
client. `client-curr.md` captures the semantic target; this document captures
package boundaries, modules, generated control-plane dependency, conformance
scope, and implementation order.

The former `packages/effect-durable-streams` client, now moved to
`packages/effect-durable-client`, and upstream `packages/client` are references,
not compatibility targets. The compatibility contract is
`packages/client-conformance-tests` plus any additional Effect-client conformance
added for reserved coordination features.

`docs/building-a-client.md` is the base protocol build guide. It reinforces
that offsets are opaque, producer sequence/epoch belongs in a client-side
producer abstraction, long-poll cursors must be forwarded, SSE reconnects use
the last control `streamNextOffset`, and clients can expose a small read-only
surface. This SDD keeps those constraints and adds Effect `Layer`s, Schema
boundaries, shared `HttpApi` control-plane derivation, CEL authoring helpers,
and scoped coordination resources.

## Compatibility boundary

The build should optimize for conformance and Effect-native semantics, not API
preservation.

- `effect-client.CONFORMANCE.1`: client behavior compatibility is defined by
  `packages/client-conformance-tests`.
- `effect-client.SCOPE.1`: source compatibility with `packages/client` is a
  non-goal.
- `effect-client.SCOPE.2`: source compatibility with the former
  `packages/effect-durable-streams` client API is a non-goal.

The current client still matters as a source of lessons: existing tests,
benchmarks, reader loops, producer batching, typed error classification, and
Effect layering patterns should be mined where useful. They do not constrain the
new public API or module shape.

## Thin execution consumers

This client should let higher-level execution packages stay thin. For
`fluent-firegrid`, the target is:

- keep the keyed replay fold in `fluent-firegrid`;
- delete the hand-rolled Durable Streams binding layer that creates streams,
  collects history, seeds producer sequence from history length, and wires
  producer append calls manually; and
- lower tutorial features such as durable sleep and durable wait to client
  primitives over schedules, filtered subscriptions, and scoped leases.

The journal fold is intentionally not part of this SDD. It is application
execution semantics: a stream of application step events is reduced by
application step keys to decide whether to run or replay a function. The server
does not see that function, and the protocol client should not own that
execution model.

The client SDD does own the substrate guarantees that make that fold safe and
thin:

- producer recovery either uses explicit producer protocol state or claims a
  fresh epoch at `seq=0`, never collected event count;
- producer append assignment and send order are serialized under concurrency;
- offsets remain opaque and cannot be treated as array indexes;
- scheduled append, filtered subscription, and scoped lease helpers compose as
  resume substrates without embedding a worker loop; and
- generation fencing controls ack/release while producer fencing controls
  durable fact append.

This is the boundary that removes `durable-journal.ts`-style substrate plumbing
from userland without moving keyed replay into the client.

## Package split

The paired package plan is:

```text
packages/effect-durable-client              # Effect-native semantic client
packages/effect-durable-streams             # Effect-native server
packages/durable-streams-protocol           # shared HttpApi schemas
```

The client package imports shared protocol contracts and ordinary package
dependencies only. It must not import implementation code from `packages/client`,
`packages/server`, or the server package.

## Component dependencies

```mermaid
flowchart LR
  App[application / fluent-runtime] --> Client[effect-durable-client]

  Client --> Service[DurableStreamClient service]
  Service --> Runtime[Typed stream handle]

  Runtime --> Log[log read API]
  Runtime --> Producer[Producer resource]
  Service --> Coordination[Subscription and lease API]
  Service --> Schedules[Schedule API]
  Service --> Webhooks[Webhook verifier layer]

  Coordination --> ControlClient[generated HttpApiClient]
  Schedules --> ControlClient
  Webhooks --> ControlClient
  ControlClient --> ProtocolApi[package-neutral DurableStreamsApi]

  Log --> StreamTransport[stream data-plane transport]
  Producer --> StreamTransport
  StreamTransport --> HttpClient[@effect/platform HttpClient]
  ControlClient --> HttpClient

  Client --> Errors[semantic typed errors]
  Client --> Layers[auth / retry / tracing layers]
```

The important dependency rule is asymmetric:

- the control plane derives request/response plumbing from shared `Api.ts`;
- the stream data plane remains hand-written because it owns raw bytes, headers,
  long-poll, SSE, cursor, cache, and schema decode loops; and
- semantic resources wrap both planes without owning server state machines.

## Public package shape

Proposed exports:

```text
src/index.ts
src/ApiClient.ts
src/DurableStreamClient.ts
src/DurableStream.ts
src/Producer.ts
src/Lease.ts
src/Subscription.ts
src/Schedule.ts
src/CEL.ts
src/WebhookVerifier.ts
src/Errors.ts
src/Offset.ts
src/Layers.ts
src/internal/DataPlane.ts
src/internal/ReadLoop.ts
src/internal/Sse.ts
src/internal/Encoding.ts
```

The names can change during implementation. The stable architecture is:

- `ApiClient`: generated `HttpApiClient` construction and escape hatch;
- `DurableStreamClient`: canonical public service entry point;
- `DurableStream`: runtime stream handle types;
- `Producer`: scoped producer resource acquired from a client stream handle;
- `Lease` and `Subscription`: coordination wrappers over generated endpoints;
- `Schedule`: delayed append wrapper over generated endpoints;
- `CEL`: branded expression construction for server-side filtered
  subscriptions;
- `WebhookVerifier`: handler-side verification layer; and
- internals for transport, SSE, batching, and encoding.

## Shared protocol contract

Reserved control-plane plumbing comes from the shared protocol package:

```ts
import { FetchHttpClient, HttpApiClient, HttpClient } from "@effect/platform"
import { Effect } from "effect"
import { DurableStreamsApi } from "durable-streams-protocol/Api"

export const makeControlClient = (baseUrl: string) =>
  HttpApiClient.make(DurableStreamsApi, {
    baseUrl,
    transformClient: HttpClient.mapRequest((request) => request),
  }).pipe(Effect.provide(FetchHttpClient.layer))
```

This satisfies `effect-client.HTTP_API.1`: paths, payloads, response decoding,
and declared control errors are inferred from `DurableStreamsApi`.

The generated client can be exported for tests and tooling, but application code
should usually use semantic wrappers. That boundary satisfies
`effect-client.HTTP_API.2` and `effect-client.HTTP_API.3`.

## Basic usage

The ordinary app path is:

1. acquire the `DurableStreamClient` service from the Effect environment;
2. ask the client for a typed stream handle by supplying a stream path and wire
   schema; and
3. let the producer own producer sequence, epoch, fencing, batching, and send
   serialization.

```ts
import { Effect, Schema, Stream } from "effect"
import {
  DurableStreamClient,
  DurableStreamClientLayerFetch,
} from "effect-durable-client"

class Message extends Schema.Class<Message>("Message")({
  id: Schema.String,
  room: Schema.String,
  text: Schema.String,
}) {}

const program = Effect.gen(function* () {
  const client = yield* DurableStreamClient
  const chat = client.stream("rooms/general/messages", Message)

  const producer = yield* chat.producer("chat-writer")

  const nextOffset = yield* producer.append({
    id: "msg-1",
    room: "general",
    text: "hello",
  })

  const recent = yield* chat.read({ until: "tail" }).pipe(
    Stream.map((item) => item.value),
    Stream.runCollect
  )

  return { nextOffset, recent }
}).pipe(Effect.scoped, Effect.provide(DurableStreamClientLayerFetch))
```

This keeps the useful Effect RPC lesson without importing the RPC endpoint
model. The wire schema is explicit at the client boundary, but the concrete
Durable Streams resource is still the stream path.
`client.stream("rooms/general/messages", Message)` returns a typed handle. Reads
decode `Message` values at the wire boundary; producer appends encode `Message`
values before sending. The handle is pure, while the producer is scoped because
it owns stateful protocol resources.

`"rooms/general/messages"` is a Durable Streams stream path resolved by the
client layer against the configured stream root. It is not an RPC-style endpoint
definition; the protocol still treats stream URL shape as server-defined.

## Log plane

The log plane is a hand-written stream data-plane implementation. The canonical
user entry point is the `DurableStreamClient` service: the client resolves a
concrete stream path and schema to a runtime handle.

```ts
export type StreamPath = string

export class DurableStreamClient extends Context.Tag("DS/DurableStreamClient")<
  DurableStreamClient,
  DurableStreamClient.Service
>() {}

export declare namespace DurableStreamClient {
  export interface Service {
    readonly stream: <A, I>(
      path: StreamPath,
      schema: Schema.Schema<A, I>
    ) => DurableStream.Handle<A>

    readonly subscriptions: SubscriptionClient
    readonly cel: CelBuilder
    readonly webhooks: WebhookVerifier
  }
}

export declare namespace DurableStream {
  export interface Handle<A> {
    readonly read: (opts?: {
      readonly from?: ReadFrom
      readonly until?: "close" | "tail"
    }) => Stream.Stream<Item<A>, ReadError, HttpClient.HttpClient>

    readonly readWithControl: (opts?: {
      readonly from?: ReadFrom
      readonly until?: "close" | "tail"
    }) => Stream.Stream<ReadEvent<A>, ReadError, HttpClient.HttpClient>

    readonly producer: (
      producerId: ProducerId,
      opts?: ProducerOptions
    ) => Effect.Effect<Producer<A>, never, Scope.Scope | HttpClient.HttpClient>

    readonly schedule: (
      id: string,
      spec: ScheduleSpec<A>
    ) => Effect.Effect<
      Schedule,
      ConfigConflict | Transport,
      HttpClient.HttpClient
    >

    readonly head: Effect.Effect<StreamHead, StreamGone | Transport>
    readonly fork: (
      opts: ForkOptions
    ) => Effect.Effect<DurableStream.Handle<A>, ForkError>
  }
}
```

Implementation responsibilities:

- page catch-up reads until `Stream-Up-To-Date`;
- expose up-to-date only through `readWithControl`;
- continue live reads until `Stream-Closed` when `until` is `"close"`;
- terminate at the current tail when `until` is `"tail"`;
- preserve offset opacity and bytewise ordering;
- decode JSON items or non-JSON SSE base64 at the wire boundary; and
- surface schema parse failures as typed read errors.

`client.stream(path, schema)` is pure. It binds a concrete stream path and wire
schema but does not perform network I/O. Network I/O starts when the returned
handle is read, written, scheduled, forked, or inspected. This covers
`effect-client.LOG.1` through `effect-client.LOG.6` and
`effect-client.PACKAGE.5`.

The base client guide calls out read-only consumers as a common case. The
Effect client should preserve that ergonomically: either expose a dedicated
read-only entry point or make the read-only handle tree-shakable so browser and
agent consumers that only follow streams do not acquire producer, schedule, or
reserved control-plane resources.

```ts
export interface ReadonlyDurableStreamClient {
  readonly stream: <A, I>(
    path: StreamPath,
    schema: Schema.Schema<A, I>
  ) => DurableStream.ReadonlyHandle<A>
}

export declare namespace DurableStream {
  export interface ReadonlyHandle<A> {
    readonly read: DurableStream.Handle<A>["read"]
    readonly readWithControl: DurableStream.Handle<A>["readWithControl"]
    readonly head: DurableStream.Handle<A>["head"]
  }
}
```

This covers `effect-client.LOG.7`.

## Producer plane

Producer identity is a scoped resource, not a loose append option bag.

```ts
export interface Producer<A> {
  readonly append: (
    value: A | ReadonlyArray<A>,
    opts?: { readonly streamSeq?: StreamSeq }
  ) => Effect.Effect<Offset, AppendError, HttpClient.HttpClient>

  readonly appendAndClose: (
    value: A | ReadonlyArray<A>,
    opts?: { readonly streamSeq?: StreamSeq }
  ) => Effect.Effect<Offset, AppendError, HttpClient.HttpClient>

  readonly close: Effect.Effect<Offset, AppendError, HttpClient.HttpClient>
}
```

Producer resources are acquired from a runtime stream handle, for example
`chat.producer("chat-writer")` in the basic usage section above. There is no
separate top-level producer constructor in the canonical API. The producer
resource owns epoch, sequence, optional bounded auto-claim, local closed state,
batching, and send serialization. The key invariant is `effect-client.PRODUCER.2`:
assignment and send order are serialized so concurrent Effect fibers cannot
produce protocol sequence gaps.

On cold replay, producer state must not be inferred from collected event count,
stream offsets, or the length of a folded history. `effect-client.PRODUCER.6`
allows two valid recovery paths: resume from explicit producer protocol state, or
claim a fresh epoch and start that epoch at `seq=0`. This is load-bearing for
higher-level keyed replay consumers because real servers can mint opaque,
non-sequential offsets and unrelated event count is not a producer sequence.

`Producer-Seq` is internal to the resource. `Stream-Seq` remains an optional
caller-supplied protocol ordering token for the rare multi-writer case. The two
must not share a type.

Producer acquisition is scoped because producer lifetime owns background
flushing, local closed state, and any heartbeat/recovery resources needed by the
implementation. This covers `effect-client.PRODUCER.1` through
`effect-client.PRODUCER.7`.

## Coordination plane

Subscription and lease APIs are semantic wrappers over generated control-plane
methods exposed through `DurableStreamClient.subscriptions`.

```ts
export interface SubscriptionClient {
  readonly create: (
    id: SubscriptionId,
    config: SubscriptionConfig
  ) => Effect.Effect<
    Subscription,
    ConfigConflict | Transport,
    HttpClient.HttpClient
  >

  readonly claim: (
    id: SubscriptionId,
    worker: string
  ) => Effect.Effect<
    Lease,
    AlreadyClaimed | Transport,
    Scope.Scope | HttpClient.HttpClient
  >

  readonly filtered: <A, I>(
    id: SubscriptionId,
    opts: {
      readonly stream: DurableStream.Handle<A>
      readonly filter: CelExpression
      readonly schema?: Schema.Schema<A, I>
    }
  ) => Effect.Effect<
    Subscription,
    ConfigConflict | Transport,
    HttpClient.HttpClient
  >
}
```

`client.subscriptions.claim` calls generated `subscriptions.claim`, then
converts the response into a scoped `Lease` with heartbeat, `guard`, `ack`, and
`release`. Heartbeat uses ack-without-done. `guard` races work against detected
generation fencing and interrupts the work region when fenced.

The client never owns durable subscription state. It does not implement a worker
loop, predicate index, lease table, cursor store, or dedupe store. It carries
server-side filter configs as opaque data and never evaluates CEL as a durable
wait mechanism.

CEL support is an authoring and serialization helper, not a local evaluator:

```ts
import { Brand } from "effect"
import { CEL } from "effect-durable-client/CEL"

export type CelExpression = Brand.Branded<string, "CelExpression">
export type CelPath = Brand.Branded<string, "CelPath">

export interface CelBuilder {
  readonly raw: (expression: string) => CelExpression
  readonly eq: (
    left: CelExpression | CelPath,
    right: string | number | boolean
  ) => CelExpression
  readonly and: (...filters: ReadonlyArray<CelExpression>) => CelExpression
  readonly or: (...filters: ReadonlyArray<CelExpression>) => CelExpression
  readonly path: (...segments: ReadonlyArray<string>) => CelPath
}

const approvals = client.stream("approvals", Approval)

yield *
  client.subscriptions.filtered("pending-approval", {
    stream: approvals,
    filter: CEL.and(
      CEL.eq(CEL.path("value", "requestId"), requestId),
      CEL.eq(CEL.path("value", "status"), "approved")
    ),
    schema: Approval,
  })
```

Raw strings require an explicit `CEL.raw(...)` call or equivalent branding so
they cannot be confused with locally executable predicates. The helper may do
syntax construction and escaping, but it must not decide wake eligibility,
maintain predicate indexes, or evaluate CEL against decoded events. The server
remains the only authority for §7.4.1 filtered wake decisions.

For higher-level runtimes, scheduled append, filtered subscriptions, and scoped
leases are the resume substrate:

- durable sleep lowers to schedule creation plus a later wake;
- durable wait lowers to filtered subscription wake plus materialization; and
- lease/generation fencing ensures one active claimant can ack the wake.

The client exposes those pieces as Effect primitives, but the runtime decides
when to create them, what function to run after wake, and how to fold the
resulting application events. This covers `effect-client.COORDINATION.1`
through `effect-client.COORDINATION.10` and
`effect-client.CONFORMANCE.7` through `effect-client.CONFORMANCE.8`.

## Schedules

Schedule helpers wrap generated schedule endpoints and present schedules as
delayed appends. Creating a schedule that appends a typed value is exposed on
the runtime stream handle so encoding uses the same schema as ordinary appends.

```ts
chat.schedule("wake-user-123", {
  at: wakeAt,
  value: { _tag: "TimerFired", timerId: "user-123" },
  producer: producerTuple,
})
```

The wrapper owns schema encoding against the target stream and reuses the same
producer tuple type as `Producer`. It does not own a local scheduler.

## Webhook verifier

Webhook support is handler-side verification, not an outbound client method.

```ts
export class WebhookVerifier extends Context.Tag("DS/WebhookVerifier")<
  WebhookVerifier,
  {
    readonly verify: (req: {
      readonly headers: Record<string, string>
      readonly rawBody: Uint8Array
    }) => Effect.Effect<WakeNotification, WebhookRejected>
  }
>() {}
```

The verifier uses shared JWKS and callback schemas from the protocol contract,
then owns key cache, rotation, timestamp, replay-window, signature, and malformed
body checks. The handler still decides what product work to run.

For product webhooks used as execution signals, verification and provider
decoding happen before ordinary Durable Streams writes. The verifier does not
directly resume an execution; the handler appends a schema-decoded event or
`@durable-streams/state` fact through a normal typed stream producer, and any
matching filtered subscription wake is produced by the server after that append
is durable.

## Error model

The public error model should describe semantic protocol outcomes, not raw HTTP.

Examples:

```ts
export class StreamClosed extends Data.TaggedError("StreamClosed")<{
  readonly finalOffset: Offset
}> {}

export class ProducerFenced extends Data.TaggedError("ProducerFenced")<{
  readonly currentEpoch: number
}> {}

export class SequenceGap extends Data.TaggedError("SequenceGap")<{
  readonly expected: number
  readonly received: number
}> {}

export class Fenced extends Data.TaggedError("Fenced")<{
  readonly generation: number
}> {}
```

Transport, rate-limit, retention, gone, config conflict, and schema parse errors
should be similarly typed. Generated control-plane errors lower into this model
at the wrapper boundary.

## Layers

The package should not bake in global fetch, auth, retry, or tracing.

```ts
export const layerFetch: Layer.Layer<DurableStreamClient, never, never>
export const layerHttpClient: Layer.Layer<
  DurableStreamClient,
  never,
  HttpClient.HttpClient
>
```

Auth is a request-transforming layer. Retry is error-class-aware: transient
transport errors and `429` can retry, while fencing, sequence gaps, config
conflicts, retention, and stream closure are protocol-final unless the caller
explicitly handles them.

## Conformance

The client must run as a first-class target of `packages/client-conformance-tests`.

```text
effect client / log reads
effect client / lifecycle
effect client / producer
effect client / retries
effect client / reserved subscriptions
effect client / schedules
effect client / webhook verifier
effect client / producer cold recovery with non-sequential offsets
```

The current Effect-client tests can be reused where they prove the new public API
and conformance behavior. Tests that only preserve old method names should be
deleted or rewritten.

Additional producer conformance should include a server fixture that mints
opaque, non-sequential offsets and preloads existing events whose count differs
from the next usable producer sequence. A recovered producer must either append
with explicit protocol producer state or claim a fresh epoch starting at `seq=0`;
it must not append with `events.length` and must not derive sequence from stream
offsets.

## Migration from current client package

1. Create `packages/effect-durable-client`.
2. Move or copy useful internals from the former
   `packages/effect-durable-streams` client only when they match this SDD.
3. Rename current package references in downstream users after the new package
   passes conformance.
4. Reserve `packages/effect-durable-streams` for the server package from the
   companion server SDD.

This is a rename plus redesign permission, not a compatibility-preserving
facade. Public API preservation is explicitly subordinate to conformance and
Effect-native semantics.

## Implementation order

1. Add `effect-client.feature.yaml` and this SDD.
2. Create `packages/durable-streams-protocol` with shared `DurableStreamsApi`.
3. Scaffold `packages/effect-durable-client` and generated control client.
4. Implement log-plane reads, read-only stream surface, and lifecycle against
   client conformance.
5. Implement producer resource and producer conformance.
6. Implement semantic control wrappers for subscription create, claim, ack, and
   release.
7. Implement schedule helpers from generated schedule endpoints.
8. Implement webhook verifier layer using shared JWKS/callback schemas.
9. Add auth, retry, and tracing layers.
10. Rename downstream imports and reserve `packages/effect-durable-streams` for
    the server package.
