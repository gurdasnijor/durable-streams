import * as os from "node:os"
import * as path from "node:path"
import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { OrderedKvStore } from "../../src/storage/OrderedKvStore.ts"
import * as LmdbOrderedKvStore from "../../src/storage/LmdbOrderedKvStore.ts"

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value)
const text = (value: Uint8Array): string => new TextDecoder().decode(value)

describe(`LmdbOrderedKvStore`, () => {
  it(`effect-server.STORE.10 effect-server.CONFORMANCE.8 scans keys in order`, async () => {
    const dir = path.join(os.tmpdir(), `effect-ds-lmdb-${crypto.randomUUID()}`)
    const program = Effect.gen(function* () {
      const store = yield* OrderedKvStore

      yield* store.writeTxn((txn) => {
        txn.put(bytes(`record:/rooms/a:003`), bytes(`c`))
        txn.put(bytes(`record:/rooms/a:001`), bytes(`a`))
        txn.put(bytes(`record:/rooms/a:002`), bytes(`b`))
      })

      const values = yield* store
        .scan({
          start: bytes(`record:/rooms/a:`),
          end: bytes(`record:/rooms/a;`),
        })
        .pipe(
          Stream.map((entry) => text(entry.value)),
          Stream.runCollect
        )

      expect(Array.from(values)).toEqual([`a`, `b`, `c`])
    })

    await Effect.runPromise(
      program.pipe(
        Effect.provide(LmdbOrderedKvStore.layer({ path: dir })),
        Effect.scoped
      )
    )
  })
})
