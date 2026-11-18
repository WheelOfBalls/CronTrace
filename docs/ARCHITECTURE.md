# Architecture

Implemented as one Node 24 / TypeScript ESM package. Domain logic has no network, filesystem, environment or clock access. There is no service, database, telemetry or plugin framework. Historical planning remains in Git history; this document describes the implemented design.

```mermaid
flowchart LR
  GH[GitHub REST GET] --> C[Collector]
  C --> B[Validated JSON evidence]
  B --> A[Offline audit]
  P[Explicit historical policy] --> A
  A --> S[UTC schedule enumeration]
  S --> R[Normalization and candidate graph]
  R --> O[Text / canonical JSON report]
```

| Module | Responsibility |
| --- | --- |
| `domain.ts`, `validate.ts` | Internal contracts, input invariants and resource limits |
| `evidence-types.ts`, `evidence.ts` | Schema-v1 external contracts, strict runtime validation, canonical serialization/digests, bounded file I/O |
| `github.ts` | Fixed-host GET collection, immutable definition pinning, paging/partitioning, bounded retries and partial coverage |
| `schedule.ts` | Safe YAML 1.2 extraction, narrow five-field UTC grammar, cron-parser adapter |
| `normalize.ts` | Identity grouping, conflicting observations, original/latest attempts |
| `reconcile.ts` | Indexed candidates, disjoint-set components, conservative evidence-qualified classifications |
| `audit.ts` | Bundle/policy orchestration, enumeration context, coverage and qualified summaries |
| `report.ts` | Bounded, escaped readable output and exit thresholds |
| `cli.ts`, `bin.ts` | Arguments, environment authentication, exclusive file output, process entry |

## Important design choices

- **Single JSON bundle**, not the originally proposed archive/directory. A small versioned contract is simpler to validate and reproduce. Only necessary projected fields are stored; page bodies, logs, arbitrary headers and tokens are omitted. Coverage intervals, request count and diagnostics describe collection; there is no full request-level transcript or ETag cache.
- **Separate policy**, never auto-asserted by the collector. Pinning current YAML is not historical validation. Assertions bind to its SHA-256 digest and an explicit context interval.
- **Conservative graph components**, not nearest-slot or maximum-matching attribution. Only isolated compatible one-to-one components produce matches. Reason codes explain unknowns and ambiguity. Reruns remain one identity.
- **Bounded dependencies**: yaml 2.9.1 and cron-parser 5.10.6 (including Luxon transitively), locked exactly. yaml uses ISC; cron-parser and Luxon use MIT. The grammar adapter rejects semantics beyond the supported subset before invoking cron-parser. Updating a parser requires conformance tests.
- **Secure local I/O**: regular files, bounded reads, UTF-8 validation, no symlink paths, exclusive 0600 output creation. Parent replacement races are not eliminated; work in a trusted local directory. Node-specific file behavior is verified on Linux only.
- **Release preparation**: tsc rewrites source `.ts` imports to `.js` in `dist`; a tiny executable entry avoids npm symlink entry-detection errors. No public JavaScript API stability is promised at 0.1.0. Package files are allowlisted. `private: true` prevents accidental npm publication until owner review.

## Determinism and complexity

Audit results depend only on the validated bundle, policy, options and version. Input observation order is normalized; API fetch times remain real evidence and can change newly collected bundles. Canonical JSON sorts object keys but preserves array order; digests detect edits rather than authenticate an author.

Reconciliation sorts opportunities/runs, uses binary lower bounds for timing candidates and disjoint sets for connected components. Coverage intervals are merged and component reasons computed once. Candidate edges are capped before pathological dense graphs exhaust memory. Text formatting has a byte ceiling; output is never silently truncated. See [methodology](METHODOLOGY.md) for exact bounds and classification precedence.

## Verification boundaries

`npm run verify` runs strict type checking, ESLint, node:test unit/integration tests, production compilation and installed-tarball E2E tests. Synthetic expected outcomes are specified independently, including an adversarial oracle that rejects a deliberately flawed nearest-slot matcher. Tests cover corrupt evidence, schedule boundaries, reruns, partial API histories, malicious redirects/pagination, encoded credentials and rate-limit stopping. Offline E2E tests disable fetch and vary host timezones. Live data is a smoke check, not an oracle for historical absence.

See [REVIEW.md](REVIEW.md) for independent findings and [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for actual test counts and outstanding work.
