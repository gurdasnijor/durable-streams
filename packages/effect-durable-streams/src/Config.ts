/**
 * Server configuration. The HTTP port is read from `Config` (env
 * `DS_EFFECT_SERVER_PORT`) with a default of 4437.
 */
import { Config } from "effect"

export const DEFAULT_PORT = 4437

export const port: Config.Config<number> = Config.integer(
  "DS_EFFECT_SERVER_PORT"
).pipe(Config.withDefault(DEFAULT_PORT))
