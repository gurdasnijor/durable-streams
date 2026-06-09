/**
 * The protocol/domain `Store` algebra.
 *
 * The store exposes *protocol decisions*, not database details (STORE.9 /
 * STORE.14 — it must not be key-value-shaped). `append` is intentionally the
 * atomic operation: it validates PROTOCOL.md §5.2 append precedence, appends
 * data, updates producer state, and records tail advancement in one step. All
 * append conflicts that affect §5.2 precedence are `AppendDecision` variants in
 * the success channel (not split into `ProtocolError`), keeping closed-stream
 * conflict ahead of content-type mismatch ahead of stream-seq regression ahead
 * of producer rules in one decision path.
 *
 * This slice implements the memory backend only: `createStream`, `append`,
 * `read`, `head`, `currentTail`, `listStreams`. Subscription/wake/schedule
 * members from the full SDD algebra are intentionally omitted from this slice
 * to keep the algebra honest and compiling.
 */
import { Context } from "effect"
import type { Effect, Option } from "effect"
import type { ProtocolError } from "./ProtocolError.ts"

/** Opaque, stream-local offset token. Clients MUST NOT interpret the format. */
export type Offset = string

/** A stream path relative to the `/v1/stream/` root (e.g. `rooms/general`). */
export type StreamPath = string

/** Identifies a producer tuple for idempotent-producer decisions. */
export interface Producer {
  readonly id: string
  readonly epoch: number
  readonly seq: number
}

export interface AppendInput {
  readonly path: StreamPath
  readonly contentType: string
  readonly body: Uint8Array
  readonly close: boolean
  /** The optional `Stream-Seq` writer-coordination value (lexicographic). */
  readonly streamSeq: Option.Option<string>
  readonly producer: Option.Option<Producer>
}

export interface CreateInput {
  readonly path: StreamPath
  readonly contentType: string
  /** Optional initial body written at create time (PUT with a body). */
  readonly body: Uint8Array
  readonly close: boolean
}

/** The result of a create-only `PUT`. */
export type CreateDecision =
  | {
      readonly _tag: `Created`
      readonly tail: Offset
      readonly closed: boolean
    }
  | {
      readonly _tag: `AlreadyExists`
      readonly tail: Offset
      readonly closed: boolean
    }

/**
 * The single append decision path. Corrected outcome matrix per the SDD build
 * addenda (PRODUCERS.7 idempotent close retry, PRODUCERS.8 / F1 epoch advance
 * with non-zero seq).
 */
export type AppendDecision =
  | {
      readonly _tag: `PlainAccepted`
      readonly nextOffset: Offset
      readonly closed: boolean
    }
  | {
      readonly _tag: `ProducerAccepted`
      readonly nextOffset: Offset
      readonly closed: boolean
      readonly producerEpoch: number
      readonly highestAcceptedSeq: number
    }
  | {
      readonly _tag: `ProducerDuplicate`
      readonly nextOffset: Offset
      readonly closed: boolean
      readonly producerEpoch: number
      readonly highestAcceptedSeq: number
    }
  | { readonly _tag: `ProducerFenced`; readonly currentEpoch: number }
  | {
      readonly _tag: `ProducerGap`
      readonly expectedSeq: number
      readonly receivedSeq: number
    }
  | { readonly _tag: `ClosedConflict`; readonly finalOffset: Offset }
  | { readonly _tag: `ContentTypeMismatch` }
  | { readonly _tag: `StreamSeqRegression` }

export interface TailAdvanced {
  readonly path: StreamPath
  readonly tailOffset: Offset
  readonly closed: boolean
}

export interface AppendResult {
  readonly append: AppendDecision
  readonly tailAdvanced: Option.Option<TailAdvanced>
}

export interface StreamTail {
  readonly path: StreamPath
  readonly tailOffset: Offset
  readonly closed: boolean
  readonly contentType: string
}

/** A catch-up read result: bytes from `offset` to the current tail. */
export interface ReadChunk {
  readonly path: StreamPath
  readonly contentType: string
  readonly body: Uint8Array
  /** Tail offset after the returned bytes (the next offset to read from). */
  readonly nextOffset: Offset
  /** True when the returned bytes reach the current tail. */
  readonly upToDate: boolean
  readonly closed: boolean
}

export interface StreamSnapshot {
  readonly path: StreamPath
  readonly tailOffset: Offset
  readonly closed: boolean
  readonly contentType: string
}

export interface StoreShape {
  readonly createStream: (
    input: CreateInput
  ) => Effect.Effect<CreateDecision, ProtocolError>

  readonly append: (
    input: AppendInput
  ) => Effect.Effect<AppendResult, ProtocolError>

  readonly read: (
    path: StreamPath,
    offset: Offset
  ) => Effect.Effect<ReadChunk, ProtocolError>

  readonly head: (path: StreamPath) => Effect.Effect<StreamTail, ProtocolError>

  readonly currentTail: (
    path: StreamPath
  ) => Effect.Effect<StreamTail, ProtocolError>

  /** Delete a stream. Fails with `NotFound` if it does not exist. */
  readonly deleteStream: (
    path: StreamPath
  ) => Effect.Effect<void, ProtocolError>

  readonly listStreams: (
    pattern: string
  ) => Effect.Effect<ReadonlyArray<StreamSnapshot>, ProtocolError>
}

export class Store extends Context.Tag(`@durable-streams/effect-server/Store`)<
  Store,
  StoreShape
>() {}
