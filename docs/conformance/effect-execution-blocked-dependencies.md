# Effect durable execution conformance — blocked dependencies

This manifest tracks the `effect-durable-execution` conformance harness under
`packages/effect-durable-execution/test/conformance/`. The harness is
intentionally **red** while server/client primitives land: it encodes the target
authoring surface and the review-addendum contracts from the SDD, and turns green
as the substrate it depends on is advertised.

Source of truth for the dependency mapping is
`test/conformance/harness/blocked.ts` (the `BLOCKED` registry). This doc is the
human-readable view; keep them in sync.

## No fake substrate in conformance

This rule is `effect-execution.TOOLING.1` and is enforced by the
`local/no-fake-conformance-substrate` ESLint rule over
`packages/effect-durable-execution/test/conformance/**` (it flags `new Response`
and `make*/create*/start*` substrate/transport/server/fetch factories).

Conformance describes behavior at **production seams**. Harness code is allowed
only for generic test orchestration — probing the public export surface
(`harness/surface.ts`) and recording blocked dependencies (`harness/blocked.ts`).
It must **not** manufacture missing substrate semantics or observability. In
particular, the producer-plane and replay invariants are **not** proven by
simulating a Durable Streams server and inspecting recorded
`producer-id`/`producer-epoch`/`producer-seq` request headers. Those invariants
are proven at the production boundary by one of:

- the real `effect-durable-client` producer resource against a real launchable
  server / memory-server implementation;
- a production `OperationLog` binding/layer that execution actually uses; or
- OTel / structured production telemetry emitted by the real
  client/server/`OperationLog` path once the SDD observability surface lands.

Until that production path exists, these cases are explicit **blocked** entries.

## How a case is classified

| Tier                  | Needs substrate? | Meaning                                                                                                       |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| **surface assertion** | no               | probes only the public export surface; green guard or red-now                                                 |
| **blocked**           | yes              | depends on client/server (or not-yet-built execution) substrate and its production instrumentation; fails red |

The harness typechecks against today's exports (it probes the target surface as
data via `harness/surface.ts`) so workspace typecheck stays green; it fails only
at **runtime** under the `effect-durable-execution` vitest project, which is not
part of the CI `test:run` job.

## Surface assertions (no substrate)

| Execution ACIDs             | Case                                               | Today                        |
| --------------------------- | -------------------------------------------------- | ---------------------------- |
| API.20 / CONFORMANCE.10     | durable programs are ordinary lazy `Effect` values | green                        |
| API.23 / CONFORMANCE.24     | no `currentRuntime`/`currentOps` escape hatch      | green                        |
| API.12 / CONFORMANCE.17     | no host-level invocation-control APIs              | green                        |
| CONFORMANCE.25              | no `service`/`object`/`workflow` exports           | **red-now** (still exported) |
| API.7,8 / CONFORMANCE.11,14 | free-primitive + handler-first surface exists      | **red-now** (missing)        |

## Blocked on client/server (or execution) substrate

| Registry id              | Execution ACIDs                                 | Depends on                                                                                                                                                |
| ------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `replay-oplog-binding`   | JOURNAL.1,2,3,6,8; CONFORMANCE.1,2,8,15; API.28 | execution: OperationLog binding; effect-client.PRODUCER.7; effect-server.CONFORMANCE.1 (launchable server); effect-server.OBSERVABILITY.3 (OTel)          |
| `producer-plane`         | JOURNAL.4,5; CONFORMANCE.3                      | effect-client.PRODUCER.1,6; effect-server.PRODUCERS.6; effect-server.CONFORMANCE.5; effect-server.OBSERVABILITY.3 (OTel); execution: OperationLog binding |
| `signal-substrate`       | API.15, RESUME.2, CONFORMANCE.19                | effect-client.COORDINATION.2-4; effect-server.SUBSCRIPTIONS.2,3; effect-server.PULL_WAKE.5; coordination-substrate.EXECUTION.1                            |
| `awakeable-append-close` | API.17, RESUME.8, CONFORMANCE.20,37             | effect-client.PRODUCER.1,3; effect-server.PRODUCERS.5; effect-server.READS.1,2; coordination-substrate.CLIENT.7                                           |
| `deferred-oplog-settle`  | API.17, RESUME.9, CONFORMANCE.20,41             | effect-client.PRODUCER.1; effect-server.PRODUCERS.2,3; effect-server.STORE.8                                                                              |
| `wait-for-state`         | API.25,31, RESUME.6, CONFORMANCE.28,35,36       | effect-client.COORDINATION.8,10; effect-server.FILTERS.1,5; effect-server.WAKE.2; coordination-substrate.FILTERS.1, EXECUTION.3                           |
| `state-writes`           | API.30, CONFORMANCE.34                          | execution: state primitives + StateSet/StateDeleted facts                                                                                                 |
| `durable-select`         | API.29, CONFORMANCE.33                          | execution: durable waits; effect-client.LOG.4; `signal-substrate`; `sleep-schedule`                                                                       |
| `sleep-schedule`         | RESUME.1                                        | effect-client.SCHEDULES.1; effect-server.SCHEDULES.2,6; coordination-substrate.SCHEDULES.3, EXECUTION.2                                                   |
| `ack-after-outcome`      | DELIVERY.2,3, CONFORMANCE.8,9                   | effect-client.COORDINATION.2,4; effect-server.PULL_WAKE.5; effect-server.SUBSCRIPTIONS.3                                                                  |
| `epoch-cas-lease`        | DELIVERY.9, CONFORMANCE.40 (and 26,27)          | effect-client.PRODUCER.5; effect-server.PRODUCERS.2; effect-server.STORE.8; effect-server.CONFORMANCE.5; effect-server.SUBSCRIPTIONS.4                    |
| `channel-primitive`      | API.21,33, CONFORMANCE.23,39                    | execution: channel free primitive                                                                                                                         |
| `snapshot-checkpoint`    | JOURNAL.9,10,11, INVOCATION.8, CONFORMANCE.31   | execution: snapshot fold; effect-client.LOG.4                                                                                                             |
| `body-determinism`       | API.28, CONFORMANCE.32                          | execution: divergence detection                                                                                                                           |
| `idempotency-keys`       | API.32, CONFORMANCE.38                          | execution: `run` idempotency-key derivation                                                                                                               |
| `oplog-binding-parity`   | BOUNDARY.7, CONFORMANCE.42                      | execution: `OperationLog` abstraction; effect-client.PRODUCER.7                                                                                           |
| `handler-surface`        | API.8, CONFORMANCE.14                           | execution: handler-first declaration                                                                                                                      |
| `free-primitive-runtime` | API.7,23, CONFORMANCE.11,24                     | execution: active-operation runtime                                                                                                                       |

## Notes

- `JOURNAL.4 / CONFORMANCE.3` (no `events.length` producer sequence) is a real
  failure mode in the current adapter, but its acceptance test belongs at the
  production boundary. Execution conformance **depends on** it via
  `producer-plane`; it does not prove it by inspecting a fake transport.
- `execution:*` dependencies are work owned by this package, sequenced after the
  substrate it lowers onto; see the SDD implementation order, items 22–30 (the
  review-addendum contracts).
- The integration suite (effect-execution.CONFORMANCE.6) runs against a
  conformant Effect client and server once those packages advertise the
  primitives above; until then these cases must not be read as substrate
  correctness.
