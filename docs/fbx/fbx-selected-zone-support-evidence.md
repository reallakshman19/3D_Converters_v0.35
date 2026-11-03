# FBX selected-zone support candidate evidence (Phase 3)

`contracts/fbx/fbx-support-evidence.v1.schema.json` — `FbxSupportEvidence.v1`.

## What this produces

For every selected-zone occurrence whose raw type is `ATTA` or `SUPPORT`,
`buildSupportCandidateEvidence` (in
`tabs/model-converters/converters/fbx/zone-package/support-evidence.js`)
emits a candidate record with an explicit, closed disposition:

- `GENERIC_SUPPORT` — the candidate carries at least one identity field
  (`SUPPORT_TAG`/`CMPSUPREFN`, `REF`, or `NAME`).
- `UNCLASSIFIED_SUPPORT` — the candidate has no identity evidence at all.

There is no third, implicit disposition; every candidate is one or the
other, with a machine-readable `dispositionReason`.

## What this deliberately does not produce

- No `REST` / `GUIDE` / `LINE_STOP` (or any other restraint-kind)
  classification.
- No restraint degrees-of-freedom.
- No host association — a candidate's `sourceIdentity` never contains a
  host occurrence, pipe, or surface reference.

Those require owner-reviewed authority external to what a parser or
geometry pass can produce; see Phase 4 (`fbx-selected-zone-host-authority`).
Feeding a `FbxSupportEvidence.v1` object into
`buildSelectedZonePackage({ supportEvidence })` sets the package audit's
`supportSemantics` to `CANDIDATE_EVIDENCE_ONLY` — never a restraint or host
determination.

## Determinism

`candidateId` is a truncated SHA-256 of the candidate's `occurrenceId`, so
candidate identity is stable across rebuilds and independent of input
ordering; candidates are emitted sorted by `candidateId`.
