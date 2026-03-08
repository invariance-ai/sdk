import { describe, it, expect } from 'vitest';
import { ACTION_TYPE_MAP, SDK_ACTION_TYPE_MAP, isRecord, toCanonicalActionType, toSdkActionType, addAlias } from '../normalize.js';

describe('toCanonicalActionType()', () => {
  it('converts PascalCase to snake_case', () => {
    expect(toCanonicalActionType('DecisionPoint')).toBe('decision_point');
    expect(toCanonicalActionType('ToolInvocation')).toBe('tool_invocation');
    expect(toCanonicalActionType('SubAgentSpawn')).toBe('sub_agent_spawn');
    expect(toCanonicalActionType('GoalDrift')).toBe('goal_drift');
  });

  it('passes through snake_case unchanged', () => {
    expect(toCanonicalActionType('decision_point')).toBe('decision_point');
    expect(toCanonicalActionType('tool_invocation')).toBe('tool_invocation');
  });

  it('returns null for unknown types', () => {
    expect(toCanonicalActionType('UnknownType')).toBeNull();
    expect(toCanonicalActionType('')).toBeNull();
  });

  it('returns null for non-string input', () => {
    expect(toCanonicalActionType(42)).toBeNull();
    expect(toCanonicalActionType(null)).toBeNull();
    expect(toCanonicalActionType(undefined)).toBeNull();
  });
});

describe('toSdkActionType()', () => {
  it('converts snake_case to PascalCase', () => {
    expect(toSdkActionType('decision_point')).toBe('DecisionPoint');
    expect(toSdkActionType('tool_invocation')).toBe('ToolInvocation');
  });

  it('converts PascalCase to PascalCase (round-trip)', () => {
    expect(toSdkActionType('DecisionPoint')).toBe('DecisionPoint');
  });

  it('returns null for unknown types', () => {
    expect(toSdkActionType('unknown')).toBeNull();
  });
});

describe('isRecord()', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns false for arrays, null, primitives', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe('addAlias()', () => {
  it('adds alias when source exists and target does not', () => {
    const obj: Record<string, unknown> = { nodeId: 'n1' };
    addAlias(obj, 'nodeId', 'node_id');
    expect(obj.node_id).toBe('n1');
  });

  it('does not overwrite existing target', () => {
    const obj: Record<string, unknown> = { nodeId: 'n1', node_id: 'existing' };
    addAlias(obj, 'nodeId', 'node_id');
    expect(obj.node_id).toBe('existing');
  });

  it('does nothing when source does not exist', () => {
    const obj: Record<string, unknown> = {};
    addAlias(obj, 'nodeId', 'node_id');
    expect(obj.node_id).toBeUndefined();
  });
});
