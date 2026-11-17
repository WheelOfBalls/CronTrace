# Roadmap and decision gates

All milestones below are **planned**. Only the research and documentation initialization exist. Estimates are maintainer planning judgments, not delivery promises. Assume roughly 4–6 focused hours per week alongside school, with examination breaks and no on-call obligation.

## M0 — Direction review and demand discovery

Prepared: research, product specification, architecture, contribution guidance, license recommendation and eight issue drafts for [WheelOfBalls/CronTrace](https://github.com/WheelOfBalls/CronTrace). Not done: interviews, implementations, package release or product validation.

Review the narrow premise. The proposed study in [RESEARCH.md](RESEARCH.md) asks five independent maintainers about actual incidents and current workarounds. Use a paper/text report mockup first. Separately assess whether a contribution to Cronkeeper, Schedule Lens or cron-drift would serve the same people with less duplication. No outreach is authorized or performed by this repository preparation.

Budget: 4–8 hours of research/interview preparation plus participant-dependent elapsed time. Do not wait for a large survey to discover that the target users only want alerts.

## M1 — First and only recommended implementation task now

**Build a pure offline evidence-to-opportunity reconciler with adversarial fixtures.**

Input: explicitly supplied expected UTC opportunity timestamps (no cron parsing yet), normalized recorded runs, bounded coverage/eligibility assertions, a frozen observation time, late tolerance and attribution horizon. Output: deterministic JSON classifications and reasons. This tests the hardest product promise before HTTP, packaging or UI.

Include a minimal TypeScript test harness and only the domain/normalization/matching logic needed for this task. No GitHub calls, tokens, workflow execution, automatic discovery, YAML parser, dashboard or installation experience. Fixture data must be marked synthetic, or sanitized with permission and provenance.

Independently testable exit criteria:

1. Hand-specified cases cover isolated within-tolerance/late matches, absent records after the horizon, an open horizon, ambiguous overlapping slots, reruns, manual events, failed/cancelled records, incomplete API/history evidence, unknown eligibility, boundary competitors, and unexplained runs.
2. One recorded run cannot satisfy two opportunities. Reruns do not increase occurrence counts. Missing coverage cannot become a confident negative result.
3. A two-slot/one-late-run case remains ambiguous; a delayed run beyond the report end is considered when its evidence is available.
4. Fixed inputs and policy produce byte-identical JSON with no clock/network access. Input order does not matter.
5. Tests have independently written expected results and include at least one deliberately broken nearest-slot implementation/check demonstrating that the adversarial case catches the mistake.

Estimate: **10–16 focused hours**, approximately 2–4 weeks at student pace. Scope is capped; if it expands beyond ~20 hours, remove convenience behavior before adding more modules. The issue draft is [D03](issues/03-offline-reconciler.md).

**Gate:** proceed only if the output is understandable to a maintainer and false-certainty cases are prevented. A technically correct report consisting mostly of unhelpful unknowns is a negative product finding.

## M2 — Validate the useful subset

Prerequisites: M1 and initial external feedback. Implement a versioned bundle/policy contract and one UTC cron adapter with conformance fixtures. Keep assertions explicit and unsupported schedule forms visible. Work packages: D02 and D04.

Estimate: 10–18 hours. Deliver an offline audit from a saved workflow definition plus supplied history. Gate: another person can reproduce the report from the same inputs and explain its uncertainty; the domain contract can be consumed without the collector.

## M3 — Read-only collection

Prerequisites: M2 and positive evidence of a concrete local-audit need. Implement the bounded GET collector and original-attempt normalization. Complete dense-window pagination, partial-history, retry, credential redaction and hostile-link tests before trusting absence results. Work package: D05.

Estimate: 14–24 hours. Gate: inspect a small public historical interval against the API/UI and reproduce it offline; demonstrate incomplete results on cap/budget/error paths. Do not create workload just to generate an impressive demo.

## M4 — Small useful MVP

Integrate proposed `collect`/`audit`, text and JSON, exit codes, simple UTC count tables and conditional lag metrics. Finish security and reproducibility review. Work packages: D06–D08.

Estimate: 12–20 hours. Include two maintainer walkthroughs and at least one repeat use before treating the tool as validated. Describe exactly which features exist; remove speculative README claims as implementation evolves. Packaging/release is a separate, later decision requiring owner review.

Total after review: roughly 46–78 implementation hours, plus discovery and revisions. At 4–6 hours/week this is approximately a school term or longer, not a weekend promise. The first milestone is deliberately useful as a learning/validation artifact even if the project stops.

## Essential maintenance after an MVP

- Recheck GitHub scheduling/API/retention docs before a release and after relevant upstream changes.
- Keep bundle schemas and offline fixtures stable; version changed inference behavior.
- Triage bugs affecting false certainty before adding features.
- Maintain a small supported Node/platform matrix and dependency-update review process.
- Publish an honest response cadence; no guaranteed support SLA. Pause development during exams if necessary.

Reserve an estimated 1–2 hours/month for routine review after stabilization, with occasional larger API/parser compatibility work. This estimate is uncertain; support demand can dominate it. No server budget is necessary.

## Conditional later features

| Candidate | Evidence required before building |
| --- | --- |
| Multiple cron entries | Real workflows blocked by the subset, plus fixtures for duplicate/overlapping schedules without original cron identifiers. |
| IANA time zones and DST | Documented/observed spring-gap and fall-fold behavior; pinned time-zone data and conservative fallback for unresolved cases. |
| Historical schedule epochs | Users cannot reasonably bound stable periods; a design that preserves branch/merge/disablement uncertainty. |
| Markdown/CSV/HTML | Users need a format the JSON/text output cannot practically serve; safe escaping and provenance remain intact. |
| Longer retained local evidence | Repeated users need data beyond API retention; explicit retention/privacy policy and migration story. |
| Batch repository scanning | Demonstrated multi-repository use and a bounded rate-limit design. |
| GitHub Enterprise | A real user and a tested host/version/security support budget. |

Hosted monitoring, notifications, automatic dispatch/retry, re-enabling workflows, broad multi-platform scheduling, predictive ML and “optimal cron time” recommendations are speculative expansions outside this project's current direction. A future proposal must explain why existing tools are insufficient.

## Stop or pivot conditions

- Feedback is mainly about ensuring execution or getting alerts: recommend established monitors/schedulers; contribute correctness fixes upstream.
- Users prefer their existing script/editor and cannot identify a decision improved by the evidence bundle: do not launch a separate product.
- Most target intervals require unverifiable assertions or remain ambiguous: publish the limitations and fixtures; consider a small analysis library or cron-drift contribution.
- Maintenance threatens school commitments: freeze the CLI scope, document unsupported cases, and pause without creating service obligations.
- An existing project welcomes the exact feature: prefer collaboration over a redundant package when the license and architecture fit.
