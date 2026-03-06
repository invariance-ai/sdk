// Core
export { Invariance } from './client.js';
export { Session } from './session.js';

// Receipt utilities
export { createReceipt, verifyChain, sortedStringify, sha256, hmacSign } from './receipt.js';

// Policy engine
export { checkPolicies } from './policy.js';

// Errors
export { InvarianceError } from './errors.js';
export type { InvarianceErrorCode } from './errors.js';

// Types
export type {
  InvarianceConfig,
  Action,
  Receipt,
  SessionInfo,
  PolicyRule,
  PolicyCheck,
  ReceiptQuery,
  ErrorHandler,
} from './types.js';
