import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 as sha256Hash } from '@noble/hashes/sha256';
import { InvarianceError } from './errors.js';

// Set sync SHA-512 for Ed25519
ed25519.etc.sha512Sync = sha512;

/**
 * Deterministic JSON serialization with sorted keys.
 *
 * CRITICAL: Must produce identical output to backend/src/crypto.ts.
 * Both implementations must stay in sync.
 */
export function sortedStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((el) => sortedStringify(el)).join(',') + ']';
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const entries: string[] = [];
    for (const key of keys) {
      const v = obj[key];
      if (v === undefined) continue;
      entries.push(JSON.stringify(key) + ':' + sortedStringify(v));
    }
    return '{' + entries.join(',') + '}';
  }
  return 'null';
}

export async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  return bytesToHex(new Uint8Array(hashBuffer));
}

export interface ReceiptHashInput {
  id: string;
  sessionId: string;
  agent: string;
  action: string;
  input: unknown;
  output?: unknown;
  error?: unknown;
  timestamp: number | string;
  previousHash: string;
}

export async function computeReceiptHash(r: ReceiptHashInput): Promise<string> {
  const hashInput = sortedStringify({
    id: r.id,
    sessionId: r.sessionId,
    agent: r.agent,
    action: r.action,
    input: r.input,
    output: r.output ?? null,
    error: r.error ?? null,
    timestamp: r.timestamp,
    previousHash: r.previousHash,
  });
  return sha256(hashInput);
}

export async function ed25519Sign(data: string, privateKeyHex: string): Promise<string> {
  const msgBytes = new TextEncoder().encode(data);
  const privKeyBytes = hexToBytes(privateKeyHex);
  const signature = await ed25519.signAsync(msgBytes, privKeyBytes);
  return bytesToHex(signature);
}

export function ed25519Verify(data: string, signatureHex: string, publicKeyHex: string): boolean {
  try {
    if (signatureHex.length !== 128 || publicKeyHex.length !== 64) return false;
    if (!/^[0-9a-fA-F]+$/.test(signatureHex) || !/^[0-9a-fA-F]+$/.test(publicKeyHex)) return false;
    const sigBytes = hexToBytes(signatureHex);
    const msgBytes = new TextEncoder().encode(data);
    const pubKeyBytes = hexToBytes(publicKeyHex);
    return ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
  } catch {
    return false;
  }
}

export function generateKeypair(): { privateKey: string; publicKey: string } {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey: bytesToHex(privateKey), publicKey: bytesToHex(publicKey) };
}

export function getPublicKey(privateKeyHex: string): string {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(privateKeyHex)));
}

export function deriveAgentKeypair(
  ownerPrivateKeyHex: string,
  identity: string,
): { privateKey: string; publicKey: string } {
  const ownerBytes = hexToBytes(ownerPrivateKeyHex);
  const info = new TextEncoder().encode(identity);
  const derived = hkdf(sha256Hash, ownerBytes, undefined, info, 32);
  const privateKey = bytesToHex(new Uint8Array(derived));
  const publicKey = getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new InvarianceError('CRYPTO_ERROR', 'Hex string must have even length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}
