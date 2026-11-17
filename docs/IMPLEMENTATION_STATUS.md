# Implementation status

Updated: 2026-11-17. This file is the resumable engineering record.

## Overarching objective

Deliver a focused, working open-source CronTrace CLI: read-only GitHub evidence collection, conservative schedule reconciliation, local evidence storage, offline text/JSON reports, tested installation, and release preparation. Keep evidence uncertainty explicit. No package publication, paid infrastructure, unsolicited outreach, or merge into main without owner approval.

The user's full-product instruction supersedes the earlier M1-only scope. Existing research/history is retained from `docs/initial-research-and-architecture` (54387a5). Main still contains only the initialization commit; development is isolated in `/workspace/work/crontrace-m1`.

## Verified work

- M1 in-memory TypeScript reconciler implemented locally: conservative candidate components, rerun normalization, conditional timing, unknown/pending/excluded outcomes, bounded evidence assertions, and deterministic output.
- `npm run check`: 53/53 synthetic tests pass; TypeScript passes on Node 24.22.1. Tests include a deliberately broken nearest-slot matcher rejected by the independent expected outcome.
- No collector, schedule parser, evidence persistence, CLI, installed product, production build or independent implementation review completed yet.

## Current decisions

- TypeScript/Node 24, built-in test runner, no runtime dependencies in the core.
- Supported first-release schedules: one five-field UTC entry; named zones/multiple entries explicitly unsupported, not silently treated as UTC.
- Keep current-definition historical assertions visible; current metadata cannot reconstruct enablement/default-branch/schedule history.
- Use a versioned JSON evidence file with canonical SHA-256 digest, plus a separately reviewed policy file. Checksums prove integrity, not provenance/authenticity.
- All implementation stays on a feature branch. Final PR includes the planning history against main; do not merge PR #1 automatically.

## Remaining milestones (in order)

1. Complete schedule enumeration and evidence validation/persistence.
2. Implement bounded GET-only collector with explicit partial coverage and credential-safe errors.
3. Integrate collect/audit CLI and deterministic text/JSON reporting.
4. Add end-to-end installation/replay tests and a reproducible synthetic example; perform bounded read-only public-data smoke check if access permits.
5. Independent correctness/security/usability reviews, fixes and complete verification.
6. Update documentation, security/contribution guidance, CI, release artifacts and final PR.

## Known limitations

Current passing tests validate synthetic invariants only. Historical eligibility/availability and context completeness are caller assertions. A finite horizon cannot prove a scheduler miss. Conservative components can yield many unknown/ambiguous rows at high frequencies. Demand and adoption remain unvalidated.

## Precise next action

Preserve the verified core on a full-product feature branch; define the evidence/collector integration contract, then implement schedule enumeration, persistence and collector in isolated module tasks. Re-run `npm run check` after integration. Update this file after each significant milestone and before ending a session.
