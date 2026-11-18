# Decision memo — 2026-11-17

**Conditional GO for a narrow initial CLI release candidate; no claim of validated product demand or exact missed-event detection.** The owner authorized completing the functional product after the initial M1 recommendation. The research and earlier decision remain in Git history.

The technical hypothesis survived adversarial validation in its limited form: saved records plus explicit assumptions can support deterministic, inspectable associations without forcing a nearest-slot answer. The tool can retrieve evidence, replay offline, distinguish ambiguous/unknown/pending cases and report conditional timing/gaps. Tests cannot establish true scheduling intent from GitHub's API. Dense schedules and uncertain history can produce mostly unknowns; that is a serious product limitation, not merely a future optimization.

| Criterion | Current judgment |
| --- | --- |
| Unmet demand | Real scheduling pain is sourced; demand for this precise local-evidence workflow is still unproven. No interviews or user feedback fabricated. |
| Differentiation | Modest but concrete: checksummed local bundles, explicit history policy, conservative attribution and deterministic offline replay. Competitors and scripts overlap substantially. |
| Technical feasibility | Demonstrated for the supported UTC subset and bounded collection; exact dropped-event identification and historical reconstruction remain unsupported. |
| Maintenance | Manageable with a narrow Node/cron/API support surface; compatibility and false-certainty bugs need ongoing attention. No hosted operations burden. |
| Adoption | Plausible for maintainers investigating incidents; external walkthroughs and repeat usefulness are still required before expansion. |
| Student suitability | A focused CLI can be maintained alongside school if scope stays frozen and support has no SLA. A monitoring service or broad scheduling framework would be a poor fit. |

The next work after review should be **one unfamiliar maintainer reproducing a report for a real, bounded stable interval and explaining whether it improved an investigation**. This is a product-validation task, not permission to send outreach. If evidence remains unhelpful or users chiefly want alerts/execution guarantees, prefer contributing these fixtures/uncertainty rules to an existing tool rather than broadening CronTrace.

Implementation is on a feature branch; the source package is release-prepared but unpublished. Owner review, actual CI results and explicit merge/publication approval remain required. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [REVIEW.md](REVIEW.md) and [RELEASE.md](RELEASE.md).
