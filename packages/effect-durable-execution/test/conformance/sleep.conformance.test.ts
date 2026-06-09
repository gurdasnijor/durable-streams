// effect execution / resume primitives (sleep)
//
// Proves durable sleep lowers to a scheduled append plus wake/materialization
// rather than a package-owned scheduler. Blocked on client/server schedule APIs.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / resume primitives (sleep)`, () => {
  it(`RESUME.1: durable sleep lowers to scheduled append plus wake/materialization [BLOCKED]`, () => {
    failBlocked(`sleep-schedule`)
  })
})
