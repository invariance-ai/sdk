/**
 * Cross-SDK hash compatibility tests.
 *
 * These tests verify that the TypeScript SDK produces identical outputs to the
 * Python SDK for the same inputs. Test vectors are hardcoded identically in both
 * test files. The ground-truth hash comes from crypto.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { sortedStringify, computeReceiptHash, sha256 } from '../crypto.js';

// ── Shared test vectors (must be identical in test_e2e_cross_sdk.py) ──

const VECTOR_1 = {
  id: 'test-receipt-001',
  sessionId: 'test-session-001',
  agent: 'test-agent-001',
  action: 'read_file',
  input: { path: '/tmp/test.txt' },
  output: { content: 'hello' },
  error: null,
  timestamp: 1700000000000,
  previousHash: '0',
};
const VECTOR_1_EXPECTED_HASH = '545820b70b337413f6a6c42ed76b27f3701b18a9b5ab2ddb46ae1ceb29be72d4';

const VECTOR_2 = {
  id: 'r1',
  sessionId: 's1',
  agent: 'a1',
  action: 'act',
  input: {},
  output: null,
  error: null,
  timestamp: 1,
  previousHash: '0',
};

const VECTOR_3_INPUT = { z: [1, { b: 2, a: 1 }], a: null };
const VECTOR_3_EXPECTED_STRINGIFY = '{"a":null,"z":[1,{"a":1,"b":2}]}';

describe('Cross-SDK: sortedStringify compatibility', () => {
  it('sorted keys', () => {
    expect(sortedStringify({ z: 1, a: 2 })).toBe('{"a":2,"z":1}');
  });

  it('nested sorted keys', () => {
    expect(sortedStringify({ b: { d: 1, c: 2 }, a: 'x' })).toBe('{"a":"x","b":{"c":2,"d":1}}');
  });

  it('null', () => {
    expect(sortedStringify(null)).toBe('null');
  });

  it('arrays preserve order', () => {
    expect(sortedStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('booleans', () => {
    expect(sortedStringify(true)).toBe('true');
    expect(sortedStringify(false)).toBe('false');
  });

  it('strings', () => {
    expect(sortedStringify('hello')).toBe('"hello"');
    expect(sortedStringify('')).toBe('""');
  });

  it('empty object', () => {
    expect(sortedStringify({})).toBe('{}');
  });

  it('empty array', () => {
    expect(sortedStringify([])).toBe('[]');
  });

  it('vector 3: nested with null and array', () => {
    expect(sortedStringify(VECTOR_3_INPUT)).toBe(VECTOR_3_EXPECTED_STRINGIFY);
  });

  it('integer number serialization', () => {
    expect(sortedStringify(1)).toBe('1');
    expect(sortedStringify(0)).toBe('0');
    expect(sortedStringify(-1)).toBe('-1');
    expect(sortedStringify(42)).toBe('42');
  });

  it('float serialization', () => {
    expect(sortedStringify(0.5)).toBe('0.5');
  });

  it('nested null in object', () => {
    expect(sortedStringify({ a: null })).toBe('{"a":null}');
  });

  it('nested null in array', () => {
    expect(sortedStringify([null, true, 1])).toBe('[null,true,1]');
  });

  it('omits undefined values in objects', () => {
    expect(sortedStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('string with quotes', () => {
    expect(sortedStringify('a"b')).toBe('"a\\"b"');
  });

  it('deeply nested', () => {
    expect(sortedStringify({ a: { b: { c: [1, { d: 2 }] } } })).toBe('{"a":{"b":{"c":[1,{"d":2}]}}}');
  });
});

describe('Cross-SDK: sha256 compatibility', () => {
  it('empty string', async () => {
    expect(await sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hello', async () => {
    expect(await sha256('hello')).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('json string', async () => {
    const data = '{"a":1,"b":2}';
    const result = await sha256(data);
    expect(result).toHaveLength(64);
    expect(result).toBe(await sha256(data));
  });
});

describe('Cross-SDK: computeReceiptHash compatibility', () => {
  it('vector 1: known hash', async () => {
    const h = await computeReceiptHash(VECTOR_1);
    expect(h).toBe(VECTOR_1_EXPECTED_HASH);
  });

  it('vector 2: deterministic', async () => {
    const h1 = await computeReceiptHash(VECTOR_2);
    const h2 = await computeReceiptHash(VECTOR_2);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it('undefined output/error treated as null', async () => {
    const h1 = await computeReceiptHash({
      id: 'r1', sessionId: 's1', agent: 'a1', action: 'act',
      input: {}, output: undefined, error: undefined, timestamp: 1, previousHash: '0',
    });
    const h2 = await computeReceiptHash(VECTOR_2);
    expect(h1).toBe(h2);
  });

  it('different input produces different hash', async () => {
    const h1 = await computeReceiptHash({
      id: 'r1', sessionId: 's1', agent: 'a1', action: 'act',
      input: { x: 1 }, output: null, error: null, timestamp: 1, previousHash: '0',
    });
    const h2 = await computeReceiptHash({
      id: 'r1', sessionId: 's1', agent: 'a1', action: 'act',
      input: { x: 2 }, output: null, error: null, timestamp: 1, previousHash: '0',
    });
    expect(h1).not.toBe(h2);
  });

  it('nested input key order does not affect hash', async () => {
    const h1 = await computeReceiptHash({
      id: 'r1', sessionId: 's1', agent: 'a1', action: 'act',
      input: { z: 1, a: 2 }, output: null, error: null, timestamp: 1, previousHash: '0',
    });
    const h2 = await computeReceiptHash({
      id: 'r1', sessionId: 's1', agent: 'a1', action: 'act',
      input: { a: 2, z: 1 }, output: null, error: null, timestamp: 1, previousHash: '0',
    });
    expect(h1).toBe(h2);
  });
});
