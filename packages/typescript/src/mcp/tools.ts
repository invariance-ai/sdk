// ── MCP Tool Definitions ──
// Each tool mirrors a CLI command. Schemas are JSON Schema draft-07.

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TOOLS: Tool[] = [
  // ── Monitors ──
  {
    name: 'invariance_list_monitors',
    description: 'List monitors with optional filters',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['active', 'paused'], description: 'Filter by status' },
        agent_id: { type: 'string', description: 'Filter by agent ID' },
      },
    },
  },
  {
    name: 'invariance_create_simple_monitor',
    description: 'Create a keyword or threshold monitor',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Monitor name' },
        evaluator_type: { type: 'string', enum: ['keyword', 'threshold'], description: 'Evaluator type' },
        field: { type: 'string', description: 'Field to evaluate (dot-notation path)' },
        value: { description: 'Value to match — string for keyword, number for threshold' },
        operator: { type: 'string', enum: ['gt', 'gte', 'lt', 'lte'], description: 'Threshold operator (required for threshold type)' },
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Signal severity' },
        review: { type: 'boolean', description: 'Auto-create review when monitor triggers' },
        agent_id: { type: 'string', description: 'Scope to an agent' },
      },
      required: ['name', 'evaluator_type', 'field'],
    },
  },
  {
    name: 'invariance_evaluate_monitor',
    description: 'Evaluate a monitor against current data',
    inputSchema: {
      type: 'object' as const,
      properties: {
        monitor_id: { type: 'string', description: 'Monitor ID to evaluate' },
      },
      required: ['monitor_id'],
    },
  },
  {
    name: 'invariance_list_monitor_executions',
    description: 'List executions for a monitor',
    inputSchema: {
      type: 'object' as const,
      properties: {
        monitor_id: { type: 'string', description: 'Monitor ID' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: ['monitor_id'],
    },
  },
  {
    name: 'invariance_list_monitor_findings',
    description: 'List findings for a monitor',
    inputSchema: {
      type: 'object' as const,
      properties: {
        monitor_id: { type: 'string', description: 'Monitor ID' },
        limit: { type: 'number', description: 'Max results (default 50)' },
      },
      required: ['monitor_id'],
    },
  },

  // ── Signals ──
  {
    name: 'invariance_list_signals',
    description: 'List signals with optional filters',
    inputSchema: {
      type: 'object' as const,
      properties: {
        severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        agent_id: { type: 'string' },
        session_id: { type: 'string' },
        acknowledged: { type: 'boolean' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'invariance_acknowledge_signal',
    description: 'Acknowledge a signal',
    inputSchema: {
      type: 'object' as const,
      properties: {
        signal_id: { type: 'string', description: 'Signal ID to acknowledge' },
      },
      required: ['signal_id'],
    },
  },
  {
    name: 'invariance_signal_stats',
    description: 'Get signal statistics (counts by source, severity, unacknowledged)',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },

  // ── Reviews ──
  {
    name: 'invariance_list_reviews',
    description: 'List monitor reviews with optional filters',
    inputSchema: {
      type: 'object' as const,
      properties: {
        status: { type: 'string', enum: ['pending', 'claimed', 'passed', 'failed', 'needs_fix'] },
        monitor_id: { type: 'string' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'invariance_claim_review',
    description: 'Claim a review for yourself',
    inputSchema: {
      type: 'object' as const,
      properties: {
        review_id: { type: 'string', description: 'Review ID to claim' },
      },
      required: ['review_id'],
    },
  },
  {
    name: 'invariance_resolve_review',
    description: 'Resolve a review with a decision',
    inputSchema: {
      type: 'object' as const,
      properties: {
        review_id: { type: 'string', description: 'Review ID to resolve' },
        decision: { type: 'string', enum: ['pass', 'fail', 'needs_fix'], description: 'Review decision' },
        notes: { type: 'string', description: 'Optional reviewer notes' },
      },
      required: ['review_id', 'decision'],
    },
  },
];
