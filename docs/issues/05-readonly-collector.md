# D05 — Collect bounded GitHub run evidence with explicit coverage

Status: draft. Suggested labels: `github-api`, `security`, `correctness`. Milestone: M3. Estimate: 14–24 hours. Dependencies: D02 and positive product-validation gate.

## Problem

First-page reads, filtered-result caps, mutable history and access failures can appear as missing executions unless collection preserves its limits.

## Deliverable

A GET-only collector for one selected workflow, pinned definition and scheduled run metadata, producing the D02 bundle. Use time partitions, pagination, bounded retries/budgets and original-attempt retrieval where required.

## Acceptance criteria

- Filter `event=schedule`, include all conclusions, deduplicate by run ID and preserve attempt distinctions.
- Test 0/100/1,000+ results, inclusive query boundaries, repeated pages, saturated timestamps and collection mutation.
- Include pre/post-window context; insufficient context is explicit.
- 401/403/404/429/5xx, rate exhaustion and interrupted collection never become zero-run evidence.
- Current workflow state and pinned content have observation provenance; they do not establish historical eligibility. The first collector only supports asserted intervals matching that pinned definition.
- Treat the frozen cutoff as creation-time eligibility; retain per-record fetch times and successive mutable observations. Conflicting invariant fields yield unknown evidence; do not claim an atomic historical snapshot.
- Assert allowed GET routes/host only, reject credential-bearing foreign redirects, and prove tokens are absent from stored outputs and errors.
- Save partial evidence with coverage reasons and correct status; do not declare inaccessible older records complete.

## Out of scope

Workflow writes/dispatch, job logs, administration permission, hidden credential helpers, automatic schedule epochs, organizational scanning or paid infrastructure.
