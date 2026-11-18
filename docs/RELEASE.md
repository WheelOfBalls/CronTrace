# Initial release checklist

Publication and merge require explicit owner approval. No release workflow publishes automatically. The source package deliberately has `private: true` until that decision.

1. Review the PR, [implementation status](IMPLEMENTATION_STATUS.md), [review record](REVIEW.md), known limits and the actual CI result.
2. On the approved immutable ref, run `npm ci`, `npm run verify`, `npm audit`, and `npm pack --dry-run`. Review the file allowlist and dependency/license changes. Test the local tarball installation from the README.
3. Check current GitHub schedule/API/retention documentation. Record API-version compatibility and a small read-only live smoke check; do not invent a real missed event as a test.
4. Confirm README/CHANGELOG accurately describe the candidate, source-install instructions, unvalidated demand and unsupported semantics. Remove the temporary feature-branch instruction only after merge.
5. Decide the npm package name and version; availability/reservation is not established. Keep package.json and src/version.ts aligned. Review provenance/trusted publishing settings, npm account security and an SBOM if required by the chosen release process.
6. Only after publication approval, remove `private: true`, regenerate lock metadata, rerun verification and prepare the exact tarball. Review it before publishing. Do not expose real evidence or credentials.
7. Merge/tag/release only with owner approval. Preserve schema-v1 fixtures; changing inference may require a version bump even when syntax is unchanged. Publish release notes describing known uncertainty and support expectations.

No package, tag or GitHub Release is created by the implementation task. A PR and locally verified package are review artifacts, not an authorization to publish.
