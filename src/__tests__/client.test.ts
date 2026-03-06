import { describe, it, expect, vi } from 'vitest';
import { Invariance } from '../client.js';
import { InvarianceError } from '../errors.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

const privKey = ed25519.utils.randomPrivateKey();
const privKeyHex = Buffer.from(privKey).toString('hex');

// Mock fetch globally for transport calls
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));

describe('Invariance', () => {
  it('init() throws if apiKey missing', () => {
    expect(() => Invariance.init({ apiKey: '', privateKey: privKeyHex })).toThrow('apiKey is required');
  });

  it('init() throws if privateKey missing', () => {
    expect(() => Invariance.init({ apiKey: 'inv_test', privateKey: '' })).toThrow('privateKey is required');
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
});
