import { describe, it, expect, vi, afterEach } from 'vitest';
import { InvarianceTracer } from '../observability/tracer.js';
import { Transport } from '../transport.js';

function makeTracer(
  overrides?: Partial<{
    mode: 'DEV' | 'PROD';
    sampleRate: number;
    anomalyThreshold: number;
    random: () => number;
    now: () => number;
  }>,
) {
  const transport = {
    submitTraceEvent: vi.fn().mockResolvedValue(undefined),
    submitBehavioralEvent: vi.fn().mockResolvedValue(undefined),
    verifyExecution: vi.fn().mockResolvedValue({
      valid: true,
      executionId: 'exec-1',
      chain: [],
      signedBy: 'invariance',
      anchored: true,
      anchoredAt: '2026-03-06T00:00:00.000Z',
    }),
  };

  const tracer = new InvarianceTracer(transport as unknown as Transport, {
    mode: overrides?.mode ?? 'DEV',
    sampleRate: overrides?.sampleRate,
    anomalyThreshold: overrides?.anomalyThreshold,
    random: overrides?.random,
    now: overrides?.now,
  });

  return { tracer, transport };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InvarianceTracer observability behavior', () => {
  it('rethrows with traceEvent attached when wrapped function throws non-Error', async () => {
    const { tracer, transport } = makeTracer({ mode: 'DEV', now: () => 1_000 });

    await expect(
      tracer.trace({
        sessionId: 'sess-1',
        agentId: 'agent-1',
        action: { type: 'ToolInvocation', input: { q: 'x' } },
        fn: () => {
          throw 'boom';
        },
      }),
    ).rejects.toMatchObject({
      message: 'boom',
      traceEvent: expect.objectContaining({
        sessionId: 'sess-1',
        actionType: 'ToolInvocation',
      }),
    });

    expect(transport.submitTraceEvent).toHaveBeenCalledTimes(1);
  });

  it('does not promote baseline samples to hot paths in PROD mode', async () => {
    const randomValues = [0.0, 1.0];
    const { tracer, transport } = makeTracer({
      mode: 'PROD',
      sampleRate: 0.5,
      anomalyThreshold: 0.9,
      random: () => randomValues.shift() ?? 1.0,
      now: () => 2_000,
    });

    await tracer.trace({
      sessionId: 'sess-1',
      spanId: 'span-1',
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: { step: 1 } },
      fn: async () => 'ok-1',
    });

    await tracer.trace({
      sessionId: 'sess-1',
      spanId: 'span-1',
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: { step: 2 } },
      fn: async () => 'ok-2',
    });

    expect(transport.submitTraceEvent).toHaveBeenCalledTimes(1);
  });

  it('always captures error traces in PROD mode regardless of anomaly threshold', async () => {
    const { tracer, transport } = makeTracer({
      mode: 'PROD',
      sampleRate: 0.0,
      anomalyThreshold: 0.95,
      random: () => 1.0,
      now: () => 3_000,
    });

    await expect(
      tracer.trace({
        sessionId: 'sess-1',
        spanId: 'span-1',
        agentId: 'agent-1',
        action: { type: 'DecisionPoint', input: { step: 'fail' } },
        fn: () => {
          throw new Error('failure');
        },
      }),
    ).rejects.toThrow('failure');

    expect(transport.submitTraceEvent).toHaveBeenCalledTimes(1);
  });

  it('normalizes anchoredAt into Date in verify()', async () => {
    const { tracer } = makeTracer({ mode: 'DEV' });
    const proof = await tracer.verify('exec-1');

    expect(proof.anchoredAt).toBeInstanceOf(Date);
    expect(proof.anchoredAt?.toISOString()).toBe('2026-03-06T00:00:00.000Z');
  });
});

describe('Transport observability payload normalization', () => {
  it('adds canonical snake_case aliases for trace events and behavioral payloads', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const transport = new Transport(
      'https://api.invariance.dev',
      'inv_test',
      60_000,
      100,
      () => {},
    );

    await transport.submitTraceEvent({
      nodeId: 'node-1',
      sessionId: 'sess-1',
      parentNodeId: null,
      spanId: 'span-1',
      agentId: 'agent-1',
      actionType: 'ToolInvocation',
      input: {},
      output: {},
      metadata: { depth: 0 },
      timestamp: 10,
      durationMs: 2,
      hash: 'h1',
      previousHash: '0',
      anomalyScore: 0,
    });

    await transport.submitBehavioralEvent({
      type: 'GoalDrift',
      data: {
        nodeId: 'node-1',
        originalGoal: 'A',
        currentGoal: 'B',
        similarity: 0.6,
      },
    });

    const tracePayload = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(tracePayload.action_type).toBe('tool_invocation');
    expect(tracePayload.node_id).toBe('node-1');
    expect(tracePayload.session_id).toBe('sess-1');

    const behaviorPayload = JSON.parse(fetchMock.mock.calls[1][1].body as string) as Record<string, unknown>;
    expect(behaviorPayload.action_type).toBe('goal_drift');
    expect((behaviorPayload.data as Record<string, unknown>).node_id).toBe('node-1');

    await transport.shutdown();
  });
});
