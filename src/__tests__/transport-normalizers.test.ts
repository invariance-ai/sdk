import { describe, expect, it } from 'vitest';
import {
  normalizeBehavioralPayload,
  normalizeCounterfactualRequestPayload,
  normalizeCounterfactualResponse,
  normalizeNodeSnapshotResponse,
  normalizeReplayTimelineResponse,
  normalizeTraceEventPayload,
} from '../transport-normalizers.js';

describe('transport normalizers', () => {
  it('normalizes trace event aliases and canonicalizes action type', () => {
    const normalized = normalizeTraceEventPayload({
      sessionId: 'sess-1',
      agentId: 'agent-1',
      actionType: 'A2ASend',
      durationMs: 42,
    }) as Record<string, unknown>;

    expect(normalized.session_id).toBe('sess-1');
    expect(normalized.agent_id).toBe('agent-1');
    expect(normalized.duration_ms).toBe(42);
    expect(normalized.action_type).toBe('a2a_send');
  });

  it('normalizes behavioral payload aliases', () => {
    const normalized = normalizeBehavioralPayload({
      type: 'ToolInvocation',
      data: {
        nodeId: 'node-1',
        latencyMs: 18,
        outputHash: 'hash-1',
      },
    }) as Record<string, unknown>;

    expect(normalized.action_type).toBe('tool_invocation');
    expect(normalized.data).toMatchObject({
      node_id: 'node-1',
      latency_ms: 18,
      output_hash: 'hash-1',
    });
  });

  it('normalizes replay timeline responses into SDK action names when available', () => {
    const normalized = normalizeReplayTimelineResponse({
      timeline: [
        { node_id: 'node-1', action_type: 'orchestrator_decision', duration_ms: 12, context_hash: 'ctx', has_snapshot: true, agent_id: 'agent-1' },
        { node_id: 'node-2', action_type: 'a2a_send', duration_ms: 6, context_hash: 'ctx-2', has_snapshot: false, agent_id: 'agent-2' },
      ],
    }) as { timeline: Array<Record<string, unknown>> };

    expect(normalized.timeline[0]).toMatchObject({
      nodeId: 'node-1',
      actionType: 'OrchestrationDecision',
      durationMs: 12,
      contextHash: 'ctx',
      hasSnapshot: true,
      agentId: 'agent-1',
    });
    expect(normalized.timeline[1]?.actionType).toBe('A2ASend');
  });

  it('normalizes node snapshot responses', () => {
    const normalized = normalizeNodeSnapshotResponse({
      snapshot: {
        node_id: 'node-1',
        session_id: 'sess-1',
        llm_messages: [{ role: 'user' }],
      },
    }) as { snapshot: Record<string, unknown> };

    expect(normalized.snapshot).toMatchObject({
      nodeId: 'node-1',
      sessionId: 'sess-1',
      llmMessages: [{ role: 'user' }],
    });
  });

  it('normalizes counterfactual request and response payloads', () => {
    const request = normalizeCounterfactualRequestPayload({
      branchFromNodeId: 'node-1',
      modifiedInput: { retry: true },
      modifiedActionType: 'PlanRevision',
    }) as Record<string, unknown>;
    const response = normalizeCounterfactualResponse({
      original_node_id: 'node-1',
      counterfactual_node_id: 'node-2',
      branch_session_id: 'sess-2',
    }) as Record<string, unknown>;

    expect(request).toMatchObject({
      branch_from_node_id: 'node-1',
      modified_input: { retry: true },
      modified_action_type: 'plan_revision',
    });
    expect(response).toMatchObject({
      originalNodeId: 'node-1',
      counterfactualNodeId: 'node-2',
      branchSessionId: 'sess-2',
    });
  });
});
