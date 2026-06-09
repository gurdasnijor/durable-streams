// effect execution / operation log adapter
//
// The operation-log adapter must delegate producer sequence, epoch, and dedupe
// to the client producer resource (never derive sequence from collected event
// count). The failure mode is real, but the acceptance test belongs at the
// PRODUCTION boundary: the real effect-durable-client producer resource against a
// launchable server, or OTel/structured telemetry from that path once the SDD
// observability surface lands. It must NOT be proven by inspecting a fake fetch
// recorder, so these cases are explicit blocked entries.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / operation log adapter`, () => {
  it(`JOURNAL.4 / CONFORMANCE.3: producer sequence is owned by the producer resource, not derived from event count [BLOCKED]`, () => {
    failBlocked(`producer-plane`)
  })

  it(`JOURNAL.5: the adapter delegates producer identity/fencing/retry to the client producer resource [BLOCKED]`, () => {
    failBlocked(`producer-plane`)
  })

  it(`DELIVERY.6 / CONFORMANCE.26: a stale writer cannot append after a newer producer epoch claims the log [BLOCKED]`, () => {
    failBlocked(`epoch-cas-lease`)
  })

  it(`DELIVERY.7 / CONFORMANCE.27: retry-ambiguous appends from the current writer are deduplicated by producer sequence [BLOCKED]`, () => {
    failBlocked(`epoch-cas-lease`)
  })

  it(`BOUNDARY.7 / CONFORMANCE.42: the OperationLog contract holds for both remote and in-process bindings [BLOCKED]`, () => {
    failBlocked(`oplog-binding-parity`)
  })
})
