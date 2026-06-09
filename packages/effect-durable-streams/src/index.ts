/**
 * Public surface + launchable entrypoint for the Effect-native Durable Streams
 * server (memory-store slice). Server construction/launch lives in `Server.ts`;
 * route composition in `routes/Router.ts`.
 */
import { NodeRuntime } from "@effect/platform-node"
import * as Server from "./Server.ts"

export * as Storage from "./storage/index.ts"
export * as Store from "./Store.ts"
export * as MemoryStore from "./MemoryStore.ts"
export * as ProtocolError from "./ProtocolError.ts"
export * as Schema from "./schema.ts"
export * as Config from "./Config.ts"
export * as Server from "./Server.ts"

// Boot when run directly (e.g. `tsx src/index.ts`).
if (import.meta.url === `file://${process.argv[1]}`) {
  NodeRuntime.runMain(Server.launch)
}
