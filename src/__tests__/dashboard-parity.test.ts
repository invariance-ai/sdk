import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Invariance } from '../client.js';

describe('dashboard parity surface', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('exposes a usable client surface for dashboard-grade workflows', () => {
    const prototype = Invariance.prototype as Record<string, unknown>;
    const convenienceMethods = [
      'listSessions',
      'getAnomalyFeed',
      'verifyTraceChain',
      'getLiveStatus',
      'getTrainingPairs',
      'createTraceFlag',
      'getEvalSuites',
      'getFailureClusters',
      'getSuggestions',
      'askQuery',
    ];

    const missing = convenienceMethods.filter((method) => typeof prototype[method] !== 'function');
    expect(missing).toEqual([]);

    const inv = Invariance.init({ apiKey: 'inv_test' }) as Invariance & Record<string, unknown>;
    expect(inv.trace).toBeTruthy();
    expect(inv.training).toBeTruthy();
    expect(inv.evals).toBeTruthy();
    expect(inv.failureClusters).toBeTruthy();
    expect(inv.suggestions).toBeTruthy();
  });

  it('calls the dashboard trace/status endpoints with the expected wire contract', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          anomalies: [{ id: 'node-1', session_id: 'sess-1', agent_id: 'agent-1' }],
          total: 1,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agents: [{ agent_id: 'agent-1', active_sessions: 1, last_action_type: 'tool_invocation', last_action_at: 1, recent_errors: 0, anomaly_trend: [] }],
          recent_events: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      });

    await expect(inv.getAnomalyFeed({ limit: 5, agentId: 'agent-1' })).resolves.toHaveLength(1);
    await expect(inv.getLiveStatus()).resolves.toMatchObject({ agents: expect.any(Array) });
    await expect(inv.verifyTraceChain('sess-1')).resolves.toEqual({ verified: true, errors: [] });

    expect((fetch as any).mock.calls[0][0]).toBe('https://api.invariance.dev/v1/trace/anomalies?limit=5&agentId=agent-1');
    expect((fetch as any).mock.calls[1][0]).toBe('https://api.invariance.dev/v1/status/live');
    expect((fetch as any).mock.calls[2][0]).toBe('https://api.invariance.dev/v1/trace/sessions/sess-1/verify');

    await inv.shutdown();
  });
});
