# Security

CronTrace 0.1.0 is an initial release candidate. Security review and tests reduce known risks; they do not guarantee safety in every environment. Only the current development version is maintained before the first release.

## Permissions and credentials

The collector uses GET requests only, fixed to `https://api.github.com`, and rejects redirects and foreign pagination links. Public collection can be anonymous. Authorized private collection needs a fine-grained token with Actions read and Contents read on the selected repository; metadata read is implicit. No write permission is needed. Organization policies may require approval/SSO.

Use GH_TOKEN or GITHUB_TOKEN from a secret manager/CI secret. Never pass tokens in command arguments, checked-in files or issue reports. Credentials and arbitrary response bodies are not stored. Response handling checks for the configured token, including JSON escapes and decoded YAML; errors avoid echoing raw response/parser data. This is not a general secret scanner: workflow source may contain other credentials or sensitive configuration. Review before sharing evidence. The tool neither executes workflow YAML nor downloads artifacts/logs.

## Local data

Evidence includes the pinned workflow source and repository identifiers. Reports include policy notes and run links. Treat private-repository files as sensitive. New files use exclusive 0600 creation on the verified Linux platform; existing files are never overwritten. Reads are bounded regular-file UTF-8 JSON; symlink paths are refused. Use a trusted directory: parent-directory replacement races by another local actor are not fully prevented. SHA-256 detects changes, not forged provenance. Do not trust a checksum as a signature.

The collector and parser impose request/time/size/count bounds. Offline analysis has no networking. There is no telemetry. `private: true` in package.json prevents accidental publication during review.

## Reporting

For a public, non-sensitive bug, open an issue with a minimal synthetic reproduction. For a vulnerability, use the repository's **Security → Report a vulnerability** option if enabled: https://github.com/WheelOfBalls/CronTrace/security/advisories/new. If unavailable, open an issue requesting a private contact channel **without exploit details, credentials or private evidence**. No unverified maintainer email is provided. Do not test against other people's repositories or disclose secrets. Acknowledge that this student-maintained project has no guaranteed response time.

## Known development dependency advisory

As reviewed on 2026-11-18, the supported lint toolchain transitively includes picomatch 4.0.7, affected by [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf) (repeated-extglob regular-expression denial of service). The registry did not provide a patched picomatch version at review time. npm attributes this single underlying advisory to nine high-severity packages in the development dependency chain. It is **not present in the production dependency tree or the installed CLI package**. Lint patterns in this repository are fixed, and CI already treats contributor source/tests as executable; do not process untrusted glob patterns through the tooling in a long-running service.

This remains an open development-tooling risk, not a claim of a clean full dependency audit. Runtime-only `npm audit --omit=dev` reported zero vulnerabilities. Retain the supported toolchain rather than downgrade ESLint to an unsupported version merely to alter audit counts. Track the upstream fix and recheck before publication; dependency advisories can change after this review.
