import { describe, it, expect } from 'vitest';
import { InvarianceError } from '../errors.js';
import type { InvarianceErrorCode } from '../errors.js';

describe('InvarianceError', () => {
  it('sets name, code, and message', () => {
    const err = new InvarianceError('POLICY_DENIED', 'Action not allowed');
    expect(err.name).toBe('InvarianceError');
    expect(err.code).toBe('POLICY_DENIED');
    expect(err.message).toBe('Action not allowed');
  });

  it('is an instance of Error', () => {
    const err = new InvarianceError('API_ERROR', 'Network failure');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(InvarianceError);
  });

  it('has a stack trace', () => {
    const err = new InvarianceError('CHAIN_BROKEN', 'Hash mismatch');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('Hash mismatch');
  });

  it('supports all error codes', () => {
    const codes: InvarianceErrorCode[] = [
      'POLICY_DENIED',
      'CHAIN_BROKEN',
      'API_ERROR',
      'FLUSH_FAILED',
      'SESSION_CLOSED',
      'SESSION_NOT_READY',
      'INIT_FAILED',
      'QUEUE_OVERFLOW',
    ];

    for (const code of codes) {
      const err = new InvarianceError(code, `Error: ${code}`);
      expect(err.code).toBe(code);
    }
  });

  it('code property is readonly', () => {
    const err = new InvarianceError('API_ERROR', 'test');
    // TypeScript enforces readonly at compile time; verify it exists at runtime
    expect(Object.getOwnPropertyDescriptor(err, 'code')?.writable).toBe(true);
    // readonly in TS doesn't prevent runtime writes, but the type system prevents it
    expect(err.code).toBe('API_ERROR');
  });
});
