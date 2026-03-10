import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { hexToBytes, bytesToHex } from './receipt.js';

ed25519.etc.sha512Sync = sha512;

/**
 * Derive an Ed25519 keypair for a named agent from an owner's private key.
 * Uses HKDF-SHA256 with the identity string (e.g., "acme/compliance-agent") as info.
 *
 * @param ownerPrivateKeyHex - Owner's Ed25519 private key (hex)
 * @param identity - Full identity string, e.g., "acme/compliance-agent"
 * @returns Derived keypair (hex strings)
 */
export function deriveAgentKeypair(
  ownerPrivateKeyHex: string,
  identity: string,
): { privateKey: string; publicKey: string } {
  const ownerKeyBytes = hexToBytes(ownerPrivateKeyHex);
  const infoBytes = new TextEncoder().encode(identity);
  const derived = hkdf(sha256, ownerKeyBytes, undefined, infoBytes, 32);
  const pubKey = ed25519.getPublicKey(derived);
  return {
    privateKey: bytesToHex(derived),
    publicKey: bytesToHex(pubKey),
  };
}
