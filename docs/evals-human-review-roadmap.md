# Evals Human Review Roadmap

This PR brings the SDK and CLI up to the minimum company-usable human-review loop for evals.

## In Scope

- annotation queue list and inspect commands
- claim and release review items
- submit human judgments with explicit decision handling
- queue stats and SDK resource coverage
- tighter CLI validation for reviewer inputs

## Acceptance Bar

- SDK exposes annotation queue operations under a first-class namespace
- CLI can inspect, claim, release, and submit judgments for eval-backed review items
- invalid review decisions and invalid score ranges fail before an API request is made
- wire-contract tests cover the new human-review endpoints

## Next Follow-Ups

- bulk review commands
- richer reviewer filtering and assignment controls
- exportable queue reports for operations teams
- CI helpers that wait on human-review-complete conditions
