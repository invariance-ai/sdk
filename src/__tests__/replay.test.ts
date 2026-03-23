import { describe, it, expect, vi, afterEach } from 'vitest';
import { InvarianceTracer } from '../observability/tracer.js';
import { Transport } from '../transport.js';
import type { ReplayContextMode, ReplaySnapshot } from '../observability/types.js';

function makeReplayTracer(
  overrides?: Partial<{
    replayContext: ReplayContextMode;
    captureReplaySnapshots: boolean;
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
      anchored: false,
    }),
  };

  let tick = 1000;
  const tracer = new InvarianceTracer(transport as unknown as Transport, {
    mode: 'DEV',
    captureReplaySnapshots: overrides?.captureReplaySnapshots ?? true,
    replayContext: overrides?.replayContext ?? { type: 'full' },
    now: () => tick++,
  });

  return { tracer, transport };
}

async function traceN(tracer: InvarianceTracer, sessionId: string, n: number) {
  const events = [];
  for (let i = 0; i < n; i++) {
    const { event } = await tracer.trace({
      sessionId,
      agentId: 'agent-1',
      action: { type: 'ToolInvocation', input: { step: i } },
      fn: () => `result-${i}`,
    });
    events.push(event);
  }
  return events;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Replay: context hash chain', () => {
  it('builds a correct hash chain across events', async () => {
    const { tracer } = makeReplayTracer();
    const events = await traceN(tracer, 'sess-1', 3);

    // All events have contextHash and previousContextHash
    for (const e of events) {
      expect(e.contextHash).toBeDefined();
      expect(e.previousContextHash).toBeDefined();
    }

    // First event's previousContextHash is '0'
    expect(events[0]!.previousContextHash).toBe('0');

    // Chain links correctly
    expect(events[1]!.previousContextHash).toBe(events[0]!.contextHash);
    expect(events[2]!.previousContextHash).toBe(events[1]!.contextHash);

    // All context hashes are unique
    const hashes = events.map((e) => e.contextHash);
    expect(new Set(hashes).size).toBe(3);
  });
});

describe('Replay: snapshot pruning', () => {
  it('last mode keeps only the last snapshot', async () => {
    const { tracer } = makeReplayTracer({ replayContext: { type: 'last' } });
    const events = await traceN(tracer, 'sess-1', 3);

    expect(tracer.getSnapshot('sess-1', events[0]!.nodeId)).toBeUndefined();
    expect(tracer.getSnapshot('sess-1', events[1]!.nodeId)).toBeUndefined();
    expect(tracer.getSnapshot('sess-1', events[2]!.nodeId)).toBeDefined();
  });

  it('window mode keeps only the last N snapshots', async () => {
    const { tracer } = makeReplayTracer({ replayContext: { type: 'window', size: 2 } });
    const events = await traceN(tracer, 'sess-1', 5);

    // First 3 should be pruned
    for (let i = 0; i < 3; i++) {
      expect(tracer.getSnapshot('sess-1', events[i]!.nodeId)).toBeUndefined();
    }
    // Last 2 should exist
    for (let i = 3; i < 5; i++) {
      expect(tracer.getSnapshot('sess-1', events[i]!.nodeId)).toBeDefined();
    }
  });

  it('invalid window size falls back to last snapshot retention', async () => {
    const { tracer } = makeReplayTracer({ replayContext: { type: 'window', size: 0 } });
    const events = await traceN(tracer, 'sess-1', 3);

    expect(tracer.getSnapshot('sess-1', events[0]!.nodeId)).toBeUndefined();
    expect(tracer.getSnapshot('sess-1', events[1]!.nodeId)).toBeUndefined();
    expect(tracer.getSnapshot('sess-1', events[2]!.nodeId)).toBeDefined();
  });

  it('full mode retains all snapshots', async () => {
    const { tracer } = makeReplayTracer({ replayContext: { type: 'full' } });
    const events = await traceN(tracer, 'sess-1', 3);

    for (const e of events) {
      expect(tracer.getSnapshot('sess-1', e.nodeId)).toBeDefined();
    }
  });
});

describe('Replay: context hash preserved after pruning', () => {
  it('contextHash is set on all events even when snapshots are pruned', async () => {
    const { tracer } = makeReplayTracer({ replayContext: { type: 'last' } });
    const events = await traceN(tracer, 'sess-1', 3);

    // Snapshots pruned for first two
    expect(tracer.getSnapshot('sess-1', events[0]!.nodeId)).toBeUndefined();
    expect(tracer.getSnapshot('sess-1', events[1]!.nodeId)).toBeUndefined();

    // But contextHash was computed before pruning
    for (const e of events) {
      expect(e.contextHash).toBeDefined();
      expect(typeof e.contextHash).toBe('string');
      expect(e.contextHash!.length).toBeGreaterThan(0);
    }
  });
});

describe('Replay: manual captureSnapshot', () => {
  it('stores and retrieves a manually captured snapshot', () => {
    const { tracer } = makeReplayTracer({ replayContext: { type: 'full' } });

    const snapshot: ReplaySnapshot = {
      nodeId: 'node-manual',
      sessionId: 'sess-1',
      timestamp: 5000,
      llmMessages: [{ role: 'user', content: 'hello' }],
      custom: { foo: 'bar' },
    };

    tracer.captureSnapshot('sess-1', 'node-manual', snapshot);
    const retrieved = tracer.getSnapshot('sess-1', 'node-manual');
    expect(retrieved).toEqual(snapshot);
  });
});

describe('Replay: transport methods', () => {
  it('normalizes replay and counterfactual payload casing', async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          timeline: [{
            node_id: 'node-1',
            action_type: 'tool_invocation',
            timestamp: 1000,
            duration_ms: 4,
            hash: 'h1',
            context_hash: 'c1',
            has_snapshot: true,
            agent_id: 'agent-1',
            input: { q: 'x' },
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          snapshot: {
            node_id: 'node-1',
            session_id: 'sess-1',
            timestamp: 1000,
            llm_messages: [{ role: 'user', content: 'hi' }],
            tool_results: [{ ok: true }],
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          original_node_id: 'node-1',
          counterfactual_node_id: 'node-2',
          branch_session_id: 'cf-sess-1-123',
        }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const transport = new Transport(
      'https://api.invariance.dev',
      'inv_test',
      60_000,
      100,
      () => {},
    );

    const timeline = await transport.getReplayTimeline('sess-1') as any;
    expect(timeline.timeline[0].nodeId).toBe('node-1');
    expect(timeline.timeline[0].actionType).toBe('ToolInvocation');
    expect(timeline.timeline[0].durationMs).toBe(4);
    expect(timeline.timeline[0].contextHash).toBe('c1');
    expect(timeline.timeline[0].hasSnapshot).toBe(true);
    expect(timeline.timeline[0].agentId).toBe('agent-1');

    const nodeSnapshot = await transport.getNodeSnapshot('node-1') as any;
    expect(nodeSnapshot.snapshot.nodeId).toBe('node-1');
    expect(nodeSnapshot.snapshot.sessionId).toBe('sess-1');
    expect(nodeSnapshot.snapshot.llmMessages).toEqual([{ role: 'user', content: 'hi' }]);
    expect(nodeSnapshot.snapshot.toolResults).toEqual([{ ok: true }]);

    const result = await transport.submitCounterfactual({
      branchFromNodeId: 'node-1',
      modifiedInput: { alt: true },
      modifiedActionType: 'ToolInvocation',
    }) as any;
    expect(result.originalNodeId).toBe('node-1');
    expect(result.counterfactualNodeId).toBe('node-2');
    expect(result.branchSessionId).toBe('cf-sess-1-123');

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const body = JSON.parse(fetchMock.mock.calls[2]![1]!.body as string);
    expect(body.branch_from_node_id).toBe('node-1');
    expect(body.modified_input).toEqual({ alt: true });
    expect(body.modified_action_type).toBe('tool_invocation');

    await transport.shutdown();
  });
});
