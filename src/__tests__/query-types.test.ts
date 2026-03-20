import { describe, it, expect } from 'vitest';
import type {
  NLQueryRequest,
  NLQueryResponse,
  NLTraceContext,
  LiveStatusEvent,
} from '../query-types.js';

describe('query-types', () => {
  it('NLQueryRequest shape is valid', () => {
    const req: NLQueryRequest = {
      question: 'How many sessions?',
      conversation_id: 'conv-1',
      context: { agent_id: 'agent-1', time_range: { since: 1000 } },
    };
    expect(req.question).toBe('How many sessions?');
    expect(req.context?.agent_id).toBe('agent-1');
  });

  it('NLQueryResponse round-trip serialization', () => {
    const res: NLQueryResponse = {
      answer: 'There are 5 sessions',
      conversation_id: 'conv-1',
      data_sources: [{ type: 'sessions', count: 5, query_description: 'all sessions' }],
      confidence: 0.95,
    };
    const serialized = JSON.stringify(res);
    const deserialized = JSON.parse(serialized) as NLQueryResponse;
    expect(deserialized.answer).toBe(res.answer);
    expect(deserialized.data_sources[0].count).toBe(5);
    expect(deserialized.confidence).toBe(0.95);
  });

  it('NLTraceContext with causal chain', () => {
    const ctx: NLTraceContext = {
      session_id: 'sess-1',
      nodes: [],
      highlighted_node_ids: ['node-1'],
      causal_chain: {
        nodes: [],
        anomaly_flags: [{ node_id: 'node-1', score: 0.9, label: 'goal_drift' }],
        root_cause_node_id: 'node-1',
      },
    };
    expect(ctx.causal_chain?.root_cause_node_id).toBe('node-1');
  });

  it('LiveStatusEvent shape', () => {
    const event: LiveStatusEvent = {
      id: '01ABC',
      type: 'trace_node_created',
      timestamp: Date.now(),
      session_id: 'sess-1',
      agent_id: 'agent-1',
      payload: { node_id: 'n1' },
    };
    expect(event.type).toBe('trace_node_created');
    expect(event.payload.node_id).toBe('n1');
  });
});
