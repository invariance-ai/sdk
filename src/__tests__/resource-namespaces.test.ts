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
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ eval_run: { id: 'run-1' }, experiment_id: null }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ case_id: 'case-1' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ run_id: 'run-1' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 'cand-1', status: 'pending' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'cand-1', status: 'accepted' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ candidates: [{ id: 'cand-2' }], count: 1 }),
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

    const launchResult = await inv.evals.launch({
      mode: 'session',
      suite_id: 'suite-1',
      agent_id: 'agent-1',
      session_ids: ['sess-1'],
    });
    expect(launchResult).toMatchObject({ eval_run: { id: 'run-1' } });

    const regressionsResult = await inv.evals.listRegressions({ suite_id: 'suite-1', run_a: 'run-a', run_b: 'run-b' });
    expect(regressionsResult).toEqual([{ case_id: 'case-1' }]);

    const lineageResult = await inv.evals.getLineage({ suite_id: 'suite-1', limit: 10 });
    expect(lineageResult).toEqual([{ run_id: 'run-1' }]);

    const improvementCandidates = await inv.evals.listImprovementCandidates({ suite_id: 'suite-1', status: 'pending' });
    expect(improvementCandidates).toEqual([{ id: 'cand-1', status: 'pending' }]);

    const updatedCandidate = await inv.evals.updateImprovementCandidate('cand-1', { status: 'accepted' });
    expect(updatedCandidate).toEqual({ id: 'cand-1', status: 'accepted' });

    const createCandidatesResult = await inv.training.createCandidatesFromEvalCompare({
      suite_id: 'suite-1',
      run_a: 'run-a',
      run_b: 'run-b',
      include: 'regressions',
    });
    expect(createCandidatesResult).toEqual({ candidates: [{ id: 'cand-2' }], count: 1 });
    expect((fetch as any).mock.calls[0][0]).toBe('https://api.invariance.dev/v1/status/live');
    expect((fetch as any).mock.calls[1][0]).toBe('https://api.invariance.dev/v1/trace/sessions/sess-1/verify');
    expect((fetch as any).mock.calls[2][0]).toBe('https://api.invariance.dev/v1/datasets?agent_id=agent-1');
    expect((fetch as any).mock.calls[3][0]).toBe('https://api.invariance.dev/v1/experiments');
    expect((fetch as any).mock.calls[3][1]).toMatchObject({ method: 'POST' });
    expect((fetch as any).mock.calls[4][0]).toBe('https://api.invariance.dev/v1/prompts');
    expect((fetch as any).mock.calls[5][0]).toBe('https://api.invariance.dev/v1/datasets/ds-1/from-compare');
    expect((fetch as any).mock.calls[5][1]).toMatchObject({ method: 'POST' });
    expect((fetch as any).mock.calls[6][0]).toBe('https://api.invariance.dev/v1/evals/launch');
    expect((fetch as any).mock.calls[6][1]).toMatchObject({ method: 'POST' });
    expect((fetch as any).mock.calls[7][0]).toBe('https://api.invariance.dev/v1/evals/regressions?suite_id=suite-1&run_a=run-a&run_b=run-b');
    expect((fetch as any).mock.calls[8][0]).toBe('https://api.invariance.dev/v1/evals/lineage?suite_id=suite-1&limit=10');
    expect((fetch as any).mock.calls[9][0]).toBe('https://api.invariance.dev/v1/evals/improvement-candidates?suite_id=suite-1&status=pending');
    expect((fetch as any).mock.calls[10][0]).toBe('https://api.invariance.dev/v1/evals/improvement-candidates/cand-1');
    expect((fetch as any).mock.calls[10][1]).toMatchObject({ method: 'PATCH' });
    expect((fetch as any).mock.calls[11][0]).toBe('https://api.invariance.dev/v1/training/candidates/from-eval-compare');
    expect((fetch as any).mock.calls[11][1]).toMatchObject({ method: 'POST' });

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

  it('does not expose removed training.listImprovementCandidates (API boundary guard)', () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    expect((inv.training as Record<string, unknown>).listImprovementCandidates).toBeUndefined();
  });
});

describe('orchestration contract shapes', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('launch result conforms to EvalLaunchResult shape', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        eval_run: { id: 'run-1', suite_id: 'suite-1', agent_id: 'agent-1', status: 'completed', owner_id: 'agent-1', created_at: '2026-01-01T00:00:00Z' },
        experiment_id: 'exp-1',
      }),
    });

    const result = await inv.evals.launch({ mode: 'dataset', suite_id: 'suite-1', agent_id: 'agent-1', dataset_id: 'ds-1', dataset_version: 1 });
    expect(result.eval_run).toBeDefined();
    expect(typeof result.eval_run.id).toBe('string');
    expect(typeof result.eval_run.status).toBe('string');
    expect(typeof result.experiment_id).toBe('string');
    await inv.shutdown();
  });

  it('listRegressions returns correctly shaped EvalRegressionEntry[]', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        case_id: 'case-1', case_name: 'No errors', run_a: 'run-a', run_b: 'run-b',
        suite_id: 'suite-1', a_passed: true, b_passed: false,
        a_score: 1, b_score: 0, delta: -1, session_id: null, dataset_row_id: null,
      }],
    });

    const result = await inv.evals.listRegressions({ suite_id: 'suite-1' });
    expect(result).toHaveLength(1);
    const entry = result[0]!;
    expect(entry).toHaveProperty('case_id');
    expect(entry).toHaveProperty('case_name');
    expect(entry).toHaveProperty('run_a');
    expect(entry).toHaveProperty('run_b');
    expect(entry).toHaveProperty('suite_id');
    expect(entry).toHaveProperty('a_passed');
    expect(entry).toHaveProperty('b_passed');
    expect(entry).toHaveProperty('a_score');
    expect(entry).toHaveProperty('b_score');
    expect(entry).toHaveProperty('delta');
    expect(entry).toHaveProperty('session_id');
    expect(entry).toHaveProperty('dataset_row_id');
    await inv.shutdown();
  });

  it('getLineage returns correctly shaped EvalLineageEntry[]', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        run_id: 'run-1', suite_id: 'suite-1', suite_name: 'Suite A', agent_id: 'agent-1',
        version_label: 'v1', status: 'completed', pass_rate: 0.9, avg_score: 0.85,
        dataset_id: 'ds-1', dataset_version: 1, experiment_id: 'exp-1', created_at: '2026-01-01T00:00:00Z',
      }],
    });

    const result = await inv.evals.getLineage({ suite_id: 'suite-1' });
    expect(result).toHaveLength(1);
    const entry = result[0]!;
    expect(entry).toHaveProperty('run_id');
    expect(entry).toHaveProperty('suite_id');
    expect(entry).toHaveProperty('suite_name');
    expect(entry).toHaveProperty('agent_id');
    expect(entry).toHaveProperty('version_label');
    expect(entry).toHaveProperty('status');
    expect(entry).toHaveProperty('pass_rate');
    expect(entry).toHaveProperty('avg_score');
    expect(entry).toHaveProperty('dataset_id');
    expect(entry).toHaveProperty('dataset_version');
    expect(entry).toHaveProperty('experiment_id');
    expect(entry).toHaveProperty('created_at');
    await inv.shutdown();
  });

  it('listImprovementCandidates returns correctly shaped ImprovementCandidate[]', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [{
        id: 'cand-1', suite_id: 'suite-1', run_a: 'run-a', run_b: 'run-b',
        case_id: 'case-1', case_name: 'Test', type: 'regression',
        a_passed: true, b_passed: false, a_score: 1, b_score: 0, delta: -1,
        dataset_row_id: null, dataset_version: null, session_id: null, trace_node_id: null,
        status: 'pending', owner_id: 'agent-1', created_at: '2026-01-01T00:00:00Z',
      }],
    });

    const result = await inv.evals.listImprovementCandidates({ suite_id: 'suite-1' });
    expect(result).toHaveLength(1);
    const cand = result[0]!;
    const expectedKeys = [
      'id', 'suite_id', 'run_a', 'run_b', 'case_id', 'case_name', 'type',
      'a_passed', 'b_passed', 'a_score', 'b_score', 'delta',
      'dataset_row_id', 'dataset_version', 'session_id', 'trace_node_id',
      'status', 'owner_id', 'created_at',
    ];
    for (const key of expectedKeys) {
      expect(cand).toHaveProperty(key);
    }
    await inv.shutdown();
  });

  it('updateImprovementCandidate returns updated candidate', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'cand-1', status: 'accepted', suite_id: 'suite-1', type: 'regression' }),
    });

    const result = await inv.evals.updateImprovementCandidate('cand-1', { status: 'accepted' });
    expect(result.status).toBe('accepted');
    expect(result.id).toBe('cand-1');
    await inv.shutdown();
  });

  it('createCandidatesFromEvalCompare returns CreateCandidatesResult shape', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          { id: 'cand-1', type: 'regression', status: 'pending' },
          { id: 'cand-2', type: 'improvement', status: 'pending' },
        ],
        count: 2,
      }),
    });

    const result = await inv.training.createCandidatesFromEvalCompare({
      suite_id: 'suite-1', run_a: 'run-a', run_b: 'run-b', include: 'all',
    });
    expect(result.count).toBe(2);
    expect(result.candidates).toHaveLength(2);
    expect(result.count).toBe(result.candidates.length);
    await inv.shutdown();
  });

  it('passes query parameters correctly for all filter options', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any)
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => [] });

    await inv.evals.listImprovementCandidates({ suite_id: 's1', status: 'pending', type: 'regression', limit: 10, offset: 5 });
    await inv.evals.getLineage({ agent_id: 'a1', suite_id: 's1', dataset_id: 'd1', limit: 20 });

    const candidatesUrl = (fetch as any).mock.calls[0][0] as string;
    expect(candidatesUrl).toContain('suite_id=s1');
    expect(candidatesUrl).toContain('status=pending');
    expect(candidatesUrl).toContain('type=regression');
    expect(candidatesUrl).toContain('limit=10');
    expect(candidatesUrl).toContain('offset=5');

    const lineageUrl = (fetch as any).mock.calls[1][0] as string;
    expect(lineageUrl).toContain('agent_id=a1');
    expect(lineageUrl).toContain('suite_id=s1');
    expect(lineageUrl).toContain('dataset_id=d1');
    expect(lineageUrl).toContain('limit=20');

    await inv.shutdown();
  });
});
