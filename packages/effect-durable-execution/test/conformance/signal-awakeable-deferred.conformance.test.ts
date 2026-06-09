// effect execution / settle-once lowering
//
// Proves signal, awakeable, and deferred are three distinct settle-once patterns
// with distinct identity, scope, and completion source. All cases are blocked on
// the client/server notification, append-and-close, and single-writer substrate.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / settle-once lowering`, () => {
  it(`API.15 / RESUME.2 / CONFORMANCE.19: receiver-side signal waits on the current operation [BLOCKED]`, () => {
    failBlocked(`signal-substrate`)
  })

  it(`API.16 / CONFORMANCE.19: sender-side InvocationReference.signal resolves or rejects a target signal [BLOCKED]`, () => {
    failBlocked(`signal-substrate`)
  })

  it(`API.17 / RESUME.8 / CONFORMANCE.37: an awakeable resolution after its settling append-and-close is rejected (cross-process settle-once) [BLOCKED]`, () => {
    failBlocked(`awakeable-append-close`)
  })

  it(`API.17 / RESUME.9 / CONFORMANCE.41: deferred is settled as an operation-log fact by the epoch-holding executor [BLOCKED]`, () => {
    failBlocked(`deferred-oplog-settle`)
  })

  it(`CONFORMANCE.20: awakeables and durable promises have distinct identity, scope, and completion semantics [BLOCKED]`, () => {
    failBlocked(`awakeable-append-close`)
  })
})
