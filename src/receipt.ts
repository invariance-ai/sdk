import type { Receipt, VerifyResult } from './types.js';
import { InvarianceError } from './errors.js';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';

ed25519.etc.sha512Sync = sha512;

/**
 * Deterministic JSON serialization with sorted keys.
 * Objects: sort keys lexicographically, recurse values.
 * Arrays: keep order, recurse elements. Primitives: pass through.
 *
 * NOTE: This is a duplicate of sortedStringify in invariance-core/backend/src/crypto.ts.
 * The SDK uses Web Crypto (async sha256) for browser/edge compatibility, while the core
 * backend uses Node's crypto module (sync sha256). Both implementations must produce
 * identical output — keep them in sync when modifying.
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

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) {
    throw new InvarianceError('API_ERROR', 'Invalid hex string');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
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
  contractId?: string;
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
  signingKey: string | null,
): Promise<Receipt> {
  const hashObj: Record<string, unknown> = {
    id: data.id,
    sessionId: data.sessionId,
    agent: data.agent,
    action: data.action,
    input: data.input,
    output: data.output ?? null,
    error: data.error ?? null,
    timestamp: data.timestamp,
    previousHash,
  };
  if (data.contractId) {
    hashObj.contractId = data.contractId;
  }
  const hashInput = sortedStringify(hashObj);

  const hash = await sha256(hashInput);
  const signature = signingKey ? await ed25519Sign(hash, signingKey) : null;

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
 * Collects all errors instead of throwing on first failure.
 */
export async function verifyChain(
  receipts: Receipt[],
  opts?: { publicKeyHex?: string },
): Promise<VerifyResult> {
  const errors: Array<{ index: number; reason: string }> = [];
  const publicKeyHex = opts?.publicKeyHex;
  const seenReceiptIds = new Set<string>();

  for (let i = 0; i < receipts.length; i++) {
    const receipt = receipts[i]!;

    // Check IDs are unique.
    if (seenReceiptIds.has(receipt.id)) {
      errors.push({ index: i, reason: `Receipt ${i} duplicates ID "${receipt.id}"` });
    } else {
      seenReceiptIds.add(receipt.id);
    }

    // Check all receipts share same sessionId
    if (i > 0 && receipt.sessionId !== receipts[0]!.sessionId) {
      errors.push({ index: i, reason: `Receipt ${i} session ID mismatch: expected "${receipts[0]!.sessionId}", got "${receipt.sessionId}"` });
    }

    // Check timestamps are non-decreasing
    if (i > 0 && receipt.timestamp < receipts[i - 1]!.timestamp) {
      errors.push({ index: i, reason: `Receipt ${i} timestamp is before receipt ${i - 1} timestamp` });
    }

    // Check first receipt has previousHash === '0'
    if (i === 0 && receipt.previousHash !== '0') {
      errors.push({ index: i, reason: 'First receipt must use previousHash "0"' });
    }

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
      errors.push({ index: i, reason: `Receipt ${i} hash mismatch` });
    }

    // Check chain linkage
    if (i > 0) {
      const previous = receipts[i - 1]!;
      if (receipt.previousHash !== previous.hash) {
        errors.push({ index: i, reason: `Receipt ${i} previousHash does not match receipt ${i - 1} hash` });
      }
    }

    // Verify Ed25519 signature if public key provided.
    if (publicKeyHex && !receipt.signature) {
      errors.push({ index: i, reason: `Receipt ${i} is missing signature` });
    } else if (publicKeyHex && receipt.signature) {
      try {
        const sigBytes = hexToBytes(receipt.signature);
        const msgBytes = new TextEncoder().encode(receipt.hash);
        const pubKeyBytes = hexToBytes(publicKeyHex);
        const valid = ed25519.verify(sigBytes, msgBytes, pubKeyBytes);
        if (!valid) {
          errors.push({ index: i, reason: `Receipt ${i} has invalid signature` });
        }
      } catch (err) {
        if (!(err instanceof InvarianceError)) {
          errors.push({ index: i, reason: `Receipt ${i} signature verification failed` });
        } else {
          errors.push({ index: i, reason: (err as InvarianceError).message });
        }
      }
    }
  }

  return { valid: errors.length === 0, receiptCount: receipts.length, errors };
}

export async function verifyChainOrThrow(receipts: Receipt[], publicKeyHex?: string): Promise<boolean> {
  const result = await verifyChain(receipts, { publicKeyHex });
  if (!result.valid) {
    throw new InvarianceError('CHAIN_BROKEN', result.errors[0]!.reason);
  }
  return true;
}
