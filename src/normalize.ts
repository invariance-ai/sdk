/**
 * Shared normalization utilities for camelCase (SDK) ↔ snake_case (API) conversion.
 * Single source of truth for action type mappings — used by both SDK transport and backend ingestion.
 */

/** Maps any action type variant (PascalCase or snake_case) to the canonical snake_case form. */
export const ACTION_TYPE_MAP: Record<string, string> = {
  DecisionPoint: 'decision_point',
  ToolInvocation: 'tool_invocation',
  SubAgentSpawn: 'sub_agent_spawn',
  GoalDrift: 'goal_drift',
  ConstraintCheck: 'constraint_check',
  PlanRevision: 'plan_revision',
  A2ASend: 'a2a_send',
  A2AReceive: 'a2a_receive',
  OrchestrationDecision: 'orchestrator_decision',
  decision_point: 'decision_point',
  tool_invocation: 'tool_invocation',
  sub_agent_spawn: 'sub_agent_spawn',
  goal_drift: 'goal_drift',
  constraint_check: 'constraint_check',
  plan_revision: 'plan_revision',
  a2a_send: 'a2a_send',
  a2a_receive: 'a2a_receive',
  orchestrator_decision: 'orchestrator_decision',
};

/** Maps canonical snake_case action types back to SDK PascalCase. */
export const SDK_ACTION_TYPE_MAP: Record<string, string> = {
  decision_point: 'DecisionPoint',
  tool_invocation: 'ToolInvocation',
  sub_agent_spawn: 'SubAgentSpawn',
  goal_drift: 'GoalDrift',
  constraint_check: 'ConstraintCheck',
  plan_revision: 'PlanRevision',
  a2a_send: 'A2ASend',
  a2a_receive: 'A2AReceive',
  orchestrator_decision: 'OrchestrationDecision',
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

export function normalizeSdkActionType(value: unknown): string | null {
  return toSdkActionType(value) ?? toCanonicalActionType(value);
}

export function addAliases(target: Record<string, unknown>, pairs: Array<[string, string]>): void {
  for (const [from, to] of pairs) {
    addAlias(target, from, to);
  }
}

export function normalizeActionTypeAlias(target: Record<string, unknown>, keys: string[]): string | null {
  const targetKey = keys[0];
  if (!targetKey) return null;

  for (const key of keys) {
    const canonical = toCanonicalActionType(target[key]);
    if (canonical) {
      target[targetKey] = canonical;
      return canonical;
    }
  }

  return null;
}
