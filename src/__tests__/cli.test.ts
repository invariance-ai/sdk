import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../cli/app.js';

function createStubClient() {
  return {
    evals: {
      listSuites: vi.fn().mockResolvedValue([
        { id: 'suite-1', name: 'Suite A', case_count: 3, latest_pass_rate: 0.9 },
      ]),
      listRuns: vi.fn().mockResolvedValue([
        { id: 'run-1', suite_id: 'suite-1', status: 'completed', pass_rate: 1, version_label: 'v1', created_at: '2026-01-01' },
      ]),
      getRun: vi.fn().mockResolvedValue({ id: 'run-1', status: 'completed', results: [] }),
      rerun: vi.fn().mockResolvedValue({ id: 'run-2', status: 'completed' }),
      launch: vi.fn().mockResolvedValue({ eval_run: { id: 'run-1', status: 'completed' }, experiment_id: 'exp-1', replay_continuation: null }),
      launchReplay: vi.fn().mockResolvedValue({
        eval_run: { id: 'run-3', status: 'completed', replay_session_id: 'replay-sess-1' },
        experiment_id: null,
        replay_continuation: {
          execution_mode: 'fully_continued',
          continuation_node_count: 5,
          continuation_error: null,
        },
      }),
      compare: vi.fn().mockResolvedValue({ per_case: [], regressions: 0, improvements: 0 }),
      listRegressions: vi.fn().mockResolvedValue([]),
      getLineage: vi.fn().mockResolvedValue([
        { run_id: 'run-1', suite_name: 'Suite A', version_label: 'v1', status: 'completed', pass_rate: 1, created_at: '2026-01-01' },
      ]),
      listImprovementCandidates: vi.fn().mockResolvedValue([
        { id: 'cand-1', type: 'regression', case_name: 'Test', status: 'pending', delta: -0.5 },
      ]),
      updateImprovementCandidate: vi.fn().mockResolvedValue({ id: 'cand-1', status: 'accepted' }),
    },
    datasets: { list: vi.fn().mockResolvedValue([{ id: 'ds-1', name: 'DS', row_count: 10, latest_published_version: 1 }]) },
    scorers: { list: vi.fn().mockResolvedValue([{ id: 'sc-1', name: 'Quality', type: 'llm' }]) },
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

type StubClient = ReturnType<typeof createStubClient>;

function makeDeps(client: StubClient) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    deps: {
      env: { INVARIANCE_API_KEY: 'inv_test', INVARIANCE_API_URL: 'https://api.example.com' } as NodeJS.ProcessEnv,
      stdout: (line: string) => { stdout.push(line); },
      stderr: (line: string) => { stderr.push(line); },
      createClient: () => client,
    },
    stdout,
    stderr,
  };
}

// ── Missing API key ──────────────────────────────────────────────

describe('CLI auth', () => {
  it('errors when INVARIANCE_API_KEY is missing', async () => {
    const { stderr } = { stderr: [] as string[] };
    const exitCode = await runCli(['evals', 'list-suites'], {
      env: {} as NodeJS.ProcessEnv,
      stdout: () => {},
      stderr: (line: string) => { stderr.push(line); },
      createClient: () => createStubClient(),
    });
    expect(exitCode).toBe(1);
    expect(stderr[0]).toContain('INVARIANCE_API_KEY');
  });

  it('shows help without error when no command given', async () => {
    const stdout: string[] = [];
    const exitCode = await runCli([], {
      env: {} as NodeJS.ProcessEnv,
      stdout: (line: string) => { stdout.push(line); },
      stderr: () => {},
      createClient: () => createStubClient(),
    });
    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Invariance CLI');
  });
});

// ── Evals commands ───────────────────────────────────────────────

describe('CLI evals', () => {
  it('list-suites calls listSuites and prints table', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli(['evals', 'list-suites'], deps);
    expect(exitCode).toBe(0);
    expect(client.evals.listSuites).toHaveBeenCalled();
    expect(stdout.join('\n')).toContain('suite-1');
  });

  it('list-suites passes --agent filter', async () => {
    const client = createStubClient();
    const { deps } = makeDeps(client);
    await runCli(['evals', 'list-suites', '--agent', 'agent-1'], deps);
    expect(client.evals.listSuites).toHaveBeenCalledWith({ agent_id: 'agent-1' });
  });

  it('list-runs calls listRuns with filters', async () => {
    const client = createStubClient();
    const { deps } = makeDeps(client);
    await runCli(['evals', 'list-runs', '--suite', 's1', '--agent', 'a1', '--status', 'completed'], deps);
    expect(client.evals.listRuns).toHaveBeenCalledWith({ suite_id: 's1', agent_id: 'a1', status: 'completed' });
  });

  it('get-run prints JSON for a run', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli(['evals', 'get-run', 'run-1'], deps);
    expect(exitCode).toBe(0);
    expect(client.evals.getRun).toHaveBeenCalledWith('run-1');
    expect(stdout.join('\n')).toContain('run-1');
  });

  it('get-run errors without run id', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['evals', 'get-run'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
  });

  it('rerun calls evals.rerun and prints the rerun', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli(['evals', 'rerun', 'run-1'], deps);
    expect(exitCode).toBe(0);
    expect(client.evals.rerun).toHaveBeenCalledWith('run-1');
    expect(stdout[0]).toContain('Run run-2 created');
  });

  it('rerun errors without run id', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['evals', 'rerun'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
  });

  it('launch passes session ids and provider targeting', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);

    const exitCode = await runCli([
      'evals', 'launch',
      '--suite', 'suite-1', '--agent', 'agent-1',
      '--sessions', 'sess-1,sess-2',
      '--provider', 'openai', '--model', 'gpt-4o-mini',
      '--api-key-env', 'BRAINTRUST_OPENAI_KEY',
      '--base-url-env', 'BRAINTRUST_OPENAI_BASE_URL',
      '--label', 'replay-baseline',
    ], deps);

    expect(exitCode).toBe(0);
    expect(client.evals.launch).toHaveBeenCalledWith({
      mode: 'session',
      suite_id: 'suite-1',
      agent_id: 'agent-1',
      version_label: 'replay-baseline',
      session_ids: ['sess-1', 'sess-2'],
      target: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        api_key_env: 'BRAINTRUST_OPENAI_KEY',
        base_url_env: 'BRAINTRUST_OPENAI_BASE_URL',
      },
    });
    expect(stdout[0]).toContain('Run run-1 created');
  });

  it('launch in dataset mode passes dataset params', async () => {
    const client = createStubClient();
    const { deps } = makeDeps(client);

    await runCli([
      'evals', 'launch',
      '--suite', 'suite-1', '--agent', 'agent-1',
      '--mode', 'dataset', '--dataset', 'ds-1', '--dataset-version', '3',
    ], deps);

    expect(client.evals.launch).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'dataset',
      dataset_id: 'ds-1',
      dataset_version: 3,
    }));
  });

  it('launch fails fast with partial provider target', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(
      ['evals', 'launch', '--suite', 's1', '--agent', 'a1', '--provider', 'openai'],
      deps,
    );
    expect(exitCode).toBe(1);
    expect(client.evals.launch).not.toHaveBeenCalled();
    expect(stderr.at(-1)).toContain('--provider and --model');
  });

  it('launch errors without required --suite flag', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['evals', 'launch', '--agent', 'a1'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
  });

  // ── Replay launch ───────────────────────────────────────────────

  it('replay-launch calls launchReplay with source session and node', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);

    const exitCode = await runCli([
      'evals', 'replay-launch',
      '--suite', 'suite-1', '--agent', 'agent-1',
      '--source-session', 'sess-orig', '--source-node', 'node-42',
      '--label', 'prompt-tweak',
    ], deps);

    expect(exitCode).toBe(0);
    expect(client.evals.launchReplay).toHaveBeenCalledWith({
      suite_id: 'suite-1',
      agent_id: 'agent-1',
      source_session_id: 'sess-orig',
      source_node_id: 'node-42',
      version_label: 'prompt-tweak',
    });
    expect(stdout[0]).toContain('Run run-3 created');
    expect(stdout.join('\n')).toContain('Replay session: replay-sess-1');
    expect(stdout.join('\n')).toContain('Execution mode: fully_continued');
  });

  it('replay-launch passes override config flags', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);

    const exitCode = await runCli([
      'evals', 'replay-launch',
      '--suite', 'suite-1', '--agent', 'agent-1',
      '--source-session', 'sess-orig', '--source-node', 'node-42',
      '--prompt', 'Be more concise', '--model', 'claude-sonnet-4-6', '--provider', 'anthropic',
    ], deps);

    expect(exitCode).toBe(0);
    expect(client.evals.launchReplay).toHaveBeenCalledWith({
      suite_id: 'suite-1',
      agent_id: 'agent-1',
      source_session_id: 'sess-orig',
      source_node_id: 'node-42',
      override_config: {
        prompt: 'Be more concise',
        model: 'claude-sonnet-4-6',
        provider: 'anthropic',
      },
    });
  });

  it('replay-launch prints continuation results', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);

    await runCli([
      'evals', 'replay-launch',
      '--suite', 'suite-1', '--agent', 'agent-1',
      '--source-session', 'sess-orig', '--source-node', 'node-42',
    ], deps);

    const output = stdout.join('\n');
    expect(output).toContain('Replay session: replay-sess-1');
    expect(output).toContain('Execution mode: fully_continued');
    expect(output).toContain('Continuation nodes: 5');
  });

  it('replay-launch errors without --source-session', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli([
      'evals', 'replay-launch',
      '--suite', 'suite-1', '--agent', 'agent-1',
      '--source-node', 'node-42',
    ], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
    expect(client.evals.launchReplay).not.toHaveBeenCalled();
  });

  it('replay-launch errors without --source-node', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli([
      'evals', 'replay-launch',
      '--suite', 'suite-1', '--agent', 'agent-1',
      '--source-session', 'sess-orig',
    ], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
    expect(client.evals.launchReplay).not.toHaveBeenCalled();
  });

  it('replay-launch errors without --suite', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli([
      'evals', 'replay-launch',
      '--agent', 'agent-1',
      '--source-session', 'sess-orig', '--source-node', 'node-42',
    ], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
  });

  it('compare calls compare with suite, run_a, run_b', async () => {
    const client = createStubClient();
    const { deps } = makeDeps(client);
    const exitCode = await runCli([
      'evals', 'compare', '--suite', 's1', '--run-a', 'ra', '--run-b', 'rb',
    ], deps);
    expect(exitCode).toBe(0);
    expect(client.evals.compare).toHaveBeenCalledWith('s1', 'ra', 'rb');
  });

  it('regressions calls listRegressions with suite and agent', async () => {
    const client = createStubClient();
    const { deps } = makeDeps(client);
    await runCli(['evals', 'regressions', '--suite', 's1', '--agent', 'a1'], deps);
    expect(client.evals.listRegressions).toHaveBeenCalledWith(
      expect.objectContaining({ suite_id: 's1', agent_id: 'a1' }),
    );
  });

  it('regressions with explicit run ids', async () => {
    const client = createStubClient();
    const { deps } = makeDeps(client);
    await runCli(['evals', 'regressions', '--run-a', 'ra', '--run-b', 'rb'], deps);
    expect(client.evals.listRegressions).toHaveBeenCalledWith(
      expect.objectContaining({ run_a: 'ra', run_b: 'rb' }),
    );
  });

  it('regressions errors without suite or run ids', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['evals', 'regressions'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
  });

  it('lineage calls getLineage with params', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli([
      'evals', 'lineage', '--suite', 's1', '--agent', 'a1', '--dataset', 'ds-1', '--limit', '10',
    ], deps);
    expect(exitCode).toBe(0);
    expect(client.evals.getLineage).toHaveBeenCalledWith({
      suite_id: 's1',
      agent_id: 'a1',
      dataset_id: 'ds-1',
      limit: 10,
    });
    expect(stdout.join('\n')).toContain('Suite A');
  });

  it('lineage errors without suite or agent', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['evals', 'lineage'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
  });

  it('unknown evals subcommand returns error', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['evals', 'bogus'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Unknown evals subcommand');
  });
});

// ── Candidates commands ──────────────────────────────────────────

describe('CLI candidates', () => {
  it('list calls listImprovementCandidates with filters', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli([
      'candidates', 'list', '--suite', 's1', '--type', 'regression', '--status', 'pending', '--limit', '5', '--offset', '10',
    ], deps);
    expect(exitCode).toBe(0);
    expect(client.evals.listImprovementCandidates).toHaveBeenCalledWith({
      suite_id: 's1',
      type: 'regression',
      status: 'pending',
      limit: 5,
      offset: 10,
    });
    expect(stdout.join('\n')).toContain('cand-1');
  });

  it('accept updates candidate status', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli(['candidates', 'accept', 'cand-1'], deps);
    expect(exitCode).toBe(0);
    expect(client.evals.updateImprovementCandidate).toHaveBeenCalledWith('cand-1', { status: 'accepted' });
    expect(stdout[0]).toContain('accepted');
  });

  it('reject updates candidate status', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli(['candidates', 'reject', 'cand-1'], deps);
    expect(exitCode).toBe(0);
    expect(client.evals.updateImprovementCandidate).toHaveBeenCalledWith('cand-1', { status: 'rejected' });
    expect(stdout[0]).toContain('rejected');
  });

  it('accept errors without id', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['candidates', 'accept'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage');
  });

  it('unknown candidates subcommand returns error', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['candidates', 'bogus'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Unknown candidates subcommand');
  });
});

// ── Datasets & Scorers commands ──────────────────────────────────

describe('CLI datasets', () => {
  it('list calls datasets.list', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli(['datasets', 'list'], deps);
    expect(exitCode).toBe(0);
    expect(client.datasets.list).toHaveBeenCalled();
    expect(stdout.join('\n')).toContain('ds-1');
  });

  it('list passes --agent filter', async () => {
    const client = createStubClient();
    const { deps } = makeDeps(client);
    await runCli(['datasets', 'list', '--agent', 'a1'], deps);
    expect(client.datasets.list).toHaveBeenCalledWith({ agent_id: 'a1' });
  });

  it('unknown datasets subcommand returns error', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['datasets', 'bogus'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Unknown datasets subcommand');
  });
});

describe('CLI scorers', () => {
  it('list calls scorers.list', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli(['scorers', 'list'], deps);
    expect(exitCode).toBe(0);
    expect(client.scorers.list).toHaveBeenCalled();
    expect(stdout.join('\n')).toContain('Quality');
  });

  it('unknown scorers subcommand returns error', async () => {
    const client = createStubClient();
    const { deps, stderr } = makeDeps(client);
    const exitCode = await runCli(['scorers', 'bogus'], deps);
    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Unknown scorers subcommand');
  });
});

// ── Unknown top-level command ────────────────────────────────────

describe('CLI unknown command', () => {
  it('shows help and exits 1 for unknown command', async () => {
    const client = createStubClient();
    const { deps, stdout } = makeDeps(client);
    const exitCode = await runCli(['bogus'], deps);
    expect(exitCode).toBe(1);
    expect(stdout.join('\n')).toContain('Invariance CLI');
  });
});
