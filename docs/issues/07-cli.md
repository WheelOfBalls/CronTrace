# D07 — Integrate collect/audit commands and honest exit behavior

Status: draft. Suggested labels: `cli`, `integration`. Milestone: M4. Estimate: 4–6 hours. Dependencies: D04, D05, D06.

## Problem

The core needs a small interface usable locally and in CI without accidentally treating an incomplete scan as healthy.

## Deliverable

Implement the proposed `collect` and offline `audit` command contracts, strict interval/policy validation, text/JSON output selection, explicit token environment lookup and exit codes.

## Acceptance criteria

- Offset-qualified timestamps are required and normalized; no machine-local date ambiguity.
- Offline audit makes zero network/credential accesses; observation time comes from evidence.
- Arguments cannot silently extend the horizon beyond available evidence or overwrite existing files.
- Test stdout/stderr separation and exit precedence: fatal 2, incomplete 3, selected threshold 1, otherwise 0.
- `--fail-on none` does not suppress incomplete-analysis status; manual/failed-run outcomes are not confused with schedule absence.
- Help and README describe only implemented behavior and explicitly say a gap is not a confirmed miss.

## Out of scope

Publishing npm packages, installing a GitHub Action in other repositories, daemon mode, automatic login and GitHub issue creation.
