import { TRACE_SCHEMA_VERSION } from './types.js';
import type { TraceEvent } from './types.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const REQUIRED_FIELDS: (keyof TraceEvent)[] = [
  'schemaVersion',
  'nodeId',
  'sessionId',
  'spanId',
  'agentId',
  'actionType',
  'input',
  'metadata',
  'timestamp',
  'durationMs',
  'hash',
  'previousHash',
  'anomalyScore',
];

/**
 * Validates a trace event for required field presence and schema version correctness.
 */
export function validateTraceEvent(event: unknown): ValidationResult {
  const errors: string[] = [];

  if (event == null || typeof event !== 'object') {
    return { valid: false, errors: ['Event must be a non-null object'] };
  }

  const record = event as Record<string, unknown>;

  for (const field of REQUIRED_FIELDS) {
    if (!(field in record) || record[field] === undefined) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if ('schemaVersion' in record && record.schemaVersion !== TRACE_SCHEMA_VERSION) {
    errors.push(
      `Invalid schemaVersion: expected '${TRACE_SCHEMA_VERSION}', got '${String(record.schemaVersion)}'`,
    );
  }

  return { valid: errors.length === 0, errors };
}
