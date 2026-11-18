# Implementation status

Updated: 2026-11-18. Resumable engineering record; no background work is implied.

## Overarching objective

Deliver the full focused CronTrace CLI: read-only GitHub collection, conservative schedule analysis, offline evidence replay, reproducible reports, tests/reviews/documentation and release preparation. Preserve explicit uncertainty. Work on a feature branch and open a final PR; do not merge or publish without owner approval. The owner's full-product instruction superseded M1-only scope.

## Completed functionality

- Planning history preserved from `docs/initial-research-and-architecture` (54387a5); implementation on `feat/crontrace-cli`.
- M1 core committed at be788e4; integrated product at ebb691a; subsequent review fixes/documentation are recorded in later commits.
- Validated internal contracts, run/rerun normalization, conservative candidate components, boundary context, conditional timing and unknown/pending/ambiguous/gap outcomes.
- Single five-field UTC schedule adapter with conformance/resource tests and explicit unsupported cases.
- Schema-v1 checksummed JSON evidence and separate false-default historical policy templates, strict bounded file validation/private exclusive output.
- Fixed-host GET collector with pinned YAML, event filtering, pagination/second partitioning, two-pass stability checks, partial coverage, bounded retries/rate stops and original-attempt recovery.
- Offline audit orchestration, active-horizon context selection, text/canonical JSON, qualified lag/coverage/outcome summaries.
- Working collect/audit/policy/help/version CLI, explicit errors/exit codes and installed-package tests.
- README/CLI/methodology/architecture/troubleshooting, MIT license, contribution/security/conduct guidance, review record, roadmap/remaining drafts, changelog, release checklist and pinned read-only CI configuration.

## Verified results

Linux, Node 24.22.1, npm 11.9.0; `npm run verify` passed on 2026-11-18:

- TypeScript, ESLint, production build: pass.
- Unit/integration: **105 passed, 0 failed, 0 skipped**.
- Installed local tarball E2E: **5 passed, 0 failed, 0 skipped**.
- npm ci, npm pack dry-run, package contents and documented synthetic examples: checked. Package publication did not occur.
- Runtime npm audit: **0 vulnerabilities**. Full audit: **9 high-severity development-chain entries from one unpatched picomatch advisory**, GHSA-fc5q-39xc-vjpf. Current registry latest is affected; documented in SECURITY.md/D15. The supported toolchain was retained instead of an unsupported downgrade.
- Read-only live public collection succeeded (6 GETs, one run in selected context) on lowlysre/cron-drift. Selected run independently cross-checked through GitHub connector. Two offline JSON replays matched exactly and exited 3 with unknowns, appropriately without historical assertions. No live private-repository verification.
- Independent review passes and fixes documented in [REVIEW.md](REVIEW.md). Material fixes cover assertion completeness, conflicting start observations, output expansion, escaped-token handling, secondary cooldowns, narrowed-context replay, output-pipe failure and ignored private output names.

## Decisions and rationale

Use Node 24/TypeScript ESM, built-in test/fetch/crypto and pinned YAML/cron adapters. Store one small JSON contract instead of a multi-file archive. Keep historical assertions separate: current metadata cannot establish prior schedule/enablement/default-branch/retention facts. Never force nearest-slot assignment or count reruns twice. Fail explicitly on limits; do not silently sample. Keep `private: true` to prevent accidental publication.

## Limitations / unfinished validation

Named zones/DST, multiple cron entries, historical epochs and Enterprise hosts are unsupported. H is a conditional bound, not a maximum GitHub delay. High-frequency schedules may be mostly ambiguous/unknown. API traversal does not prove retained history; checksums do not authenticate provenance. Trusted local directories are required (parent replacement races remain). Linux is the only verified platform. Development-only dependency advisory remains open. External demand, independent user walkthroughs and adoption are unvalidated; no claims fabricated.

The technical hypothesis survived **for conservative conditional analysis and reproducible evidence**, not exact missed-event detection. Product-market usefulness remains unproven. Scope expansion is optional and gated by actual need.

## Remaining actions and precise resume point

1. Commit/push the reviewed changes to `feat/crontrace-cli` and open the final PR against main, preserving planning history.
2. Inspect the remote CI result, fix material failures if any, and record the PR/result here. Do not claim CI ran until observed.
3. Owner review and explicit merge/publication decisions remain. Recheck D15 before release and follow [RELEASE.md](RELEASE.md).
4. After review, prioritize one authorized unfamiliar-developer incident walkthrough; no outreach has been sent.

Resume at step 1 if the session ends before PR creation. All implementation and local verification are preserved in the worktree `/workspace/work/crontrace-m1`; logs/live evidence are outside the repo under `/workspace/work/`. No package, tag, service or release was published.
