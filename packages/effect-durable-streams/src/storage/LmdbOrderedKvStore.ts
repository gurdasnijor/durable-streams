import { open as openLmdb } from "lmdb"
import { Effect, Layer, Stream } from "effect"
import { OrderedKvStore, StoreDriverError } from "./OrderedKvStore"
import type { Database } from "lmdb"
import type {
  KeyRange,
  KvEntry,
  OrderedKvStoreService,
  OrderedKvTxn,
} from "./OrderedKvStore"

export interface LmdbOptions {
  readonly path: string
  readonly mapSize?: number
}

const copy = (bytes: Uint8Array): Uint8Array => new Uint8Array(bytes)

const driverError = (
  operation: StoreDriverError[`operation`]
): ((cause: unknown) => StoreDriverError) => {
  return (cause) => new StoreDriverError({ operation, cause })
}

const scanSync = (
  db: Database<Uint8Array, Uint8Array>,
  range: KeyRange
): ReadonlyArray<KvEntry> => {
  const entries: Array<KvEntry> = []
  const rangeOptions = {
    ...(range.start === undefined ? {} : { start: range.start }),
    ...(range.end === undefined ? {} : { end: range.end }),
    ...(range.limit === undefined ? {} : { limit: range.limit }),
    ...(range.reverse === undefined ? {} : { reverse: range.reverse }),
  }
  for (const entry of db.getRange(rangeOptions)) {
    entries.push({ key: copy(entry.key), value: copy(entry.value) })
  }
  return entries
}

const makeTxn = (db: Database<Uint8Array, Uint8Array>): OrderedKvTxn => ({
  get: (key) => {
    const value = db.get(key)
    return value === undefined ? undefined : copy(value)
  },
  put: (key, value) => db.putSync(key, value),
  remove: (key) => {
    db.removeSync(key)
  },
  scan: (range) => scanSync(db, range),
})

const make = (db: Database<Uint8Array, Uint8Array>): OrderedKvStoreService => ({
  get: (key) =>
    Effect.try({
      try: () => {
        const value = db.get(key)
        return value === undefined ? undefined : copy(value)
      },
      catch: driverError(`get`),
    }),
  put: (key, value) =>
    Effect.tryPromise({
      try: () => db.put(key, value),
      catch: driverError(`put`),
    }).pipe(Effect.asVoid),
  remove: (key) =>
    Effect.tryPromise({
      try: () => db.remove(key),
      catch: driverError(`remove`),
    }).pipe(Effect.asVoid),
  scan: (range) =>
    Stream.unwrap(
      Effect.try({
        try: () => Stream.fromIterable(scanSync(db, range)),
        catch: driverError(`scan`),
      })
    ),
  writeTxn: (f) =>
    Effect.try({
      try: () => db.transactionSync(() => f(makeTxn(db))),
      catch: driverError(`writeTxn`),
    }),
})

export const layer = (
  options: LmdbOptions
): Layer.Layer<OrderedKvStore, StoreDriverError> =>
  Layer.scoped(
    OrderedKvStore,
    Effect.acquireRelease(
      Effect.try({
        try: () => {
          const openOptions = {
            path: options.path,
            encoding: `binary`,
            keyEncoding: `binary`,
            ...(options.mapSize === undefined
              ? {}
              : { mapSize: options.mapSize }),
          } as const
          const db = openLmdb<Uint8Array, Uint8Array>(openOptions)
          return { db, store: make(db) }
        },
        catch: driverError(`open`),
      }),
      ({ db }) =>
        Effect.tryPromise({
          try: () => db.close(),
          catch: driverError(`close`),
        }).pipe(Effect.orDie)
    ).pipe(Effect.map(({ store }) => store))
  )
