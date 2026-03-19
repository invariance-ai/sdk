import { describe, it, expect, vi } from 'vitest';
import { InvarianceTracer } from '../observability/tracer.js';
import type { Transport } from '../transport.js';

function makeTracer(overrides?: { maxSessionTreeSize?: number }) {
  const transport = {
    submitTraceEvent: vi.fn().mockResolvedValue(undefined),
    submitBehavioralEvent: vi.fn().mockResolvedValue(undefined),
    verifyExecution: vi.fn().mockResolvedValue({ valid: true, executionId: 'e', chain: [], signedBy: 'inv', anchored: false }),
  };

  const tracer = new InvarianceTracer(transport as unknown as Transport, {
    mode: 'DEV',
    now: () => 1_000,
    maxSessionTreeSize: overrides?.maxSessionTreeSize,
  });

  return { tracer, transport };
}

async function traceN(tracer: InvarianceTracer, sessionId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await tracer.trace({
      sessionId,
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: { step: i } },
      fn: () => `result-${i}`,
    });
  }
}

describe('tracer memory management', () => {
  it('clearSession removes all session state', async () => {
    const { tracer } = makeTracer();

    await traceN(tracer, 'sess-1', 3);
    expect(tracer.getDevTree('sess-1')).toHaveLength(3);

    tracer.clearSession('sess-1');
    expect(tracer.getDevTree('sess-1')).toHaveLength(0);
  });

  it('clearSession is safe to call on unknown session', () => {
    const { tracer } = makeTracer();
    // Should not throw
    tracer.clearSession('nonexistent');
    expect(tracer.getDevTree('nonexistent')).toHaveLength(0);
  });

  it('sessionTrees caps at maxSessionTreeSize', async () => {
    const { tracer } = makeTracer({ maxSessionTreeSize: 5 });

    await traceN(tracer, 'sess-1', 10);

    const tree = tracer.getDevTree('sess-1');
    expect(tree).toHaveLength(5);
    // Should keep the last 5 (steps 5-9)
    expect((tree[0]!.input as { step: number }).step).toBe(5);
    expect((tree[4]!.input as { step: number }).step).toBe(9);
  });

  it('default maxSessionTreeSize is 10000', async () => {
    const { tracer } = makeTracer();
    // Trace a small number and verify no pruning happens
    await traceN(tracer, 'sess-1', 3);
    expect(tracer.getDevTree('sess-1')).toHaveLength(3);
  });

  it('clearSession does not affect other sessions', async () => {
    const { tracer } = makeTracer();

    await traceN(tracer, 'sess-1', 2);
    await traceN(tracer, 'sess-2', 3);

    tracer.clearSession('sess-1');

    expect(tracer.getDevTree('sess-1')).toHaveLength(0);
    expect(tracer.getDevTree('sess-2')).toHaveLength(3);
  });
});
