import { describe, it, expect, vi } from 'vitest';
import { InvarianceCrewAIMiddleware } from '../observability/adapters/crewai.js';
import { InvarianceTracer } from '../observability/tracer.js';
import type { Transport } from '../transport.js';

function makeTracer() {
  const transport = {
    submitTraceEvent: vi.fn().mockResolvedValue(undefined),
    submitBehavioralEvent: vi.fn().mockResolvedValue(undefined),
    verifyExecution: vi.fn().mockResolvedValue({ valid: true }),
  };

  const tracer = new InvarianceTracer(transport as unknown as Transport, {
    mode: 'DEV',
    now: () => 1_000,
  });

  return { tracer, transport };
}

function makeMiddleware(tracer: InvarianceTracer, sessionId = 'sess-1') {
  return new InvarianceCrewAIMiddleware(tracer, sessionId, () => 1_000);
}

describe('InvarianceCrewAIMiddleware', () => {
  // ── Crew start/end ──

  describe('crew lifecycle', () => {
    it('onCrewStart emits DecisionPoint and SubAgentSpawn for each agent', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      const spanId = mw.onCrewStart({
        name: 'research-crew',
        agents: ['researcher', 'writer'],
        tasks: ['research', 'write'],
      });

      expect(spanId).toBeTruthy();
      expect(mw.getCrewSpanId()).toBe(spanId);

      const calls = transport.submitBehavioralEvent.mock.calls;
      // 1 DecisionPoint + 2 SubAgentSpawn = 3 calls
      expect(calls.length).toBe(3);

      // First call: DecisionPoint for crew start
      expect(calls[0][0]).toMatchObject({
        type: 'DecisionPoint',
        data: expect.objectContaining({
          nodeId: spanId,
          candidates: ['research', 'write'],
          chosen: 'research-crew',
          depth: 0,
        }),
      });

      // 2nd and 3rd: SubAgentSpawn for each agent
      expect(calls[1][0]).toMatchObject({
        type: 'SubAgentSpawn',
        data: expect.objectContaining({
          parentNodeId: spanId,
          childAgentId: 'researcher',
          depth: 0,
        }),
      });
      expect(calls[2][0]).toMatchObject({
        type: 'SubAgentSpawn',
        data: expect.objectContaining({
          parentNodeId: spanId,
          childAgentId: 'writer',
          depth: 0,
        }),
      });
    });

    it('onCrewEnd emits completion DecisionPoint and clears crew span', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      mw.onCrewStart({ name: 'crew-1', agents: ['a1'], tasks: ['t1'] });
      transport.submitBehavioralEvent.mockClear();

      mw.onCrewEnd('crew-1', { result: 'done' });

      expect(mw.getCrewSpanId()).toBeUndefined();
      expect(mw.getActiveSpans().size).toBe(0);

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toMatchObject({
        type: 'DecisionPoint',
        data: expect.objectContaining({
          chosen: 'completed: crew-1',
          depth: 0,
        }),
      });
    });

    it('onCrewEnd is a no-op when no crew is active', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      mw.onCrewEnd('nonexistent');

      expect(transport.submitBehavioralEvent).not.toHaveBeenCalled();
    });
  });

  // ── Task lifecycle ──

  describe('task lifecycle', () => {
    it('onTaskStart creates task span nested under crew span', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      const crewSpanId = mw.onCrewStart({
        name: 'crew-1',
        agents: ['researcher'],
        tasks: ['research'],
      });
      transport.submitBehavioralEvent.mockClear();

      const taskSpanId = mw.onTaskStart({
        name: 'research',
        agentId: 'researcher',
        description: 'Research AI papers',
      });

      expect(taskSpanId).toBeTruthy();
      expect(taskSpanId).not.toBe(crewSpanId);

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toMatchObject({
        type: 'SubAgentSpawn',
        data: expect.objectContaining({
          parentNodeId: crewSpanId,
          childAgentId: 'researcher',
          depth: 1,
        }),
      });

      // Task span should be tracked as active
      expect(mw.getActiveSpans().has(taskSpanId)).toBe(true);
    });

    it('onTaskComplete emits DecisionPoint and removes task span', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      mw.onCrewStart({ name: 'crew-1', agents: ['a1'], tasks: ['t1'] });
      const taskSpanId = mw.onTaskStart({ name: 't1', agentId: 'a1' });
      transport.submitBehavioralEvent.mockClear();

      mw.onTaskComplete('t1', 'a1', { result: 'done' });

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toMatchObject({
        type: 'DecisionPoint',
        data: expect.objectContaining({
          nodeId: taskSpanId,
          candidates: ['t1'],
          chosen: 't1',
          depth: 1,
        }),
      });

      // Task span should be removed
      expect(mw.getActiveSpans().has(taskSpanId)).toBe(false);
    });

    it('onTaskError emits error DecisionPoint and removes task span', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      mw.onCrewStart({ name: 'crew-1', agents: ['a1'], tasks: ['t1'] });
      const taskSpanId = mw.onTaskStart({ name: 't1', agentId: 'a1' });
      transport.submitBehavioralEvent.mockClear();

      const error = new Error('task failed');
      mw.onTaskError('t1', 'a1', error);

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toMatchObject({
        type: 'DecisionPoint',
        data: expect.objectContaining({
          nodeId: taskSpanId,
          chosen: 'error: task failed',
          depth: 1,
        }),
      });

      expect(mw.getActiveSpans().has(taskSpanId)).toBe(false);
    });

    it('onTaskStart works without an active crew span', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      const taskSpanId = mw.onTaskStart({ name: 't1', agentId: 'a1' });

      expect(taskSpanId).toBeTruthy();

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      // parentNodeId should fall back to the taskSpanId itself
      expect(calls[0][0]).toMatchObject({
        type: 'SubAgentSpawn',
        data: expect.objectContaining({
          parentNodeId: taskSpanId,
          childAgentId: 'a1',
          depth: 1,
        }),
      });
    });
  });

  // ── Agent action tracking ──

  describe('agent action tracking', () => {
    it('onAgentAction with tool emits ToolInvocation', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      mw.onCrewStart({ name: 'crew-1', agents: ['a1'], tasks: ['t1'] });
      mw.onTaskStart({ name: 't1', agentId: 'a1' });
      transport.submitBehavioralEvent.mockClear();

      const actionSpanId = mw.onAgentAction({
        agentId: 'a1',
        action: 'search',
        tool: 'web_search',
        toolInput: { query: 'AI papers' },
      });

      expect(actionSpanId).toBeTruthy();

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toMatchObject({
        type: 'ToolInvocation',
        data: expect.objectContaining({
          nodeId: actionSpanId,
          tool: 'web_search',
          inputHash: JSON.stringify({ query: 'AI papers' }),
        }),
      });
    });

    it('onAgentAction without tool emits DecisionPoint', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      transport.submitBehavioralEvent.mockClear();

      const actionSpanId = mw.onAgentAction({
        agentId: 'a1',
        action: 'decide_next_step',
      });

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toMatchObject({
        type: 'DecisionPoint',
        data: expect.objectContaining({
          nodeId: actionSpanId,
          candidates: ['decide_next_step'],
          chosen: 'decide_next_step',
          depth: 2,
        }),
      });
    });

    it('onAgentAction with string toolInput passes it directly', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);
      transport.submitBehavioralEvent.mockClear();

      mw.onAgentAction({
        agentId: 'a1',
        action: 'search',
        tool: 'grep',
        toolInput: 'raw-string-input',
      });

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls[0][0].data.inputHash).toBe('raw-string-input');
    });

    it('onAgentAction creates span nested under parent task', () => {
      const { tracer } = makeTracer();
      const mw = makeMiddleware(tracer);

      mw.onCrewStart({ name: 'crew-1', agents: ['a1'], tasks: ['t1'] });
      const taskSpanId = mw.onTaskStart({ name: 't1', agentId: 'a1' });
      const actionSpanId = mw.onAgentAction({
        agentId: 'a1',
        action: 'search',
        tool: 'web_search',
      });

      const actionSpan = mw.getActiveSpans().get(actionSpanId);
      expect(actionSpan).toBeDefined();
      expect(actionSpan!.parentSpanId).toBe(taskSpanId);
      expect(actionSpan!.type).toBe('action');
    });
  });

  // ── Agent thinking ──

  describe('agent thinking', () => {
    it('onAgentThinking emits DecisionPoint with thought content', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      transport.submitBehavioralEvent.mockClear();

      mw.onAgentThinking({
        agentId: 'researcher',
        thought: 'I need to find recent papers on transformers',
      });

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toMatchObject({
        type: 'DecisionPoint',
        data: expect.objectContaining({
          candidates: ['I need to find recent papers on transformers'],
          chosen: 'I need to find recent papers on transformers',
          depth: 2,
        }),
      });
    });
  });

  // ── Delegation ──

  describe('delegation chains', () => {
    it('onDelegation emits SubAgentSpawn and DecisionPoint', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      transport.submitBehavioralEvent.mockClear();

      mw.onDelegation({
        fromAgentId: 'researcher',
        toAgentId: 'writer',
        taskName: 'summarize',
        reason: 'Better at writing',
      });

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(2);

      // SubAgentSpawn for the delegation target
      expect(calls[0][0]).toMatchObject({
        type: 'SubAgentSpawn',
        data: expect.objectContaining({
          childAgentId: 'writer',
          depth: 1,
        }),
      });

      // DecisionPoint capturing the delegation decision
      expect(calls[1][0]).toMatchObject({
        type: 'DecisionPoint',
        data: expect.objectContaining({
          candidates: ['researcher', 'writer'],
          chosen: 'delegate: researcher -> writer',
          depth: 1,
        }),
      });
    });

    it('tracks delegation chains via getDelegationChains()', () => {
      const { tracer } = makeTracer();
      const mw = makeMiddleware(tracer);

      expect(mw.getDelegationChains()).toHaveLength(0);

      mw.onDelegation({ fromAgentId: 'a1', toAgentId: 'a2', taskName: 't1' });
      mw.onDelegation({ fromAgentId: 'a2', toAgentId: 'a3', taskName: 't2' });

      const chains = mw.getDelegationChains();
      expect(chains).toHaveLength(2);
      expect(chains[0]).toMatchObject({ fromAgentId: 'a1', toAgentId: 'a2', taskName: 't1' });
      expect(chains[1]).toMatchObject({ fromAgentId: 'a2', toAgentId: 'a3', taskName: 't2' });
    });

    it('delegation chain preserves order of delegations', () => {
      const { tracer } = makeTracer();
      const mw = makeMiddleware(tracer);

      mw.onDelegation({ fromAgentId: 'manager', toAgentId: 'researcher', taskName: 'research' });
      mw.onDelegation({ fromAgentId: 'researcher', toAgentId: 'analyst', taskName: 'analyze' });
      mw.onDelegation({ fromAgentId: 'analyst', toAgentId: 'writer', taskName: 'write' });

      const chains = mw.getDelegationChains();
      expect(chains.map((c) => c.fromAgentId)).toEqual(['manager', 'researcher', 'analyst']);
      expect(chains.map((c) => c.toAgentId)).toEqual(['researcher', 'analyst', 'writer']);
    });
  });

  // ── Nested span relationships ──

  describe('nested span relationships (crew -> task -> action)', () => {
    it('full lifecycle produces correct nesting', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      // Crew start
      const crewSpanId = mw.onCrewStart({
        name: 'analysis-crew',
        agents: ['researcher', 'analyst'],
        tasks: ['gather-data', 'analyze'],
      });

      // Task start
      const taskSpanId = mw.onTaskStart({
        name: 'gather-data',
        agentId: 'researcher',
      });

      // Agent action
      const actionSpanId = mw.onAgentAction({
        agentId: 'researcher',
        action: 'search',
        tool: 'web_search',
        toolInput: 'data',
      });

      // Verify nesting: crew -> task -> action
      const crewSpan = mw.getActiveSpans().get(crewSpanId);
      const taskSpan = mw.getActiveSpans().get(taskSpanId);
      const actionSpan = mw.getActiveSpans().get(actionSpanId);

      expect(crewSpan!.type).toBe('crew');
      expect(crewSpan!.parentSpanId).toBeUndefined();

      expect(taskSpan!.type).toBe('task');
      expect(taskSpan!.parentSpanId).toBe(crewSpanId);

      expect(actionSpan!.type).toBe('action');
      expect(actionSpan!.parentSpanId).toBe(taskSpanId);
    });

    it('multiple tasks under same crew have correct parent', () => {
      const { tracer } = makeTracer();
      const mw = makeMiddleware(tracer);

      const crewSpanId = mw.onCrewStart({
        name: 'crew-1',
        agents: ['a1', 'a2'],
        tasks: ['t1', 't2'],
      });

      const task1SpanId = mw.onTaskStart({ name: 't1', agentId: 'a1' });
      const task2SpanId = mw.onTaskStart({ name: 't2', agentId: 'a2' });

      const task1Span = mw.getActiveSpans().get(task1SpanId);
      const task2Span = mw.getActiveSpans().get(task2SpanId);

      expect(task1Span!.parentSpanId).toBe(crewSpanId);
      expect(task2Span!.parentSpanId).toBe(crewSpanId);
    });
  });

  // ── Error propagation ──

  describe('error propagation', () => {
    it('task error includes error message in chosen field', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      mw.onCrewStart({ name: 'crew-1', agents: ['a1'], tasks: ['t1'] });
      mw.onTaskStart({ name: 't1', agentId: 'a1' });
      transport.submitBehavioralEvent.mockClear();

      const error = new Error('Connection timeout');
      mw.onTaskError('t1', 'a1', error);

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls[0][0].data.chosen).toBe('error: Connection timeout');
    });

    it('task error on unknown task still emits event', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      transport.submitBehavioralEvent.mockClear();

      mw.onTaskError('unknown-task', 'a1', new Error('fail'));

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0].data.chosen).toBe('error: fail');
    });

    it('task complete on unknown task still emits event', () => {
      const { tracer, transport } = makeTracer();
      const mw = makeMiddleware(tracer);

      transport.submitBehavioralEvent.mockClear();

      mw.onTaskComplete('unknown-task', 'a1', 'result');

      const calls = transport.submitBehavioralEvent.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0].data.chosen).toBe('unknown-task');
    });
  });

  // ── Session isolation ──

  describe('session isolation', () => {
    it('separate middleware instances track independent state', () => {
      const { tracer } = makeTracer();
      const mw1 = makeMiddleware(tracer, 'sess-1');
      const mw2 = makeMiddleware(tracer, 'sess-2');

      mw1.onCrewStart({ name: 'crew-1', agents: ['a1'], tasks: ['t1'] });
      mw2.onCrewStart({ name: 'crew-2', agents: ['a2'], tasks: ['t2'] });

      expect(mw1.getCrewSpanId()).toBeTruthy();
      expect(mw2.getCrewSpanId()).toBeTruthy();
      expect(mw1.getCrewSpanId()).not.toBe(mw2.getCrewSpanId());

      mw1.onCrewEnd('crew-1');
      expect(mw1.getCrewSpanId()).toBeUndefined();
      expect(mw2.getCrewSpanId()).toBeTruthy(); // mw2 unaffected
    });
  });
});
