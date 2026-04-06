import { describe, expect, it } from 'vitest';
import {
  buildTraceEvent,
  buildToolInvocationEvent,
  buildDecisionEvent,
  buildConstraintCheckEvent,
  buildHandoffEvent,
} from '../trace-builders.js';
import type { TraceEventInput } from '../types/trace.js';

const BASE = { session_id: 'sess-1', agent_id: 'agent-1' };

describe('buildTraceEvent', () => {
  it('builds a minimal event', () => {
    const evt = buildTraceEvent({ ...BASE, action_type: 'tool_invocation' });
    expect(evt.session_id).toBe('sess-1');
    expect(evt.agent_id).toBe('agent-1');
    expect(evt.action_type).toBe('tool_invocation');
    expect(evt.metadata).toBeUndefined();
  });

  it('includes custom_headers and custom_attributes', () => {
    const evt = buildTraceEvent({
      ...BASE,
      action_type: 'decision_point',
      custom_headers: { 'x-monitor-kind': 'safety' },
      custom_attributes: { risk_tier: 'high', confidence: 0.92, flagged: true, notes: null },
    });
    expect(evt.custom_headers).toEqual({ 'x-monitor-kind': 'safety' });
    expect(evt.custom_attributes).toEqual({
      risk_tier: 'high',
      confidence: 0.92,
      flagged: true,
      notes: null,
    });
  });

  it('merges tags into metadata', () => {
    const evt = buildTraceEvent({
      ...BASE,
      action_type: 'tool_invocation',
      tags: ['medical', 'chart'],
      metadata: { depth: 2 },
    });
    expect(evt.metadata?.tags).toEqual(['medical', 'chart']);
    expect(evt.metadata?.depth).toBe(2);
  });

  it('passes through parent_id, span_id, duration_ms', () => {
    const evt = buildTraceEvent({
      ...BASE,
      action_type: 'tool_invocation',
      parent_id: 'parent-1',
      span_id: 'span-1',
      duration_ms: 150,
    });
    expect(evt.parent_id).toBe('parent-1');
    expect(evt.span_id).toBe('span-1');
    expect(evt.duration_ms).toBe(150);
  });
});

describe('buildToolInvocationEvent', () => {
  it('builds a tool_invocation event', () => {
    const evt = buildToolInvocationEvent({
      ...BASE,
      tool: 'fetch_patient_chart',
      args: { patient_id: 'p-123' },
      result: { chart: 'data' },
    });
    expect(evt.action_type).toBe('tool_invocation');
    expect(evt.input).toEqual({ tool: 'fetch_patient_chart', args: { patient_id: 'p-123' } });
    expect(evt.output).toEqual({ chart: 'data' });
    expect(evt.metadata?.tool_calls).toEqual(['fetch_patient_chart']);
  });

  it('includes latency_ms as execution_ms in metadata', () => {
    const evt = buildToolInvocationEvent({
      ...BASE,
      tool: 'search',
      latency_ms: 42,
    });
    expect(evt.metadata?.execution_ms).toBe(42);
  });

  it('preserves custom_headers and custom_attributes', () => {
    const evt = buildToolInvocationEvent({
      ...BASE,
      tool: 'search',
      custom_headers: { 'x-env': 'prod' },
      custom_attributes: { pii_detected: true },
    });
    expect(evt.custom_headers).toEqual({ 'x-env': 'prod' });
    expect(evt.custom_attributes).toEqual({ pii_detected: true });
  });
});

describe('buildDecisionEvent', () => {
  it('builds a decision_point event', () => {
    const evt = buildDecisionEvent({
      ...BASE,
      candidates: ['route_a', 'route_b'],
      chosen: 'route_a',
      reasoning: 'lower latency',
    });
    expect(evt.action_type).toBe('decision_point');
    expect(evt.input).toEqual({ candidates: ['route_a', 'route_b'] });
    expect(evt.output).toEqual({ chosen: 'route_a', reasoning: 'lower latency' });
  });
});

describe('buildConstraintCheckEvent', () => {
  it('builds a constraint_check event', () => {
    const evt = buildConstraintCheckEvent({
      ...BASE,
      constraint: 'no_pii_in_response',
      passed: false,
      details: { field: 'ssn' },
    });
    expect(evt.action_type).toBe('constraint_check');
    expect(evt.input).toEqual({ constraint: 'no_pii_in_response' });
    expect(evt.output).toEqual({ passed: false, details: { field: 'ssn' } });
  });
});

describe('buildHandoffEvent', () => {
  it('builds a sub_agent_spawn event', () => {
    const evt = buildHandoffEvent({
      ...BASE,
      target_agent_id: 'specialist-agent',
      task: 'review labs',
      context: { patient_id: 'p-123' },
    });
    expect(evt.action_type).toBe('sub_agent_spawn');
    expect(evt.input).toEqual({
      target_agent_id: 'specialist-agent',
      task: 'review labs',
      context: { patient_id: 'p-123' },
    });
  });
});

describe('type compatibility', () => {
  it('all builders return TraceEventInput', () => {
    const events: TraceEventInput[] = [
      buildTraceEvent({ ...BASE, action_type: 'goal_drift' }),
      buildToolInvocationEvent({ ...BASE, tool: 'search' }),
      buildDecisionEvent({ ...BASE, candidates: ['a'], chosen: 'a' }),
      buildConstraintCheckEvent({ ...BASE, constraint: 'safe', passed: true }),
      buildHandoffEvent({ ...BASE, target_agent_id: 'other' }),
    ];
    expect(events).toHaveLength(5);
    events.forEach((e) => {
      expect(e.session_id).toBe('sess-1');
      expect(e.agent_id).toBe('agent-1');
    });
  });
});
