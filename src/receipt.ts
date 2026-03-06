import type { Receipt } from './types.js';
import { InvarianceError } from './errors.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

/**
 * Deterministic JSON serialization with sorted keys.
 * Objects: sort keys lexicographically, recurse values.
 * Arrays: keep order, recurse elements. Primitives: pass through.
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

/**
 * SHA-256 hash using Web Crypto API.
 * @returns hex-encoded hash string
 */
export async function sha256(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const buffer = await crypto.subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new InvarianceError('API_ERROR', 'Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Ed25519 signature.
 * @returns hex-encoded signature string
 */
export async function ed25519Sign(data: string, privateKeyHex: string): Promise<string> {
  const msgBytes = new TextEncoder().encode(data);
  const privKeyBytes = hexToBytes(privateKeyHex);
  const signature = ed25519.sign(msgBytes, privKeyBytes);
  return bytesToHex(signature);
}

/** Data needed to create a receipt (before hashing) */
export interface ReceiptData {
  id: string;
  sessionId: string;
  agent: string;
  action: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  timestamp: number;
}

/**
 * Create a hash-chained, signed receipt.
 *
 * The hash covers (id, sessionId, agent, action, input, output, error, timestamp, previousHash)
 * using deterministic JSON serialization + SHA-256.
 * The signature is Ed25519(hash, privateKey).
 */
export async function createReceipt(
  data: ReceiptData,
  previousHash: string,
  signingKey: string,
): Promise<Receipt> {
  const hashInput = sortedStringify({
    id: data.id,
    sessionId: data.sessionId,
    agent: data.agent,
    action: data.action,
    input: data.input,
    output: data.output ?? null,
    error: data.error ?? null,
    timestamp: data.timestamp,
    previousHash,
  });

  const hash = await sha256(hashInput);
  const signature = await ed25519Sign(hash, signingKey);

  return {
    id: data.id,
    sessionId: data.sessionId,
    agent: data.agent,
    action: data.action,
    input: data.input,
    output: data.output,
    error: data.error,
    timestamp: data.timestamp,
    hash,
    previousHash,
    signature,
  };
}

/**
 * Verify hash-chain linkage and Ed25519 signatures of an ordered array of receipts.
 * Recomputes each hash, checks previousHash linkage, and optionally verifies signatures.
 *
 * @param receipts - Ordered array of receipts to verify
 * @param publicKeyHex - Optional Ed25519 public key (hex) to verify signatures against.
 *                       If omitted, only hash-chain integrity is verified.
 * @throws InvarianceError with code CHAIN_BROKEN if verification fails
 */
export async function verifyChain(receipts: Receipt[], publicKeyHex?: string): Promise<boolean> {
  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i]!;

    // Recompute hash
    const hashInput = sortedStringify({
      id: receipt.id,
      sessionId: receipt.sessionId,
      agent: receipt.agent,
      action: receipt.action,
      input: receipt.input,
      output: receipt.output ?? null,
      error: receipt.error ?? null,
      timestamp: receipt.timestamp,
      previousHash: receipt.previousHash,
    });
    const expectedHash = await sha256(hashInput);

    if (receipt.hash !== expectedHash) {
      throw new InvarianceError('CHAIN_BROKEN', `Receipt ${i} hash mismatch`);
    }

    // Check linkage
    if (i === 0 && receipt.previousHash !== '0') {
      throw new InvarianceError('CHAIN_BROKEN', 'First receipt must use previousHash "0"');
    }
    if (i > 0) {
      const previous = receipts[i - 1]!;
      if (receipt.previousHash !== previous.hash) {
        throw new InvarianceError('CHAIN_BROKEN', `Receipt ${i} previousHash does not match receipt ${i - 1} hash`);
      }
    }

    // Verify Ed25519 signature if public key provided
    if (publicKeyHex && receipt.signature) {
      try {
        const sigBytes = hexToBytes(receipt.signature);
        const msgBytes = new TextEncoder().encode(receipt.hash);
        const pubKeyBytes = hexToBytes(publicKeyHex);
        const valid = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
        if (!valid) {
          throw new InvarianceError('CHAIN_BROKEN', `Receipt ${i} has invalid signature`);
        }
      } catch (err) {
        if (err instanceof InvarianceError) throw err;
        throw new InvarianceError('CHAIN_BROKEN', `Receipt ${i} signature verification failed`);
      }
    }
  }

  return true;
}
