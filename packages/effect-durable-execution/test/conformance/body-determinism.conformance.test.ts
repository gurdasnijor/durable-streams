// effect execution / body determinism
//
// The replay contract: anything non-deterministic (wall clock, random, UUID,
// positional counters) must be captured inside keyed `run` so replay returns the
// recorded value, and non-determinism produced OUTSIDE `run` must be detected as
// replay-unsafe divergence. Both require running the body across two activations
// against a real OperationLog binding (not a simulated transport), so they are
// explicit blocked entries.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / body determinism`, () => {
  it(`API.28: non-determinism captured inside run is recorded and stable across replay [BLOCKED]`, () => {
    failBlocked(`replay-oplog-binding`)
  })

  it(`API.28 / CONFORMANCE.32: non-determinism produced outside run is detected as replay-unsafe body divergence [BLOCKED]`, () => {
    failBlocked(`body-determinism`)
  })
})
