/**
 * Protocol/domain failures raised by the store algebra and the HTTP routes.
 *
 * These are typed errors in the Effect error channel. Append *protocol
 * conflicts* that participate in PROTOCOL.md §5.2 precedence (closed-stream,
 * content-type mismatch, stream-seq regression, producer rules) are NOT modeled
 * here — they are `Store.AppendDecision` variants returned in the success
 * channel so the single decision path keeps its precedence. `ProtocolError`
 * covers store/transport-level failures: missing streams, malformed requests,
 * create conflicts, and retention gaps.
 */
import { Data } from "effect"

/** The requested stream does not exist. Lowered to HTTP 404. */
export class NotFound extends Data.TaggedError(`NotFound`)<{
  readonly path: string
}> {}

/**
 * The request was malformed (e.g. partial producer headers, non-integer
 * producer header, an epoch advance presented with a non-zero seq at the HTTP
 * boundary, or an empty JSON array on POST). Lowered to HTTP 400.
 */
export class BadRequest extends Data.TaggedError(`BadRequest`)<{
  readonly reason: string
}> {}

/**
 * A create-only `PUT` was attempted with a config that conflicts with the
 * existing stream (e.g. different content type). Lowered to HTTP 409.
 */
export class CreateConflict extends Data.TaggedError(`CreateConflict`)<{
  readonly path: string
  readonly reason: string
}> {}

/**
 * The requested offset has been compacted / aged out of retention. Lowered to
 * HTTP 410. (Declared for completeness; retention is out of scope for the
 * memory-store slice and never raised here.)
 */
export class RetentionGone extends Data.TaggedError(`RetentionGone`)<{
  readonly path: string
  readonly offset: string
}> {}

export type ProtocolError =
  | NotFound
  | BadRequest
  | CreateConflict
  | RetentionGone
