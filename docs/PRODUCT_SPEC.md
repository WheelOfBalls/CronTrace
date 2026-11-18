# Product specification — implemented 0.1.0 candidate

## Audience and value

For developers investigating historical GitHub Actions scheduling incidents who can review a stable workflow interval and want inspectable local evidence. Useful for incident writeups, comparing saved audits, and testing whether a suspected gap is actually ambiguous. Not a scheduler, alerting service, execution guarantee or substitute for a heartbeat monitor.

The differentiator is a versioned local evidence bundle plus explicit historical assertions, conservative matching and deterministic offline reports. Demand for this exact workflow is unvalidated; existing scripts and tools may be sufficient. See [RESEARCH.md](RESEARCH.md) and [DECISION.md](DECISION.md).

## Delivered contract

1. `collect` gathers bounded read-only GitHub.com workflow metadata and scheduled-run records, with authentication for authorized private access and explicit partial traversal coverage.
2. `policy` prepares false-default historical assertion fields; the user supplies their basis and interval.
3. `audit` validates evidence, enumerates supported opportunities, deduplicates runs/reruns, reconciles candidates, and emits text or canonical JSON offline.
4. Reports distinguish isolated within-tolerance/late associations, ambiguity, pending horizons, conditional gaps, unknown evidence and recorded execution outcomes. Internal explicit exclusions exist; the CLI does not reconstruct disabled epochs.
5. Exit codes support CI without equating incomplete evidence to health.

Supported scheduling is a single five-field UTC cron entry at conservatively validated spacing of at least five minutes. Named zones, DST and multiple entries are explicit unsupported results. No current metadata is treated as historical proof. No run fills multiple opportunities. Manual dispatch does not count; failure/cancellation still count as recorded executions. Full semantics and limits are in [METHODOLOGY.md](METHODOLOGY.md); arguments and output are in [CLI.md](CLI.md).

## Quality and acceptance

The initial candidate requires passing module/integration/E2E tests, type/lint/build checks, actual packaged installation, deterministic replay, hostile-input tests and independent review. Live public collection is supplementary verification. Private access is designed and mock-tested; it must not be described as live-verified without a separately authorized private fixture.

No claim of production maturity, external user validation, scheduler reliability guarantee or exact missed-event detection is justified by a passing build. Release publication and merging require owner review. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

## Exclusions and future evidence

No dashboard, daemon, alerts, dispatch/retry, hosted monitoring, Enterprise host support, automatic schedule-history reconstruction or multiple-workflow batch audit. Add a feature only after a real blocked use case and a conservative evidence model exist. A student maintainer should freeze scope and reserve time for correctness/dependency updates instead of operating a service.
