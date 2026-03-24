// Main client
export { Invariance } from './client.js';

// Session & receipt
export { Session } from './session.js';
export { createReceipt, verifyChain } from './receipt.js';

// Crypto utilities
export {
  sortedStringify, sha256, computeReceiptHash,
  ed25519Sign, ed25519Verify, generateKeypair, getPublicKey,
  deriveAgentKeypair, bytesToHex, hexToBytes, randomHex,
} from './crypto.js';

// Errors
export { InvarianceError } from './errors.js';
export type { ErrorCode } from './errors.js';

// Policy
export { checkPolicies, assertPolicy } from './policy.js';

// A2A Channel
export { A2AChannel } from './a2a-channel.js';

// Normalize
export { normalizeActionType, toSnakeCase, toCamelCase } from './normalize.js';

// Resource classes (for advanced use / extending)
export { IdentityResource } from './resources/identity.js';
export { AgentsResource } from './resources/agents.js';
export { SessionsResource } from './resources/sessions.js';
export { ReceiptsResource } from './resources/receipts.js';
export { ContractsResource } from './resources/contracts.js';
export { A2AResource } from './resources/a2a.js';
export { TraceResource } from './resources/trace.js';
export { QueryResource } from './resources/query.js';
export { MonitorsResource } from './resources/monitors.js';
export { DriftResource } from './resources/drift.js';
export { TrainingResource } from './resources/training.js';
export { TemplatesResource } from './resources/templates.js';
export { ApiKeysResource } from './resources/api-keys.js';
export { UsageResource } from './resources/usage.js';
export { SearchResource } from './resources/search.js';
export { StatusResource } from './resources/status.js';
export { NLQueryResource } from './resources/nl-query.js';
export { IdentitiesResource } from './resources/identities.js';

// All types
export type * from './types/index.js';
