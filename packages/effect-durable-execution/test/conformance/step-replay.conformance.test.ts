// effect execution / step replay
//
// The keyed replay fold over named step outcomes: skip a recorded success,
// replay a typed failure through its declared schema, and treat StepStarted as
// observability-only (a started-but-unfinished step re-runs). These are
// execution-owned semantics, but their ACCEPTANCE belongs at the production
// seam — a real OperationLog binding/layer that execution actually uses
// (in-process, or remote against a launchable server via effect-durable-client),
// observed through return values and OTel from that path. We do NOT simulate a
// Durable Streams server in a conformance directory to make replay observable.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / step replay`, () => {
  it(`JOURNAL.1,2 / CONFORMANCE.1: a successful named step is not re-run on replay [BLOCKED]`, () => {
    failBlocked(`replay-oplog-binding`)
  })

  it(`JOURNAL.3 / CONFORMANCE.2: a failed named step replays through its declared error schema [BLOCKED]`, () => {
    failBlocked(`replay-oplog-binding`)
  })

  it(`JOURNAL.8 / CONFORMANCE.15: StepStarted without a terminal outcome does not skip re-execution [BLOCKED]`, () => {
    failBlocked(`replay-oplog-binding`)
  })
})
