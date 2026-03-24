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
