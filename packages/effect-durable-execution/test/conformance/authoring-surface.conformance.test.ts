// effect execution / authoring surface
//
// Proves the operation-first public surface: ordinary Effect programs, a
// handler-first definition surface, free primitives resolved from an active
// runtime, and the deliberate ABSENCE of Restate-style service/object/workflow
// definitions, host-level invocation control, and runtime escape hatches.
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { run } from "effect-durable-execution"
import { hasExport } from "./harness/surface.ts"
import { failBlocked } from "./harness/blocked.ts"

const FREE_PRIMITIVES = [
  `run`,
  `sleep`,
  `signal`,
  `awakeable`,
  `deferred`,
  `waitForState`,
  `attach`,
  `state`,
  `sharedState`,
  `channel`,
  `select`,
  `call`,
  `send`,
  `cancel`,
  `handlerRequest`,
]

const HOST_CONTROL_APIS = [
  `start`,
  `status`,
  `list`,
  `delete`,
  `pause`,
  `resume`,
  `restart`,
]

const RESTATE_DEFINITIONS = [`service`, `object`, `workflow`]

const ESCAPE_HATCHES = [`currentRuntime`, `currentOps`]

describe(`effect execution / authoring surface`, () => {
  it(`API.20 / CONFORMANCE.10: durable programs are ordinary lazy Effect values`, () => {
    const program = run(`step`, Effect.succeed(1))
    expect(Effect.isEffect(program)).toBe(true)
  })

  it(`API.7 / CONFORMANCE.11: the free primitive surface is exported [RED]`, () => {
    const missing = FREE_PRIMITIVES.filter((name) => !hasExport(name))
    expect(missing).toEqual([])
  })

  it(`API.8 / CONFORMANCE.14: handler-first declaration surface is exported [RED]`, () => {
    expect(hasExport(`handler`)).toBe(true)
    expect(hasExport(`handlerRequest`)).toBe(true)
    if (!hasExport(`handler`)) failBlocked(`handler-surface`)
  })

  it(`CONFORMANCE.25: no Restate-equivalent service/object/workflow definition APIs [RED]`, () => {
    const exported = RESTATE_DEFINITIONS.filter((name) => hasExport(name))
    expect(exported).toEqual([])
  })

  it(`API.23 / CONFORMANCE.24: no currentRuntime/currentOps escape hatch`, () => {
    const exported = ESCAPE_HATCHES.filter((name) => hasExport(name))
    expect(exported).toEqual([])
  })

  it(`API.12 / CONFORMANCE.17: no host-level invocation control APIs`, () => {
    const exported = HOST_CONTROL_APIS.filter((name) => hasExport(name))
    expect(exported).toEqual([])
  })

  it(`API.7 / CONFORMANCE.11: free primitives fail deterministically outside an active operation runtime [BLOCKED]`, () => {
    failBlocked(`free-primitive-runtime`)
  })
})
