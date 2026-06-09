// Conformance harness: probe the public package surface as data, so the harness
// TYPECHECKS against today's exports but can assert presence/absence/shape of the
// TARGET authoring surface (`handler`, free primitives, etc.) and go red at
// runtime until that surface lands. We never import not-yet-existing named
// exports directly — that would break `tsc` for the whole workspace.
import * as EDE from "effect-durable-execution"

const surface = { ...EDE } as Record<string, unknown>

export const exportNames = (): ReadonlyArray<string> => Object.keys(surface)

export const hasExport = (name: string): boolean => surface[name] !== undefined

export const getExport = (name: string): unknown => surface[name]

export type AnyFn = (...args: ReadonlyArray<unknown>) => unknown

/**
 * Resolve a target free primitive by name or throw a descriptive red. As the
 * primitive lands, callers can exercise the returned function for real.
 */
export const requirePrimitive = (name: string, note?: string): AnyFn => {
  const value = surface[name]
  if (typeof value !== `function`) {
    throw new Error(
      `BLOCKED conformance: \`${name}\` is not yet exported by ` +
        `effect-durable-execution.${note === undefined ? `` : ` ${note}`}`
    )
  }
  return value as AnyFn
}
