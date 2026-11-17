# D06 — Render deterministic text/JSON reports with qualified metrics

Status: draft. Suggested labels: `reporting`, `usability`. Milestone: M4. Estimate: 4–7 hours. Dependencies: D02, D03.

## Problem

Even a cautious matching engine can mislead through a “reliability” headline, hidden denominator or omission of unknown cases.

## Deliverable

Plain-text and versioned JSON reports with interval, observation time, policy, provenance, coverage, per-opportunity outcomes, candidate links, unexplained runs and UTC daily/weekly counts.

## Acceptance criteria

- Every classification/reason is visible; unknown fields remain null with reasons.
- Creation lag and original-attempt start lag are separately labeled with separate sample sizes.
- Median/p95/max use the documented formulas and only eligible isolated matches; empty samples return null.
- Show assumptions and all excluded/ambiguous/unknown counts beside summaries; suppress invalid comparisons and suspect workflow-wide summaries.
- Fixed inputs yield byte-identical output. Golden cases include malicious terminal characters and long workflow names.
- Synthetic examples are labeled synthetic and contain no adoption/performance claims.

## Out of scope

HTML, CSV, Markdown templates, charts, alert delivery or fetching more data during rendering.
