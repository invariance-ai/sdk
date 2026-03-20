import { describe, it, expect } from 'vitest';
import { TraceQuery } from '../trace-query.js';
import { assertTrace, AssertionError } from '../assertions.js';
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

describe('assertTrace', () => {
  it('toHaveNoErrors passes for clean session', () => {
    const q = new TraceQuery([
      makeReceipt({ action: 'tool_invocation' }),
      makeReceipt({ action: 'decision_point' }),
    ]);
    expect(() => assertTrace(q).toHaveNoErrors()).not.toThrow();
  });

  it('toHaveNoErrors throws for session with errors', () => {
    const q = new TraceQuery([
      makeReceipt({ action: 'tool_invocation', error: 'failed' }),
    ]);
    expect(() => assertTrace(q).toHaveNoErrors()).toThrow(AssertionError);
  });

  it('toHaveCount checks exact count', () => {
    const q = new TraceQuery([
      makeReceipt({ action: 'a' }),
      makeReceipt({ action: 'b' }),
    ]);
    expect(() => assertTrace(q).toHaveCount(2)).not.toThrow();
    expect(() => assertTrace(q).toHaveCount(3)).toThrow(AssertionError);
  });

  it('toContainAction checks action presence', () => {
    const q = new TraceQuery([makeReceipt({ action: 'tool_invocation' })]);
    expect(() => assertTrace(q).toContainAction('tool_invocation')).not.toThrow();
    expect(() => assertTrace(q).toContainAction('nonexistent')).toThrow(AssertionError);
  });

  it('toAllSatisfy checks all receipts match predicate', () => {
    const q = new TraceQuery([
      makeReceipt({ action: 'a', agent: 'bot' }),
      makeReceipt({ action: 'b', agent: 'bot' }),
    ]);
    expect(() => assertTrace(q).toAllSatisfy((r) => r.agent === 'bot')).not.toThrow();
    expect(() => assertTrace(q).toAllSatisfy((r) => r.action === 'a')).toThrow(AssertionError);
  });

  it('toHaveChainIntegrity validates hash chain', () => {
    const q = new TraceQuery([
      makeReceipt({ hash: 'abc', previousHash: '0' }),
      makeReceipt({ hash: 'def', previousHash: 'abc' }),
    ]);
    expect(() => assertTrace(q).toHaveChainIntegrity()).not.toThrow();

    const broken = new TraceQuery([
      makeReceipt({ hash: 'abc', previousHash: '0' }),
      makeReceipt({ hash: 'def', previousHash: 'wrong' }),
    ]);
    expect(() => assertTrace(broken).toHaveChainIntegrity()).toThrow(AssertionError);
  });

  it('chains assertions', () => {
    const q = new TraceQuery([
      makeReceipt({ action: 'tool_invocation' }),
      makeReceipt({ action: 'decision_point' }),
    ]);
    expect(() =>
      assertTrace(q).toHaveNoErrors().toHaveCount(2).toContainAction('tool_invocation')
    ).not.toThrow();
  });
});
