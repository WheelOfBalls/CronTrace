# Initial GitHub issue drafts

These **eight drafts have not been posted**. D01–D08 are local identifiers, not GitHub issue numbers. No assignees, contributors, acceptance or completed work are implied. Labels/milestones are proposed only. Each file can become one issue after direction review.

| Draft | Scope | Suggested milestone | Dependencies |
| --- | --- | --- | --- |
| [D01](01-validate-need.md) | Validate the local evidence-audit need and upstream fit | M0 | None |
| [D02](02-evidence-contract.md) | Specify and validate evidence/policy schema | M2 | None; coordinate contract with D03 |
| [D03](03-offline-reconciler.md) | Build the offline conservative reconciler | M1 | Minimal in-memory contract defined within this task |
| [D04](04-utc-schedules.md) | Extract and enumerate the supported UTC subset | M2 | D03 input contract |
| [D05](05-readonly-collector.md) | Implement bounded read-only GitHub collection | M3 | D02; positive validation gate |
| [D06](06-reports.md) | Deterministic reports and careful metrics | M4 | D02, D03 |
| [D07](07-cli.md) | Integrate CLI commands and exit semantics | M4 | D04, D05, D06 |
| [D08](08-release-readiness.md) | Verify privacy/replay boundaries and pilot usefulness | M4 | D07 |

Independently scoped does not mean dependency-free: each draft has its own deliverable, acceptance criteria and exclusions. D01 can run alongside the first small technical milestone. No work beyond M1 should be assumed approved by these drafts.
