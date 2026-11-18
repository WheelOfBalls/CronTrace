# Audit methodology (schema 1 / version 0.1.0)

CronTrace answers: **what do these recorded runs support, under these declared historical assumptions and timing bounds?** It does not reconstruct GitHub's internal scheduler or prove an event was dropped.

## Evidence and assumptions

The collector pins the current default branch commit and workflow YAML and records current workflow state. These are observations at collection time, not a historical schedule/enablement record. Projected run fields retain repository/workflow/run identity, event, creation/start times, attempt, conclusion and observation time. The definition digest attached to a run is conditional compatibility with the pinned YAML, not proof of its historical trigger configuration.

A separate policy names that digest and makes three explicit boolean assertions over a closed millisecond interval:

- `historyAvailable`: the relevant run history is believed available, taking retention/deletion into account.
- `definitionStable`: the pinned definition applies throughout the asserted period, including relevant default-branch history.
- `workflowEligible`: the workflow was eligible to schedule throughout that period, including enablement and repository/actor restrictions.

The generated template defaults all three to false. Its generous context interval is a starting point, not established history. Supply a rationale in `note`; if you cannot justify a fact, leave it false. A report is incomplete if assertions do not cover the requested context, even when today's YAML generates no target opportunities. Schema checks and SHA-256 digests establish structure/integrity only, not trust in an author or assertions.

## Time and schedule semantics

The target interval is half-open **[A, B)**; exact B is excluded. Stored evidence intervals and candidate lag bounds are closed integer milliseconds. The collection start is a fixed run-creation cutoff; records created after it cannot affect the audit. Execution conclusions may be observed later and are not an atomic snapshot at that cutoff.

Supported YAML contains one `on.schedule` entry, five POSIX-style fields, UTC by default or explicit `UTC`/`Etc/UTC`. Minute/hour/day/month/weekday ranges are validated before cron-parser; weekday is 0–6, not 7. Names, ranges, lists and steps are supported. Restricted day-of-month and weekday follow OR semantics; impossible calendar dates alone create no opportunity. Cyclic minute/hour spacing below five minutes is conservatively rejected even if a date mask might prevent close executions. Quartz extensions, macros, aliases, custom YAML tags, duplicate keys and unsupported entry keys are rejected.

Named IANA zones and multiple entries produce explicit unsupported/incomplete results. GitHub itself supports time zones and documents DST behavior; this release does **not** reinterpret those schedules as UTC or implement DST. The host timezone never changes enumeration. Historical edits and disabled/default-branch epochs must be bounded by the operator, not inferred from current state.

## Matching algorithm

For an opportunity at `s` and a recorded scheduled run created at `r`, a timing candidate requires `0 <= r - s <= H`, where H is the attribution horizon. Default H is 24 hours. The late tolerance L defaults to 30 minutes and must not exceed H. These defaults are policy choices, not guarantees from GitHub. Conditional creation lag measures API run creation; original-attempt start lag is separate. Neither measures internal queue time exactly.

Normalize observations by repository/run identity before filtering. Duplicate pages and reruns do not create new scheduled events. Conflicting invariant fields undermine confidence; contradictory original start observations remove that timing value. Manual dispatches never fill schedule opportunities. Failure, cancellation and skipping are execution outcomes and still establish a recorded run's existence. Missing attempt-one timing is never borrowed from a rerun.

Build a bipartite graph of opportunities and candidate runs, including contextual opportunities outside [A, B) and provisional definition conflicts. Only an isolated component containing **one opportunity and one run**, with sufficient compatible evidence, yields a match. Larger components remain ambiguous, even if a global assignment could produce a unique answer under stronger assumptions. No nearest-slot heuristic is used, and a recorded run cannot satisfy two opportunities. Distinct run IDs competing for one slot are possible duplicates/ambiguity, not proof of duplicate scheduling.

The analysis enumerates contextual opportunities from A−2H through min(cutoff, B+H). Each component needs API/history/definition/eligibility/context evidence over its envelope from earliest opportunity−H to min(cutoff, latest opportunity+H). A component extending beyond supported context is unknown. Collection queries run creation from A−H through min(cutoff, B+H). Sparse isolated target components can be established while edge context remains unclassified; dense connected components commonly remain unknown. Increasing audit H beyond collected context can produce incomplete results; it never silently extrapolates coverage.

| Classification | Meaning |
| --- | --- |
| `matched_on_time` / `matched_late` | Isolated association under stated evidence and horizon; creation lag ≤ L or > L |
| `ambiguous` | Multiple candidates/opportunities with adequate evidence; no forced assignment |
| `pending` | No candidate yet and horizon remains open |
| `no_observed_run` | No candidate after horizon closure under assertions; a **potential gap**, not a proven miss |
| `unknown` | Missing/incompatible evidence, unsupported/conflicting context or an unexplained record undermines attribution |
| `excluded` | Explicit exclusion supplied to the internal reconciler; the CLI does not invent exclusions from current disabled state |

Unknown evidence takes precedence over ambiguity and absence. An unexplained in-scope run suppresses gap judgments and aggregate lag statistics. It could represent a delay beyond H or an invalid historical assumption. Individual isolated matches remain explicitly conditional.

## Collection coverage and limitations

Requests are GET-only to a fixed GitHub.com host. The collector queries `event=schedule`, 100 records/page and explicit creation ranges. Filtered GitHub searches cap at 1,000 results: windows at that threshold split into nonoverlapping second partitions. Saturated seconds, malformed pages, duplicate IDs, inconsistent counts or unstable traversals remain incomplete. Each accepted partition requires two traversals with equal projected observations; this is a stability check, not a transaction or proof against deleted history. Partial records are saved even when coverage cannot be asserted.

Retries are bounded (three attempts, small backoff, at most five seconds total retry sleep), with a 200-request maximum, approximately 60-second collection deadline and ten-second per-request limit. A cooldown exceeding the budget stops subsequent requests. Missing initial metadata/definition aborts collection; run/attempt failures preserve partial evidence. Attempt-one recovery failure affects start timing without fabricating an absent run.

Reports show merged API traversal milliseconds over requested context. This number is not schedule reliability or retention completeness. Lag median/p95/max use only isolated matched records (nearest-rank p95); this selected sample may exclude difficult cases. Execution outcome totals include contextual runs and latest observed attempts, so they need not equal target opportunity counts. Rerun totals count identities with observed attempt >1, not all historical attempts.

Resource limits fail explicitly: 90-day target span, 50,000 opportunities/observations, 250,000 candidate edges, 1 MiB workflow source and 10 MiB evidence/report. No silent sampling. Collection is bounded but cannot guarantee a strict wall-clock limit under event-loop stalls or hostile local conditions.

## Authoritative references

Reviewed 2026-11-17: [scheduled workflow semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [workflow runs API](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-workflow), [REST rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), [API versions](https://docs.github.com/en/rest/about-the-rest-api/api-versions). Research sources and competitor qualifications are in [RESEARCH.md](RESEARCH.md).

When replaying with a different H, only observations whose identities have at least one creation time inside the new requested run context participate. Whole selected identities are retained so contradictory creation times cannot be hidden by filtering. `excludedContextObservations` records the omitted outer observations; the original bundle and its digest are unchanged. An unexplained record still inside the active context continues to suppress gaps/statistics.
