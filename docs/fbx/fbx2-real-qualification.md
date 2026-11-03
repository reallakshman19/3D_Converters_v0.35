# FBX2 real qualification

`FBX2-REAL-QUAL-001` is the executable release-evidence gate for the governed FBX2 source and managed reference archives.

## One-command execution

From the repository root:

```bash
node scripts/fbx/qualify-fbx2-real.mjs
```

The default command securely extracts:

```text
Benchmarks/FBX2/STF_2026Jul23-1554_binary.zip
Benchmarks/FBX2/ATTRIBUTE_GL_managed_stage.zip
```

It then runs the exact two-build benchmark, constructs two independent selected-zone closure packages, compares their ledger, audit and archive identities, reopens the emitted `FBXZPKG1` archive, runs the full package validator and writes:

```text
artifacts/fbx2-small-benchmark.json
artifacts/fbx2-global-occurrence-index.json
artifacts/fbx2-cross-zone-support-association.json
artifacts/fbx2-branch-match-ledger.json
artifacts/fbx2-selected-zone-package-audit.json
artifacts/fbx2-selected-zone-package.fbxzpkg
artifacts/fbx2-real-qualification.json
```

Python 3 is required only for secure ZIP extraction. Override the executable with `FBX_QUALIFICATION_PYTHON` when necessary.

## Pre-extracted execution

A CI or controlled runner may supply exact extracted files:

```bash
node scripts/fbx/qualify-fbx2-real.mjs \
  --fbx .tmp/fbx2/input/STF_2026Jul23-1554_binary.fbx \
  --managed .tmp/fbx2/output/ATTRIBUTE_GL_managed_stage.json \
  --input-zip Benchmarks/FBX2/STF_2026Jul23-1554_binary.zip \
  --output-zip Benchmarks/FBX2/ATTRIBUTE_GL_managed_stage.zip \
  --artifact-root artifacts \
  --receipt artifacts/fbx2-real-qualification.json
```

The benchmark runner independently checks all archive and extracted-file byte lengths and SHA-256 identities.

## Receipt dispositions

The receipt schema is `Fbx2RealQualificationReceipt.v1`.

- `QUALIFIED_EXACT_PARITY`: every managed record is an exact PASS.
- `QUALIFIED_WITH_EXPLICIT_SOURCE_OMISSIONS`: all non-PASS managed records are explicit `SOURCE_NOT_EXPORTED_AS_STANDALONE_GEOMETRY` omissions.
- `BLOCKED_REAL_QUALIFICATION`: one or more release checks failed.

Qualification requires:

- source identities are bound;
- both benchmark runs are deterministic;
- managed and selected-source terminal coverage is complete;
- no managed record is unresolved;
- no blocked record exists except an explicit source-export omission;
- support population is conserved;
- every expected support is matched;
- no support association is ambiguous;
- the branch ledger conserves all managed records;
- the package archive reopens and passes the complete validator;
- the archive audit equals its emitted sidecar;
- all closure artifacts are present and hash-bound.

The command exits non-zero for a blocked receipt. `--allow-blocked` is diagnostic only; it writes and prints the blocked receipt without converting it into a release pass.

## Authority boundary

This gate proves the exact governed, reference-assisted benchmark and package closure. It does not prove autonomous FBX inference, restraint subtype, engineering-attribute parity, connectivity parity or SUPPORT publication to StagedJSON.

A GitHub Actions job that terminates before step 1 is not qualification evidence. Run this command on an owner-controlled machine when the hosted runner remains unavailable.
