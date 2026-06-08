# Reserved Protocol Bindings

## Status

This document intentionally does not define a new client abstraction.
`PROTOCOL.md` is the source of truth for coordination semantics and endpoint
behavior.

The purpose of this note is to constrain the first `effect-durable-streams`
coordination slice so it cannot drift into a worker, runtime, scheduler, or
durable-execution layer.

## Scope

`effect-durable-streams` may expose typed Effect bindings for concrete reserved
Durable Streams HTTP endpoints:

```http
PUT    {stream-root}/__ds/subscriptions/:id
GET    {stream-root}/__ds/subscriptions/:id
DELETE {stream-root}/__ds/subscriptions/:id

POST   {stream-root}/__ds/subscriptions/:id/streams
DELETE {stream-root}/__ds/subscriptions/:id/streams/:path

POST   {stream-root}/__ds/subscriptions/:id/claim
POST   {stream-root}/__ds/subscriptions/:id/ack
POST   {stream-root}/__ds/subscriptions/:id/release

GET    {stream-root}/__ds/jwks.json

PUT    {stream-root}/__ds/schedules/:id
GET    {stream-root}/__ds/schedules/:id
DELETE {stream-root}/__ds/schedules/:id
```

These bindings should model request bodies, response bodies, headers, and typed
protocol errors for those endpoints. Endpoint URL construction, header
resolution, retry policy, and auth headers should use the existing
`Endpoint`/`HttpClient` plumbing.

The wake stream is an ordinary Durable Stream. Reading it should use the
existing stream read APIs, not a special wake-stream abstraction.

## Not RPC

Do not define a parallel RPC catalog for these operations. The wire protocol is
the Durable Streams HTTP protocol in `PROTOCOL.md`, not an Effect RPC endpoint.

`@effect/rpc` is the right tool when the application owns the RPC protocol on
both client and server. This package is binding an existing public HTTP
protocol with stable methods, paths, headers, request bodies, response bodies,
and status codes. Introducing RPC-shaped request names would obscure the
protocol contract and recreate a second API surface.

The useful Effect pieces here are Schema codecs for protocol payloads,
`HttpClient` request execution, and typed protocol error decoding. The endpoint
table remains the HTTP table above.

## Non-goals

The first coordination slice must not introduce:

- a subscription service abstraction;
- a filtered-subscription service abstraction;
- a schedule service abstraction;
- a coordination helper service;
- pull-wake claim orchestration;
- worker pooling;
- heartbeat policy;
- handler lifecycle policy;
- local CEL evaluation;
- a scheduler;
- a predicate index;
- a dedupe store; or
- durable wait, durable sleep, child, spawn, join, or attachment helpers.

Those behaviors belong either in the server protocol implementation or in a
higher layer after the protocol endpoints are implemented and covered by
conformance tests.

## Naming

This document does not choose public API names. Names should be selected during
implementation by following existing `effect-durable-streams` module style and
by staying close to the HTTP contract in `PROTOCOL.md`.
