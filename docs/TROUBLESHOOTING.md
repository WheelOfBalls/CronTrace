# Troubleshooting

| Symptom | Action |
| --- | --- |
| Every opportunity is unknown / exit 3 | Inspect reasons and policy flags/interval. Current YAML is not historical evidence. Keep unknowns if assertions cannot be justified. |
| No opportunities and exit 3 | Check `schedule.reasonCodes`; named zones, multiple entries or invalid syntax are unsupported. Empty current schedules cannot certify historical absence. |
| Dense ambiguous/unknown output | H may span many schedules; inspect candidate components and context. Do not shrink H merely to make the report look better. Use a defensible bound or accept uncertainty. |
| `unknown_unexplained_run` | A record fits no supported opportunity within H. Check schedule history and horizon; aggregate lag/gap judgments are suppressed. |
| Initial collection fails safely | Verify canonical repo/workflow identifiers, token permissions/SSO, default-branch workflow presence, network and rate limits. Raw server errors are intentionally not echoed. |
| Partial collection / exit 3 | Inspect collection diagnostics. Wait for a rate-limit reset before recollecting; reduce interval/density if request budget or saturated seconds apply. Partial files remain usable evidence. |
| Missing original start | Attempt one may be unavailable. Creation evidence can still exist; rerun start must not replace the original. |
| Cannot create/read file | Use a trusted existing directory, a new output name, regular UTF-8 JSON and no symlink path components. CronTrace never overwrites. |
| Digest mismatch | Evidence was edited/corrupted. Restore the original or recollect; do not manually change the digest to hide uncertainty. Policies are separate and intentionally editable. |
| Duration/date error | Use `30m`, `24h`, etc.; dates need a timezone and seconds. Late tolerance must be ≤ horizon; target span ≤90 days. |
| Resource limit | Reduce the audit interval. Limits fail explicitly, without sampling or truncation. |
| `crontrace` not found | Run `npm run build` then `node dist/bin.js --help`, or install the locally packed tarball. Nothing is published to npm yet. |

To report a bug, include tool/Node versions, command shape without credentials, exit code, reason codes and a minimal synthetic fixture. Do not upload private evidence by default. Live collection is not needed to reproduce most analysis bugs.

If your network requires a proxy, Node 24 can opt into standard proxy environment variables with `NODE_USE_ENV_PROXY=1 crontrace collect ...`. Use only a trusted configured proxy. CronTrace does not discover proxy credentials or change TLS verification. The development environment's direct connections were refused; the live smoke test succeeded with this opt-in.
