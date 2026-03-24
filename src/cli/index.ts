#!/usr/bin/env node
import { Command } from 'commander';
import { ApiClient } from './api.js';
import {
  renderSessionList,
  renderSessionDetail,
  renderVerification,
  renderMonitorList,
  renderMonitorCreated,
  renderMonitorDeleted,
  renderMonitorEvaluation,
  renderEvalSuites,
  renderEvalRun,
  renderEvalCompare,
  renderEvalThresholds,
  renderEvalThreshold,
  renderFailureClusters,
  renderFailureCluster,
  renderOptimizationSuggestions,
  renderOptimizationSuggestion,
  renderDriftCatches,
  renderDriftComparison,
  renderTraceFlags,
  renderTraceFlagStats,
  renderIdentities,
  renderSearchResults,
} from './render.js';

const program = new Command();

program
  .name('invariance')
  .description('Invariance CLI — verification infrastructure for AI agents')
  .version('0.2.1');

function getClient() {
  const apiKey = process.env.INVARIANCE_API_KEY;
  const apiUrl = process.env.INVARIANCE_API_URL || 'https://api.invariance.dev';
  if (!apiKey) {
    console.error('Error: INVARIANCE_API_KEY environment variable is required');
    process.exit(1);
  }
  return new ApiClient(apiUrl, apiKey);
}

function withErrorHandling<T extends unknown[]>(
  action: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await action(...args);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    }
  };
}

// ── Sessions ──

program
  .command('sessions')
  .description('List all sessions')
  .option('-s, --status <status>', 'Filter by status (open, closed, tampered)')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const sessions = await client.listSessions(opts.status);
    renderSessionList(sessions);
  }));

program
  .command('session <id>')
  .description('Show session detail with receipt timeline')
  .action(withErrorHandling(async (id) => {
    const client = getClient();
    const [session, receipts] = await Promise.all([
      client.getSession(id),
      client.getReceipts(id),
    ]);
    let templates: Record<string, any> = {};
    try {
      const items = await client.getAgentTemplates(session.created_by);
      for (const t of items) templates[t.action] = t;
    } catch {}
    renderSessionDetail(session, receipts, templates);
  }));

program
  .command('verify <sessionId>')
  .description('Verify chain integrity for a session')
  .action(withErrorHandling(async (sessionId) => {
    const client = getClient();
    const result = await client.verifySession(sessionId);
    const receipts = await client.getReceipts(sessionId);
    await renderVerification(result, receipts);
    if (!result.valid) process.exitCode = 1;
  }));

program
  .command('status')
  .description('Show connection status')
  .action(withErrorHandling(async () => {
    const client = getClient();
    const agents = await client.listAgents();
    console.log(`Connected to ${process.env.INVARIANCE_API_URL || 'https://api.invariance.dev'}`);
    console.log(`Agents: ${agents.length}`);
  }));

// ── Monitors ──

const monitors = program
  .command('monitors')
  .description('Manage monitors');

monitors
  .command('list')
  .description('List all monitors')
  .option('--status <status>', 'Filter by status (active, paused)')
  .option('--agent-id <id>', 'Filter by agent ID')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const items = await client.listMonitors({ status: opts.status, agentId: opts.agentId });
    renderMonitorList(items);
  }));

monitors
  .command('create')
  .description('Create a monitor from natural language')
  .requiredOption('--name <name>', 'Monitor name')
  .requiredOption('--rule <rule>', 'Natural language rule')
  .option('--agent-id <id>', 'Scope to agent')
  .option('--severity <sev>', 'Severity level (low, medium, high, critical)')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const monitor = await client.createMonitor({
      name: opts.name,
      natural_language: opts.rule,
      agent_id: opts.agentId,
      severity: opts.severity,
    });
    renderMonitorCreated(monitor);
  }));

monitors
  .command('delete <id>')
  .description('Delete a monitor')
  .action(withErrorHandling(async (id) => {
    const client = getClient();
    await client.deleteMonitor(id);
    renderMonitorDeleted(id);
  }));

monitors
  .command('evaluate <id>')
  .description('Trigger evaluation for a monitor')
  .action(withErrorHandling(async (id) => {
    const client = getClient();
    const result = await client.evaluateMonitor(id);
    renderMonitorEvaluation(result);
  }));

// ── Evals ──

const evals = program
  .command('evals')
  .description('Manage eval suites and runs');

evals
  .command('suites')
  .description('List eval suites')
  .option('--agent-id <id>', 'Filter by agent ID')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const suites = await client.listEvalSuites({ agentId: opts.agentId });
    renderEvalSuites(suites);
  }));

evals
  .command('run <suite-id>')
  .description('Run an eval suite')
  .requiredOption('--agent-id <id>', 'Agent to evaluate')
  .option('--version <label>', 'Version label')
  .action(withErrorHandling(async (suiteId, opts) => {
    const client = getClient();
    const run = await client.runEval(suiteId, {
      agent_id: opts.agentId,
      version_label: opts.version,
    });
    renderEvalRun(run);
  }));

evals
  .command('compare <suite-id> <run-a> <run-b>')
  .description('Compare two eval runs')
  .action(withErrorHandling(async (suiteId, runA, runB) => {
    const client = getClient();
    const result = await client.compareEvalRuns(suiteId, runA, runB);
    renderEvalCompare(result);
  }));

evals
  .command('thresholds')
  .description('List eval thresholds')
  .option('--suite-id <id>', 'Filter by suite ID')
  .option('--metric <metric>', 'Filter by metric (pass_rate, avg_score)')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const thresholds = await client.listEvalThresholds({ suiteId: opts.suiteId, metric: opts.metric });
    renderEvalThresholds(thresholds);
  }));

evals
  .command('threshold-create')
  .description('Create an eval threshold')
  .requiredOption('--suite-id <id>', 'Eval suite ID')
  .requiredOption('--min-value <value>', 'Minimum allowed metric value', parseFloat)
  .option('--metric <metric>', 'Metric (pass_rate, avg_score)')
  .option('--webhook-url <url>', 'Webhook to call on threshold failure')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const threshold = await client.createEvalThreshold({
      suite_id: opts.suiteId,
      min_value: opts.minValue,
      metric: opts.metric,
      webhook_url: opts.webhookUrl,
    });
    renderEvalThreshold(threshold, 'Created');
  }));

evals
  .command('threshold-update <id>')
  .description('Update an eval threshold')
  .option('--min-value <value>', 'New minimum value', parseFloat)
  .option('--metric <metric>', 'Metric (pass_rate, avg_score)')
  .option('--status <status>', 'Status (active, paused)')
  .option('--webhook-url <url>', 'Webhook URL')
  .action(withErrorHandling(async (id, opts) => {
    const client = getClient();
    const threshold = await client.updateEvalThreshold(id, {
      min_value: opts.minValue,
      metric: opts.metric,
      status: opts.status,
      webhook_url: opts.webhookUrl,
    });
    renderEvalThreshold(threshold, 'Updated');
  }));

evals
  .command('threshold-delete <id>')
  .description('Delete an eval threshold')
  .action(withErrorHandling(async (id) => {
    const client = getClient();
    await client.deleteEvalThreshold(id);
    console.log(`Deleted threshold ${id}`);
  }));

evals
  .command('clusters')
  .description('List failure clusters')
  .option('--agent-id <id>', 'Filter by agent ID')
  .option('--status <status>', 'Filter by status')
  .option('--cluster-type <type>', 'Filter by cluster type')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const clusters = await client.listFailureClusters({
      agentId: opts.agentId,
      status: opts.status,
      clusterType: opts.clusterType,
    });
    renderFailureClusters(clusters);
  }));

evals
  .command('cluster-create')
  .description('Create a failure cluster')
  .requiredOption('--agent-id <id>', 'Agent ID')
  .requiredOption('--cluster-type <type>', 'Cluster type')
  .requiredOption('--label <label>', 'Cluster label')
  .option('--description <text>', 'Cluster description')
  .option('--severity <sev>', 'Severity (low, medium, high, critical)')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const cluster = await client.createFailureCluster({
      agent_id: opts.agentId,
      cluster_type: opts.clusterType,
      label: opts.label,
      description: opts.description,
      severity: opts.severity,
    });
    renderFailureCluster(cluster, 'Created');
  }));

evals
  .command('cluster-update <id>')
  .description('Update a failure cluster')
  .option('--status <status>', 'Status (open, acknowledged, resolved)')
  .option('--label <label>', 'Cluster label')
  .option('--description <text>', 'Cluster description')
  .option('--severity <sev>', 'Severity')
  .option('--resolution-notes <text>', 'Resolution notes')
  .action(withErrorHandling(async (id, opts) => {
    const client = getClient();
    const cluster = await client.updateFailureCluster(id, {
      status: opts.status,
      label: opts.label,
      description: opts.description,
      severity: opts.severity,
      resolution_notes: opts.resolutionNotes,
    });
    renderFailureCluster(cluster, 'Updated');
  }));

evals
  .command('cluster-add-member <id>')
  .description('Add a trace node to a failure cluster')
  .requiredOption('--trace-node-id <id>', 'Trace node ID')
  .requiredOption('--session-id <id>', 'Session ID')
  .action(withErrorHandling(async (id, opts) => {
    const client = getClient();
    const member = await client.addFailureClusterMember(id, {
      trace_node_id: opts.traceNodeId,
      session_id: opts.sessionId,
    });
    console.log(`Added ${member.trace_node_id} to cluster ${id}`);
  }));

evals
  .command('cluster-delete <id>')
  .description('Delete a failure cluster')
  .action(withErrorHandling(async (id) => {
    const client = getClient();
    await client.deleteFailureCluster(id);
    console.log(`Deleted cluster ${id}`);
  }));

evals
  .command('suggestions')
  .description('List optimization suggestions')
  .option('--agent-id <id>', 'Filter by agent ID')
  .option('--status <status>', 'Filter by status')
  .option('--suggestion-type <type>', 'Filter by suggestion type')
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const suggestions = await client.listOptimizationSuggestions({
      agentId: opts.agentId,
      status: opts.status,
      suggestionType: opts.suggestionType,
    });
    renderOptimizationSuggestions(suggestions);
  }));

evals
  .command('suggestion-create')
  .description('Create an optimization suggestion')
  .requiredOption('--agent-id <id>', 'Agent ID')
  .requiredOption('--suggestion-type <type>', 'Suggestion type')
  .requiredOption('--title <title>', 'Suggestion title')
  .requiredOption('--description <text>', 'Suggestion description')
  .option('--cluster-id <id>', 'Related cluster ID')
  .option('--confidence <value>', 'Confidence score', parseFloat)
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const suggestion = await client.createOptimizationSuggestion({
      agent_id: opts.agentId,
      suggestion_type: opts.suggestionType,
      title: opts.title,
      description: opts.description,
      cluster_id: opts.clusterId,
      confidence: opts.confidence,
    });
    renderOptimizationSuggestion(suggestion, 'Created');
  }));

evals
  .command('suggestion-update <id>')
  .description('Update an optimization suggestion')
  .option('--status <status>', 'Status (pending, accepted, rejected, implemented)')
  .option('--title <title>', 'Suggestion title')
  .option('--description <text>', 'Suggestion description')
  .option('--confidence <value>', 'Confidence score', parseFloat)
  .action(withErrorHandling(async (id, opts) => {
    const client = getClient();
    const suggestion = await client.updateOptimizationSuggestion(id, {
      status: opts.status,
      title: opts.title,
      description: opts.description,
      confidence: opts.confidence,
    });
    renderOptimizationSuggestion(suggestion, 'Updated');
  }));

evals
  .command('suggestion-delete <id>')
  .description('Delete an optimization suggestion')
  .action(withErrorHandling(async (id) => {
    const client = getClient();
    await client.deleteOptimizationSuggestion(id);
    console.log(`Deleted suggestion ${id}`);
  }));

// ── Drift ──

const drift = program
  .command('drift')
  .description('Drift detection between sessions');

drift
  .command('catches')
  .description('List detected drift catches')
  .action(withErrorHandling(async () => {
    const client = getClient();
    const catches = await client.getDriftCatches();
    renderDriftCatches(catches);
  }));

drift
  .command('compare <session-a> <session-b>')
  .description('Compare two sessions for drift')
  .action(withErrorHandling(async (sessionA, sessionB) => {
    const client = getClient();
    const result = await client.getDriftComparison(sessionA, sessionB);
    renderDriftComparison(result);
  }));

// ── Training ──

const training = program
  .command('training')
  .description('Training feedback and trace flags');

training
  .command('flags')
  .description('List trace flags')
  .option('--flag <flag>', 'Filter by flag type (good, bad, needs_review)')
  .option('--limit <n>', 'Limit results', parseInt)
  .action(withErrorHandling(async (opts) => {
    const client = getClient();
    const flags = await client.listTraceFlags({ flag: opts.flag, limit: opts.limit });
    renderTraceFlags(flags);
  }));

training
  .command('stats')
  .description('Show trace flag statistics')
  .action(withErrorHandling(async () => {
    const client = getClient();
    const stats = await client.getTraceFlagStats();
    renderTraceFlagStats(stats);
  }));

// ── Identities ──

const identities = program
  .command('identities')
  .description('Manage agent identities');

identities
  .command('list')
  .description('List registered identities')
  .action(withErrorHandling(async () => {
    const client = getClient();
    const items = await client.listIdentities();
    renderIdentities(items);
  }));

// ── Search ──

program
  .command('search <query>')
  .description('Search across sessions, agents, and anomalies')
  .action(withErrorHandling(async (query) => {
    const client = getClient();
    const results = await client.search(query);
    renderSearchResults(results);
  }));

void program.parseAsync(process.argv);
