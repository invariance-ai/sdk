#!/usr/bin/env node

import { Invariance } from '../client.js';

const args = process.argv.slice(2);
const command = args[0];
const subcommand = args[1];

const apiKey = process.env.INVARIANCE_API_KEY || '';
const apiUrl = process.env.INVARIANCE_API_URL || 'https://api.invariance.dev';

if (!apiKey && command !== 'help' && command !== undefined) {
  console.error('Error: INVARIANCE_API_KEY environment variable required');
  process.exit(1);
}

function printJson(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function printTable(items: Array<Record<string, unknown>>, columns: string[]) {
  if (items.length === 0) {
    console.log('No results.');
    return;
  }
  const widths = columns.map(col =>
    Math.max(col.length, ...items.map(item => String(item[col] ?? '').length)),
  );
  const header = columns.map((col, i) => col.padEnd(widths[i]!)).join('  ');
  console.log(header);
  console.log(columns.map((_, i) => '-'.repeat(widths[i]!)).join('  '));
  for (const item of items) {
    console.log(columns.map((col, i) => String(item[col] ?? '').padEnd(widths[i]!)).join('  '));
  }
}

function getFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function requireFlag(flag: string, usage: string): string {
  const val = getFlag(flag);
  if (!val) {
    console.error(usage);
    process.exit(1);
  }
  return val;
}

async function main() {
  const client = apiKey ? Invariance.init({ apiKey, apiUrl }) : (null as unknown as Invariance);

  try {
    switch (command) {
      case 'evals': {
        switch (subcommand) {
          case 'list-suites': {
            const agentId = getFlag('--agent');
            const suites = await client.evals.listSuites(agentId ? { agent_id: agentId } : undefined);
            printTable(suites as unknown as Array<Record<string, unknown>>, ['id', 'name', 'case_count', 'latest_pass_rate']);
            break;
          }
          case 'list-runs': {
            const suiteId = getFlag('--suite');
            const agentId = getFlag('--agent');
            const status = getFlag('--status');
            const runs = await client.evals.listRuns({ suite_id: suiteId, agent_id: agentId, status });
            printTable(runs as unknown as Array<Record<string, unknown>>, ['id', 'suite_id', 'status', 'pass_rate', 'version_label', 'created_at']);
            break;
          }
          case 'get-run': {
            const id = args[2];
            if (!id) { console.error('Usage: evals get-run <run-id>'); process.exit(1); }
            const run = await client.evals.getRun(id);
            printJson(run);
            break;
          }
          case 'launch': {
            const suiteId = requireFlag('--suite', 'Usage: evals launch --suite <id> --agent <id> --mode <session|dataset> [--dataset <id> --dataset-version <n>] [--label <label>]');
            const agentId = requireFlag('--agent', 'Usage: evals launch --suite <id> --agent <id> --mode <session|dataset> [--dataset <id> --dataset-version <n>] [--label <label>]');
            const mode = (getFlag('--mode') ?? 'session') as 'session' | 'dataset';
            const datasetId = getFlag('--dataset');
            const datasetVersion = getFlag('--dataset-version');
            const versionLabel = getFlag('--label');
            const result = await client.evals.launch({
              mode,
              suite_id: suiteId,
              agent_id: agentId,
              version_label: versionLabel,
              ...(datasetId ? { dataset_id: datasetId, dataset_version: parseInt(datasetVersion ?? '1') } : {}),
            });
            console.log(`Run ${result.eval_run.id} created (status: ${result.eval_run.status})`);
            if (result.experiment_id) console.log(`Experiment: ${result.experiment_id}`);
            printJson(result);
            break;
          }
          case 'compare': {
            const suiteId = requireFlag('--suite', 'Usage: evals compare --suite <id> --run-a <id> --run-b <id>');
            const runA = requireFlag('--run-a', 'Usage: evals compare --suite <id> --run-a <id> --run-b <id>');
            const runB = requireFlag('--run-b', 'Usage: evals compare --suite <id> --run-a <id> --run-b <id>');
            const result = await client.evals.compare(suiteId, runA, runB);
            printJson(result);
            break;
          }
          case 'regressions': {
            const suiteId = getFlag('--suite');
            const agentId = getFlag('--agent');
            const runA = getFlag('--run-a');
            const runB = getFlag('--run-b');
            if (!suiteId && !agentId) {
              console.error('Usage: evals regressions --suite <id> [--agent <id>] [--run-a <id> --run-b <id>]');
              process.exit(1);
            }
            const data = await client.evals.listRegressions({ suite_id: suiteId, agent_id: agentId, run_a: runA, run_b: runB });
            printTable(data as unknown as Array<Record<string, unknown>>, ['case_id', 'case_name', 'suite_id', 'a_passed', 'b_passed', 'delta']);
            break;
          }
          case 'lineage': {
            const suiteId = getFlag('--suite');
            const agentId = getFlag('--agent');
            const datasetId = getFlag('--dataset');
            const limit = getFlag('--limit');
            if (!suiteId && !agentId) {
              console.error('Usage: evals lineage --suite <id> [--agent <id>] [--dataset <id>] [--limit <n>]');
              process.exit(1);
            }
            const data = await client.evals.getLineage({
              suite_id: suiteId,
              agent_id: agentId,
              dataset_id: datasetId,
              ...(limit ? { limit: parseInt(limit) } : {}),
            });
            printTable(data as unknown as Array<Record<string, unknown>>, ['run_id', 'suite_name', 'version_label', 'status', 'pass_rate', 'created_at']);
            break;
          }
          default:
            console.error(`Unknown evals subcommand: ${subcommand}`);
            console.error('Available: list-suites, list-runs, get-run, launch, compare, regressions, lineage');
            process.exit(1);
        }
        break;
      }

      case 'candidates': {
        switch (subcommand) {
          case 'list': {
            const suiteId = getFlag('--suite');
            const type = getFlag('--type');
            const status = getFlag('--status');
            const limit = getFlag('--limit');
            const offset = getFlag('--offset');
            const data = await client.evals.listImprovementCandidates({
              suite_id: suiteId,
              type,
              status,
              ...(limit ? { limit: parseInt(limit) } : {}),
              ...(offset ? { offset: parseInt(offset) } : {}),
            });
            printTable(data as unknown as Array<Record<string, unknown>>, ['id', 'type', 'case_name', 'status', 'delta']);
            break;
          }
          case 'accept': {
            const id = args[2];
            if (!id) { console.error('Usage: candidates accept <id>'); process.exit(1); }
            await client.evals.updateImprovementCandidate(id, { status: 'accepted' });
            console.log(`Candidate ${id} accepted`);
            break;
          }
          case 'reject': {
            const id = args[2];
            if (!id) { console.error('Usage: candidates reject <id>'); process.exit(1); }
            await client.evals.updateImprovementCandidate(id, { status: 'rejected' });
            console.log(`Candidate ${id} rejected`);
            break;
          }
          default:
            console.error(`Unknown candidates subcommand: ${subcommand}`);
            console.error('Available: list, accept, reject');
            process.exit(1);
        }
        break;
      }

      case 'datasets': {
        switch (subcommand) {
          case 'list': {
            const agentId = getFlag('--agent');
            const data = await client.datasets.list(agentId ? { agent_id: agentId } : undefined);
            printTable(data as unknown as Array<Record<string, unknown>>, ['id', 'name', 'row_count', 'latest_published_version']);
            break;
          }
          default:
            console.error(`Unknown datasets subcommand: ${subcommand}`);
            console.error('Available: list');
            process.exit(1);
        }
        break;
      }

      case 'scorers': {
        switch (subcommand) {
          case 'list': {
            const data = await client.scorers.list();
            printTable(data as unknown as Array<Record<string, unknown>>, ['id', 'name', 'type']);
            break;
          }
          default:
            console.error(`Unknown scorers subcommand: ${subcommand}`);
            console.error('Available: list');
            process.exit(1);
        }
        break;
      }

      case 'help':
      default:
        console.log(`Invariance CLI

Usage: invariance <command> <subcommand> [options]

Commands:
  evals         Eval suite and run management
    list-suites [--agent <id>]      List eval suites
    list-runs [--suite <id>] [--agent <id>] [--status <s>]
    get-run <id>                    Get run details
    launch --suite <id> --agent <id> [--mode <session|dataset>] [--dataset <id> --dataset-version <n>] [--label <label>]
    compare --suite <id> --run-a <id> --run-b <id>
    regressions --suite <id> [--agent <id>] [--run-a <id> --run-b <id>]
    lineage --suite <id> [--agent <id>] [--dataset <id>] [--limit <n>]

  candidates    Improvement candidate management
    list [--suite <id>] [--type <type>] [--status <status>] [--limit <n>] [--offset <n>]
    accept <id>
    reject <id>

  datasets      Dataset management
    list [--agent <id>]             List datasets

  scorers       Scorer management
    list                            List scorers

Environment:
  INVARIANCE_API_KEY    API key (required)
  INVARIANCE_API_URL    API URL (default: https://api.invariance.dev)
`);
        if (command !== 'help' && command !== undefined) process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  await client?.shutdown();
}

main();
