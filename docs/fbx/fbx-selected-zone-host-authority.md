# FBX selected-zone host-authority binding (Phase 4)

`contracts/fbx/fbx-host-authority-binding.v1.schema.json` —
`FbxHostAuthorityBinding.v1`.

## Authority source

`buildHostAuthorityBinding` (in
`tabs/model-converters/converters/fbx/zone-package/host-authority.js`)
accepts an `ownerMapping` object supplied entirely from outside the
pipeline, keyed by the exact Phase 3 `candidateId`. Each entry must carry
`status: "APPROVED"`, a non-empty `reviewedBy`, an ISO-8601 UTC
`reviewedAt`, and one or more `hostOccurrenceIds`. There is no other input
this module will accept as host evidence.

## No proximity fallback

This module never computes a host by nearest geometry, containing pipe, or
any other derived signal. A candidate with no corresponding `ownerMapping`
entry is recorded in `unresolvedCandidateIds` and the overall `status`
becomes `BLOCKED` — it is never silently resolved.

## Multi-host and ambiguity

- `hostOccurrenceIds` may contain more than one occurrence; `multiHost` is
  then `true`. This is a legitimate, owner-approved outcome (e.g. a support
  spanning two pipe runs) and does not by itself block release.
- A reviewer may instead set `ambiguous: true` on an entry to record that
  the mapping is not fully resolved. Any `ambiguous` entry is collected
  into `ambiguousCandidateIds` and forces `status: "BLOCKED"`.

`status` is `"BOUND"` only when every candidate has an approved,
unambiguous entry.
