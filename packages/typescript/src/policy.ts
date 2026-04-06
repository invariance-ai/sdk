import type { AgentActionPolicy } from './types/agent.js';
import { InvarianceError } from './errors.js';

export interface PolicyCheckResult {
  allowed: boolean;
  reason?: string;
}

export function checkPolicies(
  action: string,
  policies: AgentActionPolicy[],
): PolicyCheckResult {
  // Find matching policies (most specific first)
  const matching = policies.filter((p) => {
    if (p.action === '*') return true;
    if (p.action.endsWith('*')) {
      return action.startsWith(p.action.slice(0, -1));
    }
    return p.action === action;
  });

  // Exact match takes priority, then prefix, then wildcard
  const sorted = matching.sort((a, b) => {
    const specificity = (p: AgentActionPolicy) => {
      if (p.action === '*') return 0;
      if (p.action.endsWith('*')) return 1;
      return 2;
    };
    return specificity(b) - specificity(a);
  });

  if (sorted.length === 0) {
    // No policies = allow by default
    return { allowed: true };
  }

  const first = sorted[0]!;
  if (first.effect === 'deny') {
    return { allowed: false, reason: `Action "${action}" denied by policy "${first.action}"` };
  }

  return { allowed: true };
}

export function assertPolicy(action: string, policies: AgentActionPolicy[]): void {
  const result = checkPolicies(action, policies);
  if (!result.allowed) {
    throw new InvarianceError('POLICY_DENIED', result.reason ?? `Action "${action}" denied`);
  }
}
