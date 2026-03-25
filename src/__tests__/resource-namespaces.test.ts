import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Invariance } from '../client.js';

describe('resource namespace surface', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('exposes all resource namespaces', () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    expect(inv.trace).toBeTruthy();
    expect(inv.training).toBeTruthy();
    expect(inv.evals).toBeTruthy();
    expect(inv.failureClusters).toBeTruthy();
    expect(inv.suggestions).toBeTruthy();
    expect(inv.docs).toBeTruthy();
    expect(inv.agents).toBeTruthy();
    expect(inv.sessions).toBeTruthy();
    expect(inv.monitors).toBeTruthy();
    expect(inv.contracts).toBeTruthy();
    expect(inv.a2a).toBeTruthy();
    expect(inv.query).toBeTruthy();
    expect(inv.nlQuery).toBeTruthy();
    expect(inv.identity).toBeTruthy();
    expect(inv.identities).toBeTruthy();
    expect(inv.drift).toBeTruthy();
    expect(inv.receipts).toBeTruthy();
    expect(inv.apiKeys).toBeTruthy();
    expect(inv.usage).toBeTruthy();
    expect(inv.search).toBeTruthy();
    expect(inv.status).toBeTruthy();
    expect(inv.templates).toBeTruthy();
  });

  it('calls resource namespace methods with the expected wire contract', async () => {
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

    const anomalyResult = await inv.trace.getAnomalies({ limit: 5, agentId: 'agent-1' });
    expect(anomalyResult).toMatchObject({ anomalies: expect.any(Array), total: 1 });

    const statusResult = await inv.status.snapshot();
    expect(statusResult).toMatchObject({ agents: expect.any(Array) });

    const verifyResult = await inv.trace.verifyChain('sess-1');
    expect(verifyResult).toEqual({ verified: true, errors: [] });

    expect((fetch as any).mock.calls[0][0]).toBe('https://api.invariance.dev/v1/trace/anomalies?limit=5&agentId=agent-1');
    expect((fetch as any).mock.calls[1][0]).toBe('https://api.invariance.dev/v1/status/live');
    expect((fetch as any).mock.calls[2][0]).toBe('https://api.invariance.dev/v1/trace/sessions/sess-1/verify');

    await inv.shutdown();
  });

  it('does not expose removed convenience methods (alias regression guard)', () => {
    const prototype = Invariance.prototype as Record<string, unknown>;
    const removedMethods = [
      'createAgent', 'listAgents', 'getAgent', 'getAgentMetrics',
      'getAnomalyFeed', 'getTraceNodes', 'verifyTraceChain',
      'getLiveStatus', 'connectLiveStatus',
      'askQuestion', 'askQuery', 'ask',
      'getMonitors', 'createMonitor', 'deleteMonitor',
      'getTrainingPairs', 'createTrainingPair',
      'getEvalSuites', 'createEvalSuite',
      'getFailureClusters', 'getSuggestions',
      'searchGlobal', 'getApiDocs',
      'listSessions', 'getSession', 'verifySession',
      'signup', 'createOrg',
    ];

    const present = removedMethods.filter((method) => typeof prototype[method] === 'function');
    expect(present).toEqual([]);
  });
});
