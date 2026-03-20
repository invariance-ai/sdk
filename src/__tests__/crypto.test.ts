import { describe, it, expect } from 'vitest';
import { deriveAgentKeypair } from '../crypto.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { hexToBytes, bytesToHex } from '../receipt.js';

ed25519.etc.sha512Sync = sha512;

describe('deriveAgentKeypair', () => {
  const ownerPrivateKey = bytesToHex(ed25519.utils.randomPrivateKey());

  it('derives a valid Ed25519 keypair', () => {
    const { privateKey, publicKey } = deriveAgentKeypair(ownerPrivateKey, 'acme/compliance-agent');

    expect(privateKey).toHaveLength(64);
    expect(publicKey).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(privateKey)).toBe(true);
    expect(/^[0-9a-f]{64}$/.test(publicKey)).toBe(true);
  }, 15_000);

  it('derived public key matches derived private key', () => {
    const { privateKey, publicKey } = deriveAgentKeypair(ownerPrivateKey, 'acme/compliance-agent');
    const expectedPub = bytesToHex(ed25519.getPublicKey(hexToBytes(privateKey)));
    expect(publicKey).toBe(expectedPub);
  });

  it('is deterministic — same inputs produce same outputs', () => {
    const a = deriveAgentKeypair(ownerPrivateKey, 'acme/test-agent');
    const b = deriveAgentKeypair(ownerPrivateKey, 'acme/test-agent');
    expect(a.privateKey).toBe(b.privateKey);
    expect(a.publicKey).toBe(b.publicKey);
  });

  it('different identities produce different keys', () => {
    const a = deriveAgentKeypair(ownerPrivateKey, 'acme/agent-one');
    const b = deriveAgentKeypair(ownerPrivateKey, 'acme/agent-two');
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(a.publicKey).not.toBe(b.publicKey);
  });

  it('different owner keys produce different agent keys', () => {
    const otherOwner = bytesToHex(ed25519.utils.randomPrivateKey());
    const a = deriveAgentKeypair(ownerPrivateKey, 'acme/agent');
    const b = deriveAgentKeypair(otherOwner, 'acme/agent');
    expect(a.privateKey).not.toBe(b.privateKey);
  });

  it('derived key can sign and verify', () => {
    const { privateKey, publicKey } = deriveAgentKeypair(ownerPrivateKey, 'acme/signer');
    const message = new TextEncoder().encode('hello');
    const signature = ed25519.sign(message, hexToBytes(privateKey));
    const valid = ed25519.verify(signature, message, hexToBytes(publicKey));
    expect(valid).toBe(true);
  });
});
