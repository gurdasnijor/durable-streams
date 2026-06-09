/**
 * Boot the REAL Effect server on an ephemeral port for HTTP-level tests, using
 * the production `Server.start` surface (no re-implementing the layer, no
 * importing `router`). Returns the bound `baseUrl` and a `close`.
 */
import { Effect, Exit, Scope } from "effect"
import * as Server from "../../src/Server.ts"

export interface Running {
  readonly baseUrl: string
  readonly close: () => Promise<void>
}

export const startServer = async (): Promise<Running> => {
  const scope = await Effect.runPromise(Scope.make())
  const address = await Effect.runPromise(
    Server.start({ port: 0 }).pipe(Scope.extend(scope))
  )
  const port = address._tag === `TcpAddress` ? address.port : 0
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  }
}
