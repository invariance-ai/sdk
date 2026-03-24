import chalk from 'chalk';
import Table from 'cli-table3';
import boxen from 'boxen';
import ora from 'ora';

interface SessionItem {
  id: string;
  name: string;
  status: string;
  created_by: string;
  created_at: string;
  closed_at?: string;
  receipt_count?: number;
}

interface ReceiptItem {
  id: string;
  action: string;
  agent?: string;
  timestamp: number | string;
  hash: string;
  previousHash?: string;
  input?: unknown;
  output?: unknown;
}

interface TemplateItem {
  label?: string;
  category?: string;
  highlights?: string[];
}

interface MonitorItem {
  id: string;
  name: string;
  agent_id: string | null;
  severity: string;
  status: string;
  triggers_count: number;
  last_triggered: string | null;
  created_at: string;
}

interface EvalSuiteItem {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  case_count?: number;
  latest_pass_rate?: number | null;
  created_at: string;
}

interface EvalRunItem {
  id: string;
  suite_id: string;
  agent_id: string;
  version_label: string | null;
  status: string;
  pass_rate: number | null;
  avg_score: number | null;
  created_at: string;
}

interface EvalCompareItem {
  run_a: EvalRunItem;
  run_b: EvalRunItem;
  overall_delta: { pass_rate: number; avg_score: number };
  per_case: Array<{
    case_id: string;
    case_name: string;
    a_passed: boolean;
    b_passed: boolean;
    a_score: number | null;
    b_score: number | null;
    delta: number | null;
  }>;
  regressions: number;
  improvements: number;
}

interface EvalThresholdItem {
  id: string;
  suite_id: string;
  metric: string;
  min_value: number;
  status: string;
  webhook_url: string | null;
}

interface FailureClusterMemberItem {
  trace_node_id: string;
  session_id: string;
}

interface FailureClusterItem {
  id: string;
  agent_id: string;
  cluster_type: string;
  label: string;
  severity: string;
  status: string;
  occurrence_count: number;
  member_count?: number;
  members?: FailureClusterMemberItem[];
}

interface OptimizationSuggestionItem {
  id: string;
  agent_id: string;
  suggestion_type: string;
  title: string;
  status: string;
  confidence: number;
  cluster_id?: string | null;
}

interface MonitorEvalItem {
  monitor_id: string;
  matches_found: number;
  matched_node_ids: string[];
}

interface DriftCatchItem {
  id: string;
  session_a: string;
  session_b: string;
  agent: string;
  task: string;
  similarity_score: number;
  divergence_reason: string;
  severity: string;
  caught_at: number;
}

interface DriftComparisonItem {
  run_a: { session_id: string; agent_id: string; task: string; node_count: number; status: string };
  run_b: { session_id: string; agent_id: string; task: string; node_count: number; status: string };
  divergence_point: number | null;
  divergence_reason: string;
  similarity_score: number;
  aligned_steps: Array<{
    index: number;
    node_a: { action: string } | null;
    node_b: { action: string } | null;
    aligned: boolean;
    drift_type?: string;
  }>;
}

interface TraceFlagItem {
  id: string;
  trace_node_id: string;
  session_id: string;
  agent_id: string;
  flag: string;
  notes: string | null;
  created_at: string;
}

interface TraceFlagStatsItem {
  total: number;
  good: number;
  bad: number;
  needs_review: number;
  by_agent: Record<string, { good: number; bad: number; needs_review: number }>;
}

interface IdentityItem {
  id: string;
  name: string;
  display_name: string;
  org: string;
  org_display: string;
  public_key: string;
  verified: boolean;
  identity_type: string;
  session_count: number;
  last_active: string;
}

interface SearchResultItem {
  type: string;
  id: string;
  label: string;
  subtitle?: string;
}

const statusColor = (status: string) => {
  if (status === 'open') return chalk.blue(status);
  if (status === 'closed') return chalk.green(status);
  if (status === 'tampered') return chalk.red(status);
  return status;
};

const severityColor = (severity: string) => {
  if (severity === 'critical') return chalk.red(severity);
  if (severity === 'high') return chalk.redBright(severity);
  if (severity === 'medium') return chalk.yellow(severity);
  if (severity === 'low') return chalk.green(severity);
  return severity;
};

const flagColor = (flag: string) => {
  if (flag === 'good') return chalk.green(flag);
  if (flag === 'bad') return chalk.red(flag);
  if (flag === 'needs_review') return chalk.yellow(flag);
  return flag;
};

const categoryBadge = (cat?: string) => {
  if (!cat) return chalk.gray('[general]');
  if (cat === 'read') return chalk.blue(`[${cat}]`);
  if (cat === 'write') return chalk.yellow(`[${cat}]`);
  if (cat === 'decision') return chalk.magenta(`[${cat}]`);
  return chalk.gray(`[${cat}]`);
};

const shortHash = (h?: string) => h ? `#${h.slice(0, 8)}` : '';

function formatTime(ts: number | string): string {
  const d = new Date(typeof ts === 'string' ? ts : ts);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatPercent(n: number | null | undefined): string {
  if (n == null) return chalk.gray('--');
  return `${(n * 100).toFixed(1)}%`;
}

function makeTable(head: string[]) {
  return new Table({
    head: head.map(h => chalk.gray(h)),
    style: { head: [], border: ['gray'] },
  });
}

// ── Sessions ──

export function renderSessionList(sessions: SessionItem[]) {
  const table = makeTable(['ID', 'Name', 'Status', 'Agent', 'Receipts', 'Created']);

  for (const s of sessions) {
    table.push([
      s.id,
      s.name,
      statusColor(s.status),
      s.created_by || '',
      s.receipt_count ?? '—',
      new Date(s.created_at).toLocaleDateString(),
    ]);
  }

  console.log(table.toString());
}

export function renderSessionDetail(
  session: SessionItem,
  receipts: ReceiptItem[],
  templates: Record<string, TemplateItem>,
) {
  const duration = session.closed_at
    ? `${Math.round((new Date(session.closed_at).getTime() - new Date(session.created_at).getTime()) / 60000)}m`
    : 'ongoing';

  const header = boxen(
    `${chalk.bold(session.name)}\n${statusColor(session.status)}  ${chalk.gray('·')}  ${session.created_by}  ${chalk.gray('·')}  ${receipts.length} receipts  ${chalk.gray('·')}  ${duration}`,
    { padding: 1, borderStyle: 'round', borderColor: 'gray' },
  );
  console.log(header);
  console.log();

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]!;
    const t = templates[r.action];
    const label = t?.label ?? r.action;
    const cat = categoryBadge(t?.category);
    const time = formatTime(r.timestamp);
    const node = t?.category === 'write' ? chalk.yellow('●') : chalk.blue('○');
    const prevHash = r.previousHash === '0' ? 'genesis' : shortHash(r.previousHash);
    const isLast = i === receipts.length - 1;

    console.log(`  ${chalk.gray(time)}  ${node}${chalk.gray('───')} ${chalk.bold(label)}  ${cat}`);

    // Show highlights
    if (t?.highlights) {
      const input = (r.input ?? {}) as Record<string, unknown>;
      const output = (r.output ?? {}) as Record<string, unknown>;
      for (const key of t.highlights.slice(0, 4)) {
        const val = input[key] ?? output[key];
        if (val !== undefined) {
          console.log(`         ${chalk.gray('│')}    ${chalk.gray(key + ':')} ${typeof val === 'string' ? val : JSON.stringify(val)}`);
        }
      }
    }

    console.log(`         ${chalk.gray('│')}    ${chalk.gray(shortHash(r.hash))} ${chalk.gray('<-')} ${chalk.gray(prevHash)}`);
    if (!isLast) console.log(`         ${chalk.gray('│')}`);
  }
  console.log();
}

export async function renderVerification(
  result: { valid: boolean; error?: string; errors?: Array<{ index: number; reason: string }> },
  receipts: ReceiptItem[],
) {
  console.log();
  const spinner = ora(`Verifying session (${receipts.length} receipts)...`).start();

  // Simulate step-by-step verification display
  await new Promise(r => setTimeout(r, 500));
  spinner.stop();
  console.log();

  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i]!;
    const errorForReceipt = result.errors?.find(e => e.index === i);

    if (errorForReceipt) {
      console.log(`  ${chalk.red('✗')} Receipt ${i + 1}/${receipts.length}  ${r.action}    ${chalk.red(errorForReceipt.reason)}`);
    } else {
      console.log(`  ${chalk.green('✓')} Receipt ${i + 1}/${receipts.length}  ${r.action}    ${chalk.gray('hash ok · chain ok · sig ok')}`);
    }
  }

  console.log();
  if (result.valid) {
    console.log(`  ${chalk.green('✓')} Chain integrity verified — ${receipts.length} receipts, 0 errors`);
  } else {
    const errCount = result.errors?.length ?? 1;
    console.log(`  ${chalk.red('✗')} Chain broken — ${receipts.length} receipts, ${errCount} error${errCount > 1 ? 's' : ''}`);
  }
  console.log();
}

// ── Monitors ──

export function renderMonitorList(monitors: MonitorItem[]) {
  if (monitors.length === 0) {
    console.log(chalk.gray('No monitors found.'));
    return;
  }

  const table = makeTable(['ID', 'Name', 'Agent', 'Severity', 'Status', 'Triggers', 'Created']);

  for (const m of monitors) {
    table.push([
      m.id,
      m.name,
      m.agent_id ?? chalk.gray('—'),
      severityColor(m.severity),
      m.status === 'active' ? chalk.green(m.status) : chalk.gray(m.status),
      String(m.triggers_count),
      new Date(m.created_at).toLocaleDateString(),
    ]);
  }

  console.log(table.toString());
}

export function renderMonitorCreated(monitor: MonitorItem) {
  console.log(`${chalk.green('Created')} monitor ${chalk.bold(monitor.name)} (${monitor.id})`);
}

export function renderMonitorDeleted(id: string) {
  console.log(`${chalk.green('Deleted')} monitor ${chalk.bold(id)}`);
}

export function renderMonitorEvaluation(result: MonitorEvalItem) {
  console.log(`Monitor ${chalk.bold(result.monitor_id)}: ${result.matches_found} match(es)`);
  for (const nodeId of result.matched_node_ids) {
    console.log(`  ${chalk.yellow('>')} ${nodeId}`);
  }
}

// ── Evals ──

export function renderEvalSuites(suites: EvalSuiteItem[]) {
  if (suites.length === 0) {
    console.log(chalk.gray('No eval suites found.'));
    return;
  }

  const table = makeTable(['ID', 'Name', 'Agent', 'Cases', 'Pass Rate', 'Created']);

  for (const s of suites) {
    table.push([
      s.id,
      s.name,
      s.agent_id ?? chalk.gray('—'),
      s.case_count != null ? String(s.case_count) : chalk.gray('—'),
      formatPercent(s.latest_pass_rate),
      new Date(s.created_at).toLocaleDateString(),
    ]);
  }

  console.log(table.toString());
}

export function renderEvalRun(run: EvalRunItem) {
  const statusStr = run.status === 'completed' ? chalk.green(run.status)
    : run.status === 'failed' ? chalk.red(run.status)
    : chalk.yellow(run.status);
  console.log(`Run ${chalk.bold(run.id)}  ${statusStr}  pass_rate=${formatPercent(run.pass_rate)}  avg_score=${formatPercent(run.avg_score)}`);
}

export function renderEvalCompare(result: EvalCompareItem) {
  const deltaColor = result.overall_delta.pass_rate >= 0 ? chalk.green : chalk.red;
  console.log(`${chalk.bold('Run A:')} ${result.run_a.id}  vs  ${chalk.bold('Run B:')} ${result.run_b.id}`);
  console.log(`Pass rate delta: ${deltaColor((result.overall_delta.pass_rate >= 0 ? '+' : '') + (result.overall_delta.pass_rate * 100).toFixed(1) + '%')}`);
  console.log(`Regressions: ${chalk.red(String(result.regressions))}  Improvements: ${chalk.green(String(result.improvements))}`);
  console.log();

  if (result.per_case.length > 0) {
    const table = makeTable(['Case', 'A', 'B', 'Delta']);
    for (const c of result.per_case) {
      const aStr = c.a_passed ? chalk.green('pass') : chalk.red('fail');
      const bStr = c.b_passed ? chalk.green('pass') : chalk.red('fail');
      const dStr = c.delta != null ? (c.delta >= 0 ? chalk.green(`+${c.delta.toFixed(2)}`) : chalk.red(c.delta.toFixed(2))) : chalk.gray('—');
      table.push([c.case_name, aStr, bStr, dStr]);
    }
    console.log(table.toString());
  }
}

export function renderEvalThresholds(thresholds: EvalThresholdItem[]) {
  if (thresholds.length === 0) {
    console.log(chalk.gray('No eval thresholds found.'));
    return;
  }

  const table = makeTable(['ID', 'Suite', 'Metric', 'Min', 'Status', 'Webhook']);
  for (const threshold of thresholds) {
    table.push([
      threshold.id,
      threshold.suite_id,
      threshold.metric,
      threshold.min_value.toFixed(3),
      threshold.status === 'active' ? chalk.green(threshold.status) : chalk.gray(threshold.status),
      threshold.webhook_url ?? chalk.gray('—'),
    ]);
  }
  console.log(table.toString());
}

export function renderEvalThreshold(threshold: EvalThresholdItem, verb = 'Saved') {
  console.log(
    `${chalk.green(verb)} threshold ${chalk.bold(threshold.id)}  ${threshold.metric} >= ${threshold.min_value.toFixed(3)}  ${threshold.status}`,
  );
}

export function renderFailureClusters(clusters: FailureClusterItem[]) {
  if (clusters.length === 0) {
    console.log(chalk.gray('No failure clusters found.'));
    return;
  }

  const table = makeTable(['ID', 'Label', 'Agent', 'Type', 'Severity', 'Status', 'Occurrences']);
  for (const cluster of clusters) {
    table.push([
      cluster.id,
      cluster.label,
      cluster.agent_id,
      cluster.cluster_type,
      severityColor(cluster.severity),
      cluster.status === 'resolved' ? chalk.green(cluster.status) : cluster.status === 'acknowledged' ? chalk.yellow(cluster.status) : chalk.blue(cluster.status),
      String(cluster.member_count ?? cluster.occurrence_count),
    ]);
  }
  console.log(table.toString());
}

export function renderFailureCluster(cluster: FailureClusterItem, verb = 'Saved') {
  console.log(
    `${chalk.green(verb)} cluster ${chalk.bold(cluster.label)} (${cluster.id})  ${cluster.cluster_type}  ${severityColor(cluster.severity)}`,
  );
  if (cluster.members && cluster.members.length > 0) {
    console.log(`Members: ${cluster.members.length}`);
    for (const member of cluster.members.slice(0, 5)) {
      console.log(`  ${chalk.yellow('>')} ${member.trace_node_id}  ${chalk.gray(member.session_id)}`);
    }
  }
}

export function renderOptimizationSuggestions(suggestions: OptimizationSuggestionItem[]) {
  if (suggestions.length === 0) {
    console.log(chalk.gray('No optimization suggestions found.'));
    return;
  }

  const table = makeTable(['ID', 'Title', 'Agent', 'Type', 'Status', 'Confidence']);
  for (const suggestion of suggestions) {
    table.push([
      suggestion.id,
      suggestion.title,
      suggestion.agent_id,
      suggestion.suggestion_type,
      suggestion.status === 'implemented'
        ? chalk.green(suggestion.status)
        : suggestion.status === 'accepted'
          ? chalk.blue(suggestion.status)
          : suggestion.status === 'rejected'
            ? chalk.red(suggestion.status)
            : chalk.yellow(suggestion.status),
      `${(suggestion.confidence * 100).toFixed(0)}%`,
    ]);
  }
  console.log(table.toString());
}

export function renderOptimizationSuggestion(suggestion: OptimizationSuggestionItem, verb = 'Saved') {
  console.log(
    `${chalk.green(verb)} suggestion ${chalk.bold(suggestion.title)} (${suggestion.id})  ${suggestion.suggestion_type}  ${(suggestion.confidence * 100).toFixed(0)}%`,
  );
}

// ── Drift ──

export function renderDriftCatches(catches: DriftCatchItem[]) {
  if (catches.length === 0) {
    console.log(chalk.gray('No drift catches found.'));
    return;
  }

  const table = makeTable(['ID', 'Session A', 'Session B', 'Agent', 'Similarity', 'Severity', 'Reason']);

  for (const c of catches) {
    table.push([
      c.id,
      c.session_a,
      c.session_b,
      c.agent,
      `${(c.similarity_score * 100).toFixed(1)}%`,
      severityColor(c.severity),
      c.divergence_reason.slice(0, 40),
    ]);
  }

  console.log(table.toString());
}

export function renderDriftComparison(result: DriftComparisonItem) {
  console.log(boxen(
    `${chalk.bold('Drift Comparison')}\n` +
    `Session A: ${result.run_a.session_id}  (${result.run_a.node_count} nodes, ${result.run_a.status})\n` +
    `Session B: ${result.run_b.session_id}  (${result.run_b.node_count} nodes, ${result.run_b.status})\n` +
    `Similarity: ${(result.similarity_score * 100).toFixed(1)}%\n` +
    `Divergence: ${result.divergence_reason}` +
    (result.divergence_point != null ? `  at step ${result.divergence_point}` : ''),
    { padding: 1, borderStyle: 'round', borderColor: 'gray' },
  ));

  if (result.aligned_steps.length > 0) {
    const table = makeTable(['Step', 'Action A', 'Action B', 'Aligned', 'Drift']);
    for (const step of result.aligned_steps) {
      const aligned = step.aligned ? chalk.green('yes') : chalk.red('no');
      table.push([
        String(step.index),
        step.node_a?.action ?? chalk.gray('—'),
        step.node_b?.action ?? chalk.gray('—'),
        aligned,
        step.drift_type ?? '',
      ]);
    }
    console.log(table.toString());
  }
}

// ── Training ──

export function renderTraceFlags(flags: TraceFlagItem[]) {
  if (flags.length === 0) {
    console.log(chalk.gray('No trace flags found.'));
    return;
  }

  const table = makeTable(['ID', 'Node', 'Session', 'Agent', 'Flag', 'Notes', 'Created']);

  for (const f of flags) {
    table.push([
      f.id,
      f.trace_node_id,
      f.session_id,
      f.agent_id,
      flagColor(f.flag),
      f.notes?.slice(0, 30) ?? chalk.gray('—'),
      new Date(f.created_at).toLocaleDateString(),
    ]);
  }

  console.log(table.toString());
}

export function renderTraceFlagStats(stats: TraceFlagStatsItem) {
  console.log(`${chalk.bold('Trace Flag Statistics')}`);
  console.log(`  Total: ${stats.total}    ${chalk.green(`good: ${stats.good}`)}    ${chalk.red(`bad: ${stats.bad}`)}    ${chalk.yellow(`needs_review: ${stats.needs_review}`)}`);

  const agents = Object.entries(stats.by_agent);
  if (agents.length > 0) {
    console.log();
    const table = makeTable(['Agent', 'Good', 'Bad', 'Needs Review']);
    for (const [agent, counts] of agents) {
      table.push([
        agent,
        chalk.green(String(counts.good)),
        chalk.red(String(counts.bad)),
        chalk.yellow(String(counts.needs_review)),
      ]);
    }
    console.log(table.toString());
  }
}

// ── Identities ──

export function renderIdentities(identities: IdentityItem[]) {
  if (identities.length === 0) {
    console.log(chalk.gray('No identities found.'));
    return;
  }

  const table = makeTable(['ID', 'Name', 'Org', 'Type', 'Verified', 'Sessions', 'Last Active']);

  for (const i of identities) {
    table.push([
      i.id,
      i.display_name || i.name,
      i.org_display || i.org,
      i.identity_type,
      i.verified ? chalk.green('yes') : chalk.gray('no'),
      String(i.session_count),
      i.last_active ? new Date(i.last_active).toLocaleDateString() : chalk.gray('—'),
    ]);
  }

  console.log(table.toString());
}

// ── Search ──

export function renderSearchResults(results: SearchResultItem[]) {
  if (results.length === 0) {
    console.log(chalk.gray('No results found.'));
    return;
  }

  const table = makeTable(['Type', 'ID', 'Label', 'Details']);

  for (const r of results) {
    const typeColor = r.type === 'anomaly' ? chalk.red(r.type)
      : r.type === 'agent' ? chalk.blue(r.type)
      : chalk.cyan(r.type);
    table.push([
      typeColor,
      r.id,
      r.label,
      r.subtitle ?? '',
    ]);
  }

  console.log(table.toString());
}
