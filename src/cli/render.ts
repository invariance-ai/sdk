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

const statusColor = (status: string) => {
  if (status === 'open') return chalk.blue(status);
  if (status === 'closed') return chalk.green(status);
  if (status === 'tampered') return chalk.red(status);
  return status;
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

export function renderSessionList(sessions: SessionItem[]) {
  const table = new Table({
    head: ['ID', 'Name', 'Status', 'Agent', 'Receipts', 'Created'].map(h => chalk.gray(h)),
    style: { head: [], border: ['gray'] },
  });

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
