# Synthetic audit example

All identities, runs and historical assertions here are synthetic; no real user workload or scheduler benchmark is represented.

The hourly UTC definition has three target opportunities on 2026-01-01 at 00:00, 01:00 and 02:00. Two distinct scheduled runs are recorded at 00:05 and 01:30. The latter failed, but still counts as an execution. Under H=50 minutes, L=10 minutes, complete fixture coverage and explicit fixture assertions, expected outcomes are within tolerance, late, and a potential gap. H is deliberately shorter than the hourly spacing for this isolated example; it is not a recommended bound for real workloads.

```sh
node dist/bin.js audit examples/synthetic-evidence.json \
  --policy examples/synthetic-policy.json --late-after 10m
```

Expected output is `synthetic-report.txt`. Installed-package E2E tests compare it exactly and check JSON replay under different host timezones. The adversarial tests in `test/reconcile.test.ts` cover competing delayed runs, boundaries and reruns that this short introductory example does not illustrate.
