# D02 — Define a versioned evidence bundle and policy contract

Status: draft. Suggested labels: `architecture`, `data-contract`. Milestone: M2. Estimate: 4–7 hours. Dependencies: none; reconcile the minimal D03 in-memory contract before merge.

## Problem

An offline report cannot be reproducible if its inputs, collection coverage and operator assumptions are implicit or mixed together.

## Deliverable

Version-1 bundle and policy schemas, validators, a small synthetic example and a compatibility note. Separate API traversal, historical availability, definition validity, eligibility and context coverage. Include projected source fields, query provenance, timestamps, IDs as strings, digests and reasons for missing values.

## Acceptance criteria

- Invalid/missing versions, corrupt hashes, conflicting identity, invalid bounds and unsafe bundle paths are rejected explicitly.
- Operator assertions are bounded, labeled and distinct from observed metadata.
- A current workflow snapshot cannot be treated as historical registration evidence.
- Unknown fields are handled by a documented compatibility rule; no silent interpretation of newer semantics.
- Bundle identity and canonical serialization avoid circular hashing; identical inputs yield identical digests.
- Evidence files contain no credential fields; projection and redaction behavior have tests.

## Out of scope

HTTP collection, automatic history reconstruction, cron enumeration, presentation, telemetry or publishing a schema package.
