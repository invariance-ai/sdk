import type { Receipt } from './types.js';

/** Filter predicate for trace queries */
export type TraceFilter = (receipt: Receipt) => boolean;

/**
 * Chainable query builder for filtering trace receipts.
 * Operates over in-memory receipts or fetches from backend.
 */
export class TraceQuery {
  private receipts: Receipt[];
  private filters: TraceFilter[];

  constructor(receipts: Receipt[]) {
    this.receipts = receipts;
    this.filters = [];
  }

  /** Filter by action type */
  ofType(actionType: string): TraceQuery {
    return this.where((r) => r.action === actionType);
  }

  /** Filter by agent name */
  byAgent(agent: string): TraceQuery {
    return this.where((r) => r.agent === agent);
  }

  /** Filter to only receipts with errors */
  withError(): TraceQuery {
    return this.where((r) => r.error != null);
  }

  /** Filter by custom predicate */
  where(predicate: TraceFilter): TraceQuery {
    const next = new TraceQuery(this.receipts);
    next.filters = [...this.filters, predicate];
    return next;
  }

  /** Filter by time range (unix ms) */
  inTimeRange(from: number, to: number): TraceQuery {
    return this.where((r) => r.timestamp >= from && r.timestamp <= to);
  }

  /** Get all matching receipts */
  all(): Receipt[] {
    return this.receipts.filter((r) => this.filters.every((f) => f(r)));
  }

  /** Count matching receipts */
  count(): number {
    return this.all().length;
  }

  /** Get first matching receipt or undefined */
  first(): Receipt | undefined {
    return this.all()[0];
  }
}
