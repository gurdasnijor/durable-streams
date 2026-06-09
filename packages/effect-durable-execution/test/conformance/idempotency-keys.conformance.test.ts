// effect execution / step idempotency keys
//
// Proves step idempotency keys auto-derive from `${invocationId}:${stepKey}`,
// are stable across replays, and that a caller override (for matching an external
// API's required key format) is reused verbatim on replay. Blocked on `run`
// idempotency-key derivation landing.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / step idempotency keys`, () => {
  it(`API.32 / CONFORMANCE.38: default idempotency key equals \${invocationId}:\${stepKey} and is stable across replay; an override is reused verbatim [BLOCKED]`, () => {
    failBlocked(`idempotency-keys`)
  })
})
