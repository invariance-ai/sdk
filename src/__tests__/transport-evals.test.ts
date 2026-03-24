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
