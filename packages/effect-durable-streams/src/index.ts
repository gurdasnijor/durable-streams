/**
 * Launchable Effect-native Durable Streams server — memory-store slice.
 *
 * Swapping persistence is changing the provided store layer, not the route
 * code (STORE.1). This entrypoint boots a Node HTTP server on the configured
 * port (default 4437) backed by the STM `MemoryStore`.
 */
import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"
import { createServer } from "node:http"
import * as AppConfig from "./Config.ts"
import * as MemoryStore from "./MemoryStore.ts"
import { router } from "./Server.ts"

export * as Storage from "./storage/index.ts"
export * as Store from "./Store.ts"
export * as MemoryStoreLayer from "./MemoryStore.ts"
export * as ProtocolError from "./ProtocolError.ts"
export * as Protocol from "./protocol.ts"
export * as Config from "./Config.ts"
export { router } from "./Server.ts"

/** The HTTP application layer over the memory store. */
export const RoutesLive = (port: number) =>
  HttpServer.serve(HttpMiddleware.logger)(router).pipe(
    Layer.provide(MemoryStore.layer),
    Layer.provide(NodeHttpServer.layer(createServer, { port }))
  )

const main = Effect.gen(function* () {
  const port = yield* AppConfig.port
  yield* Layer.launch(RoutesLive(port))
})

// Boot when run directly (e.g. `tsx src/index.ts`).
if (import.meta.url === `file://${process.argv[1]}`) {
  NodeRuntime.runMain(main)
}
