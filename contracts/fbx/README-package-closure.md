# FBX2 closure contracts

The FBX2 selected-zone closure package uses these Draft 2020-12 contracts:

- `fbx-benchmark-coordinate-profile.v1.schema.json`
- `fbx-global-occurrence-index.v1.schema.json`
- `fbx-cross-zone-support-association-evidence.v1.schema.json`
- `fbx-selected-zone-branch-match-ledger.v1.schema.json`

The package audit contract inventories each corresponding artifact role exactly once. Runtime validation additionally recomputes digests and enforces cross-artifact identity, branch-host and selected-zone geometry boundaries.
