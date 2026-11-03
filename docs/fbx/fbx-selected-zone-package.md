# FBX Selected-Zone Package

The selected-zone package is a deterministic, validated export of already accepted FBX topology. It does not parse FBX, infer support restraint type, or invent host relationships.

## Authority boundaries

- `FbxZoneGeometryEvidence.v1` remains the authority for selected occurrences, ancestry, transforms, and selected-zone scope.
- `FbxSelectedZoneGeometryManifest.v1` owns the selected geometry projection and exact binary-buffer integrity only.
- Shared geometry is represented once with a sorted `occurrenceIds` array. The manifest does not own occurrence transforms.
- StagedJSON remains engineering-semantic authority when present.
- Support evidence is candidate evidence only; host binding requires explicit, governed evidence.
- Cross-zone association evidence does not expand the selected geometry population.

## Deterministic binary contract

All geometry buffers are encoded explicitly in little-endian byte order:

- `control-points-mm`: Float64, three components per control point;
- `polygon-offsets`: Uint32;
- `polygon-vertex-indices`: Uint32.

The runtime validates integer ranges, buffer lengths, topology offsets, hashes, deterministic paths, and the exact three-role order.

## Package audit

The audit inventories every physical file except `audit.json` itself, including every geometry descriptor and binary buffer. Each present record binds path, role, byte length, and SHA-256. Optional StagedJSON, support evidence and semantic evidence are either present with integrity metadata or explicitly `OMITTED_BLOCKED` with a reason.

The package builder immediately re-validates its own output. Validation rejects unbound files, omitted-file publication, manifest or buffer tampering, unsafe paths, malformed StagedJSON, support evidence from another zone, and incomplete geometry inventory.

## FBX2 closure evidence

The FBX2 governed benchmark may add this complete evidence set:

| Role | Package path | Schema |
|---|---|---|
| `BRANCH_MATCH_LEDGER` | `evidence/branch-match-ledger.json` | `FbxSelectedZoneBranchMatchLedger.v1` |
| `GLOBAL_OCCURRENCE_INDEX` | `evidence/global-occurrence-index.json` | `FbxGlobalOccurrenceIndex.v1` |
| `CROSS_ZONE_SUPPORT_ASSOCIATION_EVIDENCE` | `evidence/cross-zone-support-associations.json` | `FbxCrossZoneSupportAssociationEvidence.v1` |
| `COORDINATE_PROFILE` | `evidence/coordinate-profile.json` | `FbxBenchmarkCoordinateProfile.v1` |

These roles are optional for general selected-zone exports but all-or-none when used. Their validator independently recomputes the global-index, support-evidence, coordinate-profile and branch-ledger digests and cross-checks them against the selected-zone manifest.

A passing cross-zone support entry must:

- claim one unique source occurrence present in the global index;
- correspond to one PASS SUPPORT record in the branch ledger;
- preserve `MATCHED_CROSS_ZONE_SUPPORT` as the terminal disposition;
- bind one existing managed PIPE host;
- retain `selectedZonePopulationChanged: false` and `siblingGeometryImported: false`.

The closure package does not classify REST, GUIDE, STOP or other restraint mechanics and does not publish SUPPORT records into StagedJSON.

## Browser export

The zone-analysis controller publishes validated package inputs only after a successful selected-zone analysis. The **Download zone package** control remains disabled until those live inputs exist and is invalidated when the analysis is cleared or fails.

## Archive

`FBXZPKG1` archives enforce fixed file-count, header-size and total-byte ceilings. Decoding rejects unsafe or duplicate paths, non-contiguous or overlapping offsets, truncation, malformed directories and SHA-256 mismatches.

## Remaining release evidence

Synthetic qualification proves package mechanics, deterministic inventory and fail-closed binding. A source-specific release claim still requires the exact governed archives to execute on a functioning runner. Hosted jobs that terminate before step 1 do not provide real-source qualification evidence.
