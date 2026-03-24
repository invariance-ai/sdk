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

describe('listMonitors', () => {
  it('sends GET /v1/monitors with no filters', async () => {
    const monitors = [{ id: 'm1', name: 'test' }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(monitors));
    const { transport } = makeTransport();

    const result = await transport.listMonitors();

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      'http://localhost:3001', 'inv_test', '/v1/monitors',
    );
    expect(result).toEqual(monitors);
    await transport.shutdown();
  });

  it('sends GET /v1/monitors with status and agent_id filters', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listMonitors({ status: 'active', agent_id: 'a1' });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('status=active');
    expect(path).toContain('agent_id=a1');
    await transport.shutdown();
  });

  it('throws on error response', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(500));
    const { transport } = makeTransport();

    await expect(transport.listMonitors()).rejects.toThrow('500');
    await transport.shutdown();
  });
});

describe('createMonitor', () => {
  it('sends POST /v1/monitors with body', async () => {
    const created = { id: 'm1', name: 'test', natural_language: 'alert if latency > 1000ms' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(created));
    const { transport } = makeTransport();

    const body = { name: 'test', natural_language: 'alert if latency > 1000ms' };
    const result = await transport.createMonitor(body);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/monitors');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
    expect(result).toEqual(created);
    await transport.shutdown();
  });
});

describe('getMonitor', () => {
  it('sends GET /v1/monitors/:id', async () => {
    const monitor = { id: 'm1', name: 'test' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(monitor));
    const { transport } = makeTransport();

    const result = await transport.getMonitor('m1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/monitors/m1');
    expect(result).toEqual(monitor);
    await transport.shutdown();
  });
});

describe('updateMonitor', () => {
  it('sends PATCH /v1/monitors/:id', async () => {
    const updated = { id: 'm1', name: 'updated', status: 'paused' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(updated));
    const { transport } = makeTransport();

    const result = await transport.updateMonitor('m1', { status: 'paused' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/monitors/m1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'paused' });
    expect(result).toEqual(updated);
    await transport.shutdown();
  });
});

describe('deleteMonitor', () => {
  it('sends DELETE /v1/monitors/:id', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ ok: true }));
    const { transport } = makeTransport();

    const result = await transport.deleteMonitor('m1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/monitors/m1');
    expect(init.method).toBe('DELETE');
    expect(result).toEqual({ ok: true });
    await transport.shutdown();
  });
});

describe('evaluateMonitor', () => {
  it('sends POST /v1/monitors/:id/evaluate', async () => {
    const evalResult = { monitor_id: 'm1', matches_found: 3, matched_node_ids: ['n1', 'n2', 'n3'] };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(evalResult));
    const { transport } = makeTransport();

    const result = await transport.evaluateMonitor('m1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/monitors/m1/evaluate');
    expect(init.method).toBe('POST');
    expect(result).toEqual(evalResult);
    await transport.shutdown();
  });
});

describe('acknowledgeMonitorEvent', () => {
  it('sends PATCH /v1/monitors/events/:id/acknowledge', async () => {
    const acked = { id: 'e1', acknowledged: true };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(acked));
    const { transport } = makeTransport();

    const result = await transport.acknowledgeMonitorEvent('e1');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/monitors/events/e1/acknowledge');
    expect(init.method).toBe('PATCH');
    expect(result).toEqual(acked);
    await transport.shutdown();
  });
});
