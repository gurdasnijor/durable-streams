# Coordination Substrate Client Design

## Scope

`effect-durable-streams` currently exposes L0 streams and producer-fenced append.
This document proposes the client surface for Durable Streams coordination
capabilities that sit above raw streams:

- reserved subscriptions and pull-wake claim loops;
- filtered subscriptions for predicate wake-up;
- scheduled append for timers and delayed redrive; and
- small helpers for commit-once append and child stream composition.

The client remains a thin Effect wrapper over Durable Streams protocol calls. It
does not import server internals and does not own a scheduler, predicate index,
or deduplication store.

## Design Principles

- Keep protocol ownership in Durable Streams and keep client helpers mechanical.
- Preserve `HttpClient` pluggability and `Endpoint` policy support.
- Prefer service tags for higher-level libraries that want dependency injection.
- Keep schema validation at the wire boundary.
- Return typed protocol errors instead of broad `Error` values.
- Treat draft protocol extensions as optional until conformance coverage lands.

## Service Split

| Service                      | Responsibility                                              | Intended caller                              |
| ---------------------------- | ----------------------------------------------------------- | -------------------------------------------- |
| `DurableSubscriptionClient`   | Create/read/delete subscriptions; claim, ack, release       | Workers, webhook receivers, runtime adapters |
| `DurableFilteredSubscription` | Register filtered subscriptions and expose wake metadata    | Durable wait and event choreography          |
| `DurableScheduleClient`       | Create/read/cancel scheduled appends                        | Durable sleep, timeouts, delayed redrive     |
| `DurableCoordination`         | Commit-once append and child stream composition helpers     | Thin higher-level authoring libraries        |

These services should layer over the existing `DurableStreamClient` transport
machinery instead of adding a second HTTP stack.

## Subscription Client

The subscription client should expose the reserved subscription API in a
service-shaped form:

```ts
interface DurableSubscriptionClient {
  readonly put: (
    id: string,
    request: SubscriptionRequest,
  ) => Effect.Effect<SubscriptionInfo, SubscriptionError>

  readonly get: (
    id: string,
  ) => Effect.Effect<SubscriptionInfo, SubscriptionError>

  readonly delete: (
    id: string,
  ) => Effect.Effect<void, SubscriptionError>

  readonly claim: (
    id: string,
    options?: ClaimOptions,
  ) => Effect.Effect<Claim, SubscriptionError>

  readonly ack: (
    id: string,
    claim: ClaimRef,
    request: AckRequest,
  ) => Effect.Effect<AckResult, SubscriptionError>

  readonly release: (
    id: string,
    claim: ClaimRef,
  ) => Effect.Effect<void, SubscriptionError>
}
```

The client should also provide a scoped pull-wake worker helper that reads a wake
stream, claims matching subscriptions, runs a handler, acks progress, and
releases on interruption.

## Filtered Subscription Client

Filtered subscriptions should be modeled as subscription creation with a typed
filter payload, not as a separate runtime registry:

```ts
interface DurableFilteredSubscription {
  readonly putFiltered: (
    id: string,
    request: FilteredSubscriptionRequest,
  ) => Effect.Effect<SubscriptionInfo, SubscriptionError>
}
```

The helper may provide constructors for common filter payloads, but it should
not evaluate filters locally. Server-side filter evaluation is the substrate
capability being exposed.

## Schedule Client

Scheduled append should expose create, read, and cancel operations:

```ts
interface DurableScheduleClient {
  readonly put: (
    id: string,
    request: ScheduleRequest,
  ) => Effect.Effect<ScheduleInfo, ScheduleError>

  readonly get: (
    id: string,
  ) => Effect.Effect<ScheduleInfo, ScheduleError>

  readonly cancel: (
    id: string,
  ) => Effect.Effect<void, ScheduleError>
}
```

The request should accept the same producer tuple used by immediate append so
that scheduler retry remains commit-once at the stream append boundary.

## Coordination Helpers

`DurableCoordination` should provide small composition helpers only:

- `commitOnceAppend` as a named wrapper around producer-fenced append;
- `scheduleJson` for typed JSON timer facts;
- `childStream` for deriving child stream endpoints; and
- `awaitTerminalFact` for filtered subscription setup around a child stream.

These helpers should lower to stream creation, append, subscription, ack, and
release. They should not introduce workflow-specific state machines.

## Higher-level Runtime Consumption

A higher-level durable execution library should consume these services through
injected Effect capabilities:

- named steps use producer-fenced appends and replay from the session stream;
- sleep uses scheduled append plus a filtered or pull-wake subscription;
- wait uses filtered subscriptions instead of a runtime-owned predicate index;
- spawn and attach use child streams plus filtered subscriptions for progress or
  terminal facts; and
- external ingress uses stable producer tuples so duplicate deliveries collapse
  at the Durable Streams append boundary.

The higher-level library keeps authoring APIs and domain schemas. Durable
Streams owns durable wake, timer, cursor, lease, and producer-fencing mechanics.
