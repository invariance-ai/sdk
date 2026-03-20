import { describe, it, expect, vi } from 'vitest';
import { Invariance } from '../client.js';
import { InvarianceError } from '../errors.js';
import { action } from '../templates.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

const privKey = ed25519.utils.randomPrivateKey();
const privKeyHex = Buffer.from(privKey).toString('hex');

// Mock fetch globally for transport calls
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

describe('Invariance.generateKeypair()', () => {
  it('produces valid 64-char hex strings', () => {
    const { privateKey, publicKey } = Invariance.generateKeypair();
    expect(privateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it('public key can verify signatures from private key', async () => {
    const { privateKey, publicKey } = Invariance.generateKeypair();
    const message = new TextEncoder().encode('test message');
    const privBytes = ed25519.etc.hexToBytes(privateKey);
    const sig = await ed25519.signAsync(message, privBytes);
    const pubBytes = ed25519.etc.hexToBytes(publicKey);
    const valid = await ed25519.verifyAsync(sig, message, pubBytes);
    expect(valid).toBe(true);
  });
});

describe('Invariance', () => {
  it('init() throws if apiKey missing', () => {
    expect(() => Invariance.init({ apiKey: '', privateKey: privKeyHex })).toThrow('apiKey is required');
  });

  it('init() works without privateKey', () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    expect(inv).toBeDefined();
  });

  it('init() throws if privateKey is not valid hex', () => {
    expect(() => Invariance.init({ apiKey: 'inv_test', privateKey: 'xyz' })).toThrow('privateKey must be a 32-byte hex string');
  });

  it('session() creates a Session instance', () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    const session = inv.session({ agent: 'bot', name: 'run' });
    expect(session.id).toBeTruthy();
    expect(session.agent).toBe('bot');
  });

  it('createSession() rejects when backend session creation fails', async () => {
    const onError = vi.fn();
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex, onError });
    (fetch as any).mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    await expect(inv.createSession({ agent: 'bot', name: 'run' })).rejects.toMatchObject({
      name: 'InvarianceError',
      code: 'API_ERROR',
    });
    expect(onError).toHaveBeenCalledTimes(1);
    await inv.shutdown();
  });

  it('check() runs policy evaluation', () => {
    const inv = Invariance.init({
      apiKey: 'inv_test',
      privateKey: privKeyHex,
      policies: [{ action: 'swap', maxAmountUsd: 100 }],
    });

    const allowed = inv.check({ agent: 'bot', action: 'swap', input: { amountUsd: 50 } });
    expect(allowed.allowed).toBe(true);

    const denied = inv.check({ agent: 'bot', action: 'swap', input: { amountUsd: 200 } });
    expect(denied.allowed).toBe(false);
  });

  it('agent() enforces local allow/deny action policy', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    const trader = inv.agent({
      id: 'trader',
      privateKey: privKeyHex,
      allowActions: ['finance.balance.read'],
      denyActions: ['finance.transfer.execute'],
    });

    const session = trader.session({ name: 'run' });
    await expect(session.record('finance.balance.read', { accountId: 'acc-1' })).resolves.toBeDefined();
    await expect(session.record('finance.transfer.execute', { from: 'a', to: 'b', amount: 1 } as any)).rejects.toThrow(InvarianceError);
    await expect(session.record('finance.unlisted', {} as any)).rejects.toThrow('not allowed');
  });

  it('healthCheck() calls transport', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    (fetch as any).mockResolvedValueOnce({ ok: true });
    const result = await inv.healthCheck();
    expect(result).toBe(true);
    await inv.shutdown();
  });

  it('ask() sends the new NL query contract and preserves legacy scope compatibility', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        answer: 'ok',
        conversation_id: 'conv-1',
        data_sources: [],
        confidence: 0.9,
      }),
    });

    const result = await inv.ask('What happened?', {
      session_id: 'sess-1',
      time_range: { from: 10, to: 20 },
    });

    const [url, init] = (fetch as any).mock.calls.at(-1);
    expect(url).toBe('https://api.invariance.dev/v1/nl-query');
    expect(JSON.parse(init.body)).toEqual({
      question: 'What happened?',
      context: {
        session_id: 'sess-1',
        time_range: { since: 10, until: 20 },
      },
    });
    expect(result.conversation_id).toBe('conv-1');
    await inv.shutdown();
  });

  it('record() requires agent for one-off receipt', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    await expect(inv.record({ action: 'compute', input: { n: 1 } } as any)).rejects.toThrow(
      'agent is required for one-off record(); use session() to default agent',
    );
    await inv.shutdown();
  });

  it('agent() supports typed action templates', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    const actions = {
      'finance.balance.read': action<{ accountId: string }, { balance: number; currency: string }>({
        label: 'Read Balance',
        category: 'read',
        highlights: ['accountId', 'balance', 'currency'],
      }),
    };

    const agent = inv.agent({
      id: 'finance-agent',
      privateKey: privKeyHex,
      actions,
      allowActions: ['finance.balance.read'],
    });

    const session = agent.session({ name: 'typed' });
    const receipt = await session.record('finance.balance.read', { accountId: 'acc-1' }, { balance: 100, currency: 'USD' });
    expect(receipt.action).toBe('finance.balance.read');
    expect(receipt.agent).toBe('finance-agent');
  });

  it('agent().sessionAsync() creates an initialized typed session', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    const actions = {
      'finance.balance.read': action<{ accountId: string }, { balance: number; currency: string }>({
        label: 'Read Balance',
      }),
    };

    const agent = inv.agent({
      id: 'finance-agent',
      privateKey: privKeyHex,
      actions,
      allowActions: ['finance.balance.read'],
    });

    const session = await agent.sessionAsync({ name: 'typed-async' });
    const receipt = await session.record('finance.balance.read', { accountId: 'acc-1' }, { balance: 100, currency: 'USD' });
    expect(session.id).toBeTruthy();
    expect(receipt.action).toBe('finance.balance.read');
  });

  // --- Optional crypto (no privateKey) ---

  it('init() without privateKey creates valid instance', () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    expect(inv).toBeDefined();
  });

  it('session().record() works without privateKey (signature is null)', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    const session = inv.session({ agent: 'bot', name: 'run' });
    const receipt = await session.record({ agent: 'bot', action: 'step', input: { x: 1 } });
    expect(receipt.signature).toBeNull();
    expect(receipt.hash).toBeTruthy();
    expect(receipt.previousHash).toBe('0');
  });

  it('hash chain is valid without privateKey', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    const session = inv.session({ agent: 'bot', name: 'run' });
    const r1 = await session.record({ agent: 'bot', action: 'step', input: { x: 1 } });
    const r2 = await session.record({ agent: 'bot', action: 'step', input: { x: 2 } });
    expect(r2.previousHash).toBe(r1.hash);
    expect(r1.signature).toBeNull();
    expect(r2.signature).toBeNull();
  });

  it('proposeContract() throws without privateKey', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    await expect(inv.proposeContract('provider', { description: 'test', deliverables: [] })).rejects.toThrow(
      'privateKey required for proposeContract()',
    );
  });

  it('acceptContract() throws without privateKey', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    await expect(inv.acceptContract('c1', 'hash')).rejects.toThrow('privateKey required for acceptContract()');
  });

  it('deliver() throws without privateKey', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    await expect(inv.deliver('c1', {})).rejects.toThrow('privateKey required for deliver()');
  });

  it('acceptDelivery() throws without privateKey', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    await expect(inv.acceptDelivery('c1', 'd1', 'hash')).rejects.toThrow('privateKey required for acceptDelivery()');
  });

  it('dispute() throws without privateKey', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    await expect(inv.dispute('c1')).rejects.toThrow('privateKey required for dispute()');
  });

  it('registerAgent() throws without privateKey', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    await expect(inv.registerAgent('acme', 'bot')).rejects.toThrow('privateKey required for registerAgent()');
  });

  it('wrapWithIdentity() throws without privateKey', () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    expect(() => inv.wrapWithIdentity(() => 'hi', { identity: 'acme/bot', action: 'greet', input: {} })).toThrow(
      'privateKey required for wrapWithIdentity()',
    );
  });

  it('deriveAgentKeypair() throws without privateKey', () => {
    const inv = Invariance.init({ apiKey: 'inv_test' });
    expect(() => inv.deriveAgentKeypair('acme/bot')).toThrow('privateKey required for deriveAgentKeypair()');
  });
});
