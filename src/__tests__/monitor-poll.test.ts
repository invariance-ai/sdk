import { describe, it, expect, vi, afterEach } from 'vitest';
import { Transport } from '../transport.js';
import { Invariance } from '../client.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [], next_cursor: null }) });
vi.stubGlobal('fetch', fetchMock);
ed25519.etc.sha512Sync = sha512;

const privKey = ed25519.utils.randomPrivateKey();
const privKeyHex = Buffer.from(privKey).toString('hex');

function makeTransport() {
  const onError = vi.fn();
  const transport = new Transport(
    'http://localhost:3001',
    'inv_test',
    60000,
    100,
    onError,
  );
  return { transport, onError };
}

afterEach(() => {
  fetchMock.mockClear();
  vi.useRealTimers();
});

describe('Transport.getMonitorEvents', () => {
  it('passes after_id cursor as query param', async () => {
    const { transport } = makeTransport();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [{ event_id: 'mev_1', monitor_id: 'mon_1', monitor_name: 'Latency Guard', severity: 'warning', trace_node_id: 'tn_1', matched_value: {}, created_at: '2026-01-01' }],
        next_cursor: null,
      }),
    });

    const result = await transport.getMonitorEvents('mev_0', 50);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].event_id).toBe('mev_1');

    const callUrl = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
    expect(callUrl).toContain('after_id=mev_0');
    expect(callUrl).toContain('limit=50');

    await transport.shutdown();
  });

  it('returns empty on error without throwing', async () => {
    const { transport, onError } = makeTransport();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await transport.getMonitorEvents();
    expect(result.events).toEqual([]);
    expect(result.next_cursor).toBeNull();
    expect(onError).toHaveBeenCalled();

    await transport.shutdown();
  });
});

describe('Monitor poll integration', () => {
  it('callback receives events and cursor advances', async () => {
    const { transport } = makeTransport();
    const received: string[] = [];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { event_id: 'mev_1', monitor_id: 'mon_1', monitor_name: 'Latency Guard', severity: 'warning', trace_node_id: 'tn_1', matched_value: {}, created_at: '2026-01-01' },
          { event_id: 'mev_2', monitor_id: 'mon_1', monitor_name: 'Latency Guard', severity: 'critical', trace_node_id: 'tn_2', matched_value: {}, created_at: '2026-01-01' },
        ],
        next_cursor: 'mev_2',
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { event_id: 'mev_3', monitor_id: 'mon_2', monitor_name: 'Error Guard', severity: 'info', trace_node_id: 'tn_3', matched_value: {}, created_at: '2026-01-01' },
        ],
        next_cursor: null,
      }),
    });

    let cursor: string | undefined;
    while (true) {
      const { events, next_cursor } = await transport.getMonitorEvents(cursor, 200);
      for (const e of events) {
        received.push(e.event_id);
        cursor = e.event_id;
      }
      if (!next_cursor) break;
      cursor = next_cursor;
    }

    expect(received).toEqual(['mev_1', 'mev_2', 'mev_3']);
    await transport.shutdown();
  });

  it('callback error does not break subsequent events', async () => {
    const { transport } = makeTransport();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { event_id: 'mev_1', monitor_id: 'mon_1', monitor_name: 'Latency Guard', severity: 'warning', trace_node_id: 'tn_1', matched_value: {}, created_at: '2026-01-01' },
          { event_id: 'mev_2', monitor_id: 'mon_1', monitor_name: 'Latency Guard', severity: 'critical', trace_node_id: 'tn_2', matched_value: {}, created_at: '2026-01-01' },
        ],
        next_cursor: null,
      }),
    });

    const received: string[] = [];
    let callCount = 0;

    const { events } = await transport.getMonitorEvents();
    for (const e of events) {
      callCount++;
      if (callCount === 1) {
        // Simulate callback error
        try { throw new Error('bad callback'); } catch { /* ignore */ }
      }
      received.push(e.event_id);
    }

    expect(received).toEqual(['mev_1', 'mev_2']);
    await transport.shutdown();
  });

  it('client poller reports callback errors and stops after shutdown', async () => {
    vi.useFakeTimers();

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [
          { event_id: 'mev_1', monitor_id: 'mon_1', monitor_name: 'Latency Guard', severity: 'warning', trace_node_id: 'tn_1', matched_value: {}, created_at: '2026-01-01' },
          { event_id: 'mev_2', monitor_id: 'mon_1', monitor_name: 'Latency Guard', severity: 'critical', trace_node_id: 'tn_2', matched_value: {}, created_at: '2026-01-01' },
        ],
        next_cursor: null,
      }),
    });

    const onError = vi.fn();
    const onMonitorTrigger = vi.fn((event) => {
      if (event.event_id === 'mev_1') {
        throw new Error('bad callback');
      }
    });

    const inv = Invariance.init({
      apiKey: 'inv_test',
      privateKey: privKeyHex,
      onError,
      onMonitorTrigger,
      monitorPollIntervalMs: 10,
    });

    await vi.advanceTimersByTimeAsync(10);

    expect(onMonitorTrigger).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await inv.shutdown();

    await vi.advanceTimersByTimeAsync(20);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('client poller does not overlap while a previous poll is still in flight', async () => {
    vi.useFakeTimers();

    let resolveFetch: ((value: { ok: true; json: () => Promise<{ events: never[]; next_cursor: null }> }) => void) | null = null;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveFetch = resolve;
    }));

    const inv = Invariance.init({
      apiKey: 'inv_test',
      privateKey: privKeyHex,
      onMonitorTrigger: vi.fn(),
      onError: vi.fn(),
      monitorPollIntervalMs: 10,
    });

    await vi.advanceTimersByTimeAsync(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch?.({ ok: true, json: async () => ({ events: [], next_cursor: null }) });
    await Promise.resolve();
    await inv.shutdown();
  });

  it('backs off on server errors and resets on success', async () => {
    vi.useFakeTimers();
    const baseInterval = 100;

    // First two polls return server errors
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    // Third poll succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events: [], next_cursor: null }),
    });
    // Fourth poll succeeds
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ events: [], next_cursor: null }),
    });

    const inv = Invariance.init({
      apiKey: 'inv_test',
      privateKey: privKeyHex,
      onMonitorTrigger: vi.fn(),
      onError: vi.fn(),
      monitorPollIntervalMs: baseInterval,
    });

    // 1st poll fires at baseInterval (100ms) — returns 500
    await vi.advanceTimersByTimeAsync(baseInterval);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Backoff: next poll at 200ms (doubled)
    await vi.advanceTimersByTimeAsync(baseInterval); // total 200 — not enough
    expect(fetchMock).toHaveBeenCalledTimes(1); // still 1
    await vi.advanceTimersByTimeAsync(baseInterval); // total 300 — 200ms after first poll completed
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Backoff again: next poll at 400ms (doubled again)
    await vi.advanceTimersByTimeAsync(200); // not enough
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200); // 400ms after second poll — triggers third
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Success resets interval: next poll at baseInterval (100ms)
    await vi.advanceTimersByTimeAsync(baseInterval);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    await inv.shutdown();
  });
});
