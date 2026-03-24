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

// ── Training Pairs ──

describe('listTrainingPairs', () => {
  it('sends GET /v1/training/pairs with no filters', async () => {
    const pairs = [{ id: 'tp1', source_agent: 'a1', student_agent: 'a2', status: 'pending' }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(pairs));
    const { transport } = makeTransport();

    const result = await transport.listTrainingPairs();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/pairs');
    expect(result).toEqual(pairs);
    await transport.shutdown();
  });

  it('sends GET /v1/training/pairs with status filter', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listTrainingPairs({ status: 'completed' });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('status=completed');
    await transport.shutdown();
  });
});

describe('createTrainingPair', () => {
  it('sends POST /v1/training/pairs', async () => {
    const created = { id: 'tp1', source_agent: 'a1', student_agent: 'a2', status: 'pending' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(created));
    const { transport } = makeTransport();

    const body = { source_agent: 'a1', student_agent: 'a2' };
    const result = await transport.createTrainingPair(body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/pairs');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(created);
    await transport.shutdown();
  });

  it('throws on error', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(400));
    const { transport } = makeTransport();

    await expect(transport.createTrainingPair({ source_agent: 'a1', student_agent: 'a2' }))
      .rejects.toThrow('400');
    await transport.shutdown();
  });
});

describe('training pair CRUD', () => {
  it('gets a training pair', async () => {
    const pair = { id: 'tp1', source_agent: 'a1', student_agent: 'a2', status: 'pending' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(pair));
    const { transport } = makeTransport();

    const result = await transport.getTrainingPair('tp1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/pairs/tp1');
    expect(result).toEqual(pair);
    await transport.shutdown();
  });

  it('updates a training pair', async () => {
    const pair = { id: 'tp1', status: 'completed' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(pair));
    const { transport } = makeTransport();

    const result = await transport.updateTrainingPair('tp1', { status: 'completed', progress: 100 });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/pairs/tp1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'completed', progress: 100 });
    expect(result).toEqual(pair);
    await transport.shutdown();
  });

  it('deletes a training pair', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ ok: true }));
    const { transport } = makeTransport();

    const result = await transport.deleteTrainingPair('tp1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/pairs/tp1');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
    await transport.shutdown();
  });
});

// ── Trace Flags ──

describe('createTraceFlag', () => {
  it('sends POST /v1/training/flags', async () => {
    const created = { id: 'f1', trace_node_id: 'n1', flag: 'good' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(created));
    const { transport } = makeTransport();

    const body = { trace_node_id: 'n1', flag: 'good' as const, notes: 'nice' };
    const result = await transport.createTraceFlag(body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/flags');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(created);
    await transport.shutdown();
  });
});

describe('listTraceFlags', () => {
  it('sends GET /v1/training/flags with filters', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listTraceFlags({ session_id: 's1', flag: 'bad', limit: 10, offset: 5 });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('session_id=s1');
    expect(path).toContain('flag=bad');
    expect(path).toContain('limit=10');
    expect(path).toContain('offset=5');
    await transport.shutdown();
  });

  it('sends GET /v1/training/flags with no filters', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listTraceFlags();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/flags');
    await transport.shutdown();
  });
});

describe('trace flag mutations', () => {
  it('updates a trace flag', async () => {
    const updated = { id: 'f1', flag: 'needs_review' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(updated));
    const { transport } = makeTransport();

    const result = await transport.updateTraceFlag('f1', { flag: 'needs_review', notes: 'double check' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/flags/f1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ flag: 'needs_review', notes: 'double check' });
    expect(result).toEqual(updated);
    await transport.shutdown();
  });

  it('deletes a trace flag', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ ok: true }));
    const { transport } = makeTransport();

    const result = await transport.deleteTraceFlag('f1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/flags/f1');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
    await transport.shutdown();
  });
});

describe('getTraceFlagStats', () => {
  it('sends GET /v1/training/flags/stats', async () => {
    const stats = { total: 10, good: 5, bad: 3, needs_review: 2, by_agent: {} };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(stats));
    const { transport } = makeTransport();

    const result = await transport.getTraceFlagStats();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/flags/stats');
    expect(result).toEqual(stats);
    await transport.shutdown();
  });

  it('throws on error', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(500));
    const { transport } = makeTransport();

    await expect(transport.getTraceFlagStats()).rejects.toThrow('500');
    await transport.shutdown();
  });
});

describe('trace flag training actions', () => {
  it('investigates a trace flag', async () => {
    const investigation = { flag_id: 'f1', root_cause: 'Drift', suggestion: 'Tighten prompt', new_prompt: '...', recommended_suite_id: 's1' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(investigation));
    const { transport } = makeTransport();

    const result = await transport.investigateTraceFlag('f1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/flags/f1/investigate');
    expect(init.method).toBe('POST');
    expect(result).toEqual(investigation);
    await transport.shutdown();
  });

  it('reruns a trace flag', async () => {
    const rerun = { training_pair: { id: 'tp1' }, investigation: { flag_id: 'f1' }, run: { id: 'r1' }, baseline_run: null, summary: { passed: true, score: 1, version: 'prompt-v2' } };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(rerun));
    const { transport } = makeTransport();

    const result = await transport.rerunTraceFlag('f1', { version_label: 'prompt-v2' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/training/flags/f1/rerun');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ version_label: 'prompt-v2' });
    expect(result).toEqual(rerun);
    await transport.shutdown();
  });
});
