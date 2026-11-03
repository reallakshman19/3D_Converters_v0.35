# FBX Source-to-Benchmark Lineage

## Stage 1 — exact identity binding

The governing source for `Benchmarks/fbx BM/StaggedJsonBMforFBX` is the external binary FBX `fbxtaya.fbx`. Stage 1 records and verifies the exact source bytes and the exact repository benchmark blob without claiming that every benchmark occurrence has been traced to a source occurrence.

The binding artifact is:

```text
Benchmarks/fbx BM/StaggedJsonBMforFBX.source-binding.json
```

It binds:

- Google Drive file and retained revision identity;
- source byte length and SHA-256;
- binary FBX version, file ID, creator, creation time, axes and unit settings;
- benchmark repository, creation commit, path and Git blob SHA-1;
- observed source and benchmark population counts;
- the explicit statuses `derivationStatus=UNPROVEN` and `certificationStatus=BLOCKED`.

The binding hash is recomputed from canonical JSON with `bindingSha256` set to `null`. A caller-supplied digest is not accepted as authority.

## Verification

Run with the exact external source and repository benchmark:

```text
node scripts/fbx/verify-fbx-benchmark-source-binding.mjs /path/to/fbxtaya.fbx
```

The verifier fails closed on source length, FBX header/version, source SHA-256, binding hash or benchmark Git blob mismatch.

## What Stage 1 does not prove

Stage 1 does not prove the source-to-benchmark transformation. The benchmark has 499 child records while the source inspection observed 441 direct branch children. The net difference of 58 is retained as evidence, not explained away.

Stage 2 must use the repository `FbxSourceGraph.v2` parser output to construct branch-by-branch and occurrence-by-occurrence lineage, including synthetic records, filtered geometry, normalized component families and separately authoritative enrichment fields. Benchmark or release certification remains blocked until that accounting is closed.
