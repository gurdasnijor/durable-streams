/**
 * Server construction. Composes the stream `Router` with the memory `Store` and
 * a Node HTTP server into a launchable Effect `Layer`. Swapping persistence is
 * changing the provided store layer, not the route code (STORE.1).
 *
 * (Route composition lives in `routes/Router.ts`; this module owns the server
 * layer and launch surface.)
 */
import { createServer } from "node:http"
import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import * as AppConfig from "./Config.ts"
import * as MemoryStore from "./MemoryStore.ts"
import { router } from "./routes/Router.ts"

export interface ServerOptions {
  readonly port: number
}

/** The launchable HTTP server `Layer` over the memory store. */
export const layer = (options: ServerOptions) =>
  HttpServer.serve(HttpMiddleware.logger)(router).pipe(
    Layer.provide(MemoryStore.layer),
    Layer.provide(NodeHttpServer.layer(createServer, { port: options.port }))
  )

/** Launch the server, reading the port from `Config`. */
export const launch = Effect.gen(function* () {
  const port = yield* AppConfig.port
  yield* Layer.launch(layer({ port }))
})

/**
 * Start the server in the current `Scope` and return its bound `Address`. This
 * is the programmatic/embedding surface (also used by tests to boot the real
 * server on an ephemeral port); closing the scope shuts the server down.
 */
export const start = (options: ServerOptions) =>
  Effect.gen(function* () {
    yield* HttpServer.serveEffect(router, HttpMiddleware.logger)
    const server = yield* HttpServer.HttpServer
    return server.address
  }).pipe(
    Effect.provide(MemoryStore.layer),
    Effect.provide(NodeHttpServer.layer(createServer, { port: options.port }))
  )
