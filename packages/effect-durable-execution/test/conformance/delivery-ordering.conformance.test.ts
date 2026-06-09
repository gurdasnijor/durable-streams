// effect execution / delivery ordering
//
// Wake delivery is at-least-once; effectively-once execution comes from replaying
// the operation log before running missing steps, acking only after a durable
// outcome or suspension intent exists. Proving these requires the production
// activation path — a real OperationLog binding plus a scoped client pull-wake
// lease — not a simulated transport, so they are explicit blocked entries.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / delivery ordering`, () => {
  it(`DELIVERY.1,3 / CONFORMANCE.8: a redelivered activation replays completed steps and does not re-run the successful action [BLOCKED]`, () => {
    failBlocked(`replay-oplog-binding`)
  })

  it(`DELIVERY.2 / CONFORMANCE.9: a host cannot ack a wake done=true before a durable outcome or suspension intent is recorded [BLOCKED]`, () => {
    failBlocked(`ack-after-outcome`)
  })

  it(`DELIVERY.9 / CONFORMANCE.40: producer-epoch auto-claim is CAS and concurrent claimants need a single-claimant lease to make progress [BLOCKED]`, () => {
    failBlocked(`epoch-cas-lease`)
  })
})
