// Conformance harness: the registry of execution conformance cases that are
// blocked on client/server (or not-yet-built execution) substrate. Each entry
// maps execution ACIDs to the client/server ACIDs it depends on, so a red test
// names exactly what must land. This registry is the source of truth for
// `docs/conformance/effect-execution-blocked-dependencies.md`.

export interface BlockedDependency {
  readonly id: string
  /** effect-execution ACIDs this case proves. */
  readonly executionAcids: ReadonlyArray<string>
  /** client/server/coordination ACIDs (or "execution:" internal work) it needs. */
  readonly dependsOn: ReadonlyArray<string>
  readonly reason: string
}

export const BLOCKED: Record<string, BlockedDependency> = {
  "replay-oplog-binding": {
    id: `replay-oplog-binding`,
    executionAcids: [
      `JOURNAL.1`,
      `JOURNAL.2`,
      `JOURNAL.3`,
      `JOURNAL.6`,
      `JOURNAL.8`,
      `CONFORMANCE.1`,
      `CONFORMANCE.2`,
      `CONFORMANCE.8`,
      `CONFORMANCE.15`,
      `API.28`,
    ],
    dependsOn: [
      `execution:operation-log-tag`,
      `effect-client.PRODUCER.7`,
      `effect-server.CONFORMANCE.1`,
      `effect-server.OBSERVABILITY.3`,
    ],
    reason: `Replay/redelivery/capture correctness must be observed at the production seam — a real OperationLog binding execution uses (in-process, or remote against a launchable server via effect-durable-client) plus OTel from that path — not by simulating a Durable Streams server in a conformance directory.`,
  },
  "producer-plane": {
    id: `producer-plane`,
    executionAcids: [`JOURNAL.4`, `JOURNAL.5`, `CONFORMANCE.3`],
    dependsOn: [
      `effect-client.PRODUCER.1`,
      `effect-client.PRODUCER.6`,
      `effect-server.PRODUCERS.6`,
      `effect-server.CONFORMANCE.5`,
      `effect-server.OBSERVABILITY.3`,
      `execution:operation-log-tag`,
    ],
    reason: `The producer-sequence/identity invariant (sequence is producer-owned, never events.length-derived) must be observed at the production protocol boundary — the real effect-durable-client producer resource against a launchable server, or OTel/structured telemetry from that path once SDD observability lands — not by inspecting a fake fetch recorder.`,
  },
  "signal-substrate": {
    id: `signal-substrate`,
    executionAcids: [`API.15`, `RESUME.2`, `CONFORMANCE.19`],
    dependsOn: [
      `effect-client.COORDINATION.2`,
      `effect-client.COORDINATION.3`,
      `effect-client.COORDINATION.4`,
      `effect-server.SUBSCRIPTIONS.2`,
      `effect-server.SUBSCRIPTIONS.3`,
      `effect-server.PULL_WAKE.5`,
      `coordination-substrate.EXECUTION.1`,
    ],
    reason: `Receiver-side signal lowers to a signal-wait subscription plus pull-wake notification; no signal notification surface is advertised yet.`,
  },
  "awakeable-append-close": {
    id: `awakeable-append-close`,
    executionAcids: [`API.17`, `RESUME.8`, `CONFORMANCE.20`, `CONFORMANCE.37`],
    dependsOn: [
      `effect-client.PRODUCER.1`,
      `effect-client.PRODUCER.3`,
      `effect-server.PRODUCERS.5`,
      `effect-server.READS.1`,
      `effect-server.READS.2`,
      `coordination-substrate.CLIENT.7`,
    ],
    reason: `Awakeable settle-once lowers to atomic append-and-close on a dedicated stream; closure-monotonic settle is not exposed yet.`,
  },
  "deferred-oplog-settle": {
    id: `deferred-oplog-settle`,
    executionAcids: [`API.17`, `RESUME.9`, `CONFORMANCE.20`, `CONFORMANCE.41`],
    dependsOn: [
      `effect-client.PRODUCER.1`,
      `effect-server.PRODUCERS.2`,
      `effect-server.PRODUCERS.3`,
      `effect-server.STORE.8`,
    ],
    reason: `Deferred settles as an operation-log fact written by the epoch-holding executor under the single-writer fence.`,
  },
  "wait-for-state": {
    id: `wait-for-state`,
    executionAcids: [
      `API.25`,
      `API.31`,
      `RESUME.6`,
      `CONFORMANCE.28`,
      `CONFORMANCE.35`,
      `CONFORMANCE.36`,
    ],
    dependsOn: [
      `effect-client.COORDINATION.8`,
      `effect-client.COORDINATION.10`,
      `effect-server.FILTERS.1`,
      `effect-server.FILTERS.5`,
      `effect-server.WAKE.2`,
      `coordination-substrate.FILTERS.1`,
      `coordination-substrate.EXECUTION.3`,
    ],
    reason: `waitForState lowers to a CEL filtered subscription plus @durable-streams/state materialization; the client exposes no CEL filtered-subscription helper yet.`,
  },
  "state-writes": {
    id: `state-writes`,
    executionAcids: [`API.30`, `CONFORMANCE.34`],
    dependsOn: [`execution:state-primitives`, `execution:state-facts`],
    reason: `state()/sharedState() free primitives and StateSet/StateDeleted operation-log facts are not implemented.`,
  },
  "durable-select": {
    id: `durable-select`,
    executionAcids: [`API.29`, `CONFORMANCE.33`],
    dependsOn: [
      `execution:durable-waits`,
      `effect-client.LOG.4`,
      `signal-substrate`,
      `sleep-schedule`,
    ],
    reason: `Durable select resolves by earliest operation-log offset and needs durable waits to race; current select is a local Effect.race wrapper.`,
  },
  "sleep-schedule": {
    id: `sleep-schedule`,
    executionAcids: [`RESUME.1`],
    dependsOn: [
      `effect-client.SCHEDULES.1`,
      `effect-server.SCHEDULES.2`,
      `effect-server.SCHEDULES.6`,
      `coordination-substrate.SCHEDULES.3`,
      `coordination-substrate.EXECUTION.2`,
    ],
    reason: `Durable sleep lowers to scheduled append plus wake; schedule helpers are not advertised yet.`,
  },
  "ack-after-outcome": {
    id: `ack-after-outcome`,
    executionAcids: [
      `DELIVERY.2`,
      `DELIVERY.3`,
      `CONFORMANCE.8`,
      `CONFORMANCE.9`,
    ],
    dependsOn: [
      `effect-client.COORDINATION.2`,
      `effect-client.COORDINATION.4`,
      `effect-server.PULL_WAKE.5`,
      `effect-server.SUBSCRIPTIONS.3`,
    ],
    reason: `Ack-after-durable-outcome ordering needs a scoped pull-wake lease whose done-ack happens only after the durable outcome; the lease lives in the client.`,
  },
  "epoch-cas-lease": {
    id: `epoch-cas-lease`,
    executionAcids: [`DELIVERY.9`, `CONFORMANCE.40`],
    dependsOn: [
      `effect-client.PRODUCER.5`,
      `effect-server.PRODUCERS.2`,
      `effect-server.STORE.8`,
      `effect-server.CONFORMANCE.5`,
      `effect-server.SUBSCRIPTIONS.4`,
    ],
    reason: `CAS epoch auto-claim is the correctness fence and a single-claimant lease is the liveness fence; neither is exposed to execution yet.`,
  },
  "channel-primitive": {
    id: `channel-primitive`,
    executionAcids: [`API.21`, `API.33`, `CONFORMANCE.23`, `CONFORMANCE.39`],
    dependsOn: [`execution:channel-primitive`],
    reason: `Local settle-once channel free primitive is not implemented.`,
  },
  "snapshot-checkpoint": {
    id: `snapshot-checkpoint`,
    executionAcids: [
      `JOURNAL.9`,
      `JOURNAL.10`,
      `JOURNAL.11`,
      `INVOCATION.8`,
      `CONFORMANCE.31`,
    ],
    dependsOn: [`execution:snapshot-fold`, `effect-client.LOG.4`],
    reason: `Snapshot/tail-delta replay from a checkpoint watermark is not implemented; replay currently folds the entire log.`,
  },
  "body-determinism": {
    id: `body-determinism`,
    executionAcids: [`API.28`, `CONFORMANCE.32`],
    dependsOn: [`execution:divergence-detection`],
    reason: `Replay-unsafe body divergence (non-determinism outside keyed run) is not yet detected.`,
  },
  "idempotency-keys": {
    id: `idempotency-keys`,
    executionAcids: [`API.32`, `CONFORMANCE.38`],
    dependsOn: [`execution:run-idempotency`],
    reason: `Default step idempotency key \`\${invocationId}:\${stepKey}\` derivation and stable override are not implemented.`,
  },
  "oplog-binding-parity": {
    id: `oplog-binding-parity`,
    executionAcids: [`BOUNDARY.7`, `CONFORMANCE.42`],
    dependsOn: [`execution:operation-log-tag`, `effect-client.PRODUCER.7`],
    reason: `The OperationLog abstraction is not extracted; only a remote Durable Streams binding exists, so in-process/co-located parity cannot be proven.`,
  },
  "handler-surface": {
    id: `handler-surface`,
    executionAcids: [`API.8`, `CONFORMANCE.14`],
    dependsOn: [`execution:handler-declaration`],
    reason: `Handler-first declaration (handler/handlerRequest) is not implemented; deprecated service/object/workflow descriptors are still the surface.`,
  },
  "free-primitive-runtime": {
    id: `free-primitive-runtime`,
    executionAcids: [`API.7`, `API.23`, `CONFORMANCE.11`, `CONFORMANCE.24`],
    dependsOn: [`execution:active-operation-runtime`],
    reason: `Slot-backed active-operation runtime and the free primitives that resolve from it are not implemented.`,
  },
}

export const failBlocked = (id: string): never => {
  const dep = BLOCKED[id]
  if (dep === undefined) {
    throw new Error(`Unknown blocked dependency id: ${id}`)
  }
  throw new Error(
    `BLOCKED [${dep.id}]\n` +
      `  execution ACIDs: ${dep.executionAcids.join(`, `)}\n` +
      `  depends on:      ${dep.dependsOn.join(`, `)}\n` +
      `  reason:          ${dep.reason}`
  )
}
