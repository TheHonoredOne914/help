import assert from "node:assert/strict";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function expect(actual: any) {
  return {
    toBe(expected: any, message?: string) {
      assert.equal(actual, expected, message);
    },
    toEqual(expected: any, message?: string) {
      assert.deepEqual(actual, expected, message);
    },
    toHaveLength(expected: number, message?: string) {
      assert.equal(actual?.length, expected, message);
    },
    toContain(expected: any, message?: string) {
      if (typeof actual === "string") {
        assert.ok(actual.includes(expected), message ?? `Expected string to contain ${String(expected)}`);
        return;
      }
      assert.ok(actual?.includes?.(expected), message ?? `Expected value to contain ${String(expected)}`);
    },
    toBeGreaterThan(expected: number, message?: string) {
      assert.ok(actual > expected, message ?? `Expected ${actual} to be > ${expected}`);
    },
    toBeGreaterThanOrEqual(expected: number, message?: string) {
      assert.ok(actual >= expected, message ?? `Expected ${actual} to be >= ${expected}`);
    },
    toBeLessThan(expected: number, message?: string) {
      assert.ok(actual < expected, message ?? `Expected ${actual} to be < ${expected}`);
    },
    toBeLessThanOrEqual(expected: number, message?: string) {
      assert.ok(actual <= expected, message ?? `Expected ${actual} to be <= ${expected}`);
    },
    toThrow(expected?: string | RegExp) {
      const matcher = typeof expected === "string" ? new RegExp(escapeRegExp(expected)) : expected;
      assert.throws(actual, matcher);
    },
    toBeNull(message?: string) {
      assert.equal(actual, null, message);
    },
  };
}
