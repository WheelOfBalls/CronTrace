# Implementation status

Updated: 2026-11-17. Resumable engineering record; no background work is implied.

## Objective

Deliver a focused, working open-source CLI for read-only GitHub evidence collection, conservative historical schedule audits, offline replay and reproducible reports. Complete release preparation on a feature branch and open a reviewable PR. Do not publish a package or merge without owner approval. The full-product instruction supersedes earlier M1-only scope.

## Completed and verified

- Planning history retained from `docs/initial-research-and-architecture` (54387a5); isolated branch `feat/crontrace-cli`.
- M1 reconciler committed at be788e4: conservative candidate components, rerun normalization, boundary context, evidence assertions, deterministic classifications and adversarial tests.
- Single-entry UTC schedule extraction/enumeration; explicit unsupported forms.
- Schema-v1 checksummed evidence, policy validation, bounded private/exclusive file I/O.
- Bounded GitHub.com GET collector, pagination/partitioning, two-pass stability check, partial coverage, attempt-one recovery and safe authentication.
- Pure offline audit, text/canonical JSON reports, conditional lag summaries and coverage.
- CLI collect/audit/policy/help/version, input validation, exit codes and false-default assertion templates.
- Latest module run: 102/102 tests and TypeScript passed. ESLint and production compilation passed separately. Installed-package E2E verification is in progress.
- Independent core and integrated reviews found and prompted fixes for conflicting original-start observations, false completeness with insufficient assertions, text output expansion, escaped credential leakage, and collection-wide rate-limit stopping. Regression tests added.

## Decisions

Node 24, TypeScript ESM, built-in test runner/fetch/crypto, pinned yaml and cron-parser adapters. Single JSON bundle, not a directory/archive. Current pinned YAML is an explicitly conditional historical definition; the collector cannot establish historical retention, enablement or default-branch history. Policies start with all flags false. A finite attribution horizon never proves a missed event. Reject unsupported zones/multiple cron entries. No telemetry or service.

## Remaining work

1. Finish installation/E2E verification and fix any failures.
2. Rewrite planning-era user docs to actual behavior; CI, security/contribution guidance and release checklist.
3. Bounded public-data smoke collection and deterministic replay, if GitHub access permits.
4. Final independent security/usability review; fix material findings and rerun full verification.
5. Commit, push feature branch, open final PR against main. Keep publication/merge manual.

## Known limits

Named zones/DST and multiple schedules are rejected. Historical epochs are not reconstructed. Retention/deletion and extreme delays remain uncertain. High-frequency schedules can be mostly ambiguous/unknown. Two traversals do not create an atomic historical snapshot. Checksums are integrity checks, not signatures. Filesystem protections do not eliminate parent-directory replacement races; use a trusted local directory. No live private-repository validation or external user/adoption validation yet.

## Precise next action

Read `/workspace/work/product-verify.log` for the running verification result, then complete public documentation/CI and a read-only live smoke test. Run `npm run verify`, `npm audit`, independent final reviews, preserve changes with commits and open the PR. Update this file at the next milestone and before ending.
