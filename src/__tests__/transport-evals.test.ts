import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Transport } from '../transport.js';

vi.mock('../http.js', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '../http.js';
const mockFetchWithAuth = fetchWithAuth as Mock;

function makeTransport() {
  const onError = vi.fn();
  const transport = new Transport(
    'http://localhost:3001',
    'inv_test',
    60_000,
    100,
    onError,
  );
  return { transport, onError };
}

function okResponse(body: unknown = {}): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function errorResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

beforeEach(() => {
  mockFetchWithAuth.mockReset();
});

// ── Suites ──

describe('listEvalSuites', () => {
  it('sends GET /v1/evals/suites', async () => {
    const suites = [{ id: 's1', name: 'Suite A' }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(suites));
    const { transport } = makeTransport();

    const result = await transport.listEvalSuites();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suites');
    expect(result).toEqual(suites);
    await transport.shutdown();
  });

  it('passes agent_id filter', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listEvalSuites({ agent_id: 'a1' });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('agent_id=a1');
    await transport.shutdown();
  });
});

describe('createEvalSuite', () => {
  it('sends POST /v1/evals/suites', async () => {
    const created = { id: 's1', name: 'New Suite' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(created));
    const { transport } = makeTransport();

    const body = { name: 'New Suite', description: 'test' };
    const result = await transport.createEvalSuite(body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suites');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(created);
    await transport.shutdown();
  });
});

describe('getEvalSuite', () => {
  it('sends GET /v1/evals/suites/:id', async () => {
    const suite = { id: 's1', name: 'Suite A' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(suite));
    const { transport } = makeTransport();

    const result = await transport.getEvalSuite('s1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suites/s1');
    expect(result).toEqual(suite);
    await transport.shutdown();
  });
});

describe('eval suite mutations', () => {
  it('updates an eval suite', async () => {
    const suite = { id: 's1', name: 'Updated Suite' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(suite));
    const { transport } = makeTransport();

    const result = await transport.updateEvalSuite('s1', { name: 'Updated Suite' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suites/s1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Updated Suite' });
    expect(result).toEqual(suite);
    await transport.shutdown();
  });

  it('deletes an eval suite', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ ok: true }));
    const { transport } = makeTransport();

    const result = await transport.deleteEvalSuite('s1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suites/s1');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
    await transport.shutdown();
  });
});

// ── Cases ──

describe('listEvalCases', () => {
  it('sends GET /v1/evals/suites/:id/cases', async () => {
    const cases = [{ id: 'c1', suite_id: 's1', name: 'Case 1' }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(cases));
    const { transport } = makeTransport();

    const result = await transport.listEvalCases('s1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suites/s1/cases');
    expect(result).toEqual(cases);
    await transport.shutdown();
  });
});

describe('createEvalCase', () => {
  it('sends POST /v1/evals/suites/:id/cases', async () => {
    const created = { id: 'c1', suite_id: 's1', name: 'Check output', type: 'assertion' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(created));
    const { transport } = makeTransport();

    const body = { name: 'Check output', type: 'assertion' as const };
    const result = await transport.createEvalCase('s1', body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suites/s1/cases');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(created);
    await transport.shutdown();
  });
});

describe('eval case mutations', () => {
  it('updates an eval case', async () => {
    const updated = { id: 'c1', name: 'Updated case' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(updated));
    const { transport } = makeTransport();

    const result = await transport.updateEvalCase('c1', { name: 'Updated case' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/cases/c1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Updated case' });
    expect(result).toEqual(updated);
    await transport.shutdown();
  });

  it('deletes an eval case', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ ok: true }));
    const { transport } = makeTransport();

    const result = await transport.deleteEvalCase('c1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/cases/c1');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
    await transport.shutdown();
  });
});

// ── Runs ──

describe('runEval', () => {
  it('sends POST /v1/evals/suites/:id/run', async () => {
    const run = { id: 'r1', suite_id: 's1', status: 'completed' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(run));
    const { transport } = makeTransport();

    const body = { agent_id: 'a1', version_label: 'v1' };
    const result = await transport.runEval('s1', body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suites/s1/run');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(run);
    await transport.shutdown();
  });
});

describe('getEvalRun', () => {
  it('sends GET /v1/evals/runs/:id', async () => {
    const run = { id: 'r1', suite_id: 's1', results: [] };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(run));
    const { transport } = makeTransport();

    const result = await transport.getEvalRun('r1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/runs/r1');
    expect(result).toEqual(run);
    await transport.shutdown();
  });
});

describe('listEvalRuns', () => {
  it('sends GET /v1/evals/runs with filters', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listEvalRuns({ suite_id: 's1', status: 'completed', limit: 10 });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('suite_id=s1');
    expect(path).toContain('status=completed');
    expect(path).toContain('limit=10');
    await transport.shutdown();
  });

  it('sends GET /v1/evals/runs with no filters', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listEvalRuns();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/runs');
    await transport.shutdown();
  });
});

// ── Compare ──

describe('compareEvalRuns', () => {
  it('sends GET /v1/evals/compare with suite_id, run_a, run_b', async () => {
    const comparison = { run_a: {}, run_b: {}, regressions: 0, improvements: 1 };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(comparison));
    const { transport } = makeTransport();

    const result = await transport.compareEvalRuns('s1', 'r1', 'r2');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('suite_id=s1');
    expect(path).toContain('run_a=r1');
    expect(path).toContain('run_b=r2');
    expect(result).toEqual(comparison);
    await transport.shutdown();
  });

  it('throws on error', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(400));
    const { transport } = makeTransport();

    await expect(transport.compareEvalRuns('s1', 'r1', 'r2')).rejects.toThrow('400');
    await transport.shutdown();
  });
});

// ── Thresholds ──

describe('listEvalThresholds', () => {
  it('sends GET /v1/evals/thresholds with filters', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listEvalThresholds({ suite_id: 's1', metric: 'pass_rate' });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('/v1/evals/thresholds');
    expect(path).toContain('suite_id=s1');
    expect(path).toContain('metric=pass_rate');
    await transport.shutdown();
  });
});

describe('createEvalThreshold', () => {
  it('sends POST /v1/evals/thresholds', async () => {
    const threshold = { id: 't1', suite_id: 's1', metric: 'pass_rate', min_value: 0.8 };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(threshold));
    const { transport } = makeTransport();

    const body = { suite_id: 's1', min_value: 0.8, metric: 'pass_rate' as const };
    const result = await transport.createEvalThreshold(body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/thresholds');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(threshold);
    await transport.shutdown();
  });
});

describe('updateEvalThreshold', () => {
  it('sends PATCH /v1/evals/thresholds/:id', async () => {
    const threshold = { id: 't1', status: 'paused' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(threshold));
    const { transport } = makeTransport();

    const result = await transport.updateEvalThreshold('t1', { status: 'paused' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/thresholds/t1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'paused' });
    expect(result).toEqual(threshold);
    await transport.shutdown();
  });
});

describe('deleteEvalThreshold', () => {
  it('sends DELETE /v1/evals/thresholds/:id', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ ok: true }));
    const { transport } = makeTransport();

    const result = await transport.deleteEvalThreshold('t1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/thresholds/t1');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
    await transport.shutdown();
  });
});

// ── Failure Clusters ──

describe('listFailureClusters', () => {
  it('sends GET /v1/evals/clusters with filters', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listFailureClusters({ agent_id: 'a1', status: 'open', cluster_type: 'loop' });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('/v1/evals/clusters');
    expect(path).toContain('agent_id=a1');
    expect(path).toContain('status=open');
    expect(path).toContain('cluster_type=loop');
    await transport.shutdown();
  });
});

describe('getFailureCluster', () => {
  it('sends GET /v1/evals/clusters/:id', async () => {
    const cluster = { id: 'cl1', members: [] };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(cluster));
    const { transport } = makeTransport();

    const result = await transport.getFailureCluster('cl1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/clusters/cl1');
    expect(result).toEqual(cluster);
    await transport.shutdown();
  });
});

describe('createFailureCluster', () => {
  it('sends POST /v1/evals/clusters', async () => {
    const cluster = { id: 'cl1', label: 'Loop failures' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(cluster));
    const { transport } = makeTransport();

    const body = { agent_id: 'a1', cluster_type: 'loop' as const, label: 'Loop failures' };
    const result = await transport.createFailureCluster(body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/clusters');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(cluster);
    await transport.shutdown();
  });
});

describe('updateFailureCluster', () => {
  it('sends PATCH /v1/evals/clusters/:id', async () => {
    const cluster = { id: 'cl1', status: 'resolved' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(cluster));
    const { transport } = makeTransport();

    const result = await transport.updateFailureCluster('cl1', { status: 'resolved' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/clusters/cl1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'resolved' });
    expect(result).toEqual(cluster);
    await transport.shutdown();
  });
});

describe('addFailureClusterMember', () => {
  it('sends POST /v1/evals/clusters/:id/members', async () => {
    const member = { cluster_id: 'cl1', trace_node_id: 'node-1', session_id: 'sess-1' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(member));
    const { transport } = makeTransport();

    const body = { trace_node_id: 'node-1', session_id: 'sess-1' };
    const result = await transport.addFailureClusterMember('cl1', body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/clusters/cl1/members');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(member);
    await transport.shutdown();
  });
});

describe('deleteFailureCluster', () => {
  it('sends DELETE /v1/evals/clusters/:id', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ ok: true }));
    const { transport } = makeTransport();

    const result = await transport.deleteFailureCluster('cl1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/clusters/cl1');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
    await transport.shutdown();
  });
});

// ── Suggestions ──

describe('listOptimizationSuggestions', () => {
  it('sends GET /v1/evals/suggestions with filters', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listOptimizationSuggestions({ agent_id: 'a1', status: 'pending', suggestion_type: 'prompt_change' });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('/v1/evals/suggestions');
    expect(path).toContain('agent_id=a1');
    expect(path).toContain('status=pending');
    expect(path).toContain('suggestion_type=prompt_change');
    await transport.shutdown();
  });
});

describe('createOptimizationSuggestion', () => {
  it('sends POST /v1/evals/suggestions', async () => {
    const suggestion = { id: 'sg1', title: 'Improve prompt' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(suggestion));
    const { transport } = makeTransport();

    const body = {
      agent_id: 'a1',
      suggestion_type: 'prompt_change' as const,
      title: 'Improve prompt',
      description: 'Clarify system role',
    };
    const result = await transport.createOptimizationSuggestion(body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suggestions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(suggestion);
    await transport.shutdown();
  });
});

describe('updateOptimizationSuggestion', () => {
  it('sends PATCH /v1/evals/suggestions/:id', async () => {
    const suggestion = { id: 'sg1', status: 'accepted' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(suggestion));
    const { transport } = makeTransport();

    const result = await transport.updateOptimizationSuggestion('sg1', { status: 'accepted' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suggestions/sg1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'accepted' });
    expect(result).toEqual(suggestion);
    await transport.shutdown();
  });
});

describe('deleteOptimizationSuggestion', () => {
  it('sends DELETE /v1/evals/suggestions/:id', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ ok: true }));
    const { transport } = makeTransport();

    const result = await transport.deleteOptimizationSuggestion('sg1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/evals/suggestions/sg1');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
    await transport.shutdown();
  });
});
