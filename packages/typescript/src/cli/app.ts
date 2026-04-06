import { Invariance } from '../client.js';
import type { EvalLaunchBody, ProviderTarget } from '../types/eval.js';

type ExitCode = 0 | 1;

export interface CliClient {
  evals: {
    listSuites(opts?: { agent_id?: string }): Promise<unknown[]>;
    listRuns(opts?: { suite_id?: string; agent_id?: string; status?: string }): Promise<unknown[]>;
    getRun(id: string): Promise<unknown>;
    rerun(id: string): Promise<{ id: string; status: string }>;
    launch(body: EvalLaunchBody): Promise<{ eval_run: { id: string; status: string }; experiment_id: string | null }>;
    compare(suiteId: string, runA: string, runB: string): Promise<unknown>;
    listRegressions(opts: { suite_id?: string; agent_id?: string; run_a?: string; run_b?: string }): Promise<unknown[]>;
    getLineage(opts: { suite_id?: string; agent_id?: string; dataset_id?: string; limit?: number }): Promise<unknown[]>;
    listImprovementCandidates(opts?: { suite_id?: string; status?: string; type?: string; limit?: number; offset?: number }): Promise<unknown[]>;
    updateImprovementCandidate(id: string, body: { status: string }): Promise<unknown>;
  };
  trace: {
    getSessionSemanticFacts(sessionId: string): Promise<unknown>;
    getNodeSemanticFacts(nodeId: string): Promise<unknown>;
    getSemanticFacts(query?: Record<string, unknown>): Promise<unknown>;
    rebuildSessionSemanticFacts(sessionId: string): Promise<unknown>;
    getSemanticFactAggregates(query?: Record<string, unknown>): Promise<unknown>;
    getOntologyCandidates(query?: Record<string, unknown>): Promise<unknown>;
    getOntologyCandidate(id: string): Promise<unknown>;
    mineOntologyCandidates(): Promise<unknown>;
  };
  datasets: {
    list(opts?: { agent_id?: string }): Promise<unknown[]>;
  };
  scorers: {
    list(): Promise<unknown[]>;
  };
  shutdown(): Promise<void>;
}

interface CliDeps {
  env: NodeJS.ProcessEnv;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  createClient: (config: { apiKey: string; apiUrl: string }) => CliClient;
}

const defaultDeps: CliDeps = {
  env: process.env,
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  createClient: ({ apiKey, apiUrl }) => Invariance.init({ apiKey, apiUrl }) as unknown as CliClient,
};

function printJson(stdout: (line: string) => void, data: unknown) {
  stdout(JSON.stringify(data, null, 2));
}

function printTable(stdout: (line: string) => void, items: Array<Record<string, unknown>>, columns: string[]) {
  if (items.length === 0) {
    stdout('No results.');
    return;
  }
  const widths = columns.map((col) =>
    Math.max(col.length, ...items.map((item) => String(item[col] ?? '').length)),
  );
  stdout(columns.map((col, index) => col.padEnd(widths[index]!)).join('  '));
  stdout(columns.map((_, index) => '-'.repeat(widths[index]!)).join('  '));
  for (const item of items) {
    stdout(columns.map((col, index) => String(item[col] ?? '').padEnd(widths[index]!)).join('  '));
  }
}

function getFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function requireFlag(args: string[], stderr: (line: string) => void, flag: string, usage: string): string {
  const value = getFlag(args, flag);
  if (!value) {
    stderr(usage);
    throw new Error('CLI_USAGE');
  }
  return value;
}

function parseCsvFlag(args: string[], flag: string): string[] | undefined {
  const value = getFlag(args, flag);
  if (!value) return undefined;
  const parts = value.split(',').map((entry) => entry.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

function buildTarget(args: string[]): ProviderTarget | undefined {
  const provider = getFlag(args, '--provider') as ProviderTarget['provider'] | undefined;
  const model = getFlag(args, '--model');
  const apiKeyEnv = getFlag(args, '--api-key-env');
  const baseUrlEnv = getFlag(args, '--base-url-env');

  if (!provider && !model && !apiKeyEnv && !baseUrlEnv) return undefined;
  if (!provider || !model) {
    throw new Error('Provider target requires both --provider and --model');
  }

  return {
    provider,
    model,
    ...(apiKeyEnv ? { api_key_env: apiKeyEnv } : {}),
    ...(baseUrlEnv ? { base_url_env: baseUrlEnv } : {}),
  };
}

function helpText() {
  return `Invariance CLI

Usage: invariance <command> <subcommand> [options]

Commands:
  evals         Eval suite and run management
    list-suites [--agent <id>]      List eval suites
    list-runs [--suite <id>] [--agent <id>] [--status <s>]
    get-run <id>                    Get run details
    rerun <id>                      Rerun an existing eval run
    launch --suite <id> --agent <id> [--mode <session|dataset>] [--sessions <id1,id2>] [--dataset <id> --dataset-version <n>] [--label <label>] [--provider <anthropic|openai> --model <name> --api-key-env <ENV> --base-url-env <ENV>]
    compare --suite <id> --run-a <id> --run-b <id>
    regressions --suite <id> [--agent <id>] [--run-a <id> --run-b <id>]
               or --run-a <id> --run-b <id>
    lineage --suite <id> [--agent <id>] [--dataset <id>] [--limit <n>]

  candidates    Improvement candidate management
    list [--suite <id>] [--type <type>] [--status <status>] [--limit <n>] [--offset <n>]
    accept <id>
    reject <id>

  datasets      Dataset management
    list [--agent <id>]             List datasets

  scorers       Scorer management
    list                            List scorers

  semantic-facts  Semantic fact extraction and aggregation
    list [--session <id>] [--kind <kind>] [--agent <id>] [--min-confidence <n>] [--limit <n>] [--offset <n>]
    session <session-id>              Get facts for a session
    node <node-id>                    Get facts for a node
    rebuild <session-id>              Force re-extraction
    aggregates [--kind <kind>] [--agent <id>] [--min-count <n>] [--limit <n>] [--offset <n>]

  ontology        Ontology candidate management
    list [--kind <concept|relation>] [--min-score <n>] [--entity-type <type>] [--limit <n>] [--offset <n>]
    get <id>                          Get a single candidate
    mine                              Trigger ontology mining

Environment:
  INVARIANCE_API_KEY    API key (required)
  INVARIANCE_API_URL    API URL (default: https://api.invariance.dev)
`;
}

export async function runCli(argv: string[], deps: Partial<CliDeps> = {}): Promise<ExitCode> {
  const { env, stdout, stderr, createClient } = { ...defaultDeps, ...deps };
  const [command, subcommand, positional] = argv;

  const apiKey = env.INVARIANCE_API_KEY || '';
  const apiUrl = env.INVARIANCE_API_URL || 'https://api.invariance.dev';

  if (!apiKey && command !== 'help' && command !== undefined) {
    stderr('Error: INVARIANCE_API_KEY environment variable required');
    return 1;
  }

  const client = apiKey ? createClient({ apiKey, apiUrl }) : null;

  try {
    switch (command) {
      case 'evals': {
        if (!client) return 1;
        switch (subcommand) {
          case 'list-suites': {
            const agentId = getFlag(argv, '--agent');
            const suites = await client.evals.listSuites(agentId ? { agent_id: agentId } : undefined);
            printTable(stdout, suites as Array<Record<string, unknown>>, ['id', 'name', 'case_count', 'latest_pass_rate']);
            return 0;
          }
          case 'list-runs': {
            const suiteId = getFlag(argv, '--suite');
            const agentId = getFlag(argv, '--agent');
            const status = getFlag(argv, '--status');
            const runs = await client.evals.listRuns({ suite_id: suiteId, agent_id: agentId, status });
            printTable(stdout, runs as Array<Record<string, unknown>>, ['id', 'suite_id', 'status', 'pass_rate', 'version_label', 'created_at']);
            return 0;
          }
          case 'get-run': {
            if (!positional) {
              stderr('Usage: evals get-run <run-id>');
              return 1;
            }
            const run = await client.evals.getRun(positional);
            printJson(stdout, run);
            return 0;
          }
          case 'rerun': {
            if (!positional) {
              stderr('Usage: evals rerun <run-id>');
              return 1;
            }
            const run = await client.evals.rerun(positional);
            stdout(`Run ${run.id} created (status: ${run.status})`);
            printJson(stdout, run);
            return 0;
          }
          case 'launch': {
            const suiteId = requireFlag(argv, stderr, '--suite', 'Usage: evals launch --suite <id> --agent <id> --mode <session|dataset> [--sessions <id1,id2>] [--dataset <id> --dataset-version <n>] [--label <label>] [--provider <anthropic|openai> --model <name>]');
            const agentId = requireFlag(argv, stderr, '--agent', 'Usage: evals launch --suite <id> --agent <id> --mode <session|dataset> [--sessions <id1,id2>] [--dataset <id> --dataset-version <n>] [--label <label>] [--provider <anthropic|openai> --model <name>]');
            const mode = (getFlag(argv, '--mode') ?? 'session') as 'session' | 'dataset';
            const datasetId = getFlag(argv, '--dataset');
            const datasetVersion = getFlag(argv, '--dataset-version');
            const versionLabel = getFlag(argv, '--label');
            const sessionIds = parseCsvFlag(argv, '--sessions');
            const target = buildTarget(argv);

            const result = await client.evals.launch({
              mode,
              suite_id: suiteId,
              agent_id: agentId,
              version_label: versionLabel,
              ...(sessionIds ? { session_ids: sessionIds } : {}),
              ...(datasetId ? { dataset_id: datasetId, dataset_version: parseInt(datasetVersion ?? '1', 10) } : {}),
              ...(target ? { target } : {}),
            });
            stdout(`Run ${result.eval_run.id} created (status: ${result.eval_run.status})`);
            if (result.experiment_id) stdout(`Experiment: ${result.experiment_id}`);
            printJson(stdout, result);
            return 0;
          }
          case 'compare': {
            const suiteId = requireFlag(argv, stderr, '--suite', 'Usage: evals compare --suite <id> --run-a <id> --run-b <id>');
            const runA = requireFlag(argv, stderr, '--run-a', 'Usage: evals compare --suite <id> --run-a <id> --run-b <id>');
            const runB = requireFlag(argv, stderr, '--run-b', 'Usage: evals compare --suite <id> --run-a <id> --run-b <id>');
            const result = await client.evals.compare(suiteId, runA, runB);
            printJson(stdout, result);
            return 0;
          }
          case 'regressions': {
            const suiteId = getFlag(argv, '--suite');
            const agentId = getFlag(argv, '--agent');
            const runA = getFlag(argv, '--run-a');
            const runB = getFlag(argv, '--run-b');
            if (!suiteId && !(runA && runB)) {
              stderr('Usage: evals regressions --suite <id> [--agent <id>] [--run-a <id> --run-b <id>]');
              return 1;
            }
            const data = await client.evals.listRegressions({ suite_id: suiteId, agent_id: agentId, run_a: runA, run_b: runB });
            printTable(stdout, data as Array<Record<string, unknown>>, ['case_id', 'case_name', 'suite_id', 'a_passed', 'b_passed', 'delta']);
            return 0;
          }
          case 'lineage': {
            const suiteId = getFlag(argv, '--suite');
            const agentId = getFlag(argv, '--agent');
            const datasetId = getFlag(argv, '--dataset');
            const limit = getFlag(argv, '--limit');
            if (!suiteId && !agentId) {
              stderr('Usage: evals lineage --suite <id> [--agent <id>] [--dataset <id>] [--limit <n>]');
              return 1;
            }
            const data = await client.evals.getLineage({
              suite_id: suiteId,
              agent_id: agentId,
              dataset_id: datasetId,
              ...(limit ? { limit: parseInt(limit, 10) } : {}),
            });
            printTable(stdout, data as Array<Record<string, unknown>>, ['run_id', 'suite_name', 'version_label', 'status', 'pass_rate', 'created_at']);
            return 0;
          }
          default:
            stderr(`Unknown evals subcommand: ${subcommand}`);
            stderr('Available: list-suites, list-runs, get-run, rerun, launch, compare, regressions, lineage');
            return 1;
        }
      }
      case 'candidates': {
        if (!client) return 1;
        switch (subcommand) {
          case 'list': {
            const suiteId = getFlag(argv, '--suite');
            const type = getFlag(argv, '--type');
            const status = getFlag(argv, '--status');
            const limit = getFlag(argv, '--limit');
            const offset = getFlag(argv, '--offset');
            const data = await client.evals.listImprovementCandidates({
              suite_id: suiteId,
              type,
              status,
              ...(limit ? { limit: parseInt(limit, 10) } : {}),
              ...(offset ? { offset: parseInt(offset, 10) } : {}),
            });
            printTable(stdout, data as Array<Record<string, unknown>>, ['id', 'type', 'case_name', 'status', 'delta']);
            return 0;
          }
          case 'accept': {
            if (!positional) {
              stderr('Usage: candidates accept <id>');
              return 1;
            }
            await client.evals.updateImprovementCandidate(positional, { status: 'accepted' });
            stdout(`Candidate ${positional} accepted`);
            return 0;
          }
          case 'reject': {
            if (!positional) {
              stderr('Usage: candidates reject <id>');
              return 1;
            }
            await client.evals.updateImprovementCandidate(positional, { status: 'rejected' });
            stdout(`Candidate ${positional} rejected`);
            return 0;
          }
          default:
            stderr(`Unknown candidates subcommand: ${subcommand}`);
            stderr('Available: list, accept, reject');
            return 1;
        }
      }
      case 'datasets': {
        if (!client) return 1;
        switch (subcommand) {
          case 'list': {
            const agentId = getFlag(argv, '--agent');
            const data = await client.datasets.list(agentId ? { agent_id: agentId } : undefined);
            printTable(stdout, data as Array<Record<string, unknown>>, ['id', 'name', 'row_count', 'latest_published_version']);
            return 0;
          }
          default:
            stderr(`Unknown datasets subcommand: ${subcommand}`);
            stderr('Available: list');
            return 1;
        }
      }
      case 'scorers': {
        if (!client) return 1;
        switch (subcommand) {
          case 'list': {
            const data = await client.scorers.list();
            printTable(stdout, data as Array<Record<string, unknown>>, ['id', 'name', 'type']);
            return 0;
          }
          default:
            stderr(`Unknown scorers subcommand: ${subcommand}`);
            stderr('Available: list');
            return 1;
        }
      }
      case 'semantic-facts': {
        if (!client) return 1;
        switch (subcommand) {
          case 'list': {
            const sessionId = getFlag(argv, '--session');
            const kind = getFlag(argv, '--kind');
            const agentId = getFlag(argv, '--agent');
            const minConfidence = getFlag(argv, '--min-confidence');
            const limit = getFlag(argv, '--limit');
            const offset = getFlag(argv, '--offset');
            const data = await client.trace.getSemanticFacts({
              ...(sessionId ? { session_id: sessionId } : {}),
              ...(kind ? { kind } : {}),
              ...(agentId ? { agent_id: agentId } : {}),
              ...(minConfidence ? { min_confidence: Number(minConfidence) } : {}),
              ...(limit ? { limit: Number(limit) } : {}),
              ...(offset ? { offset: Number(offset) } : {}),
            });
            printJson(stdout, data);
            return 0;
          }
          case 'session': {
            if (!positional) {
              stderr('Usage: semantic-facts session <session-id>');
              return 1;
            }
            const data = await client.trace.getSessionSemanticFacts(positional);
            printJson(stdout, data);
            return 0;
          }
          case 'node': {
            if (!positional) {
              stderr('Usage: semantic-facts node <node-id>');
              return 1;
            }
            const data = await client.trace.getNodeSemanticFacts(positional);
            printJson(stdout, data);
            return 0;
          }
          case 'rebuild': {
            if (!positional) {
              stderr('Usage: semantic-facts rebuild <session-id>');
              return 1;
            }
            const data = await client.trace.rebuildSessionSemanticFacts(positional);
            printJson(stdout, data);
            return 0;
          }
          case 'aggregates': {
            const kind = getFlag(argv, '--kind');
            const agentId = getFlag(argv, '--agent');
            const minCount = getFlag(argv, '--min-count');
            const limit = getFlag(argv, '--limit');
            const offset = getFlag(argv, '--offset');
            const data = await client.trace.getSemanticFactAggregates({
              ...(kind ? { kind } : {}),
              ...(agentId ? { agent_id: agentId } : {}),
              ...(minCount ? { min_count: Number(minCount) } : {}),
              ...(limit ? { limit: Number(limit) } : {}),
              ...(offset ? { offset: Number(offset) } : {}),
            });
            printJson(stdout, data);
            return 0;
          }
          default:
            stderr(`Unknown semantic-facts subcommand: ${subcommand}`);
            stderr('Available: list, session, node, rebuild, aggregates');
            return 1;
        }
      }
      case 'ontology': {
        if (!client) return 1;
        switch (subcommand) {
          case 'list': {
            const kind = getFlag(argv, '--kind');
            const minScore = getFlag(argv, '--min-score');
            const entityType = getFlag(argv, '--entity-type');
            const limit = getFlag(argv, '--limit');
            const offset = getFlag(argv, '--offset');
            const data = await client.trace.getOntologyCandidates({
              ...(kind ? { kind } : {}),
              ...(minScore ? { min_score: Number(minScore) } : {}),
              ...(entityType ? { entity_type: entityType } : {}),
              ...(limit ? { limit: Number(limit) } : {}),
              ...(offset ? { offset: Number(offset) } : {}),
            });
            printJson(stdout, data);
            return 0;
          }
          case 'get': {
            if (!positional) {
              stderr('Usage: ontology get <id>');
              return 1;
            }
            const data = await client.trace.getOntologyCandidate(positional);
            printJson(stdout, data);
            return 0;
          }
          case 'mine': {
            const data = await client.trace.mineOntologyCandidates();
            printJson(stdout, data);
            return 0;
          }
          default:
            stderr(`Unknown ontology subcommand: ${subcommand}`);
            stderr('Available: list, get, mine');
            return 1;
        }
      }
      case 'help':
      case undefined:
        stdout(helpText());
        return 0;
      default:
        stdout(helpText());
        return 1;
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'CLI_USAGE') return 1;
    stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await client?.shutdown();
  }
}
