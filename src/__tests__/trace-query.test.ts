import { describe, it, expect } from 'vitest';
import { TraceQuery } from '../trace-query.js';
import type { Receipt } from '../types.js';

function makeReceipt(overrides: Partial<Receipt> & { action: string }): Receipt {
  return {
    id: overrides.id ?? 'r-1',
    sessionId: overrides.sessionId ?? 's-1',
    agent: overrides.agent ?? 'bot',
    action: overrides.action,
    input: overrides.input ?? {},
    output: overrides.output,
    error: overrides.error,
    timestamp: overrides.timestamp ?? Date.now(),
    hash: overrides.hash ?? 'h1',
    previousHash: overrides.previousHash ?? '0',
    signature: overrides.signature ?? null,
  };
}

describe('TraceQuery', () => {
  const receipts: Receipt[] = [
    makeReceipt({ id: '1', action: 'tool_invocation', agent: 'bot-a', timestamp: 1000 }),
    makeReceipt({ id: '2', action: 'decision_point', agent: 'bot-a', timestamp: 2000 }),
    makeReceipt({ id: '3', action: 'tool_invocation', agent: 'bot-b', error: 'timeout', timestamp: 3000 }),
    makeReceipt({ id: '4', action: 'constraint_check', agent: 'bot-a', timestamp: 4000 }),
  ];

  it('ofType filters by action', () => {
    const q = new TraceQuery(receipts);
    expect(q.ofType('tool_invocation').count()).toBe(2);
  });

  it('byAgent filters by agent', () => {
    const q = new TraceQuery(receipts);
    expect(q.byAgent('bot-a').count()).toBe(3);
  });

  it('withError filters to error receipts', () => {
    const q = new TraceQuery(receipts);
    expect(q.withError().count()).toBe(1);
    expect(q.withError().first()?.id).toBe('3');
  });

  it('chains filters', () => {
    const q = new TraceQuery(receipts);
    expect(q.ofType('tool_invocation').withError().count()).toBe(1);
  });

  it('inTimeRange filters by time', () => {
    const q = new TraceQuery(receipts);
    expect(q.inTimeRange(1500, 3500).count()).toBe(2);
  });

  it('all returns matching receipts', () => {
    const q = new TraceQuery(receipts);
    const all = q.ofType('decision_point').all();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('2');
  });

  it('first returns first match or undefined', () => {
    const q = new TraceQuery(receipts);
    expect(q.ofType('nonexistent').first()).toBeUndefined();
    expect(q.ofType('tool_invocation').first()?.id).toBe('1');
  });

  it('where applies custom predicate', () => {
    const q = new TraceQuery(receipts);
    expect(q.where((r) => r.timestamp > 2500).count()).toBe(2);
  });
});
