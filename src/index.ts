// Core
export { Invariance } from './client.js';
export { Session } from './session.js';

// Receipt utilities
export { createReceipt, verifyChain, sortedStringify, sha256, ed25519Sign } from './receipt.js';

// Action typing templates
export { action, defineActions } from './templates.js';
export type { ActionDefinition, ActionMap, InputOf, OutputOf } from './templates.js';

// Action typing templates
export { action, defineActions } from './templates.js';
export type { ActionDefinition, ActionMap, InputOf, OutputOf } from './templates.js';

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
  ActionTemplate,
} from './types.js';
