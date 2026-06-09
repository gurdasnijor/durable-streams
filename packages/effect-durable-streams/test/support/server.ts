/**
 * Boot the Effect server (memory store) on an ephemeral port for HTTP-level
 * tests and the conformance harness. Returns the bound `baseUrl` and a `close`.
 */
import { HttpMiddleware, HttpServer } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { Effect, Exit, Layer, Scope } from "effect"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import * as MemoryStore from "../../src/MemoryStore.ts"
import { router } from "../../src/Server.ts"

export interface Running {
  readonly baseUrl: string
  readonly close: () => Promise<void>
}

export const startServer = async (): Promise<Running> => {
  const node = createServer()
  const listening = new Promise<number>((resolve) => {
    node.once("listening", () => resolve((node.address() as AddressInfo).port))
  })

  const layer = HttpServer.serve(HttpMiddleware.logger)(router).pipe(
    Layer.provide(MemoryStore.layer),
    Layer.provide(NodeHttpServer.layer(() => node, { port: 0 }))
  )

  const scope = await Effect.runPromise(Scope.make())
  await Effect.runPromise(Layer.buildWithScope(layer, scope).pipe(Effect.asVoid))
  const port = await listening

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
  }
}
