import { describe, it, expect, vi, afterEach } from 'vitest';
import { Transport } from '../transport.js';

// Mock fetch globally
const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.stubGlobal('fetch', fetchMock);

function makeTransport(opts?: { maxQueueSize?: number; maxBatchSize?: number }) {
  const onError = vi.fn();
  const transport = new Transport(
    'http://localhost:3001',
    'inv_test',
    60000, // long interval so no auto-flush
    opts?.maxBatchSize ?? 100,
    onError,
    opts?.maxQueueSize,
  );
  return { transport, onError };
}

afterEach(() => {
  fetchMock.mockClear();
});

describe('Transport bounded queue', () => {
  it('drops oldest receipts when queue overflows', async () => {
    const { transport, onError } = makeTransport({ maxQueueSize: 3 });

    const makeReceipt = (id: string) => ({
      id,
      sessionId: 's1',
      agent: 'a',
      action: 'test',
      input: {},
      timestamp: Date.now(),
      hash: id,
      previousHash: '0',
      signature: 'sig',
    });

    transport.enqueue(makeReceipt('r1') as any);
    transport.enqueue(makeReceipt('r2') as any);
    transport.enqueue(makeReceipt('r3') as any);
    // No error yet
    expect(onError).not.toHaveBeenCalled();

    // This should drop r1
    transport.enqueue(makeReceipt('r4') as any);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(String(onError.mock.calls[0][0])).toContain('dropped 1 oldest');

    await transport.shutdown();
    // The flushed batch should contain r2, r3, r4 (r1 dropped)
    const body = JSON.parse(fetchMock.mock.calls.find(([url]: any) => String(url).includes('/v1/receipts'))?.[1]?.body);
    expect(body.receipts).toHaveLength(3);
    expect(body.receipts[0].id).toBe('r2');
    expect(body.receipts[2].id).toBe('r4');
  });
});

describe('Transport healthCheck', () => {
  it('returns true when backend is reachable', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const { transport } = makeTransport();
    const result = await transport.healthCheck();
    expect(result).toBe(true);
    await transport.shutdown();
  });

  it('returns false when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const { transport } = makeTransport();
    const result = await transport.healthCheck();
    expect(result).toBe(false);
    await transport.shutdown();
  });
});
