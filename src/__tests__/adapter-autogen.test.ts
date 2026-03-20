import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvarianceAutoGenMiddleware } from '../observability/adapters/autogen.js';
import { InvarianceTracer } from '../observability/tracer.js';
import type { Transport } from '../transport.js';

function makeTracer() {
  const transport = {
    submitTraceEvent: vi.fn().mockResolvedValue(undefined),
    submitBehavioralEvent: vi.fn().mockResolvedValue(undefined),
    verifyExecution: vi.fn().mockResolvedValue({
      valid: true,
      executionId: 'exec-1',
      chain: [],
      signedBy: 'invariance',
      anchored: true,
    }),
  };

  const tracer = new InvarianceTracer(transport as unknown as Transport, {
    mode: 'DEV',
  });

  return { tracer, transport };
}

describe('InvarianceAutoGenMiddleware', () => {
  let tracer: InvarianceTracer;
  let transport: ReturnType<typeof makeTracer>['transport'];
  let middleware: InvarianceAutoGenMiddleware;

  beforeEach(() => {
    const t = makeTracer();
    tracer = t.tracer;
    transport = t.transport;
    middleware = new InvarianceAutoGenMiddleware(tracer, 'session-autogen');
  });

  // ── Message passing ──

  describe('onMessage', () => {
    it('emits a DecisionPoint event for message passing', () => {
      middleware.onMessage('agent-a', 'agent-b', 'Hello there');

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.type).toBe('DecisionPoint');
      expect(payload.data.chosen).toBe('agent-a');
      expect(payload.data.candidates).toEqual(['agent-b']);
    });

    it('includes schemaVersion in message events', () => {
      middleware.onMessage('agent-a', 'agent-b', 'Test');

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.schemaVersion).toBe('1.0.0');
    });

    it('includes sender, receiver, and content in message events', () => {
      middleware.onMessage('sender-1', 'receiver-1', 'content-msg');

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.sender).toBe('sender-1');
      expect(payload.data.receiver).toBe('receiver-1');
      expect(payload.data.content).toBe('content-msg');
      expect(payload.data.eventType).toBe('message');
    });
  });

  // ── Tool call / result tracking ──

  describe('onToolCall', () => {
    it('emits a ToolInvocation event', () => {
      const callId = middleware.onToolCall('agent-1', 'search', { query: 'test' });

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.type).toBe('ToolInvocation');
      expect(payload.data.tool).toBe('search');
      expect(payload.data.eventType).toBe('tool_call');
      expect(payload.data.schemaVersion).toBe('1.0.0');
      expect(typeof callId).toBe('string');
      expect(callId.length).toBeGreaterThan(0);
    });

    it('returns a call ID for correlation with tool result', () => {
      const callId = middleware.onToolCall('agent-1', 'calculator', { x: 1 });
      expect(typeof callId).toBe('string');
      expect(callId).toBe(transport.submitBehavioralEvent.mock.calls[0][0].data.nodeId);
    });

    it('serializes args in inputHash', () => {
      middleware.onToolCall('agent-1', 'tool', { key: 'value' });

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.inputHash).toBe(JSON.stringify({ key: 'value' }));
    });
  });

  describe('onToolResult', () => {
    it('emits a ToolInvocation event for tool result', () => {
      middleware.onToolResult('agent-1', 'search', { results: ['a', 'b'] }, 'call-123', 42);

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.type).toBe('ToolInvocation');
      expect(payload.data.tool).toBe('search');
      expect(payload.data.latencyMs).toBe(42);
      expect(payload.data.eventType).toBe('tool_result');
      expect(payload.data.schemaVersion).toBe('1.0.0');
      expect(payload.data.nodeId).toBe('call-123');
    });

    it('generates a nodeId when callId is not provided', () => {
      middleware.onToolResult('agent-1', 'tool', 'result');

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(typeof payload.data.nodeId).toBe('string');
      expect(payload.data.nodeId.length).toBeGreaterThan(0);
    });

    it('defaults durationMs to 0 when not provided', () => {
      middleware.onToolResult('agent-1', 'tool', 'result');

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.latencyMs).toBe(0);
    });
  });

  // ── Group chat lifecycle ──

  describe('onGroupChatStart', () => {
    it('emits SubAgentSpawn for each agent', () => {
      const agents = ['agent-a', 'agent-b', 'agent-c'];
      const chatId = middleware.onGroupChatStart(agents);

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(3);
      expect(typeof chatId).toBe('string');

      for (let i = 0; i < agents.length; i++) {
        const payload = transport.submitBehavioralEvent.mock.calls[i][0];
        expect(payload.type).toBe('SubAgentSpawn');
        expect(payload.data.childAgentId).toBe(agents[i]);
        expect(payload.data.schemaVersion).toBe('1.0.0');
        expect(payload.data.eventType).toBe('group_chat_start');
        expect(payload.data.chatId).toBe(chatId);
        expect(payload.data.agents).toEqual(agents);
      }
    });

    it('returns a unique chat ID', () => {
      const id1 = middleware.onGroupChatStart(['a']);
      const id2 = middleware.onGroupChatStart(['b']);
      expect(id1).not.toBe(id2);
    });
  });

  describe('onGroupChatMessage', () => {
    it('emits a DecisionPoint with group chat context', () => {
      const chatId = middleware.onGroupChatStart(['agent-a', 'agent-b']);
      transport.submitBehavioralEvent.mockClear();

      middleware.onGroupChatMessage(chatId, 'agent-a', 'Hello group');

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.type).toBe('DecisionPoint');
      expect(payload.data.chosen).toBe('agent-a');
      expect(payload.data.candidates).toEqual(['agent-a', 'agent-b']);
      expect(payload.data.depth).toBe(1);
      expect(payload.data.schemaVersion).toBe('1.0.0');
      expect(payload.data.eventType).toBe('group_chat_message');
      expect(payload.data.chatId).toBe(chatId);
      expect(payload.data.messageIndex).toBe(1);
    });

    it('increments message count', () => {
      const chatId = middleware.onGroupChatStart(['a', 'b']);
      transport.submitBehavioralEvent.mockClear();

      middleware.onGroupChatMessage(chatId, 'a', 'msg1');
      middleware.onGroupChatMessage(chatId, 'b', 'msg2');
      middleware.onGroupChatMessage(chatId, 'a', 'msg3');

      const state = middleware.getGroupChatState(chatId);
      expect(state?.messageCount).toBe(3);

      // Verify messageIndex increments
      const msg3Payload = transport.submitBehavioralEvent.mock.calls[2][0];
      expect(msg3Payload.data.messageIndex).toBe(3);
    });

    it('handles message to unknown chat gracefully', () => {
      middleware.onGroupChatMessage('unknown-chat', 'agent-x', 'hello');

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.depth).toBe(0);
      expect(payload.data.candidates).toEqual(['agent-x']);
    });
  });

  describe('onGroupChatEnd', () => {
    it('emits a summary DecisionPoint and removes state', () => {
      const chatId = middleware.onGroupChatStart(['agent-a', 'agent-b']);
      middleware.onGroupChatMessage(chatId, 'agent-a', 'msg1');
      middleware.onGroupChatMessage(chatId, 'agent-b', 'msg2');
      transport.submitBehavioralEvent.mockClear();

      const state = middleware.onGroupChatEnd(chatId);

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.type).toBe('DecisionPoint');
      expect(payload.data.eventType).toBe('group_chat_end');
      expect(payload.data.chatId).toBe(chatId);
      expect(payload.data.agents).toEqual(['agent-a', 'agent-b']);
      expect(payload.data.messageCount).toBe(2);
      expect(payload.data.schemaVersion).toBe('1.0.0');

      expect(state).toBeDefined();
      expect(state!.messageCount).toBe(2);
      expect(state!.agents).toEqual(['agent-a', 'agent-b']);

      // State is cleaned up
      expect(middleware.getGroupChatState(chatId)).toBeUndefined();
    });

    it('returns undefined for unknown chat', () => {
      const result = middleware.onGroupChatEnd('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  // ── Group chat membership tracking ──

  describe('group chat membership', () => {
    it('tracks membership correctly', () => {
      const agents = ['alice', 'bob', 'charlie'];
      const chatId = middleware.onGroupChatStart(agents);

      const state = middleware.getGroupChatState(chatId);
      expect(state).toBeDefined();
      expect(state!.agents).toEqual(agents);
      expect(state!.messageCount).toBe(0);
    });

    it('returns active group chats', () => {
      const id1 = middleware.onGroupChatStart(['a']);
      const id2 = middleware.onGroupChatStart(['b']);

      const active = middleware.getActiveGroupChats();
      expect(active).toContain(id1);
      expect(active).toContain(id2);
      expect(active.length).toBe(2);
    });

    it('removes ended chats from active list', () => {
      const id1 = middleware.onGroupChatStart(['a']);
      const id2 = middleware.onGroupChatStart(['b']);

      middleware.onGroupChatEnd(id1);

      const active = middleware.getActiveGroupChats();
      expect(active).not.toContain(id1);
      expect(active).toContain(id2);
      expect(active.length).toBe(1);
    });

    it('returns a copy of state to prevent external mutation', () => {
      const chatId = middleware.onGroupChatStart(['a', 'b']);
      const state1 = middleware.getGroupChatState(chatId);
      state1!.agents.push('c');

      const state2 = middleware.getGroupChatState(chatId);
      expect(state2!.agents).toEqual(['a', 'b']);
    });
  });

  // ── Agent response ──

  describe('onAgentResponse', () => {
    it('emits a DecisionPoint for agent response', () => {
      middleware.onAgentResponse('agent-1', 'The answer is 42', 'user-query');

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.type).toBe('DecisionPoint');
      expect(payload.data.chosen).toBe('The answer is 42');
      expect(payload.data.candidates).toEqual(['user-query']);
      expect(payload.data.eventType).toBe('agent_response');
      expect(payload.data.agentId).toBe('agent-1');
      expect(payload.data.replyTo).toBe('user-query');
      expect(payload.data.schemaVersion).toBe('1.0.0');
    });

    it('handles response without replyTo', () => {
      middleware.onAgentResponse('agent-1', 'Unprompted response');

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.candidates).toEqual([]);
      expect(payload.data.replyTo).toBeUndefined();
    });
  });

  // ── Function call ──

  describe('onFunctionCall', () => {
    it('emits a ToolInvocation for function call', () => {
      middleware.onFunctionCall('agent-1', 'calculate_sum', { a: 1, b: 2 }, 3);

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.type).toBe('ToolInvocation');
      expect(payload.data.tool).toBe('calculate_sum');
      expect(payload.data.eventType).toBe('function_call');
      expect(payload.data.agentId).toBe('agent-1');
      expect(payload.data.schemaVersion).toBe('1.0.0');
      expect(payload.data.args).toEqual({ a: 1, b: 2 });
      expect(payload.data.result).toBe(3);
    });

    it('handles function call without result', () => {
      middleware.onFunctionCall('agent-1', 'side_effect_fn', {});

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.outputHash).toBe('');
      expect(payload.data.result).toBeUndefined();
    });

    it('serializes complex args and results', () => {
      const args = { nested: { deep: true }, list: [1, 2, 3] };
      const result = { status: 'ok', data: [4, 5] };
      middleware.onFunctionCall('agent-1', 'complex_fn', args, result);

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.inputHash).toBe(JSON.stringify(args));
      expect(payload.data.outputHash).toBe(JSON.stringify(result));
    });
  });

  // ── Schema version in all events ──

  describe('schemaVersion embedded in all events', () => {
    it('is present in onMessage events', () => {
      middleware.onMessage('a', 'b', 'c');
      expect(transport.submitBehavioralEvent.mock.calls[0][0].data.schemaVersion).toBe('1.0.0');
    });

    it('is present in onToolCall events', () => {
      middleware.onToolCall('a', 'tool', {});
      expect(transport.submitBehavioralEvent.mock.calls[0][0].data.schemaVersion).toBe('1.0.0');
    });

    it('is present in onToolResult events', () => {
      middleware.onToolResult('a', 'tool', 'result');
      expect(transport.submitBehavioralEvent.mock.calls[0][0].data.schemaVersion).toBe('1.0.0');
    });

    it('is present in onGroupChatStart events', () => {
      middleware.onGroupChatStart(['a']);
      expect(transport.submitBehavioralEvent.mock.calls[0][0].data.schemaVersion).toBe('1.0.0');
    });

    it('is present in onGroupChatMessage events', () => {
      const chatId = middleware.onGroupChatStart(['a']);
      transport.submitBehavioralEvent.mockClear();
      middleware.onGroupChatMessage(chatId, 'a', 'msg');
      expect(transport.submitBehavioralEvent.mock.calls[0][0].data.schemaVersion).toBe('1.0.0');
    });

    it('is present in onGroupChatEnd events', () => {
      const chatId = middleware.onGroupChatStart(['a']);
      transport.submitBehavioralEvent.mockClear();
      middleware.onGroupChatEnd(chatId);
      expect(transport.submitBehavioralEvent.mock.calls[0][0].data.schemaVersion).toBe('1.0.0');
    });

    it('is present in onAgentResponse events', () => {
      middleware.onAgentResponse('a', 'content');
      expect(transport.submitBehavioralEvent.mock.calls[0][0].data.schemaVersion).toBe('1.0.0');
    });

    it('is present in onFunctionCall events', () => {
      middleware.onFunctionCall('a', 'fn', {});
      expect(transport.submitBehavioralEvent.mock.calls[0][0].data.schemaVersion).toBe('1.0.0');
    });
  });

  // ── Error handling ──

  describe('error handling', () => {
    it('handles tracer emit errors via transport onError', () => {
      const onError = vi.fn();
      const errorTransport = {
        submitTraceEvent: vi.fn().mockResolvedValue(undefined),
        submitBehavioralEvent: vi.fn().mockRejectedValue(new Error('network fail')),
        verifyExecution: vi.fn().mockResolvedValue({}),
      };
      const errorTracer = new InvarianceTracer(errorTransport as unknown as Transport, {
        mode: 'DEV',
        onError,
      });
      const mw = new InvarianceAutoGenMiddleware(errorTracer, 'session-err');

      // Should not throw synchronously
      expect(() => mw.onMessage('a', 'b', 'msg')).not.toThrow();
    });

    it('handles onGroupChatEnd for non-existent chat', () => {
      const result = middleware.onGroupChatEnd('does-not-exist');
      expect(result).toBeUndefined();
      expect(transport.submitBehavioralEvent).not.toHaveBeenCalled();
    });

    it('handles onToolCall with string args', () => {
      middleware.onToolCall('agent-1', 'tool', 'plain-string-arg');

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.inputHash).toBe('plain-string-arg');
    });

    it('handles onToolResult with string result', () => {
      middleware.onToolResult('agent-1', 'tool', 'string-result');

      const payload = transport.submitBehavioralEvent.mock.calls[0][0];
      expect(payload.data.outputHash).toBe('string-result');
    });
  });

  // ── Session ID ──

  describe('session tracking', () => {
    it('exposes sessionId as readonly', () => {
      expect(middleware.sessionId).toBe('session-autogen');
    });
  });
});
