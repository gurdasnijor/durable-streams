import { Context, Data } from "effect"
import type { Effect, Stream } from "effect"

export class StoreDriverError extends Data.TaggedError(
  `effect-durable-streams/StoreDriverError`
)<{
  readonly cause: unknown
  readonly operation:
    | `get`
    | `put`
    | `remove`
    | `scan`
    | `writeTxn`
    | `open`
    | `close`
}> {}

export interface KvEntry {
  readonly key: Uint8Array
  readonly value: Uint8Array
}

export interface KeyRange {
  readonly start?: Uint8Array
  readonly end?: Uint8Array
  readonly limit?: number
  readonly reverse?: boolean
}

export interface OrderedKvTxn {
  readonly get: (key: Uint8Array) => Uint8Array | undefined
  readonly put: (key: Uint8Array, value: Uint8Array) => void
  readonly remove: (key: Uint8Array) => void
  readonly scan: (range: KeyRange) => ReadonlyArray<KvEntry>
}

export interface OrderedKvStoreService {
  readonly get: (
    key: Uint8Array
  ) => Effect.Effect<Uint8Array | undefined, StoreDriverError>
  readonly put: (
    key: Uint8Array,
    value: Uint8Array
  ) => Effect.Effect<void, StoreDriverError>
  readonly remove: (key: Uint8Array) => Effect.Effect<void, StoreDriverError>
  readonly scan: (range: KeyRange) => Stream.Stream<KvEntry, StoreDriverError>
  readonly writeTxn: <A>(
    f: (txn: OrderedKvTxn) => A
  ) => Effect.Effect<A, StoreDriverError>
}

export class OrderedKvStore extends Context.Tag(
  `effect-durable-streams/OrderedKvStore`
)<OrderedKvStore, OrderedKvStoreService>() {}
