// Core
export { Invariance } from './client.js';
export { Session } from './session.js';

// Receipt utilities
export { createReceipt, verifyChain, verifyChainOrThrow, sortedStringify, sha256, ed25519Sign, hexToBytes, bytesToHex } from './receipt.js';

// Action typing templates
export { action, defineActions } from './templates.js';
export type { ActionDefinition, ActionMap, InputOf, OutputOf } from './templates.js';

// Policy engine
export { checkPolicies, clearRateLimits } from './policy.js';

// HTTP utilities
export { fetchWithAuth } from './http.js';

// Errors
export { InvarianceError } from './errors.js';
export type { InvarianceErrorCode } from './errors.js';

// Observability
export { InvarianceTracer } from './observability/index.js';
export type {
  TracerConfig,
  TracerMode,
  TraceEvent,
  TraceMetadata,
  BehavioralPrimitive,
  DevOutput,
  DecisionPointPayload,
  GoalDriftPayload,
  SubAgentSpawnPayload,
  ToolInvocationPayload,
  VerificationProof,
  TraceAction,
  ReplaySnapshot,
  ReplayTimelineEntry,
  ReplayContextMode,
  CounterfactualRequest,
  CounterfactualResult,
} from './observability/index.js';

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
  VerifyResult,
} from './types.js';
