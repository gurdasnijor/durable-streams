// effect execution / durable select
//
// Proves durable waits race through a typed `select` resolved by earliest
// operation-log offset (deterministic across replays), NOT through Effect.race /
// Effect.raceAll (which resolve by wall-clock and are replay-unstable). Blocked
// on durable waits and operation-log offsets being available to select.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / durable select`, () => {
  it(`API.29 / CONFORMANCE.33: when multiple durable waits are satisfied on replay, select picks the earliest operation-log offset [BLOCKED]`, () => {
    failBlocked(`durable-select`)
  })
})
