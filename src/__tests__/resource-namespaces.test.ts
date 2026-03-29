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
    expect(inv.datasets).toBeTruthy();
    expect(inv.scorers).toBeTruthy();
    expect(inv.experiments).toBeTruthy();
    expect(inv.prompts).toBeTruthy();
    expect(inv.annotations).toBeTruthy();
  });

  it('calls resource namespace methods with the expected wire contract', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          agents: [{ agent_id: 'agent-1', active_sessions: 1, last_action_type: 'tool_invocation', last_action_at: 1, recent_errors: 0 }],
          recent_events: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'exp-1', name: 'Experiment', dataset_id: 'ds-1', dataset_version: 1, suite_id: 'suite-1', prompt_version_id: null, config: {}, status: 'pending', run_id: null, owner_id: 'agent-1', created_at: '2026-01-01T00:00:00.000Z', completed_at: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

    const statusResult = await inv.status.snapshot();
    expect(statusResult).toMatchObject({ agents: expect.any(Array) });

    const verifyResult = await inv.trace.verifyChain('sess-1');
    expect(verifyResult).toEqual({ verified: true, errors: [] });

    const datasetsResult = await inv.datasets.list({ agent_id: 'agent-1' });
    expect(datasetsResult).toEqual([]);

    const experimentResult = await inv.experiments.create({
      name: 'Experiment',
      dataset_id: 'ds-1',
      dataset_version: 1,
      suite_id: 'suite-1',
    });
    expect(experimentResult).toMatchObject({ id: 'exp-1', dataset_id: 'ds-1' });

    const promptsResult = await inv.prompts.list();
    expect(promptsResult).toEqual([]);

    const promoteResult = await inv.datasets.promoteFromCompare('ds-1', {
      suite_id: 'suite-1',
      run_a: 'run-a',
      run_b: 'run-b',
      include: 'regressions',
    });
    expect(promoteResult).toEqual([]);

    expect((fetch as any).mock.calls[0][0]).toBe('https://api.invariance.dev/v1/status/live');
    expect((fetch as any).mock.calls[1][0]).toBe('https://api.invariance.dev/v1/trace/sessions/sess-1/verify');
    expect((fetch as any).mock.calls[2][0]).toBe('https://api.invariance.dev/v1/datasets?agent_id=agent-1');
    expect((fetch as any).mock.calls[3][0]).toBe('https://api.invariance.dev/v1/experiments');
    expect((fetch as any).mock.calls[3][1]).toMatchObject({ method: 'POST' });
    expect((fetch as any).mock.calls[4][0]).toBe('https://api.invariance.dev/v1/prompts');
    expect((fetch as any).mock.calls[5][0]).toBe('https://api.invariance.dev/v1/datasets/ds-1/from-compare');
    expect((fetch as any).mock.calls[5][1]).toMatchObject({ method: 'POST' });

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
