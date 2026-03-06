/** Error codes for Invariance SDK errors */
export type InvarianceErrorCode =
  | 'POLICY_DENIED'
  | 'CHAIN_BROKEN'
  | 'API_ERROR'
  | 'FLUSH_FAILED';

/**
 * Invariance SDK error with a machine-readable code.
 */
export class InvarianceError extends Error {
  readonly code: InvarianceErrorCode;

  constructor(code: InvarianceErrorCode, message: string) {
    super(message);
    this.name = 'InvarianceError';
    this.code = code;
  }
}
