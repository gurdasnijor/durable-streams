// effect execution / state replay semantics
//
// Proves waitForState lowers to a server-side filtered subscription plus state
// materialization (no client polling), freezes the matched value into
// StateWaitSatisfied, and resolves only on authoritative domain facts — never on
// derived execution-metadata projections. Also proves state() writes replay from
// operation-log facts. Blocked on CEL filtered subscriptions and state lowering.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / state replay semantics`, () => {
  it(`API.25 / RESUME.6 / CONFORMANCE.28: waitForState lowers to a filtered subscription plus materialization and does not poll [BLOCKED]`, () => {
    failBlocked(`wait-for-state`)
  })

  it(`API.31 / CONFORMANCE.35: waitForState replay returns the value frozen into StateWaitSatisfied [BLOCKED]`, () => {
    failBlocked(`wait-for-state`)
  })

  it(`BOUNDARY.6 / INVOCATION.9 / CONFORMANCE.36: waitForState resolves only on authoritative domain facts, never on derived projections [BLOCKED]`, () => {
    failBlocked(`wait-for-state`)
  })

  it(`API.30 / CONFORMANCE.34: state() writes replay deterministically from operation-log facts [BLOCKED]`, () => {
    failBlocked(`state-writes`)
  })
})
