# Roadmap and decision gates

The owner's full-product instruction superseded the original M1-only plan. This roadmap separates implemented engineering from unvalidated product demand. Exact verification and resume instructions live in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md).

| Milestone | Engineering status | Remaining validation |
| --- | --- | --- |
| M0 Research and direction | Sourced assessment and planning retained in history | External demand interviews not performed |
| M1 Offline reconciler | Implemented, adversarial tests and independent review | Broader real incident usefulness |
| M2 Evidence/schedule subset | Schema-v1 bundles/policies and single UTC adapter implemented | Named zones/multiple entries deliberately excluded |
| M3 Read-only collection | Bounded collector and mocked API integration implemented | Live private access and wider repository samples |
| M4 Usable CLI | collect/audit/policy, text/JSON, installed-package tests implemented | Unfamiliar external developer walkthroughs |
| M5 Release preparation | Docs, CI, security/correctness review and source package preparation | Owner PR review, CI result, merge/publication approval |

## Essential next steps

1. Review the final PR and its test/review record; resolve any reported release blocker before merging.
2. Reproduce the synthetic example and one real stable interval; inspect assertions instead of simply enabling all flags.
3. Before publishing, follow [RELEASE.md](RELEASE.md), verify package name availability and provenance settings, select an approved version/ref and remove the deliberate publication guard only after approval.
4. Validate demand: ask a small number of maintainers about actual incidents and whether this report changes a decision. No outreach has been sent. Stop expanding if the output is mostly unknowns or existing tools suffice.

## Maintenance priorities

False certainty, credential safety, API/schema compatibility and reproducibility outrank convenience. Review official scheduling/retention/API docs and dependency changes before releases. Keep CI offline and runtime support narrow. There is no guaranteed response SLA; school/exam breaks are acceptable. No hosted obligations or infrastructure budget are needed. Maintenance effort remains uncertain and can increase with upstream changes.

## Optional work (requires evidence of need)

- Multiple schedule entries: preserve overlap ambiguity without original cron identifiers.
- IANA time zones: conformance evidence for spring gaps/fall folds, pinned timezone data and unresolved-case handling.
- Historical schedule epochs: preserve branch/merge/disablement uncertainty rather than trusting current YAML.
- More platform/runtime coverage, private-repository manual validation and sanitized permitted fixtures.
- Compact reports for large ambiguous graphs, full request provenance, reviewed schema migrations.
- Additional output formats or Enterprise hosts only with an actual user and maintenance budget.

Remaining independently scoped issue drafts are in [issues/README.md](issues/README.md). Hosted monitoring, notifications and automatic workflow recovery remain outside this project. If users chiefly want alerts or execution guarantees, recommend established tools or contribute upstream instead.
