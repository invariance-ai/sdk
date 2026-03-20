import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Transport } from '../transport.js';
import type { Receipt } from '../types.js';

// Mock fetchWithAuth from http.js
vi.mock('../http.js', () => ({
  fetchWithAuth: vi.fn(),
}));

import { fetchWithAuth } from '../http.js';
const mockFetchWithAuth = fetchWithAuth as Mock;

// Also mock global fetch for methods that use it directly (signup, lookupIdentity, healthCheck)
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function makeReceipt(id: string): Receipt {
  return {
    id,
    sessionId: 's1',
    agent: 'a',
    action: 'test',
    input: {},
    timestamp: Date.now(),
    hash: id,
    previousHash: '0',
    signature: 'sig',
  };
}

function makeTransport(opts?: { maxQueueSize?: number; maxBatchSize?: number }) {
  const onError = vi.fn();
  const transport = new Transport(
    'http://localhost:3001',
    'inv_test',
    60_000, // long interval so no auto-flush
    opts?.maxBatchSize ?? 100,
    onError,
    opts?.maxQueueSize,
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
  fetchMock.mockReset();
});

// ── flush() ──

describe('flush()', () => {
  it('successful batch sends receipts and clears queue', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse());
    const { transport } = makeTransport();

    transport.enqueue(makeReceipt('r1'));
    transport.enqueue(makeReceipt('r2'));
    await transport.flush();

    expect(mockFetchWithAuth).toHaveBeenCalledOnce();
    const [url, _key, path, init] = mockFetchWithAuth.mock.calls[0];
    expect(url).toBe('http://localhost:3001');
    expect(path).toBe('/v1/receipts');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.receipts).toHaveLength(2);

    // Queue empty — second flush is no-op
    mockFetchWithAuth.mockClear();
    await transport.flush();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
    await transport.shutdown();
  });

  it('empty batch is a no-op', async () => {
    const { transport } = makeTransport();
    await transport.flush();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
    await transport.shutdown();
  });

  it('concurrent flush guard prevents double flush', async () => {
    let resolveFlush!: (v: Response) => void;
    mockFetchWithAuth.mockReturnValueOnce(new Promise(r => { resolveFlush = r; }));

    const { transport } = makeTransport();
    transport.enqueue(makeReceipt('r1'));

    const p1 = transport.flush();
    const p2 = transport.flush(); // bails — flushing is true

    resolveFlush(okResponse());
    await Promise.all([p1, p2]);

    expect(mockFetchWithAuth).toHaveBeenCalledOnce();
    await transport.shutdown();
  });

  it('4xx error discards batch and calls onError', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(400));
    const { transport, onError } = makeTransport();

    transport.enqueue(makeReceipt('r1'));
    await transport.flush();

    expect(onError).toHaveBeenCalledOnce();
    expect(String(onError.mock.calls[0][0])).toContain('400');

    // batch discarded — flush is no-op
    mockFetchWithAuth.mockClear();
    await transport.flush();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
    await transport.shutdown();
  });

  it('5xx error re-queues batch', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(500));
    const { transport, onError } = makeTransport();

    transport.enqueue(makeReceipt('r1'));
    transport.enqueue(makeReceipt('r2'));
    await transport.flush();

    expect(onError).toHaveBeenCalledOnce();

    // batch restored — retry sends them
    mockFetchWithAuth.mockResolvedValueOnce(okResponse());
    await transport.flush();
    expect(mockFetchWithAuth).toHaveBeenCalledTimes(2);
    const body = JSON.parse(mockFetchWithAuth.mock.calls[1][3].body);
    expect(body.receipts).toHaveLength(2);
    await transport.shutdown();
  });
});

// ── Session methods ──

describe('Session methods', () => {
  it('createSession sends POST /v1/sessions', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse());
    const { transport } = makeTransport();

    await transport.createSession({ id: 'sess-1', name: 'my-session' });

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      'http://localhost:3001',
      'inv_test',
      '/v1/sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ id: 'sess-1', name: 'my-session' }),
      }),
    );
    await transport.shutdown();
  });

  it('getSession fetches session by ID', async () => {
    const sessionData = { id: 'sess/1', agent: 'a', name: 'test', status: 'open', receiptCount: 0 };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(sessionData));
    const { transport } = makeTransport();

    const result = await transport.getSession('sess/1');

    expect(mockFetchWithAuth).toHaveBeenCalledWith(
      'http://localhost:3001',
      'inv_test',
      `/v1/sessions/${encodeURIComponent('sess/1')}`,
    );
    expect(result).toEqual(sessionData);
    await transport.shutdown();
  });

  it('closeSession sends PATCH with status and close_hash', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse());
    const { transport } = makeTransport();

    await transport.closeSession('sess-1', 'closed', 'abc123');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/sessions/sess-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ status: 'closed', close_hash: 'abc123' });
    await transport.shutdown();
  });
});

// ── Trace methods ──

describe('Trace methods', () => {
  it('submitTraceEvent calls POST /v1/trace/events', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse());
    const { transport } = makeTransport();

    await transport.submitTraceEvent({ nodeId: 'n1', action_type: 'llm_call' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/trace/events');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.node_id).toBe('n1');
    await transport.shutdown();
  });

  it('submitTraceEvent routes fetch errors to onError', async () => {
    mockFetchWithAuth.mockRejectedValueOnce(new Error('network failure'));
    const { transport, onError } = makeTransport();

    await transport.submitTraceEvent({ nodeId: 'n1' });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    await transport.shutdown();
  });

  it('submitBehavioralEvent calls POST /v1/trace/behaviors', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse());
    const { transport } = makeTransport();

    await transport.submitBehavioralEvent({ type: 'llm_call', data: { nodeId: 'n1' } });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/trace/behaviors');
    expect(init.method).toBe('POST');
    await transport.shutdown();
  });

  it('queryNL posts to /v1/nl-query with the full request payload', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ answer: 'ok' }));
    const { transport } = makeTransport();

    await transport.queryNL({
      question: 'How many sessions?',
      conversation_id: 'conv-1',
      context: { session_id: 'sess-1', time_range: { since: 1, until: 2 } },
    });

    const [, , path, init] = mockFetchWithAuth.mock.calls.at(-1);
    expect(path).toBe('/v1/nl-query');
    expect(JSON.parse(init.body)).toEqual({
      question: 'How many sessions?',
      conversation_id: 'conv-1',
      context: { session_id: 'sess-1', time_range: { since: 1, until: 2 } },
    });
    await transport.shutdown();
  });
});

// ── Contract methods ──

describe('Contract methods', () => {
  it('proposeContract sends POST /v1/contracts', async () => {
    const contractResp = { id: 'c1', sessionId: 's1', status: 'proposed' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(contractResp));
    const { transport } = makeTransport();

    const reqBody = { providerId: 'agent-b', terms: { description: 'test' }, termsHash: 'h1', signature: 'sig' };
    const result = await transport.proposeContract(reqBody);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/contracts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(reqBody);
    expect(result).toEqual(contractResp);
    await transport.shutdown();
  });

  it('acceptContract sends POST to /v1/contracts/:id/accept', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ id: 'c1', status: 'accepted' }));
    const { transport } = makeTransport();

    await transport.acceptContract('c1', 'my-sig');

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/contracts/c1/accept');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ signature: 'my-sig' });
    await transport.shutdown();
  });

  it('submitDelivery sends POST to /v1/contracts/:id/deliver', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ id: 'd1', status: 'pending' }));
    const { transport } = makeTransport();

    const reqBody = { outputData: { result: 'ok' }, outputHash: 'h2', signature: 'sig2' };
    await transport.submitDelivery('c1', reqBody);

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/contracts/c1/deliver');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(reqBody);
    await transport.shutdown();
  });
});

// ── Identity methods ──

describe('Identity methods', () => {
  it('signup sends POST /v1/identity/signup without auth header', async () => {
    const signupResp = { handle: 'alice', public_key: 'pk', private_key: 'sk', api_key: 'ak' };
    fetchMock.mockResolvedValueOnce(okResponse(signupResp));
    const { transport } = makeTransport();

    const result = await transport.signup({ email: 'a@b.com', name: 'Alice', handle: 'alice' });

    // signup uses raw fetch, not fetchWithAuth
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/v1/identity/signup');
    expect(init.method).toBe('POST');
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
    expect(result).toEqual(signupResp);
    await transport.shutdown();
  });

  it('registerAgent sends POST with owner in URL', async () => {
    const resp = { owner: 'acme', name: 'bot', public_key: 'pk', agent_id: 'a1', created_at: '2024-01-01' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(resp));
    const { transport } = makeTransport();

    await transport.registerAgent('acme', { name: 'bot', public_key: 'pk' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/identity/agents/acme');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'bot', public_key: 'pk' });
    await transport.shutdown();
  });

  it('lookupIdentity sends GET without auth', async () => {
    const resp = { owner: 'acme', name: 'bot', public_key: 'pk', created_at: '2024-01-01' };
    fetchMock.mockResolvedValueOnce(okResponse(resp));
    const { transport } = makeTransport();

    const result = await transport.lookupIdentity('acme', 'bot');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3001/v1/identity/agents/acme/bot');
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
    expect(result).toEqual(resp);
    await transport.shutdown();
  });
});

// ── Monitor events ──

describe('getMonitorEvents', () => {
  it('handles pagination params', async () => {
    const resp = { events: [{ event_id: 'e1' }], next_cursor: 'cur1' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(resp));
    const { transport } = makeTransport();

    const result = await transport.getMonitorEvents('after-abc', 25);

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('after_id=after-abc');
    expect(path).toContain('limit=25');
    expect(result.events).toHaveLength(1);
    expect(result.next_cursor).toBe('cur1');
    await transport.shutdown();
  });

  it('returns error fallback on failure', async () => {
    mockFetchWithAuth.mockRejectedValueOnce(new Error('network'));
    const { transport, onError } = makeTransport();

    const result = await transport.getMonitorEvents();

    expect(result).toEqual({ events: [], next_cursor: null, error: true });
    expect(onError).toHaveBeenCalledOnce();
    await transport.shutdown();
  });
});

// ── shutdown ──

describe('shutdown', () => {
  it('clears timer and flushes remaining', async () => {
    mockFetchWithAuth.mockResolvedValue(okResponse());
    const { transport } = makeTransport();

    transport.enqueue(makeReceipt('r1'));
    await transport.shutdown();

    expect(mockFetchWithAuth).toHaveBeenCalledOnce();

    // subsequent shutdown is no-op
    mockFetchWithAuth.mockClear();
    await transport.shutdown();
    expect(mockFetchWithAuth).not.toHaveBeenCalled();
  });
});

// ── healthCheck ──

describe('healthCheck', () => {
  it('returns true on 200, false on error', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });
    const { transport } = makeTransport();
    expect(await transport.healthCheck()).toBe(true);

    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await transport.healthCheck()).toBe(false);
    await transport.shutdown();
  });
});

// ── queryReceipts ──

describe('queryReceipts', () => {
  it('handles both array and wrapped formats', async () => {
    const receipts = [makeReceipt('r1')];

    // array format
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(receipts));
    const { transport } = makeTransport();
    expect(await transport.queryReceipts({ sessionId: 's1' })).toEqual(receipts);

    // wrapped format
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ receipts }));
    expect(await transport.queryReceipts({ sessionId: 's1' })).toEqual(receipts);
    await transport.shutdown();
  });
});

// ── enqueue edge cases ──

describe('enqueue', () => {
  it('triggers auto-flush at maxBatchSize', async () => {
    mockFetchWithAuth.mockResolvedValue(okResponse());
    const { transport } = makeTransport({ maxBatchSize: 2 });

    transport.enqueue(makeReceipt('r1'));
    expect(mockFetchWithAuth).not.toHaveBeenCalled();

    transport.enqueue(makeReceipt('r2'));
    // flush is fire-and-forget — give it a tick
    await new Promise(r => setTimeout(r, 10));

    expect(mockFetchWithAuth).toHaveBeenCalledOnce();
    await transport.shutdown();
  });

  it('drops oldest on queue overflow and calls onError', async () => {
    const { transport, onError } = makeTransport({ maxQueueSize: 3 });

    transport.enqueue(makeReceipt('r1'));
    transport.enqueue(makeReceipt('r2'));
    transport.enqueue(makeReceipt('r3'));
    expect(onError).not.toHaveBeenCalled();

    transport.enqueue(makeReceipt('r4'));
    expect(onError).toHaveBeenCalledOnce();
    expect(String(onError.mock.calls[0][0])).toContain('dropped 1 oldest');

    // flush should send r2, r3, r4 (r1 dropped)
    mockFetchWithAuth.mockResolvedValueOnce(okResponse());
    await transport.shutdown();
    const body = JSON.parse(mockFetchWithAuth.mock.calls[0][3].body);
    expect(body.receipts).toHaveLength(3);
    expect(body.receipts[0].id).toBe('r2');
    expect(body.receipts[2].id).toBe('r4');
  });
});
