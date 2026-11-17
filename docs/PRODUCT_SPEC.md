# Product specification — proposed, not implemented

Decision date: 2026-11-16. Source facts and competitor findings live in [RESEARCH.md](RESEARCH.md). Everything specified below is a recommendation unless explicitly described as a source fact. No user validation has been completed.

## Intent and differentiation

Help a repository maintainer answer: **“What does the available evidence say about this workflow's scheduled execution opportunities during this interval, and what can it not establish?”**

Proposed differentiation: a headless, local GitHub Actions history auditor that preserves enough input evidence to reproduce its report offline and exposes ambiguous associations and historical coverage limits. This distinguishes the proposed workflow from alerting services and editor calendars, but remains unvalidated and easy for existing tools to adopt.

The primary user is an individual maintainer or small team investigating a daily/weekly data import, report, backup trigger, or maintenance workflow. Useful tasks include preparing a support-ticket attachment, investigating a data freshness gap, and comparing two bounded periods under the same assumptions. The tool reports run evidence; application-level data completeness needs separate checks.

High-frequency recorders are a secondary, difficult use case. If the attribution horizon overlaps many opportunities, a truthful report may contain mostly ambiguous results. A strict delivery deadline calls for a suitable scheduler, not a stronger CronTrace claim.

## Alternatives considered

1. **Contribute to an existing project.** Lowest ecosystem duplication; Cronkeeper has concrete correctness opportunities, Schedule Lens has a local auditing interface, and cron-drift has measurement context. Historical evidence handling may not fit their maintainers' priorities. Seek fit before a public launch; no acceptance is assumed.
2. **Narrow standalone CLI. Recommended for one bounded experiment.** Easy to invoke in CI and replay offline; costs include another package, documentation, API compatibility and expectation management. Stop if the narrow workflow does not earn real use.
3. **Hosted monitor or dashboard. Reject for this project.** Strong competition, operations and alert-delivery obligations, token storage and privacy overhead; poor match for student maintenance.

## Smallest genuinely useful MVP

One explicit GitHub.com repository, one workflow ID, one user-reviewed stable UTC cron definition, a bounded history window, and a local evidence bundle. The MVP would collect accessible history and produce text/JSON from the same offline analysis engine.

Essential behavior:

- Pin workflow content to a commit and retain current workflow state as an observation.
- Require a policy file recording the interval in which the schedule and eligibility are assumed to apply. Missing knowledge remains unknown; the tool must never silently back-project current YAML.
- Record API traversal coverage separately from confidence in historical availability.
- Expand supported cron opportunities, normalize run identities and reruns, and conservatively associate records.
- Report matched-within-tolerance, matched-late, no-observed-run, ambiguous, pending, unknown, and explicitly excluded opportunities.
- Preserve original evidence identifiers and machine-readable reasons; replay without network access.
- Give daily/weekly count tables and conditional delay summaries only where supported.

An auditor can be useful even when an operator supplies a stable interval manually. If users cannot supply that information or resent doing so, the MVP hypothesis fails; do not hide the missing evidence to make onboarding easier.

### Scope boundaries

No daemon, alert destinations, GitHub App, hosted UI, workflow dispatch, automatic re-enable, scheduler replacement, package publication, job-log fetching, application-health verification, multi-repository mode, or arbitrary GitHub Enterprise host support in the initial MVP.

Initially support only one cron entry and an absent time zone or explicit `UTC`/`Etc/UTC`. Recognize and report other zones and multiple entries as unsupported; never silently drop those fields. The first collector pins the current default-branch definition. Only historical intervals asserted to use that same definition can be evaluated. An older differing definition requires an existing matching evidence bundle; selecting arbitrary historical refs and automated Git-history reconstruction are deferred. Do not promise automatic audits across schedule changes.

## Proposed CLI contract

These examples describe a future interface. They do not run today.

```text
crontrace collect OWNER/REPO --workflow ID_OR_PATH \
  --from RFC3339 --to RFC3339 --out DIRECTORY \
  [--max-lateness 24h] [--request-budget 200]

crontrace audit DIRECTORY --policy FILE \
  [--format text|json] [--out FILE] \
  [--late-after 30m] [--max-lateness 24h] \
  [--fail-on none|late|gap|uncertain]
```

- `collect` resolves a path to a numeric workflow ID and records repository ID; ambiguous or unavailable identity fails. `--from` and `--to` are required UTC or offset-qualified instants, interpreted as `[from,to)`. Relative dates and machine-local defaults are excluded initially.
- `collect` captures an `observed_until` instant at its start and fetches context through `min(observed_until, to + max_lateness)`. This is a creation-time eligibility cutoff, not an atomic snapshot of outcomes. Retain per-record fetch times; conclusions/attempts are observations during collection. It stores collection start/end separately. It includes boundary context before `from`; details in architecture. `to > observed_until` is invalid. Requests and output paths are bounded.
- `audit` performs no network access and takes observation time from the bundle. It validates that the evidence covers the requested policy/horizon; increasing the horizon beyond collected data produces incomplete evidence, not invented coverage. It cannot pretend that time passed by accepting a later `--as-of` value without new evidence.
- `late-after` is a user's reporting tolerance, not a GitHub SLA. `max-lateness` is a bounded attribution hypothesis, not a known maximum delay. Keep them separate and print both. Require `0 <= late-after <= max-lateness`, a finite positive horizon, and a maximum supported interval/occurrence count.
- Authentication: explicit `GH_TOKEN`, then `GITHUB_TOKEN`, otherwise public unauthenticated reads. No token argument, token persistence, automatic login, or credential-provider subprocess in the first version. Warn about rate limits without printing credentials.
- Standard output contains one report only; diagnostics go to standard error. An output file must be newly created unless a future explicit overwrite option is added. Collection directories are never silently reused.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Requested operation completed with usable coverage and no selected finding threshold met; **not a reliability guarantee**. |
| 1 | Analysis completed and a selected policy threshold was met. |
| 2 | Invalid input, unsupported schema, authentication failure, corrupt bundle, or fatal output/collection failure. |
| 3 | A report/bundle was produced but the requested interval is incomplete, unsupported, or materially unknown. |

Precedence: fatal error 2, incomplete analysis 3, threshold 1, otherwise 0. Ambiguous associations are report findings; `--fail-on uncertain` selects them. Missing history or unsupported evaluation yields 3 regardless of `--fail-on none`. Intentional exclusions do not by themselves yield 3. The default `none` does not suppress warnings or convert incomplete evidence into success. Failed workflow conclusions are separate data, not automatically schedule failures.

### Policy example (illustrative, not observed evidence)

```json
{
  "policy_version": 1,
  "workflow_id": "123456",
  "schedule": {
    "cron": "17 6 * * *",
    "timezone": "UTC",
    "valid_from": "2026-09-30T00:00:00Z",
    "valid_to": "2026-10-09T00:00:00Z",
    "definition_source": "bundle:workflow.yml",
    "basis": "operator_assertion",
    "note": "Operator reviewed this stable interval; not a GitHub attestation."
  },
  "eligibility": {
    "state": "assumed_active",
    "note": "Operator reviewed default branch, enablement and repository restrictions."
  },
  "history": {
    "availability": "operator_asserted",
    "note": "No known deletion or retention expiry in this bounded interval."
  },
  "exclusions": []
}
```

The real contract must validate every field and require bounds for all assertions; this simplified example scopes eligibility/history to the schedule interval. Assertions must cover necessary boundary context too. If they do not, boundary-affected results remain unknown. The policy must agree with the pinned workflow's normalized schedule or analysis stops with an explicit conflict. A current file is evidence of contents at its ref, not proof of historical scheduler registration. Operator assertions remain visibly labeled in every report and are never upgraded to verified history.

## Opportunity results and interpretation

| Result | Meaning under the report's stated assumptions |
| --- | --- |
| `matched_on_time` | Isolated one-to-one candidate; observed creation lag is at most `late-after`. |
| `matched_late` | Isolated one-to-one candidate; creation lag exceeds tolerance but is within the attribution horizon. |
| `no_observed_run` | Full attribution window elapsed and was queried, schedule/eligibility/history assumptions are supplied, and no compatible recorded run was found. UI may say **potential missed schedule**, never confirmed miss. |
| `ambiguous` | More than one opportunity/run association is possible, or unexplained contextual runs undermine attribution. No arbitrary winning slot. |
| `pending` | The attribution window is still open at the frozen observation time. This can be beyond the late tolerance and still be pending. |
| `unknown` | Definition, eligibility, retention, API coverage, boundary context or semantics are insufficient. Include reason codes. |
| `excluded` | Operator explicitly excluded a bounded interval with a reason, such as known disablement. Not part of an eligible denominator. |

Run conclusion is an orthogonal field: a failed, skipped, cancelled, queued or waiting recorded run is still evidence that a run exists. A success on rerun does not erase the initial failure, and no rerun fills a second opportunity. A manual dispatch cannot fill a scheduled opportunity; it may be recorded later as contextual remediation, outside the MVP.

### Outputs

**Text:** identity, audit interval, frozen observation time, all assumptions and coverage warnings, status counts, chronological opportunity rows with candidate run links, conditional lag summaries, and unexplained-run rows. Every nontrivial finding has a reason and evidence reference.

**JSON:** versioned top-level `schema_version`, `tool_version`, `analysis_version`, `bundle_digest`, `policy_digest`, repository/workflow identity, interval, observed-until, policy, coverage, assumptions, opportunities, unmatched runs, metrics and diagnostics. Each opportunity includes a stable key, expected instant, schedule source, classification, reason codes, candidate IDs and nullable lag fields. IDs are decimal strings to avoid JavaScript integer precision issues. Unknown values are `null` with reasons, not zero. Object/array ordering and numeric rounding are specified for deterministic replay.

Markdown, CSV and self-contained HTML are deferred. Text can already be attached to a support ticket or CI artifact; JSON supports further analysis. CSV would need careful representation of many-to-many candidates and spreadsheet formula escaping.

### Metrics and trends

Report counts for every classification first. Calculate median, p95 (nearest-rank `ceil(0.95*n)`), and maximum creation lag only for eligible unambiguous matches; print sample size and excluded/ambiguous counts. Median for even `n` is the mean of the middle two sorted values. No samples means null. Start lag uses only an available original-attempt start timestamp and has its own denominator.

For comparisons, require the same analysis version, horizon, tolerance, supported semantics, and equivalent coverage/assumption quality. Group opportunities by expected UTC day/week. Do not market a survivor-only delay trend as overall scheduler reliability. Never turn unavailable history into a 0% or 100% success score. A conditional observed-match fraction may be shown only with its exact denominator and prominent assumptions; avoid a headline “reliability percentage” in the MVP.

## Time and cron policy

Internal timestamps are UTC instants, serialized as RFC3339 with a fixed precision. The machine time zone never changes analysis. Optional future display zones change labels only. A schedule's zone affects enumeration and is a different concept.

Proposed grammar: exactly five fields; documented ranges, names, lists, ranges and steps; reject seconds/year fields, `@daily`, Quartz extensions and library-only syntax. Validate DOM/DOW semantics against POSIX, including restricted-field OR behavior, and GitHub's documented examples. Treat accepting aliases such as numeric weekday 7 as an explicit compatibility decision rather than blindly inheriting a library. Initial policy accepts documented weekday 0–6/names only. Impossible calendar dates yield zero opportunities, not fake gaps. Keep `on` a YAML key, not a YAML 1.1 boolean.

Frequency validation must not clamp a too-frequent cron to five minutes. For this conservative subset, expand the allowed minute/hour pairs into a sorted cyclic UTC day and reject any adjacent gap below five minutes, including the midnight wrap. This deliberately ignores date masks when calculating the lower bound and may reject a calendar-restricted expression that would be safe in practice; report `unsupported_frequency` and explain this subset limit. For example, `1,58 * * * *` has a three-minute hour-boundary gap and is unsupported, as is `* * * * *`. Emit no absence judgments for an unsupported expression.

For named zones, do not assume a general cron library reproduces GitHub's spring-gap adjustment. Fall-back multiplicity, overlapping entries at a DST shift, and time-zone database version differences need evidence. Until supported, emit `unsupported_timezone` and no absence judgment. A later implementation must pin/record tzdb and represent fold/gap uncertainty; UTC schedules have no DST transition.

## Acceptance and open questions

MVP acceptance requires deterministic offline replay, truthful boundary/retention/disablement treatment, no write requests, meaningful adversarial tests, and successful maintainer walkthroughs. No number of green unit tests validates demand.

Unresolved: will users accept manual history assertions; how much ambiguity is tolerable for hourly jobs; what named-zone semantics can be independently established; can evidence capture fit an existing upstream; and what package/name is available? These are roadmap gates, not silently resolved assumptions.
