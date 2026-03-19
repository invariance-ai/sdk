/**
 * Shared normalization utilities for camelCase (SDK) ↔ snake_case (API) conversion.
 * Single source of truth for action type mappings — used by both SDK transport and backend ingestion.
 */

/** Maps any action type variant (PascalCase or snake_case) to the canonical snake_case form. */
export const ACTION_TYPE_MAP: Record<string, string> = {
  DecisionPoint: 'decision_point',
  OrchestrationDecision: 'orchestrator_decision',
  ToolInvocation: 'tool_invocation',
  SubAgentSpawn: 'sub_agent_spawn',
  GoalDrift: 'goal_drift',
  RetrievalEvent: 'retrieval_event',
  OutputGeneration: 'output_generation',
  ConstraintCheck: 'constraint_check',
  PlanRevision: 'plan_revision',
  A2ASend: 'a2a_send',
  A2AReceive: 'a2a_receive',
  decision_point: 'decision_point',
  orchestrator_decision: 'orchestrator_decision',
  tool_invocation: 'tool_invocation',
  sub_agent_spawn: 'sub_agent_spawn',
  goal_drift: 'goal_drift',
  retrieval_event: 'retrieval_event',
  output_generation: 'output_generation',
  constraint_check: 'constraint_check',
  plan_revision: 'plan_revision',
  a2a_send: 'a2a_send',
  a2a_receive: 'a2a_receive',
};

/** Maps canonical snake_case action types back to SDK PascalCase. */
export const SDK_ACTION_TYPE_MAP: Record<string, string> = {
  decision_point: 'DecisionPoint',
  orchestrator_decision: 'OrchestrationDecision',
  tool_invocation: 'ToolInvocation',
  sub_agent_spawn: 'SubAgentSpawn',
  goal_drift: 'GoalDrift',
  retrieval_event: 'RetrievalEvent',
  output_generation: 'OutputGeneration',
  constraint_check: 'ConstraintCheck',
  plan_revision: 'PlanRevision',
  a2a_send: 'A2ASend',
  a2a_receive: 'A2AReceive',
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function toCanonicalActionType(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return ACTION_TYPE_MAP[value] ?? null;
}

export function toSdkActionType(value: unknown): string | null {
  const canonical = toCanonicalActionType(value);
  if (!canonical) return null;
  return SDK_ACTION_TYPE_MAP[canonical] ?? null;
}

export function addAlias(target: Record<string, unknown>, from: string, to: string): void {
  if (Object.prototype.hasOwnProperty.call(target, from) && !Object.prototype.hasOwnProperty.call(target, to)) {
    target[to] = target[from];
  }
}
