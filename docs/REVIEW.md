# Engineering review and verification record

Reviewed 2026-11-17–18 for the initial 0.1.0 candidate. These are internal independent agent/code-review passes and local tests, **not an external security certification, user study or proof of production maturity**.

## Material findings and fixes

| Review perspective | Finding | Resolution and evidence |
| --- | --- | --- |
| Core correctness | Different non-null original-start observations for one attempt could look trustworthy | Conflicting start times now remain unavailable; null-to-known updates remain valid; regression fixtures |
| Evidence correctness | A present policy with false/narrow assertions could yield exit 0 for an empty/sparse current schedule | Independently require all historical assertions across requested context; zero-target regressions return exit 3 |
| Resource security | A small valid bundle could expand to tens of MiB of repeated candidate URLs | Enforce a 10 MiB text ceiling during formatting; overflow regression |
| Credential safety | Unicode-escaped response strings could evade raw token scanning | Inspect decoded string values/keys and decoded YAML before persistence; escaped-token regression |
| Rate-limit behavior | Bare secondary limits or long cooldowns could be retried too soon, including sibling partitions | Stop collection-wide when cooldown cannot fit; distinguish primary reset headers; bare-403 conservative stop; regressions |
| Replay correctness | Narrowing H left irrelevant outer collection-context runs as unexplained | Select active-context identities while preserving conflicting observations; report excluded counts; regression |
| CLI status | Broken stdout pipe could force exit 0 over incomplete/findings | Output failure exits 2; installed-process regression |
| Privacy/usability | Documented root output names were not gitignored | Root evidence/policy/report filenames now ignored; arbitrary paths remain the user's responsibility |

The final independent reviewer ran 38 targeted audit/CLI/evidence/collector tests and identified the replay and ignore findings; both were then fixed. Earlier reviewers independently reproduced the assertion and output-expansion bugs and verified their fixes. The full final suite below was rerun after integration. Reviews covered module boundaries, confidence rules, token/endpoint/file safety, installation/docs and test sensitivity. No additional concrete material defect was reported in reviewed code; limitations below remain.

## Local verification

Environment: Linux, Node 24.22.1, npm 11.9.0. Final `npm run verify` on 2026-11-18:

- Strict TypeScript check: passed.
- ESLint: passed.
- Unit/integration suite: **105 passed, 0 failed, 0 skipped**.
- Production TypeScript build: passed.
- Installed-tarball E2E: **5 passed, 0 failed, 0 skipped**. Covers executable/help/version, exact synthetic text, JSON replay under America/New_York and Asia/Tokyo, no-fetch offline behavior, exits, exclusive output, policy templates and EPIPE.
- Source installation: `npm ci` succeeded; E2E packs and globally installs into a temporary prefix, with no publication.
- Runtime dependency audit: zero vulnerabilities. Full development audit has the known unpatched picomatch advisory; see SECURITY.md. A passing runtime audit is not a full dependency-clean claim.

The synthetic three-opportunity example is reproducible and included in package files. The core adversarial suite contains an independently specified two-slot ambiguity oracle that rejects a deliberately broken nearest-slot algorithm. Tests are not generated from the production matcher.

## Live public-data smoke verification

Read-only GETs against [lowlysre/cron-drift](https://github.com/lowlysre/cron-drift), workflow `cron.yml` / ID `199740244`, API version `2026-03-10`. No workflow was dispatched, modified or re-enabled; no fabricated GitHub activity was created.

On 2026-11-18, collection for target `[2026-11-18T08:00:00Z, 2026-11-18T10:00:00Z)` with H=1h and request budget 25 completed in **6 GET requests**, with one recorded run in context and a pinned definition commit `766bc99c177a675b382da9c9598b99c6bd7c9460`. Bundle digest: `c8acffd0b6605d90de1f690abf2bc8586ddd9f3223a3bdbbf6eeafd97d283d8a`. The selected [run 44290560190](https://github.com/lowlysre/cron-drift/actions/runs/44290560190) was independently checked through the GitHub connector for identity, scheduled event, creation time, attempt and conclusion.

Two offline JSON replays were byte-identical and both exited **3**, correctly yielding two unknown target opportunities without historical assertions. This does not establish a missed event or scheduler reliability. An earlier bounded interval returned no runs and also remained unknown. Live bundles were kept outside the repository, not packaged or represented as reusable public benchmark fixtures.

Direct outbound Node requests initially failed with ECONNREFUSED in this proxy-dependent environment. Node's standard `NODE_USE_ENV_PROXY=1` opt-in allowed actual application collection. No TLS verification was disabled. Private-repository access is mocked/tested but not live-verified.

## Residual limitations and release review

No full historical schedule/default-branch/disablement reconstruction, named-zone DST, multi-entry schedules, Enterprise hosts or cross-platform certification. Policy assertions can be wrong. Two traversals cannot prove retention completeness or an atomic API snapshot. Finite H cannot prove a scheduler miss. Dense components may be mostly unknown. Filesystem parent replacement races remain outside the trusted-directory model. Dependency risk and upstream semantics require ongoing review.

CI uses read-only permissions and pinned action commits. [Remote run 44317959563](https://github.com/WheelOfBalls/CronTrace/actions/runs/44317959563) passed on implementation commit f809b0b, including installation, full verification, runtime audit and package dry-run. Subsequent documentation/package-list changes have passing local installed-package tests; inspect the latest checks on [PR #2](https://github.com/WheelOfBalls/CronTrace/pull/2) before merging. Publication and merge remain manual owner decisions. No external adoption or demand validation has occurred.
