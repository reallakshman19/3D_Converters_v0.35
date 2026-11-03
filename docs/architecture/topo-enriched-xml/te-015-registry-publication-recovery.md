# TE-015 — Registry publication and recovery control

## Status and authority

TE-015 is an operations-side controller over the accepted TE-005 registry contracts and the accepted TE-012 bootstrap transaction. It consumes an independently read current registry, one approved `TopoNodeRegistryPatch.v1`, and the corresponding approved bootstrap result.

The controller prepares evidence for operator-controlled publication. It has no authority to alter the live registry, invoke GitHub, commit, push, merge, allocate node numbers, change lifecycle state, normalize topology, or run PSI/CII conversion.

GitHub Actions workflows are intentionally outside this branch. Repository workflows were removed by the owner to avoid Actions-credit consumption. TE-015 verification is therefore reported as explicit local command evidence rather than workflow status.

## API

```js
prepareRegistryPublication({
  currentRegistryRoot,
  approvedPatch,
  bootstrapResult,
  expectedBaseCommit,
  expectedCurrentSnapshotHash,
  targetManifest,
  evaluatedAt,
  fileSystem, // optional explicit adapter
})
```

`currentRegistryRoot` is the filesystem root beneath which every path in the target manifest is resolved. `fileSystem` is an explicit effect boundary; production defaults to the Node filesystem adapter, while tests may inject failures or corruption.

No wall clock, random identifier, network call, repository write, or hidden fallback is used.

## No-follow custody boundary

Every current, registry-subtree, candidate, rollback, file, and ancestor path is inspected using `lstat` before access. Symbolic links and other redirecting filesystem entries fail closed. Canonical paths are resolved only after no-follow inspection.

The candidate and rollback roots must be fully disjoint from the current registry and from one another in both parent/child directions. Containment is checked on canonical paths, not only lexical path strings.

A temporary root becomes invocation-owned only after exclusive creation succeeds. Cleanup requires the exact canonical ownership claim and removes only that verified canonical root. A pre-existing candidate or rollback root is rejected and remains byte-identical. Early validation failures cannot delete caller-owned paths.

## Target manifest

```js
{
  schema: 'TopoRegistryPublicationTargetManifest.v1',
  registryRootPath: 'node-history/registry/current/PROJECT/ZONE',
  temporaryRoot: '/absolute/operator-staging-root',
  rollbackProofRoot: '/absolute/rollback-proof-root',
  files: [
    { role: 'ZONE_REGISTRY', path: '.../zone-registry.json' },
    { role: 'LINE_HISTORY', mainLineKey: '/LINE-A', path: '.../lines/LINE-A.json' },
    { role: 'REGISTRY_MANIFEST', path: '.../manifest.json' },
  ],
}
```

Paths are POSIX-style repository-relative identities. Absolute targets, traversal, empty segments, backslashes, duplicate paths, case collisions, duplicate line identities, files outside `registryRootPath`, and incorrect role cardinality block before materialization.

The semantic target-manifest hash excludes machine-specific temporary paths. Different operators may stage in different approved locations while producing the same package hash.

## Publication stages

1. Normalize and validate the target manifest, expected commit, expected snapshot hash, and explicit evaluation timestamp.
2. Resolve all custody roots and ancestors with no-follow semantics and prove canonical isolation.
3. Recursively enumerate the current registry subtree and require exact equality with the target file set.
4. Read all current files as bytes, parse independently, validate through TE-005, and recompute zone, line-history, manifest, and complete snapshot hashes.
5. Compare the independently computed current snapshot to the caller-provided expected snapshot.
6. Require the approved patch and bootstrap result to be `PASS` and recompute their hashes.
7. Require exact patch/bootstrap bundle equality and exact base commit/snapshot preconditions.
8. Validate the complete proposed snapshot through TE-005 and re-run `verifyTopoNodeRegistryPatch` against independently read current artifacts.
9. Require unchanged project, zone, registry version, policy version, configuration version, and coordinate-registration references.
10. Exclusively create and claim the candidate root, then materialize every proposed artifact as canonical UTF-8 JSON with one trailing newline.
11. Re-enumerate and independently re-read the candidate tree; recompute every artifact and snapshot hash.
12. Build a recovery manifest containing every original path, exact before bytes, and raw byte hashes.
13. Exclusively create and claim the rollback-proof root, restore exact bytes, independently validate it, and prove original snapshot and file hashes.
14. Remove only the invocation-owned rollback root. Re-read the live registry and classify custody truthfully.
15. Emit a deterministic publication package only when every stage passes.

## Publication and recovery packages

A passing `TopoRegistryPublicationPackage.v1` contains project and zone, exact base commit and before/after snapshot hashes, target-manifest hash, ordered paths, ordered before/after file hashes, patch/bootstrap hashes, deterministic operator instructions, and the complete recovery manifest.

`TopoRegistryRecoveryManifest.v1` records the original snapshot hash, exact target paths, exact original bytes encoded as base64, each byte-payload hash, and its own deterministic hash.

Machine-local roots and audit timestamps are excluded from package semantics. Repeated semantic runs therefore produce byte-identical packages and package hashes.

## Result custody state

A passing result is possible only after an exact final live-registry re-read:

```text
status: PASS
publishablePackage: complete
acceptedMaterializedRoot: invocation-owned candidate root
rollbackProof.status: PASS
liveRegistryMutated: false
```

A blocked result never exposes an accepted package or root. Live custody is three-state:

```text
confirmed difference      -> liveRegistryMutated: true
confirmed byte equality   -> liveRegistryMutated: false
failed/unprovable reread   -> liveRegistryMutated: null
```

Controller-owned partial trees are cleaned after failure. Unowned existing trees are never reused or removed.

## Coverage and lifecycle containment

TE-015 does not interpret absence as retirement. A partial or non-authoritative patch that removes history or carries a `RETIRE_NODE` operation is blocked independently before publication.

Lifecycle changes, number ownership, lease validity, and patch diff coverage remain TE-005/TE-012 authority and are revalidated rather than reimplemented.

## Failure containment

The controller fails closed for stale authority, incomplete or unsafe path custody, symlinked roots or ancestors, overlapping roots, patch/bootstrap mismatch, partial writes, candidate corruption, rollback mismatch, and live-registry drift or indeterminate final proof.

No blocked run exposes a directory or package as accepted publication output.
