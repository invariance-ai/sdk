#!/usr/bin/env node
import { Command } from 'commander';
import { ApiClient } from './api.js';
import { renderSessionList, renderSessionDetail, renderVerification } from './render.js';

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

program
  .command('sessions')
  .description('List all sessions')
  .option('-s, --status <status>', 'Filter by status (open, closed, tampered)')
  .action(async (opts) => {
    const client = getClient();
    const sessions = await client.listSessions(opts.status);
    renderSessionList(sessions);
  });

program
  .command('session <id>')
  .description('Show session detail with receipt timeline')
  .action(async (id) => {
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
  });

program
  .command('verify <sessionId>')
  .description('Verify chain integrity for a session')
  .action(async (sessionId) => {
    const client = getClient();
    const result = await client.verifySession(sessionId);
    const receipts = await client.getReceipts(sessionId);
    await renderVerification(result, receipts);
  });

program
  .command('status')
  .description('Show connection status')
  .action(async () => {
    const client = getClient();
    try {
      const agents = await client.listAgents();
      console.log(`Connected to ${process.env.INVARIANCE_API_URL || 'https://api.invariance.dev'}`);
      console.log(`Agents: ${agents.length}`);
    } catch (err) {
      console.error('Failed to connect:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

program.parse();
