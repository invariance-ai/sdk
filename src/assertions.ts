import type { Receipt } from './types.js';
import { TraceQuery } from './trace-query.js';

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

export class TraceAssertions {
  private query: TraceQuery;

  constructor(query: TraceQuery) {
    this.query = query;
  }

  toHaveCount(n: number): this {
    const actual = this.query.count();
    if (actual !== n) {
      throw new AssertionError(`Expected ${n} matching receipts, got ${actual}`);
    }
    return this;
  }

  toHaveNoErrors(): this {
    const errors = this.query.withError().all();
    if (errors.length > 0) {
      const actions = errors.map((r) => r.action).join(', ');
      throw new AssertionError(`Expected no errors, but found ${errors.length}: [${actions}]`);
    }
    return this;
  }

  toAllSatisfy(predicate: (r: Receipt) => boolean, description?: string): this {
    const all = this.query.all();
    const failing = all.filter((r) => !predicate(r));
    if (failing.length > 0) {
      throw new AssertionError(
        `${failing.length} of ${all.length} receipts failed${description ? `: ${description}` : ''}`
      );
    }
    return this;
  }

  toContainAction(actionType: string): this {
    const found = this.query.ofType(actionType).count();
    if (found === 0) {
      throw new AssertionError(`Expected at least one "${actionType}" action, found none`);
    }
    return this;
  }

  toHaveChainIntegrity(): this {
    const all = this.query.all();
    if (all.length < 2) return this;

    for (let i = 1; i < all.length; i++) {
      const curr = all[i]!;
      const prev = all[i - 1]!;
      if (curr.previousHash !== prev.hash) {
        throw new AssertionError(
          `Chain integrity broken at index ${i}: expected previousHash "${prev.hash}", got "${curr.previousHash}"`
        );
      }
    }
    return this;
  }

  toHaveDurationBelow(ms: number): this {
    const all = this.query.all();
    if (all.length < 2) return this;

    const first = all[0]!.timestamp;
    const last = all[all.length - 1]!.timestamp;
    const duration = last - first;
    if (duration > ms) {
      throw new AssertionError(`Session duration ${duration}ms exceeds limit of ${ms}ms`);
    }
    return this;
  }
}

/** Create a chainable assertion object from a TraceQuery */
export function assertTrace(query: TraceQuery): TraceAssertions {
  return new TraceAssertions(query);
}
