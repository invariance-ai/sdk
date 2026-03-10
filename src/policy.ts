import type { Action, PolicyCheck, PolicyRule } from './types.js';

/** In-memory rate limit state: action pattern → timestamps */
const rateLimitState = new Map<string, number[]>();

/**
 * Check if an action name matches a policy pattern.
 * Supports exact match and trailing wildcard (*).
 * Examples: "swap" matches "swap", "transfer.*" matches "transfer.eth"
 */
function matchAction(pattern: string, action: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2);
    return action === prefix || action.startsWith(prefix + '.');
  }
  return pattern === action;
}

/**
 * Evaluate a single policy rule against an action.
 */
function evaluateRule(rule: PolicyRule, action: Action): PolicyCheck {
  if (!matchAction(rule.action, action.action)) {
    return { allowed: true };
  }

  // maxAmountUsd check
  if (rule.maxAmountUsd !== undefined) {
    const amount = action.input['amountUsd'];
    if (typeof amount === 'number' && amount > rule.maxAmountUsd) {
      return { allowed: false, reason: `Amount $${amount} exceeds max $${rule.maxAmountUsd}` };
    }
  }

  // Allowlist check
  if (rule.allowlist) {
    const value = action.input[rule.allowlist.field];
    if (typeof value === 'string' && !rule.allowlist.values.includes(value)) {
      return { allowed: false, reason: `Value "${value}" not in allowlist for field "${rule.allowlist.field}"` };
    }
  }

  // Rate limit check
  if (rule.rateLimit) {
    const key = rule.action;
    const now = Date.now();
    const windowStart = now - rule.rateLimit.windowMs;
    const timestamps = (rateLimitState.get(key) ?? []).filter((t) => t > windowStart);

    if (timestamps.length === 0) {
      rateLimitState.delete(key);
    }

    // Opportunistically prune expired entries from other keys to prevent unbounded growth
    if (rateLimitState.size > 100) {
      for (const [k, ts] of rateLimitState) {
        if (k === key) continue;
        const active = ts.filter((t) => t > windowStart);
        if (active.length === 0) rateLimitState.delete(k);
        else rateLimitState.set(k, active);
      }
    }

    if (timestamps.length >= rule.rateLimit.max) {
      return { allowed: false, reason: `Rate limit exceeded: ${rule.rateLimit.max} per ${rule.rateLimit.windowMs}ms` };
    }

    timestamps.push(now);
    rateLimitState.set(key, timestamps);
  }

  // Custom predicate
  if (rule.custom && !rule.custom(action)) {
    return { allowed: false, reason: 'Denied by custom policy' };
  }

  return { allowed: true };
}

/** Clear all in-memory rate limit state. Useful for testing or agent restarts. */
export function clearRateLimits(): void {
  rateLimitState.clear();
}

/**
 * Evaluate all policy rules against an action.
 * Returns denied if ANY rule denies the action.
 */
export function checkPolicies(rules: PolicyRule[], action: Action): PolicyCheck {
  for (const rule of rules) {
    const result = evaluateRule(rule, action);
    if (!result.allowed) return result;
  }
  return { allowed: true };
}
