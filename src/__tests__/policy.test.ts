import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkPolicies, clearRateLimits } from '../policy.js';
import type { Action, PolicyRule } from '../types.js';

const action = (overrides: Partial<Action> = {}): Action => ({
  agent: 'bot',
  action: 'swap',
  input: {},
  ...overrides,
});

describe('checkPolicies', () => {
  beforeEach(() => {
    clearRateLimits();
  });

  it('enforces maxAmountUsd', () => {
    const rules: PolicyRule[] = [{ action: 'swap', maxAmountUsd: 100 }];
    expect(checkPolicies(rules, action({ input: { amountUsd: 50 } })).allowed).toBe(true);
    expect(checkPolicies(rules, action({ input: { amountUsd: 150 } })).allowed).toBe(false);
  });

  it('enforces allowlist', () => {
    const rules: PolicyRule[] = [{ action: 'swap', allowlist: { field: 'token', values: ['ETH', 'USDC'] } }];
    expect(checkPolicies(rules, action({ input: { token: 'ETH' } })).allowed).toBe(true);
    expect(checkPolicies(rules, action({ input: { token: 'DOGE' } })).allowed).toBe(false);
  });

  it('enforces rateLimit', () => {
    const rules: PolicyRule[] = [{ action: 'rate-test', rateLimit: { max: 2, windowMs: 60000 } }];
    const a = action({ action: 'rate-test' });
    expect(checkPolicies(rules, a).allowed).toBe(true);
    expect(checkPolicies(rules, a).allowed).toBe(true);
    expect(checkPolicies(rules, a).allowed).toBe(false);
  });

  it('enforces custom predicate', () => {
    const rules: PolicyRule[] = [{
      action: 'swap',
      custom: (a) => (a.input['from'] as string) !== 'BTC',
    }];
    expect(checkPolicies(rules, action({ input: { from: 'ETH' } })).allowed).toBe(true);
    expect(checkPolicies(rules, action({ input: { from: 'BTC' } })).allowed).toBe(false);
  });

  it('supports wildcard action matching', () => {
    const rules: PolicyRule[] = [{ action: 'transfer.*', maxAmountUsd: 50 }];
    expect(checkPolicies(rules, action({ action: 'transfer.eth', input: { amountUsd: 100 } })).allowed).toBe(false);
    expect(checkPolicies(rules, action({ action: 'swap', input: { amountUsd: 100 } })).allowed).toBe(true);
  });

  it('wildcard * matches all actions', () => {
    const rules: PolicyRule[] = [{ action: '*', maxAmountUsd: 10 }];
    expect(checkPolicies(rules, action({ action: 'anything', input: { amountUsd: 20 } })).allowed).toBe(false);
  });

  it('deletes rate limit keys after window expires', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T00:00:00Z'));
    const rules: PolicyRule[] = [{ action: 'expire-test', rateLimit: { max: 5, windowMs: 100 } }];
    const a = action({ action: 'expire-test' });

    // Record one action
    checkPolicies(rules, a);

    // Advance time past the window
    vi.advanceTimersByTime(200);

    // Next check should clean up expired entries and still allow
    const result = checkPolicies(rules, a);
    expect(result.allowed).toBe(true);

    vi.useRealTimers();
  });

  it('does not prune longer-window keys using a shorter window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-06T00:00:00Z'));

    for (let i = 0; i < 101; i++) {
      checkPolicies(
        [{ action: `filler-${i}`, rateLimit: { max: 5, windowMs: 10 } }],
        action({ action: `filler-${i}` }),
      );
    }

    const longWindowRules: PolicyRule[] = [{ action: 'long-window', rateLimit: { max: 1, windowMs: 60_000 } }];
    const shortWindowRules: PolicyRule[] = [{ action: 'short-window', rateLimit: { max: 5, windowMs: 100 } }];

    expect(checkPolicies(longWindowRules, action({ action: 'long-window' })).allowed).toBe(true);

    vi.advanceTimersByTime(1_000);

    expect(checkPolicies(shortWindowRules, action({ action: 'short-window' })).allowed).toBe(true);
    expect(checkPolicies(longWindowRules, action({ action: 'long-window' })).allowed).toBe(false);

    vi.useRealTimers();
  });

  it('clearRateLimits resets all state', () => {
    const rules: PolicyRule[] = [{ action: 'clear-test', rateLimit: { max: 1, windowMs: 60000 } }];
    const a = action({ action: 'clear-test' });

    expect(checkPolicies(rules, a).allowed).toBe(true);
    expect(checkPolicies(rules, a).allowed).toBe(false);

    clearRateLimits();

    expect(checkPolicies(rules, a).allowed).toBe(true);
  });
});
