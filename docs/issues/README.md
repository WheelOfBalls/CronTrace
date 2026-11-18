# Local issue drafts

These are **drafts, not posted GitHub issues**. D01–D08 were initial planning tasks; their original acceptance criteria remain as historical design context, not current claims of incomplete implementation. The full-product instruction superseded the earlier M1-only scope.

| Initial draft | Current disposition |
| --- | --- |
| [D01](01-validate-need.md) | Demand validation and upstream-fit study remain open; no outreach performed |
| [D02](02-evidence-contract.md) | Schema-v1 JSON bundle/policy implemented; architecture simplified from proposed directory format |
| [D03](03-offline-reconciler.md) | Implemented and adversarially tested |
| [D04](04-utc-schedules.md) | Single UTC subset implemented and tested |
| [D05](05-readonly-collector.md) | Bounded collector implemented; no full request-level provenance transcript |
| [D06](06-reports.md) | Text/JSON and qualified summaries implemented |
| [D07](07-cli.md) | collect/audit/policy and install tests implemented |
| [D08](08-release-readiness.md) | Engineering review/release preparation implemented; external pilot/publication remain open |

## Remaining independently scoped drafts

### D09 — External incident walkthrough

Recruit only with maintainer authorization. Ask one unfamiliar developer to install from an approved ref and audit a real stable interval. Record points of confusion, assertion evidence, and whether the report changes an investigation. Acceptance: permission-safe notes and a go/pivot judgment, not a testimonial or adoption metric. No feature expansion required.

### D10 — Additional platform and private-access validation

Test documented installation/file behavior on macOS and Windows, plus one authorized private repository with a read-only token. Acceptance: explicit platform results, sanitized permitted fixtures or reproducible manual steps, and fixes for concrete failures. Do not imply cross-platform support until verified; never commit tokens/private YAML.

### D11 — Multi-schedule feasibility fixtures

Write independent expected outcomes for overlapping cron entries, identical opportunities and delayed records lacking original cron identifiers. Acceptance: a reviewed conservative specification and go/no-go decision before implementation. Do not select nearest entries to manufacture certainty.

### D12 — Named-zone conformance study

Compare authoritative GitHub semantics with spring-gap/fall-fold fixtures and timezone-data versioning. Acceptance: source-backed uncertainty rules and an adapter test proposal; unsupported zones stay rejected until proven. No hosted experiment or synthetic GitHub activity required.

### D13 — Request provenance and schema evolution

Evaluate whether users need per-partition query/status/stability records beyond the existing coverage/count/diagnostics. Acceptance: minimal privacy-safe schema proposal, migration fixtures and explicit compatibility/version rules. Do not store raw headers, tokens or response bodies.

### D14 — Compact ambiguous-component presentation

Using synthetic dense graphs, design a bounded text representation that preserves every uncertainty reason while avoiding repeated candidate URLs. Acceptance: reviewed output, accessibility/readability check and tests proving no conclusion changes. Keep machine-readable evidence reproducible; no dashboard.

### D15 — Remove the unpatched lint-tooling advisory

Track picomatch GHSA-fc5q-39xc-vjpf and supported typescript-eslint dependency updates. Acceptance: a compatible supported toolchain with the underlying advisory resolved, full verification passing and an updated dependency review record. Do not downgrade to unsupported tooling, suppress the finding, or claim runtime exposure where the dependency is development-only.
