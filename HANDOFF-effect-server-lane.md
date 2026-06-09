# Handoff — Durable Streams `effect-durable-streams` SERVER lane

Repo: `gurdasnijor/durable-streams`. Worktree: `/Users/gnijor/gurdasnijor/ds-effect-server`
(branch `feat/effect-server-slice`). Main checkout: `/Users/gnijor/gurdasnijor/durable-streams`.

## Current state (as of handoff)

- **PR #10** open against `main`. Branch HEAD `b985bd59`. **MERGEABLE** (rebased onto
  current `origin/main` = `78926df6`, the PR #9 "protocol lint guardrails" merge).
- Narrow gates all green on HEAD:
  - `pnpm --filter effect-durable-streams typecheck` → PASS
  - `pnpm --filter effect-durable-streams lint` → PASS (0 problems; this runs `eslint .`)
  - `pnpm --filter effect-durable-streams exec vitest run --root ../.. --project effect-durable-streams test/route-precedence.test.ts test/protocol-decode.test.ts test/append-decision.test.ts` → 13 passed
- The server boots: `pnpm --filter effect-durable-streams exec tsx src/index.ts` then
  `PUT/POST/GET /v1/stream/<slash/path>` works; `/v1/stream/__ds/*` → 404.

## Lane scope + targeted ACIDs

Spec: `docs/sdds/effect-native-server-sdd.md` + `features/durable-streams/effect-server.feature.yaml`.
This slice = the **memory-store** server only. Targeted/implemented: `HTTP.1-3,5,7`,
`STORE.1,2,3,6,7`, `PRODUCERS.1-8`, `READS.1` (catch-up basics only), `CONFORMANCE.1,4,9`.
**Out of scope / blocked (do not claim):** durable backend (SQL/PGlite — see direction
below; `STORE.4/8/11-16`, `CONFORMANCE.5/7/8/10/11/12`), wake/subscriptions/pull-wake/
webhooks/schedules/filters, long-poll & SSE (`HTTP.4`, `READS.3/4`), fork stitching,
full ETag/retention/TTL, `HTTP.6` JSON append normalization (**deferred** — see below),
the shared `HttpApi` control plane (`HTTP_API.*`; lives in `packages/durable-streams-protocol`).

## File map (`packages/effect-durable-streams/src`)

- `Store.ts` — protocol/domain `Store` algebra (Context.Tag) + types (`AppendInput`,
  `AppendDecision`, `CreateInput`, `ReadChunk`, ...). NOT key-value-shaped.
- `MemoryStore.ts` — STM-backed store. `decide()` is the single §5.2 append-decision path
  (close-retry idempotency `PRODUCERS.7`, epoch-advance-seq≠0 → `ProducerGap(expected:0)`
  `PRODUCERS.8/F1`, fencing, dup, gap, content-type, stream-seq). Per-stream byte offsets.
- `schema.ts` — **wire-only, Store-free**: `UintFromString`, `AppendHeaders`/`CreateHeaders`/
  `ReadParams` schemas (via `Schema.fromKey`), `normalizeContentType`.
- `headers.ts` — protocol header name constants (Store-free).
- `routes/Stream.ts` — **the only place wire meets Store.** Composes `HttpRouter.empty.pipe(...)`
  and exports `router`. Private route-local: `streamPath` (RouteContext splat + `__ds` guard),
  `rawBody`, `lowerError`/`handle`, `toAppendInput`/`toCreateInput` (use
  `HttpServerRequest.schemaHeaders`), `to*Response` lowering, and the 5 handlers.
- `Server.ts` — `layer(options)` (platform-node `http-server` example + optional
  `server?: () => http.Server` factory for ephemeral-port injection) and `launch`. Does NOT
  export `router`.
- `Config.ts` — env `PORT` (durable-streams convention), default 4437.
- `ProtocolError.ts` — `Data.TaggedError`: NotFound/BadRequest/CreateConflict/RetentionGone.
- `storage/{OrderedKvStore,LmdbOrderedKvStore}.ts` — pre-existing LMDB ordered-KV driver.
  `LmdbOrderedKvStore.writeTxn` now awaits `db.flushed` (interim durability `STORE.13/15`).
- `test/support/start-server.ts` — boots the REAL `Server.layer` via `Layer.buildWithScope`
  - injected `node:http` server (reads bound port from `listening`). No fake transport.
- `test/{append-decision,route-precedence,protocol-decode}.test.ts` + guarded
  `test/conformance/memory.test.ts` (`RUN_CONFORMANCE=1`; the full suite mostly fails —
  out-of-scope features — Basic Stream Operations 5/5 passed).

## READ THIS FIRST — standards the reviewer enforced (I repeatedly violated these)

The previous agent (me) wasted a whole session relearning these. Do not repeat:

1. **Use the Effect/platform library; do not hand-roll.** RTFM the vendored sources
   (`/Users/gnijor/gurdasnijor/firegrid/repos/effect`) and `packages/platform-node/examples/`
   BEFORE writing. Examples that matter here: `http-server.ts`, `http-router.ts`,
   `http-tag-router.ts`, `http-client.ts`.
   - Header access → `Headers.get` / `HttpServerRequest.schemaHeaders(schema)`. Never raw
     `request.headers[name]` or a custom `headerValue`.
   - Search params → `HttpServerRequest.schemaSearchParams`. Never `new URL(...)`.
   - Splat/params → `HttpRouter.RouteContext` / `HttpRouter.params`.
   - Numeric parsing → `Schema` (e.g. `UintFromString`). **`effect-server.TOOLING.1`
     lint bans `Number`/`parseInt`/`parseFloat`/`decodeUint`-named helpers in this package.**
2. **Router composition is the abstraction.** Routes belong in `HttpRouter.empty.pipe(...)`
   (or `HttpRouter.Tag(...).use(...)`). Do NOT export Express-style handler constants and
   wire them by hand.
3. **Module boundaries: wire schema → route adapter → store.** `schema.ts`/`headers.ts` are
   wire-only and must never import `Store`. Store-aware HTTP mapping/lowering is route-local
   (in `routes/Stream.ts`), not a separate renamed "codec" bucket.
4. **No harness substrate / fakes.** Tests boot the real server (`start-server.ts`) or
   exercise the real STM store. No fake fetch recorder, no `serveEffect`/`layerTest`
   experiments (a `serveEffect`-based `Server.start` was tried and FAILED — the serving fiber
   dies after the effect returns → ECONNREFUSED; the working pattern is `Layer.buildWithScope`
   on `Server.layer` with an injected node server, already in `start-server.ts`).
5. **Do not over-claim conformance.** `HTTP.6` JSON append flattening was removed/deferred
   because the flat byte buffer cannot preserve message boundaries — don't re-add a
   concatenation that pretends to implement it.
6. **Keep PR #9 tooling.** The package `lint` script (`eslint .`) and root eslint TOOLING
   guardrails are merged on `main`; don't delete them (a stale rebase did this — fixed).

## Spec direction (durable backend — still in flux, captured in the feature ACIDs)

The strategic durable backend pivoted across the session and is now **PGlite/Postgres-shaped
SQL** (`@effect/sql-pglite` dev/conformance; Postgres production), LMDB demoted to interim
adapter/spike. The `Store` algebra must stay SQL-shaped, NOT key-value-only. `pg-cel` for CEL
filter pushdown is a _validation spike_ (PGlite can load extensions via its plugin API, but
`pg-cel` isn't packaged for PGlite yet) — `FilterEvaluator` must have capability detection +
in-Effect fallback. `@effect/sql` `SqlEventJournal` is _inspiration only_ (idempotent insert,
schema transforms, txn-wrapped append) — add Durable Streams protocol decisions explicitly.
The build-addenda corrections are encoded as ACIDs (`HTTP.7`, `HTTP_API.7/8`, `STORE.13-16`,
`PRODUCERS.7-9`, `WAKE.9`, `FILTERS.6`, `PROJECTIONS.1`, `CONFORMANCE.9-12`).

## Known debt / cleanups

- **Two commits are labelled `"just commit it"`** (content correct, ugly messages). Reword via
  interactive rebase before merge, or squash the lane into one clean commit.
- `test/conformance/memory.test.ts` is guarded (`RUN_CONFORMANCE=1`) and most of the upstream
  suite fails because it needs out-of-scope features. That's expected for this slice.

## Suggested next steps

1. Decide PR #10 disposition (merge as the memory slice, or fold into a larger one).
2. Squash/reword the `"just commit it"` commits.
3. Next functional milestone per the SDD implementation order: notification transport +
   single-node live-read wakeups (then long-poll/SSE), OR start the SQL/PGlite `Store`
   behind the existing algebra. Add conformance before advertising either.
4. When touching the control plane, implement the shared `HttpApi` from
   `packages/durable-streams-protocol` (don't leave it a stub) — `HTTP_API.7`.
