import { describe, it, expect } from 'vitest';
import { EvalSuite } from '../eval.js';
import { assertTrace } from '../assertions.js';
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

describe('EvalSuite', () => {
  const receipts: Receipt[] = [
    makeReceipt({ action: 'tool_invocation' }),
    makeReceipt({ action: 'decision_point' }),
  ];

  it('runs programmatic evals', async () => {
    const suite = new EvalSuite();
    suite.add('no errors', (t) => assertTrace(t).toHaveNoErrors());
    suite.add('has tools', (t) => assertTrace(t).toContainAction('tool_invocation'));

    const results = await suite.run(receipts);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('no errors');
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(true);
  });

  it('captures failures', async () => {
    const suite = new EvalSuite();
    suite.add('wrong count', (t) => assertTrace(t).toHaveCount(999));

    const results = await suite.run(receipts);
    expect(results[0].passed).toBe(false);
    expect(results[0].reason).toContain('999');
  });

  it('runs LLM judge with mock provider', async () => {
    const suite = new EvalSuite();
    suite.addJudge('tone check', {
      prompt: 'Was the agent polite?',
      provider: async () => '{"score": 0.9, "reasoning": "Very polite agent behavior"}',
    });

    const results = await suite.run(receipts);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('tone check');
    expect(results[0].passed).toBe(true);
    expect(results[0].score).toBe(0.9);
    expect(results[0].reason).toBe('Very polite agent behavior');
  });

  it('handles judge parse failure gracefully', async () => {
    const suite = new EvalSuite();
    suite.addJudge('bad judge', {
      prompt: 'Rate this',
      provider: async () => 'invalid json response',
    });

    const results = await suite.run(receipts);
    expect(results[0].passed).toBe(false);
    expect(results[0].score).toBe(0);
  });

  it('measures duration_ms', async () => {
    const suite = new EvalSuite();
    suite.add('quick check', () => {});

    const results = await suite.run(receipts);
    expect(results[0].duration_ms).toBeGreaterThanOrEqual(0);
  });
});
