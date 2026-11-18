# CLI reference

Use `crontrace --help` or `node dist/bin.js --help`. Only Node 24 is supported. Commands reject unknown/repeated options. Dates require seconds and an explicit `Z` or numeric timezone offset; fractional seconds up to milliseconds are accepted. Durations are nonnegative integers followed by `ms`, `s`, `m`, `h` or `d`; horizon must be positive and at most 90 days.

## collect

```sh
crontrace collect OWNER/REPO --workflow daily.yml \
  --from 2026-11-01T00:00:00Z --to 2026-11-03T00:00:00Z \
  --out evidence.json --max-lateness 24h --request-budget 200
```

Required: repository, workflow ID/filename/`.github/workflows/filename.yml`, from/to, new output path. End must not exceed collection start, and span is at most 90 days. Filename support is limited to ASCII letters/digits/underscore/dot/hyphen and yml/yaml extensions. Repository renames/redirects are rejected; use the canonical name. No arbitrary API hosts.

Optional: `--max-lateness` (default 24h), `--request-budget` (default/maximum 200). Tokens come from GH_TOKEN first, then GITHUB_TOKEN; no token argument or config file. Anonymous public collection has a lower shared rate limit. Fine-grained private access needs Actions read and Contents read; organization approval/SSO may also be needed.

Exit 0 means complete traversal of the requested context, not retained-history proof. Exit 3 still saves partial evidence. Exit 2 means the operation failed, such as metadata access or invalid output. Outputs are never overwritten. An unavailable attempt-one record can leave start timing unknown without making run-list coverage incomplete.

## policy

```sh
crontrace policy evidence.json --out policy.json
```

Creates a schema-v1 template tied to the definition hash, with all historical flags false and context bounds in epoch milliseconds. Review and edit it in a text editor. False means unverified, not historically ineligible. The CLI does not provide a “trust everything” switch. See [methodology](METHODOLOGY.md) before changing assertions.

## audit

```sh
crontrace audit evidence.json --policy policy.json \
  --late-after 30m --format json --out report.json --fail-on gap
```

`--policy` is optional: missing assertions yield uncertainty. `--format` is text (default) or json. Omit `--out` to write the report to stdout. `--late-after` defaults to 30m. `--max-lateness` defaults to the bundle's collection horizon; changing it reanalyzes stored evidence only. L must be ≤ H. A wider horizon may need uncollected records and cannot increase coverage by itself.

`--fail-on` selects one criterion: `none` (default), `late` (matched_late), `gap` (no_observed_run), or `uncertain` (ambiguous/pending). These thresholds are separate, not cumulative. Incomplete evidence always returns 3 before threshold evaluation; invalid input returns 2. A complete audit containing findings returns 0 under `none`.

JSON contains schema/tool versions, bundle/policy digests, repository/workflow identity, supported schedule, exact policy, normalized analysis/candidates/reasons, summary and warnings. Object keys are canonically sorted; arrays have deterministic analysis order. Reports omit raw workflow YAML, but the evidence file contains it. A changed tool/dependency version may change inference and must be recorded when comparing reports.

## CI usage

Install from a reviewed source ref or locally prepared tarball. Save collection evidence as a private artifact only after reviewing its contents. Audit can run without a token or network. For collection in the same repository, configure the workflow token with `actions: read` and `contents: read`; never grant writes for CronTrace. Avoid collecting an actively mutating window when reproducible stable traversal matters. Exit 3 is an explicit incomplete result, not a successful health check.
