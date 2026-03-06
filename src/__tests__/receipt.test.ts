import { describe, it, expect } from 'vitest';
import { sortedStringify, sha256, ed25519Sign, createReceipt, verifyChain } from '../receipt.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

describe('sortedStringify', () => {
  it('sorts object keys lexicographically', () => {
    expect(sortedStringify({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
  });

  it('handles nested objects with sorted keys', () => {
    expect(sortedStringify({ z: { b: 2, a: 1 }, a: 0 })).toBe('{"a":0,"z":{"a":1,"b":2}}');
  });

  it('preserves array order', () => {
    expect(sortedStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('handles null', () => {
    expect(sortedStringify(null)).toBe('null');
  });

  it('handles undefined', () => {
    expect(sortedStringify(undefined)).toBe('null');
  });

  it('handles primitives', () => {
    expect(sortedStringify(42)).toBe('42');
    expect(sortedStringify(true)).toBe('true');
    expect(sortedStringify('hello')).toBe('"hello"');
  });

  it('handles empty objects and arrays', () => {
    expect(sortedStringify({})).toBe('{}');
    expect(sortedStringify([])).toBe('[]');
  });

  it('skips undefined values in objects', () => {
    expect(sortedStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

describe('sha256', () => {
  it('produces known hash for "hello"', async () => {
    const hash = await sha256('hello');
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });
});

describe('ed25519Sign', () => {
  it('signs data and signature is verifiable', async () => {
    const privKey = ed25519.utils.randomPrivateKey();
    const pubKey = ed25519.getPublicKey(privKey);
    const privKeyHex = Buffer.from(privKey).toString('hex');

    const sig = await ed25519Sign('test message', privKeyHex);
    const sigBytes = Uint8Array.from(Buffer.from(sig, 'hex'));
    const msgBytes = new TextEncoder().encode('test message');

    const valid = ed25519.verify(sigBytes, msgBytes, pubKey);
    expect(valid).toBe(true);
  });
});

describe('createReceipt', () => {
  const privKey = ed25519.utils.randomPrivateKey();
  const pubKey = ed25519.getPublicKey(privKey);
  const privKeyHex = Buffer.from(privKey).toString('hex');

  const data = {
    id: 'r1',
    sessionId: 's1',
    agent: 'bot',
    action: 'swap',
    input: { from: 'ETH', to: 'USDC' },
    timestamp: 1000,
  };

  it('produces deterministic hash', async () => {
    const r1 = await createReceipt(data, '0', privKeyHex);
    const r2 = await createReceipt(data, '0', privKeyHex);
    expect(r1.hash).toBe(r2.hash);
  });

  it('produces valid Ed25519 signature', async () => {
    const receipt = await createReceipt(data, '0', privKeyHex);
    const sigBytes = Uint8Array.from(Buffer.from(receipt.signature, 'hex'));
    const msgBytes = new TextEncoder().encode(receipt.hash);
    const valid = ed25519.verify(sigBytes, msgBytes, pubKey);
    expect(valid).toBe(true);
  });
});

describe('verifyChain', () => {
  const privKey = ed25519.utils.randomPrivateKey();
  const privKeyHex = Buffer.from(privKey).toString('hex');

  it('verifies a valid chain of 3 receipts', async () => {
    const makeData = (id: string) => ({
      id,
      sessionId: 's1',
      agent: 'bot',
      action: 'step',
      input: { n: id },
      timestamp: Date.now(),
    });

    const r1 = await createReceipt(makeData('1'), '0', privKeyHex);
    const r2 = await createReceipt(makeData('2'), r1.hash, privKeyHex);
    const r3 = await createReceipt(makeData('3'), r2.hash, privKeyHex);

    await expect(verifyChain([r1, r2, r3])).resolves.toBe(true);
  });

  it('throws CHAIN_BROKEN on tampered hash', async () => {
    const makeData = (id: string) => ({
      id,
      sessionId: 's1',
      agent: 'bot',
      action: 'step',
      input: { n: id },
      timestamp: Date.now(),
    });

    const r1 = await createReceipt(makeData('1'), '0', privKeyHex);
    const r2 = await createReceipt(makeData('2'), r1.hash, privKeyHex);
    const r3 = await createReceipt(makeData('3'), r2.hash, privKeyHex);

    r2.hash = 'tampered';

    await expect(verifyChain([r1, r2, r3])).rejects.toThrow('hash mismatch');
  });

  it('throws CHAIN_BROKEN when first receipt previousHash is not 0', async () => {
    const r1 = await createReceipt({
      id: '1',
      sessionId: 's1',
      agent: 'bot',
      action: 'step',
      input: { n: 1 },
      timestamp: Date.now(),
    }, 'not-zero', privKeyHex);

    await expect(verifyChain([r1])).rejects.toThrow('previousHash "0"');
  });
});
