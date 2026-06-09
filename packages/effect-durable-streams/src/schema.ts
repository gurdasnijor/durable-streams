/**
 * Protocol wire Schemas — Store-free. Numeric protocol/header values are decoded
 * through Effect `Schema` only (never hand-written JS numeric coercion), per
 * effect-server.TOOLING.1. These schemas are consumed by the route module via
 * `HttpServerRequest.schemaHeaders` / `schemaSearchParams`.
 */
import { Schema } from "effect"
import {
  REQ_CONTENT_TYPE,
  REQ_PRODUCER_EPOCH,
  REQ_PRODUCER_ID,
  REQ_PRODUCER_SEQ,
  REQ_STREAM_CLOSED,
  REQ_STREAM_SEQ,
} from "./headers.ts"

/**
 * A strict non-negative integer carried as a string (producer epoch/seq, byte
 * offsets): digits only — no sign, exponent, or whitespace — bounded to the
 * safe-integer ceiling expressed as a literal, so the module references no
 * banned numeric-coercion identifiers.
 */
export const UintFromString = Schema.compose(
  Schema.String.pipe(Schema.pattern(/^\d+$/)),
  Schema.NumberFromString
).pipe(
  Schema.int(),
  Schema.nonNegative(),
  Schema.lessThanOrEqualTo(9_007_199_254_740_991)
)

/**
 * Append-request headers. `Producer-Epoch`/`Producer-Seq` decode through the
 * strict-uint transform (a malformed integer is a `ParseError`); the all-or-none
 * producer-tuple rule is applied by the route after decode. Excess headers are
 * ignored by default.
 */
export const AppendHeaders = Schema.Struct({
  contentType: Schema.optional(Schema.String).pipe(
    Schema.fromKey(REQ_CONTENT_TYPE)
  ),
  streamClosed: Schema.optional(Schema.String).pipe(
    Schema.fromKey(REQ_STREAM_CLOSED)
  ),
  streamSeq: Schema.optional(Schema.String).pipe(
    Schema.fromKey(REQ_STREAM_SEQ)
  ),
  producerId: Schema.optional(Schema.String).pipe(
    Schema.fromKey(REQ_PRODUCER_ID)
  ),
  producerEpoch: Schema.optional(UintFromString).pipe(
    Schema.fromKey(REQ_PRODUCER_EPOCH)
  ),
  producerSeq: Schema.optional(UintFromString).pipe(
    Schema.fromKey(REQ_PRODUCER_SEQ)
  ),
})

/** Create-request (`PUT`) headers. */
export const CreateHeaders = Schema.Struct({
  contentType: Schema.optional(Schema.String).pipe(
    Schema.fromKey(REQ_CONTENT_TYPE)
  ),
  streamClosed: Schema.optional(Schema.String).pipe(
    Schema.fromKey(REQ_STREAM_CLOSED)
  ),
})

/** Catch-up read (`GET`) search params. */
export const ReadParams = Schema.Struct({
  offset: Schema.optional(Schema.String),
})

/** Strip `Content-Type` parameters to the lowercased media type. */
export const normalizeContentType = (ct: string | undefined): string =>
  ct === undefined ? `` : ct.split(`;`)[0]!.trim().toLowerCase()
