/**
 * Route composition. The raw stream data plane is hand-routed through
 * `HttpRouter` because it needs raw bytes and protocol headers (HTTP_API.4).
 *
 * The wildcard `/v1/stream/*` carries the FULL slash-containing stream path; the
 * reserved-path guard lives in the handlers (`StreamRoutes.resolvePath`). The
 * SDD's `__ds` control plane (HttpApi) is not part of this memory-store slice —
 * an unmatched `/v1/stream/__ds/*` is rejected by the guard, never creating a
 * user stream (HTTP.7 / CONFORMANCE.9).
 */
import { HttpRouter } from "@effect/platform"
import * as StreamRoutes from "./routes/StreamRoutes.ts"

export const router = HttpRouter.empty.pipe(
  HttpRouter.put("/v1/stream/*", StreamRoutes.create),
  HttpRouter.post("/v1/stream/*", StreamRoutes.append),
  HttpRouter.head("/v1/stream/*", StreamRoutes.head),
  HttpRouter.get("/v1/stream/*", StreamRoutes.read),
  HttpRouter.del("/v1/stream/*", StreamRoutes.remove)
)
