// ── Invariance MCP Server ──
// Exposes the customer loop (monitors, signals, reviews) as MCP tools
// over stdio transport. Connect with: invariance mcp

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Invariance } from '../client.js';
import type { MonitorsResource } from '../resources/monitors.js';
import type { SignalsResource } from '../resources/signals.js';
import { TOOLS } from './tools.js';

export interface McpServerConfig {
  apiKey: string;
  apiUrl?: string;
}

export function createInvarianceMcpServer(config: McpServerConfig) {
  const client = Invariance.init({
    apiKey: config.apiKey,
    apiUrl: config.apiUrl ?? 'https://api.invariance.dev',
  });

  // Access the underlying resources through the module
  const monitorsRes = client.monitors.monitors;
  const signalsRes = client.monitors.signals;

  const server = new Server(
    { name: 'invariance', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const result = await handleToolCall(monitorsRes, signalsRes, name, args ?? {});
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
    };
  });

  return server;
}

async function handleToolCall(
  monitors: MonitorsResource,
  signals: SignalsResource,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    // ── Monitors ──
    case 'invariance_list_monitors':
      return monitors.list(args as Parameters<typeof monitors.list>[0]);

    case 'invariance_create_simple_monitor': {
      const evalType = args.evaluator_type as 'keyword' | 'threshold';
      const evaluator = evalType === 'keyword'
        ? { type: 'keyword' as const, field: args.field as string, value: args.value as string }
        : { type: 'threshold' as const, field: args.field as string, value: args.value as number, operator: args.operator as 'gt' | 'gte' | 'lt' | 'lte' };
      return monitors.createSimple({
        name: args.name as string,
        evaluator,
        ...(args.severity ? { severity: args.severity as 'low' | 'medium' | 'high' | 'critical' } : {}),
        ...(args.review != null ? { review: args.review as boolean } : {}),
        ...(args.agent_id ? { agent_id: args.agent_id as string } : {}),
      });
    }

    case 'invariance_evaluate_monitor':
      return monitors.evaluate(args.monitor_id as string);

    case 'invariance_list_monitor_executions':
      return monitors.listExecutions(
        args.monitor_id as string,
        args.limit ? { limit: args.limit as number } : undefined,
      );

    case 'invariance_list_monitor_findings':
      return monitors.listFindings(
        args.monitor_id as string,
        args.limit ? { limit: args.limit as number } : undefined,
      );

    // ── Signals ──
    case 'invariance_list_signals': {
      const opts: Record<string, unknown> = {};
      if (args.severity) opts.severity = args.severity;
      if (args.agent_id) opts.agent_id = args.agent_id;
      if (args.session_id) opts.session_id = args.session_id;
      if (args.acknowledged != null) opts.acknowledged = args.acknowledged;
      if (args.limit) opts.limit = args.limit;
      return signals.list(opts as Parameters<typeof signals.list>[0]);
    }

    case 'invariance_acknowledge_signal':
      return signals.acknowledge(args.signal_id as string);

    case 'invariance_signal_stats':
      return signals.stats();

    // ── Reviews ──
    case 'invariance_list_reviews': {
      const opts: Record<string, unknown> = {};
      if (args.status) opts.status = args.status;
      if (args.monitor_id) opts.monitor_id = args.monitor_id;
      if (args.limit) opts.limit = args.limit;
      return monitors.listReviews(opts as Parameters<typeof monitors.listReviews>[0]);
    }

    case 'invariance_claim_review':
      return monitors.claimReview(args.review_id as string);

    case 'invariance_resolve_review':
      return monitors.resolveReview(
        args.review_id as string,
        args.decision as 'pass' | 'fail' | 'needs_fix',
        args.notes as string | undefined,
      );

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Start the MCP server on stdio.
 * Called by `invariance mcp` CLI command.
 */
export async function startMcpServer(config: McpServerConfig): Promise<void> {
  const server = createInvarianceMcpServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
