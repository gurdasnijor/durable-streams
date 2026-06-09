// effect execution / replay checkpoints
//
// Proves invocation replay can resume from a folded snapshot at a checkpoint
// watermark and apply only the operation-log tail after it, reconstructing the
// same runtime state as a full-log fold. `operationLogWatermark` is the replay
// checkpoint, not only a materialization marker. Blocked on the snapshot fold.
import { describe, it } from "vitest"
import { failBlocked } from "./harness/blocked.ts"

describe(`effect execution / replay checkpoints`, () => {
  it(`JOURNAL.9,10,11 / INVOCATION.8 / CONFORMANCE.31: snapshot+tail-delta replay reconstructs the same state as full-log replay [BLOCKED]`, () => {
    failBlocked(`snapshot-checkpoint`)
  })
})
