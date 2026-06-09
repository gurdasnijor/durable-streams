/**
 * Shared protocol Schemas. Numeric protocol/header values are decoded through
 * Effect `Schema` only — never hand-written JS numeric coercion — per
 * effect-server.TOOLING.1.
 */
import { Schema } from "effect"

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
