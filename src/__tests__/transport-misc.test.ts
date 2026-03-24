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

// ── Drift ──

describe('getDriftCatches', () => {
  it('sends GET /v1/drift/catches', async () => {
    const catches = [{ id: 'drift_s1_s2', session_a: 's1', session_b: 's2', similarity_score: 0.6 }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(catches));
    const { transport } = makeTransport();

    const result = await transport.getDriftCatches();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/drift/catches');
    expect(result).toEqual(catches);
    await transport.shutdown();
  });

  it('throws on error', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(500));
    const { transport } = makeTransport();

    await expect(transport.getDriftCatches()).rejects.toThrow('500');
    await transport.shutdown();
  });
});

describe('getDriftComparison', () => {
  it('sends GET /v1/drift/comparison with session params', async () => {
    const comparison = { run_a: {}, run_b: {}, similarity_score: 0.85 };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(comparison));
    const { transport } = makeTransport();

    const result = await transport.getDriftComparison('s1', 's2');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('session_a=s1');
    expect(path).toContain('session_b=s2');
    expect(result).toEqual(comparison);
    await transport.shutdown();
  });

  it('sends GET /v1/drift/comparison without params for auto-detect', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ run_a: {}, run_b: {} }));
    const { transport } = makeTransport();

    await transport.getDriftComparison();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/drift/comparison');
    await transport.shutdown();
  });
});

// ── Templates ──

describe('listTemplatePacks', () => {
  it('sends GET /v1/templates', async () => {
    const packs = [{ id: 'cs-pack', name: 'Customer Support', category: 'support' }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(packs));
    const { transport } = makeTransport();

    const result = await transport.listTemplatePacks();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/templates');
    expect(result).toEqual(packs);
    await transport.shutdown();
  });
});

describe('applyTemplatePack', () => {
  it('sends POST /v1/templates/:id/apply', async () => {
    const applied = { pack_id: 'cs-pack', monitors_created: 3, monitors: [] };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(applied));
    const { transport } = makeTransport();

    const result = await transport.applyTemplatePack('cs-pack', { agent_id: 'a1' });

    const [, , path, init] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/templates/cs-pack/apply');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ agent_id: 'a1' });
    expect(result).toEqual(applied);
    await transport.shutdown();
  });

  it('sends empty body when no agent_id', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ pack_id: 'p', monitors_created: 0, monitors: [] }));
    const { transport } = makeTransport();

    await transport.applyTemplatePack('cs-pack');

    const [, , , init] = mockFetchWithAuth.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({});
    await transport.shutdown();
  });

  it('throws on 404', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(404));
    const { transport } = makeTransport();

    await expect(transport.applyTemplatePack('bad-id')).rejects.toThrow('404');
    await transport.shutdown();
  });
});

// ── Identities ──

describe('listIdentities', () => {
  it('sends GET /v1/identities', async () => {
    const identities = [{ id: 'a1', name: 'bot', org: 'acme' }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(identities));
    const { transport } = makeTransport();

    const result = await transport.listIdentities();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/identities');
    expect(result).toEqual(identities);
    await transport.shutdown();
  });
});

describe('getIdentity', () => {
  it('sends GET /v1/identities/:id', async () => {
    const identity = { id: 'a1', name: 'bot', org: 'acme', identity_type: 'org_scoped' };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(identity));
    const { transport } = makeTransport();

    const result = await transport.getIdentity('a1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/identities/a1');
    expect(result).toEqual(identity);
    await transport.shutdown();
  });

  it('URL-encodes IDs with slashes', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse({ id: 'acme/bot' }));
    const { transport } = makeTransport();

    await transport.getIdentity('acme/bot');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe(`/v1/identities/${encodeURIComponent('acme/bot')}`);
    await transport.shutdown();
  });
});

// ── A2A Query ──

describe('listA2AConversations', () => {
  it('sends GET /v1/a2a/conversations', async () => {
    const conversations = [{ id: 'conv1', message_count: 5 }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(conversations));
    const { transport } = makeTransport();

    const result = await transport.listA2AConversations();

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/a2a/conversations');
    expect(result).toEqual(conversations);
    await transport.shutdown();
  });

  it('passes agent_id filter', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.listA2AConversations({ agent_id: 'a1' });

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('agent_id=a1');
    await transport.shutdown();
  });
});

describe('getA2AConversation', () => {
  it('sends GET /v1/a2a/conversations/:id', async () => {
    const conversation = { id: 'conv1', message_count: 3 };
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(conversation));
    const { transport } = makeTransport();

    const result = await transport.getA2AConversation('conv1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/a2a/conversations/conv1');
    expect(result).toEqual(conversation);
    await transport.shutdown();
  });
});

describe('getA2AConversationMessages', () => {
  it('sends GET /v1/a2a/conversations/:id/messages', async () => {
    const messages = [{ id: 'msg1', content: 'hello' }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(messages));
    const { transport } = makeTransport();

    const result = await transport.getA2AConversationMessages('conv1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/a2a/conversations/conv1/messages');
    expect(result).toEqual(messages);
    await transport.shutdown();
  });
});

describe('getAgentPeers', () => {
  it('sends GET /v1/a2a/agents/:id/peers', async () => {
    const peers = [{ agent_id: 'a2', agent_name: 'Bot B', sent: 3, received: 2, pending: 1, verified: 4 }];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(peers));
    const { transport } = makeTransport();

    const result = await transport.getAgentPeers('a1');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toBe('/v1/a2a/agents/a1/peers');
    expect(result).toEqual(peers);
    await transport.shutdown();
  });

  it('throws on 403', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(403));
    const { transport } = makeTransport();

    await expect(transport.getAgentPeers('other-agent')).rejects.toThrow('403');
    await transport.shutdown();
  });
});

// ── Search ──

describe('search', () => {
  it('sends GET /v1/search?q=...', async () => {
    const results = [
      { type: 'session', id: 's1', label: 'Test Session' },
      { type: 'agent', id: 'a1', label: 'Bot A' },
    ];
    mockFetchWithAuth.mockResolvedValueOnce(okResponse(results));
    const { transport } = makeTransport();

    const result = await transport.search('test');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('q=test');
    expect(result).toEqual(results);
    await transport.shutdown();
  });

  it('URL-encodes query', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(okResponse([]));
    const { transport } = makeTransport();

    await transport.search('my agent');

    const [, , path] = mockFetchWithAuth.mock.calls[0];
    expect(path).toContain('q=my+agent');
    await transport.shutdown();
  });

  it('throws on error', async () => {
    mockFetchWithAuth.mockResolvedValueOnce(errorResponse(500));
    const { transport } = makeTransport();

    await expect(transport.search('test')).rejects.toThrow('500');
    await transport.shutdown();
  });
});
