# Research and feasibility assessment

Reviewed: **2026-11-16, America/Toronto**. This is a point-in-time assessment, not a comprehensive census. Links are public sources. Repository files and documentation were inspected; no competitor was installed, no paid product was purchased, and no controlled scheduling experiment was performed.

## Evidence conventions

- **Fact:** stated in official documentation or directly visible in inspected source.
- **Reported observation:** a developer's account; not independently reproduced.
- **Vendor claim:** advertised capability, not independently verified behavior.
- **Inference/recommendation:** our interpretation or proposed product decision.

Searches covered the five named tools, GitHub scheduling documentation, REST run history, historical audit CLIs, and public scheduling discussions. Search results were followed to primary documentation or original posts. Search ranking and complaint volume are not market-size estimates. No users have been interviewed, and none of the people cited has agreed to use CronTrace.

## 1. What GitHub exposes

### Scheduling facts

GitHub documents possible scheduling delays under load and possible dropped queued jobs. Scheduled workflows require the default branch; public-repository schedules can be disabled after 60 days of inactivity. These statements establish limitations, not an uptime or latency guarantee. [G1]

Current syntax uses five-field POSIX cron, a minimum five-minute interval, UTC by default, and optional IANA `timezone` per schedule entry. During a spring-forward gap, GitHub documents advancing a skipped local time to the next valid time: 02:30 becomes 03:00 in its example. A workflow may contain multiple schedules; execution context exposes `github.event.schedule`. The reviewed section does not fully specify repeated-hour behavior at fall-back. [G2]

**Recommendation:** reject unsupported named-zone evaluation in the initial release, rather than silently treating it as UTC. Old advice that Actions schedules are always UTC is no longer sufficient. Runtime cron context is useful if captured prospectively, but it is not equivalent to a historical scheduled-slot ledger.

### REST surface and its limits

The run API provides repository-wide and per-workflow listing, `event` and `created` filters, pagination up to 100 per page, and a 1,000-result cap on filtered searches. Run examples expose IDs, workflow IDs, event, timestamps, status/conclusion, attempt number, and commit metadata. Run/attempt retrieval is available. Public reads can be unauthenticated; fine-grained private access uses Actions: read. [G3]

Workflow metadata includes current state and path; it does not provide a complete enable/disable timeline. [G4] Contents can be requested at a ref with Contents: read; path-filtered commit history is available separately. [G5, G6]

**Inference:** the reviewed run schema does not provide an authoritative original expected timestamp or cron-expression identifier for every scheduled run. `created_at` is a recorded creation time, not a published scheduler enqueue timestamp; `run_started_at` is not necessarily first-job or application-work start. Missing records and timestamp subtraction cannot establish internal root cause.

**Recommendation:** collect by `event=schedule`, never by successful conclusion alone. Partition dense time windows, retain collection failures, and avoid inferring exact schedule registration time from a commit's author/committer timestamp. A current default branch, current enabled state, or a successful manual run cannot establish historical eligibility.

### Retention changed recently

The organization retention documentation states that, starting October 1, 2026, configured retention applies to checks, workflow runs, and statuses as well as logs/artifacts. It gives a default of 90 days, configurable public retention of 1–90 days and private retention of 1–400 days, subject to governing limits; changes apply to new objects. [G7]

**Recommendation:** do not repeat the outdated assumption that run metadata always survives 400+ days, or assume the current retention setting describes all older records. Successful pagination only proves traversal of the currently accessible result set. Deletions, retention, permissions, and prior configuration can still remove evidence. The ordinary collector should not request administration access merely to read settings.

### Rate limits

GitHub documents 60 unauthenticated requests/hour per IP, generally 5,000/hour for authenticated users, and additional secondary limits. `GITHUB_TOKEN` has its own per-repository budget. Rate-limit response headers and retry guidance matter more than hardcoded assumptions. [G8]

**Recommendation:** use bounded sequential requests, explicit request budgets, caching within a frozen collection, and partial-coverage diagnostics. Authentication failure is never evidence of zero runs.

## 2. Competitor assessment

“Not documented” below means no matching capability was found in the material reviewed. It is not proof that a vendor cannot supply it.

| Tool | What the reviewed material establishes | Overlap and remaining distinction | Use/contribute instead when… |
| --- | --- | --- | --- |
| **Cronkeeper** [C1] | MIT Python Action; reads checked-out workflow schedules, checks recent history, posts webhook alerts. Configurable grace/lookback; no persistent deduplication. | Already provides a self-operated schedule-versus-run check without a hosted service. The inspected source checks the latest eligible opportunity, not a replayable historical interval. See source findings below. | You want a small watchdog and can accept that it depends on Actions itself. Event filtering, time-zone handling, and clearer uncertainty are useful upstream contributions. |
| **cron-drift** [C2] | MIT repository documents a Grafana dashboard and helper tooling for per-run drift, summary statistics, and hourly/daily patterns. | Already addresses measuring and visualizing delay. The reviewed README does not describe an arbitrary-repository, offline evidence-audit CLI or absence classification. | You want scheduler observations or to improve shared drift measurement; contribute fixtures or analysis instead of rebuilding its dashboard. |
| **Cronwake** [C3] | Vendor advertises an external read-only GitHub App that discovers schedules and alerts on late/apparently missed runs, disabled workflows, and optionally failures; grace/recheck behavior. | Read-only and no workflow edits are already offered. Its security page describes Actions/Contents/metadata reads and stored run metadata. Local, independently replayable export was not documented on reviewed pages. | Your need is ongoing external monitoring. A local report cannot replace a continuously running watcher. |
| **Healthchecks** [C4] | Open-source BSD-3-Clause service, hosted or self-hosted; checks expect pings, use grace periods, and notify on absence. Actions examples use success/failure pings, including a separate `workflow_run` relay option. | Strong fit for prospective job completion monitoring, including work outside GitHub. It cannot retroactively recover pings that were never sent. Self-hosting means “open source” alone is no differentiator. | You need completion monitoring and can add pinging jobs or a relay workflow. |
| **Schedule Lens** [C5] | MIT Go static scanner for Actions, Kubernetes, Vercel and crontab; future simulation, IANA zones, validation/collision/DST findings, text/JSON/HTML, CLI and Action. | Already owns much of the local “schedule audit” experience. It explicitly describes itself as a static repository auditor, rather than a historical GitHub run reconciler. | You want configuration review; consider a bounded historical adapter upstream before growing another multi-platform scanner. |
| **GitHub Actions Cron Calendar / Pro** [C6] | Marketplace advertises a local schedule calendar; paid Pro adds 30-day run history, failed/cancelled/missed views, median start delay, notifications and re-enabling. | Closest historical-reporting substitute discovered. “See missed schedules and delays” is substantially redundant. Reviewed listing does not promise a headless open-source CLI, evidence replay, or explicit matching ambiguity. Pro behavior/source was not independently audited. | You want editor-based historical inspection and accept its product/licensing model. |
| **Cronitor for GitHub Actions** [C7] | Marketplace advertises monitoring, schedule sync, failure and runtime alerts through an Action integration with Cronitor. | Competes for operational outcomes; requires service integration. | You want alert delivery and runtime monitoring instead of a retrospective evidence artifact. |
| **GitHub UI / `gh api` + a script** [G3] | Existing APIs and CLI access let developers export/filter run records without a new service. | Likely the strongest free substitute for occasional audits. CronTrace must earn its maintenance cost through correct handling of uncertainty and repeatable reports. | One-off manual analysis is sufficient. |

### Cronkeeper: source-level observations

Inspected `src/watch.py`, blob `d531328e86425e50d38dc12dfbdb524afd1d77e0`, and README on the review date. [C1]

- The run query uses `created >= expected_fire` and `per_page=1` without `event=schedule`. A push or manual run can therefore satisfy this check. This is a code observation, not a reproduced bug report.
- Schedule extraction keeps `cron` but not the `timezone` field. Matching is implemented against UTC.
- It chooses the latest opportunity old enough to exceed grace, rather than reconciling every opportunity in an interval.
- The failure check also reads the latest workflow run without an event filter.

These are bounded, independently useful contribution candidates. They do not prove that a separate project is justified. Its existing code would need substantial changes to become a reproducible historical auditor, but maintaining a second monitor would still be hard to justify.

### What would actually distinguish CronTrace?

**Recommendation:** only the combination of a headless local interface, preserved input provenance, offline deterministic replay, explicit historical assumptions, and conservative uncertainty reporting is a plausible separate scope. No reviewed source establishes that this combination is entirely absent from the market. It is a narrow hypothesis, not a uniqueness claim or moat.

Do not claim novelty for cron parsing, run filtering, delay statistics, missed-run alerts, read-only permissions, self-hosting, or avoiding workflow instrumentation. Each already exists in some form.

## 3. Evidence of need

These are original reports, not validated measurements of platform-wide reliability. Community replies about undocumented throttling, account age, registration internals, or dispatch priority are not treated as GitHub facts.

| Primary discussion | Evidence and relevance | What it does not establish |
| --- | --- | --- |
| **actions/runner #877**, opened Dec 21, 2020 [D1] | Reporter expected 12 hourly opportunities from a five-minute cron and observed 2–4 runs. A project member requested a repo URL and time interval for investigating telemetry. Supports long-standing pain and usefulness of bounded evidence. | No current incident rate or willingness to adopt a CLI. |
| **Community #201738**, July 13, 2026 [D2] | Daily-job operator supplied a timestamp table, reported 8–14-hour delays and an apparent omission despite changing the minute. They describe checking REST event and timestamps. | Does not establish new-account deprioritization or prove a particular event was dropped. |
| **Community #207370**, Sept 9, 2026 [D3] | Private-repository operator reports a 30-minute delivery need and multi-hour delays, with manual-dispatch observations for comparison. | Self-reported data, not an independent benchmark or proof that a monitor solves the delivery need. |
| **Community #208916**, Sept 27 with follow-ups [D4] | Maintainer lists expected slots and later runs. Follow-ups explicitly struggle to assign late runs to earlier opportunities and describe switching to an external trigger. | “Never ran” in an initial observation is not final evidence. This is a direct counterexample to nearest-slot matching. |
| **Community #210401**, Oct 15, 2026 [D5] | Developer explicitly requests read-only diagnostics for distinguishing absent event acceptance, restrictions and delay without exposing private source or enabling paid usage. | The desired root-cause distinction may be impossible from public APIs; it is not an explicit request for CronTrace. |

**Confirmed:** people experience and investigate scheduling gaps, need evidence for debugging, and sometimes abandon native scheduling. **Not confirmed:** sufficient demand for recurring local audits, acceptance of “unknown” results, tolerance for reviewing schedule history, or preference for a standalone CLI over a short script or existing product.

Vendor testimonials, project README examples, and the founder's own recorder experience are useful hypothesis inputs, not independent adoption validation. We did not use stars, downloads, or marketplace install counts as proof of demand.

## 4. Feasibility verdict

| Question | Assessment |
| --- | --- |
| Can available run records be retrieved and replayed? | Yes, within permission, API and history limits. |
| Can conditional schedule-to-record timing be estimated? | Yes, for well-supported schedules and sufficiently unambiguous intervals. |
| Can exact missed scheduler events be recovered? | No general method is established by the reviewed APIs. |
| Can the entire schedule/disablement past be reconstructed automatically? | Not reliably from current workflow metadata and ordinary Git history alone. |
| Is a generic scheduling monitor differentiated? | No; heavily overlapping products already exist. |
| Is an evidence-first local auditor worth a small experiment? | Yes, conditionally; demand and usability remain open. |

The biggest feasibility risk is not fetching JSON: it is producing a useful report while declining to infer unsupported facts. High-frequency schedules with long delays can be almost entirely ambiguous. The recorder that inspired the project may therefore be a difficult first customer, not a representative easy case.

## 5. Validation and contribution decision

Before expanding beyond the first offline milestone, ask five maintainers outside the founder's immediate project to walk through a real incident and a report mockup. This is a proposed study; no outreach has been performed. Record the last incident, current workaround, what decision the report changes, whether they can establish a stable schedule interval, and whether they accept an unknown result.

Suggested continuation gate (a decision rule, not a statistic): three maintainers can describe a concrete evidence task inadequately served by current tools; two independently use the prototype on a bounded case and find the report useful; at least one revisits it for another incident or review. Do not count polite interest as adoption.

If the need is alerting, improve Cronkeeper or use Cronwake/Healthchecks/Cronitor. If it is static calendar review, contribute to Schedule Lens. If the need is reproducible latency research, explore cron-drift. If a historical audit fits an existing maintainer's scope, prefer an extension and share tests rather than launch a competing identity. Maintainer willingness is unknown; do not claim an upstream has accepted the idea.

## Sources

All accessed/reviewed 2026-11-16. Mutable documentation and default-branch links may change. The source-file blob identity above pins the key code finding; other entries are dated reviews, not archived guarantees.

- **G1:** [GitHub: schedule event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- **G2:** [GitHub: on.schedule syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onschedule)
- **G3:** [GitHub REST: workflow runs](https://docs.github.com/en/rest/actions/workflow-runs)
- **G4:** [GitHub REST: workflows](https://docs.github.com/en/rest/actions/workflows)
- **G5:** [GitHub REST: repository contents](https://docs.github.com/en/rest/repos/contents#get-repository-content)
- **G6:** [GitHub REST: commits](https://docs.github.com/en/rest/commits/commits#list-commits)
- **G7:** [GitHub: organization retention policies](https://docs.github.com/en/organizations/managing-organization-settings/configuring-the-retention-period-for-github-actions-artifacts-and-logs-in-your-organization)
- **G8:** [GitHub REST: rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- **C1:** [Cronkeeper README](https://github.com/abhishekshree/cronkeeper/blob/main/README.md), [source](https://github.com/abhishekshree/cronkeeper/blob/main/src/watch.py), [reviewed blob](https://api.github.com/repos/abhishekshree/cronkeeper/git/blobs/d531328e86425e50d38dc12dfbdb524afd1d77e0)
- **C2:** [cron-drift README](https://github.com/lowlysre/cron-drift/blob/main/README.md). Older `lowlydba/cron-drift` links redirect to this repository.
- **C3:** [Cronwake product](https://cronwake.com/), [permissions](https://cronwake.com/security), [terms](https://cronwake.com/terms). This is the GitHub monitoring service, not the unrelated `stephanballer/Cronwake` SSH alarm-clock project.
- **C4:** [Healthchecks docs](https://healthchecks.io/docs/), [Actions integration](https://healthchecks.io/docs/github_actions/), [source and license](https://github.com/healthchecks/healthchecks)
- **C5:** [Schedule Lens README](https://github.com/configcrate/schedule-lens/blob/main/README.md)
- **C6:** [GitHub Actions Cron Calendar Marketplace listing](https://marketplace.visualstudio.com/items?itemName=adck8888.github-actions-cron-viewer)
- **C7:** [Cronitor Action Marketplace listing](https://github.com/marketplace/actions/cronitor-for-github-actions)
- **D1:** [actions/runner #877](https://github.com/actions/runner/issues/877)
- **D2:** [Community #201738](https://github.com/orgs/community/discussions/201738)
- **D3:** [Community #207370](https://github.com/orgs/community/discussions/207370)
- **D4:** [Community #208916](https://github.com/orgs/community/discussions/208916)
- **D5:** [Community #210401](https://github.com/orgs/community/discussions/210401)
