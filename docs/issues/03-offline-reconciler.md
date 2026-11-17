# D03 — Build the offline conservative opportunity/run reconciler

Status: draft. Suggested labels: `core`, `correctness`. Milestone: M1. Estimate: 10–16 hours. Dependencies: none beyond defining its small typed input contract. **Recommended first implementation task.**

## Problem

Nearest-slot assignment can turn a delayed run into an apparent earlier miss. Counting reruns or manual dispatches can hide gaps. The core must preserve uncertainty before API or CLI work starts.

## Deliverable

A pure function accepting pre-enumerated UTC opportunities, normalized run observations, coverage/eligibility evidence, frozen observation time, tolerance and attribution horizon. Return deterministic JSON-compatible outcomes, candidate IDs and reason codes. Include minimal TypeScript/test setup and synthetic fixtures, explicitly labeled as synthetic.

## Acceptance criteria

- Implement the classification and conservative isolated-component rules in ARCHITECTURE.md.
- Test within-tolerance/late, open horizon, elapsed horizon without a record, incomplete history/API coverage, unknown eligibility, competing slots, unexplained runs and boundary context.
- A `workflow_dispatch` never fills a scheduled opportunity; reruns share one run identity; a failed/cancelled scheduled record still establishes existence.
- Test a run beyond the target end and a pre-window competing opportunity.
- Every run is assigned at most once, input order is irrelevant, and loss of evidence cannot increase confidence.
- Expected outputs are independently specified. Demonstrate that a deliberately incorrect nearest-slot variant fails the ambiguity case.
- No network, token, system clock, YAML parsing or workflow execution is needed to run the tests.

## Out of scope

Cron parsing, GitHub collection, a user-facing CLI, package publication, dashboard, notifications and the complete MVP. Stop for design/usability review when these tests pass.
