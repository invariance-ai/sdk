import { describe, it, expect, vi } from 'vitest';
import { Invariance } from '../client.js';
import { InvarianceError } from '../errors.js';
import { action, defineActions } from '../templates.js';
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

  it('init() throws if privateKey missing', () => {
    expect(() => Invariance.init({ apiKey: 'inv_test', privateKey: '' })).toThrow('privateKey is required');
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

  it('record() requires agent for one-off receipt', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    await expect(inv.record({ action: 'compute', input: { n: 1 } } as any)).rejects.toThrow(
      'agent is required for one-off record(); use session() to default agent',
    );
    await inv.shutdown();
  });

  it('agent() supports typed action templates', async () => {
    const inv = Invariance.init({ apiKey: 'inv_test', privateKey: privKeyHex });
    const actions = defineActions({
      'finance.balance.read': action<{ accountId: string }, { balance: number; currency: string }>({
        label: 'Read Balance',
        category: 'read',
        highlights: ['accountId', 'balance', 'currency'],
      }),
    });

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
});
