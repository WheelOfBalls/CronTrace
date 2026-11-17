# CronTrace

**Planning stage. No executable, package, GitHub Action, or working MVP exists yet.**

CronTrace is a proposed open-source, read-only CLI for inspecting the recorded history of scheduled GitHub Actions workflows. It would compare declared execution opportunities with available run records and produce a local, reproducible evidence report.

The product hypothesis is unvalidated. The name is provisional. This repository contains research, a proposed design, and issue drafts—not completed features.

## Why consider it?

Developers report delayed and apparently absent scheduled runs. Several tools already monitor this problem. CronTrace is worth testing only if maintainers value a portable report that preserves its inputs, states its assumptions, and explains uncertain matches without requiring a hosted account or changes to monitored workflows.

**A missing API record cannot prove that GitHub dropped a scheduled event.** A report would distinguish recorded runs, conditional timing estimates, unresolved matches, and unavailable history. It would neither repair scheduling nor guarantee delivery. Time-sensitive workloads may need a different scheduler regardless of what an audit shows.

## Proposed first useful scope

- One repository and one explicitly selected workflow per invocation.
- One stable UTC schedule over a user-reviewed interval; unsupported schedules reported explicitly.
- Read-only collection of run metadata and a pinned workflow definition.
- Offline replay from a versioned evidence bundle.
- JSON and plain-text reports with source links, coverage caveats, and separate execution outcomes.

These are proposals. Named time zones, multiple cron entries, automatic historical reconstruction, HTML dashboards, notifications, and organization-wide scans are outside the first release.

## Proposed usage—not available commands

```text
crontrace collect OWNER/REPO --workflow WORKFLOW_ID \
  --from 2026-10-01T00:00:00Z --to 2026-10-08T00:00:00Z \
  --out ./evidence/october

crontrace audit ./evidence/october --policy ./audit-policy.json \
  --format text --out ./reports/october.txt
```

The policy would record schedule validity and history assumptions. Collection alone would not establish that the current schedule applied throughout the past. See the [proposed CLI and report contract](docs/PRODUCT_SPEC.md).

There is no installation command yet. Do not install a similarly named package assuming it belongs to this project.

## Review the direction

1. [Research, competitors, and evidence of demand](docs/RESEARCH.md)
2. [Product specification](docs/PRODUCT_SPEC.md)
3. [Architecture and inference rules](docs/ARCHITECTURE.md)
4. [Roadmap and go/no-go gates](docs/ROADMAP.md)
5. [Eight draft issues](docs/issues/README.md)
6. [Decision memo](docs/DECISION.md)

**Recommendation:** proceed only with the small offline matching milestone in the roadmap. Validate usefulness before building the collector and full MVP. If users primarily want alerts or calendar views, use or contribute to existing tools instead.

## Permissions and privacy

The planned collector would use GitHub REST GET requests only. Public metadata may be read without authentication. Private-repository collection would require a repository-scoped token with Actions: read and Contents: read. Contents permission grants access beyond workflow files; the proposed implementation would voluntarily restrict what it fetches. No write permissions, monitoring pings, telemetry, or uploaded reports are planned.

Evidence bundles may contain private repository names, paths, commit IDs, and run URLs. Keep them private by default. See [security boundaries](docs/ARCHITECTURE.md#security-boundaries).

## Contributing and license

At this stage, useful contributions are research corrections, adversarial examples, and feedback from actual workflow maintainers. Please read [CONTRIBUTING.md](CONTRIBUTING.md).

[MIT](LICENSE) is the recommended license; the [rationale](docs/LICENSE_CHOICE.md) explains the tradeoffs. No adoption, performance, or production-readiness claims are made.
