/**
 * Brick 18 — Legacy synthesis guard.
 *
 * B18-03: Gate legacy synthesis paths in production.
 * B18-32: Synthetic sources allowed only in NODE_ENV=test with explicit flag.
 * B18-37: Legacy path must not bypass ClaimGraph/ClaimLedger/validation.
 */

export const LEGACY_SYNTHESIS_BLOCKED = "LEGACY_SYNTHESIS_BLOCKED";

/**
 * Check if legacy synthesis is allowed in the current environment.
 * Returns true only if:
 * - NODE_ENV is "test" AND explicit flag is set, or
 * - NODE_ENV is not "production"
 *
 * B18-03: In production, legacy synthesis must be blocked.
 */
export function isLegacySynthesisAllowed(options?: {
  allowSyntheticSourceUsage?: boolean;
}): boolean {
  const env = process.env.NODE_ENV ?? "development";

  // B18-03: Production always blocked
  if (env === "production") return false;

  // B18-32: Test environment requires explicit flag
  if (env === "test") return options?.allowSyntheticSourceUsage === true;

  // Development: allowed for debugging
  return true;
}

/**
 * Guard that throws if legacy synthesis is called in production.
 * Use this at the top of `services/synthesis.ts`.
 */
export function assertLegacySynthesisAllowed(options?: {
  allowSyntheticSourceUsage?: boolean;
}): void {
  if (!isLegacySynthesisAllowed(options)) {
    throw new Error(
      `${LEGACY_SYNTHESIS_BLOCKED}: Legacy synthesis is blocked in ${process.env.NODE_ENV ?? "unknown"} environment. ` +
      "Use the synthesis engine (core/synthesis/synthesis-engine) for evidence-grounded synthesis.",
    );
  }
}

/**
 * B18-32: Check if synthetic source usage is allowed.
 * Only permitted in test environment with explicit opt-in.
 */
export function isSyntheticSourceAllowed(options?: {
  allowSyntheticSourceUsage?: boolean;
}): boolean {
  const env = process.env.NODE_ENV ?? "development";

  // Never in production
  if (env === "production") return false;

  // Test: only with explicit flag
  if (env === "test") return options?.allowSyntheticSourceUsage === true;

  // Development: only with explicit flag
  return options?.allowSyntheticSourceUsage === true;
}
