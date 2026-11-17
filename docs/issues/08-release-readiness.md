# D08 — Verify replay/privacy boundaries and run a small usefulness pilot

Status: draft. Suggested labels: `verification`, `pilot`. Milestone: M4. Estimate: 4–7 focused hours plus participant availability. Dependencies: D07.

## Problem

Passing synthetic tests does not establish that maintainers can interpret real reports or that exported evidence is safe to share.

## Deliverable

A documented readiness assessment, offline CI checks, one bounded public-data comparison and two independent maintainer walkthroughs. This is a review gate, not authorization to publish or deploy.

## Acceptance criteria

- Run offline tests/type checks without secrets and verify reproducibility on a second supported environment.
- Review token redaction, permission scope, hostile YAML/JSON/link handling, bundle path limits and report escaping.
- Compare a small historical sample against existing UI/API records, recording what remains unverifiable; no fabricated workload or benchmark.
- Have participants explain ambiguous/no-observed/unknown outcomes and identify the decision the report helps them make.
- Record whether repeat use occurs, existing tools suffice, or a contribution is preferable; a negative result is acceptable.
- Confirm license attribution, provisional naming, actual support matrix and documented limitations before proposing any release.

## Out of scope

Public launch, package publishing, badges claiming adoption, paid infrastructure, guaranteed support or treating a tiny pilot as market validation.
