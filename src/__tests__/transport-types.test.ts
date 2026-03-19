import { describe, it, expect, vi, afterEach } from 'vitest';
import { Transport } from '../transport.js';
import { InvarianceError } from '../errors.js';

// Mock fetch globally
const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
vi.stubGlobal('fetch', fetchMock);

function makeTransport() {
  const onError = vi.fn();
  const transport = new Transport(
    'http://localhost:3001',
    'inv_test',
    60000, // long interval so no auto-flush
    100,
    onError,
  );
  return { transport, onError };
}

afterEach(() => {
  fetchMock.mockClear();
});

describe('queryReceipts runtime validation', () => {
  it('handles array response format', async () => {
    const receipts = [
      { id: 'r1', sessionId: 's1', agent: 'a', action: 'test', input: {}, timestamp: 1, hash: 'h1', previousHash: '0', signature: 'sig' },
    ];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => receipts });

    const { transport } = makeTransport();
    const result = await transport.queryReceipts({ sessionId: 's1' });
    expect(result).toEqual(receipts);
    await transport.shutdown();
  });

  it('handles wrapped {receipts: [...]} format', async () => {
    const receipts = [
      { id: 'r1', sessionId: 's1', agent: 'a', action: 'test', input: {}, timestamp: 1, hash: 'h1', previousHash: '0', signature: 'sig' },
    ];
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ receipts }) });

    const { transport } = makeTransport();
    const result = await transport.queryReceipts({ sessionId: 's1' });
    expect(result).toEqual(receipts);
    await transport.shutdown();
  });

  it('throws InvarianceError on malformed response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: 'unexpected' }) });

    const { transport } = makeTransport();
    try {
      await transport.queryReceipts({});
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvarianceError);
      expect((err as InvarianceError).code).toBe('API_ERROR');
    }
    await transport.shutdown();
  });

  it('throws InvarianceError on non-object response', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => 'just a string' });

    const { transport } = makeTransport();
    await expect(transport.queryReceipts({})).rejects.toThrow(InvarianceError);
    await transport.shutdown();
  });

  it('throws InvarianceError with correct message on unexpected format', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => 42 });

    const { transport } = makeTransport();
    await expect(transport.queryReceipts({})).rejects.toThrow(
      'Unexpected response format from GET /v1/receipts',
    );
    await transport.shutdown();
  });

  it('throws InvarianceError when receipts field is not an array', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ receipts: 'not-array' }) });

    const { transport } = makeTransport();
    await expect(transport.queryReceipts({})).rejects.toThrow(InvarianceError);
    await transport.shutdown();
  });
});
