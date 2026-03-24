import { ulid } from 'ulid';
import { computeReceiptHash, ed25519Sign, ed25519Verify } from './crypto.js';
import type { Receipt } from './types/receipt.js';

export interface CreateReceiptOpts {
  sessionId: string;
  agent: string;
  action: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  previousHash: string;
  privateKey?: string;
  contractId?: string;
  counterAgentId?: string;
  counterSignature?: string;
}

export async function createReceipt(opts: CreateReceiptOpts): Promise<Receipt> {
  const id = ulid();
  const timestamp = Date.now();

  const hash = await computeReceiptHash({
    id,
    sessionId: opts.sessionId,
    agent: opts.agent,
    action: opts.action,
    input: opts.input,
    output: opts.output,
    error: opts.error,
    timestamp,
    previousHash: opts.previousHash,
  });

  let signature = '';
  if (opts.privateKey) {
    signature = await ed25519Sign(hash, opts.privateKey);
  }

  return {
    id,
    sessionId: opts.sessionId,
    agent: opts.agent,
    action: opts.action,
    input: opts.input,
    output: opts.output,
    error: opts.error,
    timestamp,
    hash,
    previousHash: opts.previousHash,
    signature,
    contractId: opts.contractId,
    counterAgentId: opts.counterAgentId,
    counterSignature: opts.counterSignature,
  };
}

export async function verifyChain(
  receipts: Receipt[],
  publicKeyHex?: string,
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]!;

    // Verify hash chain linkage
    const expectedPrevHash = i === 0 ? '0' : receipts[i - 1]!.hash;
    if (r.previousHash !== expectedPrevHash) {
      errors.push(`Receipt ${i} (${r.id}): previousHash mismatch. Expected ${expectedPrevHash}, got ${r.previousHash}`);
    }

    // Recompute hash
    const recomputedHash = await computeReceiptHash({
      id: r.id,
      sessionId: r.sessionId,
      agent: r.agent,
      action: r.action,
      input: r.input,
      output: r.output,
      error: r.error,
      timestamp: r.timestamp,
      previousHash: r.previousHash,
    });

    if (recomputedHash !== r.hash) {
      errors.push(`Receipt ${i} (${r.id}): hash mismatch. Expected ${recomputedHash}, got ${r.hash}`);
    }

    // Verify signature if public key provided
    if (publicKeyHex && r.signature) {
      const valid = ed25519Verify(r.hash, r.signature, publicKeyHex);
      if (!valid) {
        errors.push(`Receipt ${i} (${r.id}): invalid signature`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
