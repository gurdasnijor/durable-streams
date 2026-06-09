/**
 * Stream data-plane route composition. The raw stream plane is hand-routed
 * through `HttpRouter` because it needs raw bytes and protocol headers
 * (HTTP_API.4). The wildcard `/v1/stream/*` carries the FULL slash-containing
 * stream path; the reserved `__ds` guard lives in the handlers
 * (`StreamRoutes.resolvePath`), so an unmatched `/v1/stream/__ds/*` is rejected
 * and never creates a user stream (HTTP.7 / CONFORMANCE.9).
 */
import { HttpRouter } from "@effect/platform"
import * as StreamRoutes from "./StreamRoutes.ts"

export const router = HttpRouter.empty.pipe(
  HttpRouter.put(`/v1/stream/*`, StreamRoutes.create),
  HttpRouter.post(`/v1/stream/*`, StreamRoutes.append),
  HttpRouter.head(`/v1/stream/*`, StreamRoutes.head),
  HttpRouter.get(`/v1/stream/*`, StreamRoutes.read),
  HttpRouter.del(`/v1/stream/*`, StreamRoutes.remove)
)
