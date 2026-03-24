export type ErrorCode =
  | 'INIT_FAILED'
  | 'API_ERROR'
  | 'POLICY_DENIED'
  | 'CHAIN_BROKEN'
  | 'SESSION_CLOSED'
  | 'FLUSH_FAILED'
  | 'QUEUE_OVERFLOW'
  | 'SESSION_NOT_READY'
  | 'CRYPTO_ERROR'
  | 'INVALID_KEY';

export class InvarianceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode?: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'InvarianceError';
  }
}
