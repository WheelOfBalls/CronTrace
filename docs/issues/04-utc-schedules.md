# D04 — Extract and enumerate a strict UTC schedule subset

Status: draft. Suggested labels: `cron`, `correctness`. Milestone: M2. Estimate: 6–11 hours. Dependencies: D03 opportunity input shape.

## Problem

A general cron parser may accept syntax or DST behavior that differs from GitHub. Silent acceptance creates fictitious opportunities.

## Deliverable

A bounded safe YAML extractor and cron adapter accepting one five-field schedule with absent/UTC/Etc/UTC zone, returning UTC opportunities with source identity. Evaluate and pin a maintained parser after verifying semantics; document unsupported inputs.

## Acceptance criteria

- Preserve bare `on`, reject duplicate keys/unsafe YAML, and enforce file/occurrence limits.
- Hand-calculated cases cover lists, ranges, steps, named fields, DOM/DOW OR, leap days and calendar boundaries.
- Reject seconds/year fields, macros, Quartz extensions and unsupported weekday aliases.
- Explicitly reject or report multiple entries and named time zones; never discard a zone and evaluate it as UTC.
- Apply the specified conservative cyclic minute/hour-gap check; include `1,58 * * * *` as well as every-minute fixtures. Sub-five-minute expressions yield `unsupported_frequency` with no absence judgments, never silent clamping. Document calendar-mask over-rejection and distinguish impossible schedules from missing run evidence.
- Preserve half-open interval semantics and deterministic ordering; source and policy definition mismatches are visible errors.

## Out of scope

Named-zone support, DST guesswork, automatic schedule history, HTTP collection, and generic cron linting unrelated to the audit.
