import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Invariance } from '../client.js';

describe('Invariance management endpoints', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('lists sessions with filters and normalizes backend fields', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'sess-1',
          name: 'demo',
          created_by: 'agent-1',
          created_at: '2026-03-24T00:00:00.000Z',
          status: 'open',
          receipt_count: 3,
        },
      ],
    });

    const sessions = await inv.listSessions({ status: 'open', limit: 10, offset: 5 });

    const [url, init] = (fetch as any).mock.calls.at(-1);
    expect(url).toBe('https://api.invariance.dev/v1/sessions?status=open&limit=10&offset=5');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer inv_test');
    expect(sessions).toEqual([
      expect.objectContaining({
        id: 'sess-1',
        agent: 'agent-1',
        receiptCount: 3,
        receipt_count: 3,
      }),
    ]);

    await inv.shutdown();
  });

  it('uses an explicit Supabase bearer token for scoped API key management', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'key-1',
        name: 'ci',
        key: 'inv_secret',
        scopes: ['sessions'],
        created_at: '2026-03-24T00:00:00.000Z',
      }),
    });

    const apiKey = await inv.createApiKey('supabase-jwt', {
      name: 'ci',
      scopes: ['sessions'],
    });

    const [url, init] = (fetch as any).mock.calls.at(-1);
    expect(url).toBe('https://api.invariance.dev/v1/api-keys');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer supabase-jwt');
    expect(JSON.parse(init.body)).toEqual({ name: 'ci', scopes: ['sessions'] });
    expect(apiKey.key).toBe('inv_secret');

    await inv.shutdown();
  });

  it('queries usage with the configured developer or org key', async () => {
    const inv = Invariance.init({ apiKey: 'dev_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: 'usage-1',
          developer_id: 'dev-1',
          org_id: null,
          event_type: 'api_call',
          created_at: '2026-03-24T00:00:00.000Z',
        },
      ],
    });

    const usage = await inv.getUsage({
      event_type: 'api_call',
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-03-24T00:00:00.000Z',
      limit: 25,
    });

    const [url, init] = (fetch as any).mock.calls.at(-1);
    expect(url).toBe('https://api.invariance.dev/v1/usage?event_type=api_call&from=2026-03-01T00%3A00%3A00.000Z&to=2026-03-24T00%3A00%3A00.000Z&limit=25');
    expect((init.headers as Headers).get('Authorization')).toBe('Bearer dev_test');
    expect(usage[0]?.id).toBe('usage-1');

    await inv.shutdown();
  });

  it('fetches public docs without requiring the configured API key', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        version: '0.1.0',
        baseUrl: 'https://api.invariance.dev',
        websiteDocs: 'https://invariance.dev/docs',
        sdkPackage: '@invariance/sdk',
        endpoints: [],
      }),
    });

    const docs = await inv.getDocs();

    const [url, init] = (fetch as any).mock.calls.at(-1);
    expect(url).toBe('https://api.invariance.dev/v1/docs');
    expect(init).toBeUndefined();
    expect(docs.sdkPackage).toBe('@invariance/sdk');

    await inv.shutdown();
  });

  it('supports agent template and policy admin operations', async () => {
    const inv = Invariance.init({ apiKey: 'inv_admin' });
    (fetch as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ action: 'search', label: 'Search' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ updated: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ action: 'search', effect: 'allow' }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ updated: 1 }),
      });

    await expect(inv.getAgentTemplates('agent/one')).resolves.toEqual([{ action: 'search', label: 'Search' }]);
    await expect(inv.upsertAgentTemplates('agent/one', [{ action: 'search', label: 'Search' }])).resolves.toEqual({ updated: 1 });
    await expect(inv.getAgentPolicies('agent/one')).resolves.toEqual([{ action: 'search', effect: 'allow' }]);
    await expect(inv.upsertAgentPolicies('agent/one', [{ action: 'search', effect: 'allow' }])).resolves.toEqual({ updated: 1 });

    const templatePut = (fetch as any).mock.calls[1];
    const policyPut = (fetch as any).mock.calls[3];
    expect(templatePut[0]).toBe('https://api.invariance.dev/v1/agents/agent%2Fone/templates');
    expect(JSON.parse(templatePut[1].body)).toEqual({ templates: [{ action: 'search', label: 'Search' }] });
    expect(policyPut[0]).toBe('https://api.invariance.dev/v1/agents/agent%2Fone/policies');
    expect(JSON.parse(policyPut[1].body)).toEqual({ policies: [{ action: 'search', effect: 'allow' }] });

    await inv.shutdown();
  });
});
