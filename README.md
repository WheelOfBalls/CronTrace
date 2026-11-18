# CronTrace

An evidence-first CLI for historical audits of scheduled GitHub Actions workflows. Collect read-only API records once, save them locally, and reproduce an audit offline.

**Status: implemented initial release candidate, version 0.1.0; not published to npm.** The supported subset is deliberately small. Tests cover adversarial synthetic timelines and the installed CLI; external adoption and product demand remain unvalidated. See [implementation status](docs/IMPLEMENTATION_STATUS.md) for current verification and release blockers.

CronTrace associates recorded runs with expected opportunities conservatively. It reports late associations, possible gaps, ambiguity, incomplete evidence and execution outcomes. **It cannot prove GitHub dropped an event.** Current APIs do not identify each run's original intended schedule instant or establish complete historical eligibility.

## Install from source

Requires Node.js **24.x** and npm. Linux is the verified platform; other platforms are not yet certified.

```sh
git clone https://github.com/WheelOfBalls/CronTrace.git
cd CronTrace
# Until the implementation PR is merged:
git switch feat/crontrace-cli
npm ci
npm run verify
npm pack
npm install --global ./crontrace-0.1.0.tgz
crontrace --help
```

If global installation is unavailable, use `node dist/bin.js` in place of `crontrace` after `npm run build`. No hosted service, database or account registration is required. Package publication and merge remain subject to owner review.

## Try a reproducible offline example

```sh
crontrace audit examples/synthetic-evidence.json \
  --policy examples/synthetic-policy.json --late-after 10m
crontrace audit examples/synthetic-evidence.json \
  --policy examples/synthetic-policy.json --late-after 10m --format json
```

These are clearly labeled **synthetic** records, not a real repository or scheduler benchmark. Three hourly opportunities yield one within-tolerance association, one late association (whose execution failed), and one potential gap under the fixture's explicit 50-minute horizon and history assertions. The full expected text is [committed alongside the evidence](examples/synthetic-report.txt). Replaying unchanged inputs with the same version is deterministic.

## Audit your workflow

Choose a past interval where the schedule and eligibility history can be reviewed:

```sh
crontrace collect OWNER/REPO --workflow daily.yml \
  --from 2026-11-01T00:00:00Z --to 2026-11-03T00:00:00Z \
  --out evidence.json
crontrace audit evidence.json
crontrace policy evidence.json --out policy.json
```

The first audit normally exits **3**: historical facts are unverified. The policy command creates a readable template with **all assertions false**. Review the definition, enablement/default-branch history, retention and deletion evidence for its full time interval. Record your basis in `note`; enable only assertions you can justify. Do not toggle flags just to obtain a clean result. False flags mean unknown, not “the workflow was disabled.”

```sh
crontrace audit evidence.json --policy policy.json --format json --out report.json
crontrace audit evidence.json --policy policy.json --fail-on gap
```

Authentication is optional for public repositories. For private repositories, provide a fine-grained token through `GH_TOKEN` or `GITHUB_TOKEN` with **Actions: read** and **Contents: read** for the selected repository (metadata read is implicit). Prefer a secret manager or CI secret; never put a token in arguments or checked-in files. The collector only sends GET requests to `api.github.com` and rejects redirects. See [security guidance](SECURITY.md).

## What works

- One five-field cron schedule in UTC, with names, ranges, lists and steps in the documented subset.
- Read-only GitHub.com collection: pinned workflow definition, filtered run history, pagination, bounded partitioning/retries and explicit partial coverage.
- Versioned, validated, checksummed evidence and separate historical assertions; offline text and canonical JSON reports.
- Rerun deduplication; original-attempt timing when available; manual dispatch filtering; failed/cancelled runs counted as recorded executions.
- Conservative candidate components: ambiguous delayed executions and competing records stay unresolved.
- Qualified creation-lag statistics, API traversal coverage and separate execution outcomes. No invented scheduler reliability percentage.
- `collect`, `audit`, `policy`, help/version, exclusive output files and CI-friendly exit codes.

| Exit | Meaning |
| --- | --- |
| 0 | Requested operation completed under stated assumptions; findings may exist unless a threshold was selected |
| 1 | Selected `--fail-on` finding exists |
| 2 | Invalid input or operation failed |
| 3 | Incomplete collection/evidence or unsupported schedule semantics; takes precedence over 1 |

## Limits that matter

GitHub supports named time zones, but **this release rejects them**, including DST schedules. Multiple schedule entries are also unsupported. Historical schedule changes, default-branch changes and disabled periods are not reconstructed. Split an audit into intervals with defensible assertions, or retain unknown results.

A finite attribution horizon is a user assumption, not GitHub's maximum delay. Widening it can introduce ambiguity; narrowing it can conceal plausible late arrivals. High-frequency schedules may remain largely ambiguous or unknown. A checksummed bundle detects edits but does not authenticate its author. API traversal coverage does not prove retained history is complete. Local evidence contains workflow source and may be sensitive.

Intervals are limited to 90 days; collection to 200 requests and roughly 60 seconds of request work. Named zones, multi-schedule attribution, Enterprise hosts, dashboards, monitoring, automatic retries of workflows and notifications are outside this release. See [methodology](docs/METHODOLOGY.md), [CLI reference](docs/CLI.md) and [troubleshooting](docs/TROUBLESHOOTING.md).

## Why a separate tool?

Cronkeeper audits recent runs; cron-drift measures scheduling delays; Cronwake and Healthchecks support monitoring; Schedule Lens explains schedule configuration. Direct API scripts are often enough. CronTrace's narrow contribution is a reusable local evidence format, explicit historical assumptions, conservative ambiguity, and reproducible offline reports. Competitors overlap substantially; [the sourced assessment](docs/RESEARCH.md) and [decision](docs/DECISION.md) explain why usefulness remains a hypothesis, not an adoption claim.

## Contribute

Read [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), and [remaining issue drafts](docs/issues/README.md). Correctness and false-certainty bugs take priority over new features. MIT licensed; [license rationale](docs/LICENSE_CHOICE.md). Participation follows the [code of conduct](CODE_OF_CONDUCT.md).
