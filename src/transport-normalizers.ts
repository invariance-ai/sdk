import {
  addAlias,
  addAliases,
  isRecord,
  normalizeActionTypeAlias,
  normalizeSdkActionType,
} from './normalize.js';

export function normalizeTraceEventPayload(event: unknown): unknown {
  if (!isRecord(event)) return event;

  const normalized: Record<string, unknown> = { ...event };
  addAliases(normalized, [
    ['nodeId', 'node_id'],
    ['sessionId', 'session_id'],
    ['parentNodeId', 'parent_id'],
    ['spanId', 'span_id'],
    ['agentId', 'agent_id'],
    ['durationMs', 'duration_ms'],
    ['previousHash', 'previous_hash'],
    ['anomalyScore', 'anomaly_score'],
  ]);

  normalizeActionTypeAlias(normalized, ['action_type', 'actionType']);
  return normalized;
}

export function normalizeBehavioralPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const normalized: Record<string, unknown> = { ...payload };
  normalizeActionTypeAlias(normalized, ['action_type', 'actionType', 'type']);

  if (isRecord(normalized.data)) {
    const data = { ...normalized.data };
    addAliases(data, [
      ['nodeId', 'node_id'],
      ['parentNodeId', 'parent_node_id'],
      ['childAgentId', 'child_agent_id'],
      ['originalGoal', 'original_goal'],
      ['currentGoal', 'current_goal'],
      ['inputHash', 'input_hash'],
      ['outputHash', 'output_hash'],
      ['latencyMs', 'latency_ms'],
    ]);
    normalized.data = data;
  }

  return normalized;
}

export function normalizeReplayTimelineEntry(entry: unknown): unknown {
  if (!isRecord(entry)) return entry;

  const normalized: Record<string, unknown> = { ...entry };
  addAliases(normalized, [
    ['node_id', 'nodeId'],
    ['action_type', 'actionType'],
    ['duration_ms', 'durationMs'],
    ['context_hash', 'contextHash'],
    ['has_snapshot', 'hasSnapshot'],
    ['agent_id', 'agentId'],
  ]);

  const actionType = normalizeSdkActionType(normalized.actionType ?? normalized.action_type);
  if (actionType) {
    normalized.actionType = actionType;
  }

  return normalized;
}

export function normalizeReplayTimelineResponse(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const normalized: Record<string, unknown> = { ...payload };
  if (Array.isArray(normalized.timeline)) {
    normalized.timeline = normalized.timeline.map(normalizeReplayTimelineEntry);
  }

  return normalized;
}

export function normalizeReplaySnapshot(snapshot: unknown): unknown {
  if (!isRecord(snapshot)) return snapshot;

  const normalized: Record<string, unknown> = { ...snapshot };
  addAliases(normalized, [
    ['node_id', 'nodeId'],
    ['session_id', 'sessionId'],
    ['llm_messages', 'llmMessages'],
    ['tool_results', 'toolResults'],
    ['rag_chunks', 'ragChunks'],
    ['external_reads', 'externalReads'],
  ]);

  return normalized;
}

export function normalizeNodeSnapshotResponse(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const normalized: Record<string, unknown> = { ...payload };
  if ('snapshot' in normalized) {
    normalized.snapshot = normalizeReplaySnapshot(normalized.snapshot);
  }

  return normalized;
}

export function normalizeCounterfactualRequestPayload(request: unknown): unknown {
  if (!isRecord(request)) return request;

  const normalized: Record<string, unknown> = { ...request };
  addAliases(normalized, [
    ['branchFromNodeId', 'branch_from_node_id'],
    ['modifiedInput', 'modified_input'],
    ['modifiedActionType', 'modified_action_type'],
  ]);

  normalizeActionTypeAlias(normalized, ['modified_action_type', 'modifiedActionType']);
  return normalized;
}

export function normalizeCounterfactualResponse(payload: unknown): unknown {
  if (!isRecord(payload)) return payload;

  const normalized: Record<string, unknown> = { ...payload };
  addAlias(normalized, 'original_node_id', 'originalNodeId');
  addAlias(normalized, 'counterfactual_node_id', 'counterfactualNodeId');
  addAlias(normalized, 'branch_session_id', 'branchSessionId');
  return normalized;
}
