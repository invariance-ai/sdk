import type { BehavioralPrimitive } from './types/trace.js';

const LEGACY_ACTION_MAP: Record<string, BehavioralPrimitive> = {
  DecisionPoint: 'decision_point',
  decision_point: 'decision_point',
  OrchestratorDecision: 'orchestrator_decision',
  orchestrator_decision: 'orchestrator_decision',
  ToolCall: 'tool_invocation',
  ToolInvocation: 'tool_invocation',
  tool_invocation: 'tool_invocation',
  tool_call: 'tool_invocation',
  SubAgentSpawn: 'sub_agent_spawn',
  sub_agent_spawn: 'sub_agent_spawn',
  GoalDrift: 'goal_drift',
  goal_drift: 'goal_drift',
  ConstraintCheck: 'constraint_check',
  constraint_check: 'constraint_check',
  PlanRevision: 'plan_revision',
  plan_revision: 'plan_revision',
  TraceStep: 'trace_step',
  trace_step: 'trace_step',
  ContextWindow: 'context_window',
  context_window: 'context_window',
  TokenUsage: 'token_usage',
  token_usage: 'token_usage',
  A2ASend: 'a2a_send',
  a2a_send: 'a2a_send',
  A2AReceive: 'a2a_receive',
  a2a_receive: 'a2a_receive',
};

export function normalizeActionType(action: string): BehavioralPrimitive {
  return LEGACY_ACTION_MAP[action] ?? (action as BehavioralPrimitive);
}

const FIELD_MAP: Record<string, string> = {
  nodeId: 'node_id',
  sessionId: 'session_id',
  agentId: 'agent_id',
  parentId: 'parent_id',
  spanId: 'span_id',
  actionType: 'action_type',
  previousHash: 'previous_hash',
  contextHash: 'context_hash',
  anomalyScore: 'anomaly_score',
  durationMs: 'duration_ms',
};

export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[FIELD_MAP[key] ?? key] = value;
  }
  return result;
}

const REVERSE_FIELD_MAP: Record<string, string> = {};
for (const [camel, snake] of Object.entries(FIELD_MAP)) {
  REVERSE_FIELD_MAP[snake] = camel;
}

export function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[REVERSE_FIELD_MAP[key] ?? key] = value;
  }
  return result;
}
