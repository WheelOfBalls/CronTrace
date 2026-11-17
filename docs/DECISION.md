# Decision memo

**2026-11-16 — Conditional GO for a bounded offline prototype; NO-GO for committing to a full separate monitoring product today.**

The scheduling problem is real. The standalone-product opportunity is not yet validated. The generic pitch—discover late/missed Actions schedules, calculate drift, and avoid editing every workflow—is substantially covered by Cronkeeper, cron-drift, Cronwake, Healthchecks integration patterns, and editor tooling. Schedule Lens already offers a strong local static audit experience. Cron Calendar Pro explicitly advertises historical run summaries.

The remaining hypothesis is narrower: maintainers may value a headless, locally replayable evidence report that preserves assumptions and uncertainty well enough to support incident investigation. That merits one small experiment, not a broad launch. Sources and qualifications are in [RESEARCH.md](RESEARCH.md).

| Criterion | Judgment | Implication |
| --- | --- | --- |
| Unmet demand | Scheduling pain and requests for read-only diagnostics are documented; demand for this exact workflow is unproven. | Interview maintainers about concrete recent incidents and test an actual report. |
| Differentiation | Modest. Evidence replay and explicit uncertainty are a plausible combination, not a defensible technical moat. | Do not pitch another alerting tool or claim unique historical auditing. |
| Technical feasibility | Good for retrieving records and conservative conditional analysis; weak for exact missed-event detection or full historical reconstruction. | Unknown results are part of the product contract. |
| Maintenance burden | Moderate even without servers: cron semantics, DST, API caps, retention, reruns and user expectations. | Restrict the first release to one stable UTC schedule and a small module set. |
| Genuine adoption potential | Plausible niche among maintainers preparing incident/support evidence; ordinary UI, `gh api` scripts and existing products may be sufficient. | Require independent use and repeat value before expanding. |
| Student suitability | Good as a 10–16-hour offline milestone; viable as a narrow CLI over a term; poor as a hosted service or multi-platform framework. | Avoid on-call commitments and keep a clear stop option. |

## Single next implementation milestone

Implement **the offline opportunity/run reconciler**, accepting already-enumerated UTC opportunities and normalized synthetic records. It must distinguish isolated matches, ambiguous candidates, pending windows, no observed record and insufficient evidence, deduplicate reruns, and produce deterministic JSON. It must pass the adversarial cases in [M1](ROADMAP.md#m1--first-and-only-recommended-implementation-task-now) without network access or tokens. The ready-to-file task is [D03](issues/03-offline-reconciler.md).

Do not implement the collector, CLI packaging, dashboard or complete MVP in that milestone. The reconciler can independently falsify the most important promise: that the report avoids misleading certainty and remains useful.

If that promise or the demand gate fails, prefer a contribution: add correct event filtering and uncertainty treatment to Cronkeeper, explore a historical adapter with Schedule Lens, or contribute measurement fixtures to cron-drift. No project has been contacted and no upstream commitment is claimed.

## Prepared repository status

This repository contains documentation and draft issues only. No packages were published, services deployed, paid resources provisioned, or GitHub issues opened. No research outreach was performed. There are no production claims, fake badges, fabricated users, metrics, benchmarks or fabricated commit history. The GitHub repository is [WheelOfBalls/CronTrace](https://github.com/WheelOfBalls/CronTrace); package-name availability and trademark clearance have not been established.
