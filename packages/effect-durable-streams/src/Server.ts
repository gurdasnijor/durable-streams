/**
 * Server construction (the platform-node `http-server` example, plus an
 * observable ephemeral-port injection for tests/embedding). Route composition
 * lives in `routes/Router.ts`; this module owns the server layer and launch
 * surface only and does not export `router`.
 */
import { createServer } from "node:http"
import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import * as AppConfig from "./Config.ts"
import * as MemoryStore from "./MemoryStore.ts"
import { router } from "./routes/Stream.ts"
import type * as http from "node:http"

export interface ServerOptions {
  readonly port: number
  /**
   * Node HTTP server factory. Defaults to `createServer`; an embedder/test may
   * inject a pre-created server (e.g. to read the bound port for `port: 0`).
   * This is production construction injection, not a test harness.
   */
  readonly server?: () => http.Server
}

/** The launchable HTTP server `Layer` over the memory store. */
export const layer = (options: ServerOptions) => {
  const ServerLive = NodeHttpServer.layer(
    options.server ?? (() => createServer()),
    { port: options.port }
  )

  return HttpServer.serve(HttpMiddleware.logger)(router).pipe(
    Layer.provide(MemoryStore.layer),
    Layer.provide(ServerLive)
  )
}

/** Launch the server, reading the port from `Config`. */
export const launch = Effect.gen(function* () {
  const port = yield* AppConfig.port
  yield* Layer.launch(layer({ port }))
})
