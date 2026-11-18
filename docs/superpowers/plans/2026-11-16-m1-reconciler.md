# M1 Offline Reconciler Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with test-driven development and a fresh whole-branch review. The user has authorized implementation and a feature PR; no additional design gate is needed.

**Goal:** Reconcile pre-enumerated opportunities and supplied run observations without inventing event identity or completeness.

**Architecture:** A typed in-memory contract, run normalization, and a pure conservative graph reconciler. No I/O in production code. Assertions about coverage and history remain explicit inputs and are echoed in the output.

**Tech stack:** Node 24, TypeScript, built-in node:test; development-only type dependencies, no runtime dependencies.

**Spec:** [D03](../../issues/03-offline-reconciler.md), [architecture](../../ARCHITECTURE.md), [M1 roadmap](../../ROADMAP.md).

## Global constraints

- M1 only: no collector, CLI, cron/YAML parser, bundle schema, dashboard, publishing or deployment.
- UTC epoch milliseconds are the normalized timestamp contract; no date parsing or clock reads.
- A match requires an isolated one-opportunity/one-run component under a finite explicit horizon.
- All test evidence is synthetic; no tests require accounts, tokens or network access.
- Source branch is the planning branch while PR #1 remains open; no automatic merges.

## Review focus

- Conflicting duplicate run observations must not depend on input order or hide a schedule event.
- Missing context at either boundary must not turn a component into an apparently isolated match.
- Unsupported/missing definition evidence must not let an incompatible run become a confident gap.
- A queued run or unavailable original attempt start must not become zero-lag evidence.
- Mutable attempt outcomes fetched after the creation cutoff must not alter event identity.

## Task 1 — Reconciler and adversarial tests

Files: `package.json`, lockfile, `tsconfig.json`, `src/domain.ts`, `src/normalize.ts`, `src/reconcile.ts`, `test/fixtures.ts`, `test/reconcile.test.ts`.

Interface: `reconcile(input: ReconcileInput): ReconcileResult`. One selected repository/workflow; opportunity IDs, definition IDs and explicit timestamps; repeated run observations keyed by repository/run ID; evidence intervals for traversal, historical availability, definition, eligibility and context. Output contains target rows, normalized selected schedule runs, unmatched IDs, reasons and echoed assertions.

- [ ] Write hand-derived cases for isolated within-tolerance/late matches, horizon equality/pending, ambiguous delayed runs, reruns, manual events, execution failures, missing evidence, pre/post-window competitors and definition conflict.
- [ ] Run `npm test` against the empty behavior stub; confirm behavioral assertion failures.
- [ ] Implement normalization and bounded graph matching; preserve unknown/excluded context nodes, use finite resource guards, retain original/latest attempt outcomes separately.
- [ ] Run `npm run check`; correct behavior to satisfy the independently specified cases.
- [ ] Add deterministic permutations, evidence-degradation, unsafe-input and resource-limit checks before implementing the corresponding guard behavior.
- [ ] Prove that a deliberately wrong nearest-slot implementation fails the ambiguity assertion.

## Task 2 — Review, documentation, and feature PR

Files: README, CONTRIBUTING, roadmap/status introductions, `docs/M1.md`.

- [ ] Describe exactly the implemented in-memory interface, evidence boundary contract, limitations and commands.
- [ ] Request a fresh code review; reproduce important findings with a failing test before fixing them.
- [ ] Run full `npm run check` and an offline restricted-permission test run; inspect results critically.
- [ ] Commit on `feat/m1-offline-reconciler`, publish that branch and open a PR against the planning branch. Do not merge.

## Implementation decisions

This is an experimental typed API, not the M2 versioned bundle validator. Coverage assertions use closed intervals; the report target is half-open. Caller-supplied context assertions must attest that all opportunity nodes in their bounds are supplied. The core cannot verify an intentionally false assertion. For ambiguous components, require evidence over the component's full horizon envelope; missing context remains unknown instead of resolving a truncated graph. Malformed inputs/resource overruns throw rather than return partial confident rows.
