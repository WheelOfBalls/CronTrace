# Contributing

CronTrace is at the planning stage. There is no working application or installation procedure. Please read the [research](docs/RESEARCH.md), [specification](docs/PRODUCT_SPEC.md) and [decision](docs/DECISION.md) before proposing features.

## Useful contributions now

- Correct a sourced claim with an official document, original issue or inspected code reference and review date.
- Describe a real scheduling investigation and the decision an evidence report would have changed. Distinguish observed timestamps from inferred expected times.
- Supply small synthetic cases that expose ambiguous matching, reruns, missing history, changed definitions or disablement.
- Review the eight [issue drafts](docs/issues/README.md). Their labels and milestones are suggestions, not existing GitHub objects.

Do not generate workflow runs, stars, issues, testimonials or accounts to make the project look active. Do not publish another person's private repository data. Never include tokens, webhook URLs, logs containing secrets or unredacted API dumps in public reports.

## Proposing a change

Explain the concrete problem, current behavior or limitation, proposed behavior and evidence. Keep one independently reviewable purpose per change. New scope should identify the user need and why an existing tool or a contribution to one would not suffice. A maintainer review is needed before a large implementation, not for a small documentation correction.

Implementation work should begin with the offline reconciler milestone. Its tests must run without network access, credentials, real scheduled executions or a paid account. No code scaffolding or dependencies are present yet, so there is deliberately no fabricated `npm test` quick start. The first implementation change should document the actual setup and verification commands it introduces.

## Correctness expectations

Never label an unobserved event as a confirmed GitHub scheduler miss. Preserve unknown and ambiguous states; do not silently shrink denominators. Add regression cases for a real failure mode, with expected outcomes reviewed independently of the implementation. Reproduce reports using fixed inputs, fixed policy and explicit time. Source facts, operator assertions and design choices must remain distinguishable.

Keep network access inside the read-only collector and credentials out of all artifacts. Review any new dependency's license, maintenance and parsing behavior. Retain attribution when reusing third-party material. Contributions are intended to use the repository's MIT license; no CLA or automated sign-off system is configured.

## Reporting problems

Use the [CronTrace repository](https://github.com/WheelOfBalls/CronTrace) for planning feedback. Once an implementation exists, a useful bug report should include tool/schema version, command with secrets removed, audit interval, policy parameters, observed result and a minimal synthetic reproduction. Mention whether schedule history, enablement and retention are known or asserted. Use private reporting for sensitive material; a private contact channel has not yet been configured, so do not post secrets publicly while waiting for one.

Maintainer availability must fit school commitments. No response-time or support guarantee is promised. Be considerate, discuss evidence rather than motives, and accept that a deliberately small project may decline unrelated features.
