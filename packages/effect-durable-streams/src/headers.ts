/**
 * Durable Streams protocol header names.
 *
 * `@effect/platform` surfaces request headers lowercased, so request headers
 * are READ via the lowercase `REQ_*` names. Response headers are EMITTED with
 * the canonical protocol casing (HTTP header names are case-insensitive on the
 * wire, but we match the protocol spec and the conformance client's
 * expectations). These mirror
 * `packages/effect-durable-client/src/protocol/constants.ts` and
 * `packages/client/src/constants.ts`; kept local so the server package has no
 * cross-package source dependency for a handful of string constants.
 */

// Response headers (canonical casing emitted to clients).
export const STREAM_NEXT_OFFSET = `Stream-Next-Offset`
export const STREAM_UP_TO_DATE = `Stream-Up-To-Date`
export const STREAM_CLOSED = `Stream-Closed`
export const PRODUCER_EPOCH = `Producer-Epoch`
export const PRODUCER_SEQ = `Producer-Seq`
export const PRODUCER_EXPECTED_SEQ = `Producer-Expected-Seq`
export const PRODUCER_RECEIVED_SEQ = `Producer-Received-Seq`

// Request header names (lowercased, as parsed by @effect/platform).
export const REQ_STREAM_SEQ = `stream-seq`
export const REQ_STREAM_CLOSED = `stream-closed`
export const REQ_CONTENT_TYPE = `content-type`
export const REQ_PRODUCER_ID = `producer-id`
export const REQ_PRODUCER_EPOCH = `producer-epoch`
export const REQ_PRODUCER_SEQ = `producer-seq`
