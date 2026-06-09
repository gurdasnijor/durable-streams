// effect execution / channel re-run caution
//
// Proves channel is local-only settle-once coordination (first send wins, receive
// resolves once, no operation-log event, no replay reconstruction) and that
// routines it coordinates re-run on replay, so any side effect inside them must
// go through keyed `run` or replay duplicates it. Blocked on the channel
// primitive landing.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / channel re-run caution`, () => {
  it(`API.21 / CONFORMANCE.23: channel is local-only — first send wins, receive resolves once, no operation-log event, no replay reconstruction [BLOCKED]`, () => {
    failBlocked(`channel-primitive`)
  })

  it(`API.33 / CONFORMANCE.39: a side effect inside a channel-coordinated routine runs once across replays only when wrapped in keyed run [BLOCKED]`, () => {
    failBlocked(`channel-primitive`)
  })
})
