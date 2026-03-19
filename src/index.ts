// Core
export { Invariance } from './client.js';
export { Session } from './session.js';

// A2A (Agent-to-Agent)
export { A2AChannel } from './a2a.js';
export type { A2AEnvelope, A2AVerificationError } from './a2a.js';
export { createInstrumentedFetch } from './adapters/a2a-fetch.js';
export { wrapLangChainTool } from './adapters/a2a-langchain.js';
export type { A2ALangChainToolOptions } from './adapters/a2a-langchain.js';

// Receipt utilities
export { createReceipt, verifyChain, verifyChainOrThrow, sortedStringify, sha256, ed25519Sign, hexToBytes, bytesToHex } from './receipt.js';

// Identity crypto
export { deriveAgentKeypair } from './crypto.js';

// Action typing templates
export { action, defineActions } from './templates.js';
export type { ActionDefinition, ActionMap, InputOf, OutputOf } from './templates.js';

// Policy engine
export { checkPolicies, clearRateLimits } from './policy.js';

// Errors
export { InvarianceError } from './errors.js';
export type { InvarianceErrorCode } from './errors.js';

// Observability
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
  ContractTerms,
  Contract,
  DeliveryProof,
  SettlementProof,
  AgentIdentity,
  MonitorTriggerEvent,
} from './types.js';
