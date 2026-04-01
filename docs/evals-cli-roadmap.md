# Evals CLI Roadmap

This document tracks the roadmap used for the current eval-related SDK and CLI PR work in `invariance-sdk`.

## Scope

This roadmap is focused on SDK and CLI support for the eval framework:

- eval launch
- run inspection
- regressions and lineage
- improvement candidates
- provider targeting
- rerun support

Out of scope for this pass:

- monitor commands
- unrelated transport cleanup
- worktree metadata and local dev artifacts

## Goals For This PR

1. Make the SDK expose the core eval orchestration features already present in the backend.
2. Make the CLI reliable enough for engineering and QA operators to inspect and launch eval workflows.
3. Ensure the SDK/CLI contract reflects real backend eval capabilities, not a partial subset.
4. Add tests that lock down the wire contract and CLI argument handling.

## What This PR Completes

### SDK Resource Surface

- launch eval runs
- inspect eval runs
- compare runs
- list regressions
- list lineage
- list and update improvement candidates
- rerun existing eval runs

### CLI Surface

- `evals list-suites`
- `evals list-runs`
- `evals get-run`
- `evals rerun`
- `evals launch`
- `evals compare`
- `evals regressions`
- `evals lineage`
- `candidates list|accept|reject`
- `datasets list`
- `scorers list`

### Provider Target Support

The CLI now supports:

- `--provider`
- `--model`
- `--api-key-env`
- `--base-url-env`
- `--sessions`

This keeps the CLI aligned with backend eval launch semantics for agentic/replay-oriented session selection and provider-target routing.

## Remaining Work After This PR

These items are the next steps for a fully comprehensive company-ready CLI.

### Missing Lifecycle Operations

- suite CRUD commands
- case CRUD commands
- thresholds commands
- improvement-candidate generation commands
- richer experiment / dataset orchestration commands

### Human Judging Operations

- annotation queue listing
- claiming review work
- submitting human scores
- resolving pending-human eval results from the CLI

### CI / Automation Hardening

- machine-readable output mode
- explicit exit-code semantics for pass/fail thresholds
- report export commands
- filtering helpers for large eval fleets

## Exit Criteria Used For This PR

- SDK eval resource tests pass
- CLI eval tests pass
- SDK typecheck passes
- rerun is supported as a first-class SDK and CLI operation
- provider-target flags are validated and serialized correctly
