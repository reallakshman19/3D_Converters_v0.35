# FBX selected-zone package qualification and release evidence (Phase 7)

`tabs/model-converters/converters/fbx/zone-package/qualification.js`,
`scripts/fbx/qualify-zone-package.mjs`,
`tests/fbx/test-zone-package-qualification.mjs`.

## What is certified here

`runZonePackageQualification({ geometryCount })` runs a deterministic
synthetic truth set (N distinct closed tetrahedra, procedurally generated —
not `Math.random`-derived) through the full Phase 1/5/6 pipeline twice and
reports three explicit, independently-checked thresholds:

| Check | Threshold | What it proves |
| --- | --- | --- |
| `byteDeterminism` | archive SHA-256, package audit digest, and diagnostic-ledger digest identical across two independent builds of the same input | the pipeline has no hidden nondeterminism (ordering, timestamps, random ids) |
| `resourceCeiling` | file count ≤ `FBX_ZONE_PACKAGE_LIMITS.maxPackageFiles` (200,000); archive bytes bounded relative to file count | the package builder and archive codec stay within the admitted resource ceiling as geometry count scales |
| `ledgerCoverage` | Phase 5 ledger entry count exactly equals the truth-set geometry count | every selected geometry is explained, with zero silent omissions |

`overallStatus` is `PASS` only when every check passes. The qualification
report itself is hashed (`reportDigest`) and re-run in the test to prove
the *report* is reproducible, not just the package.

Run it directly: `node scripts/fbx/qualify-zone-package.mjs [geometryCount]`
(defaults to 200; exits non-zero on any failed threshold).

## Rollback and compatibility evidence

- Every Phase (1-6) is additive: new files under
  `tabs/model-converters/converters/fbx/zone-package/`, new
  `contracts/fbx/fbx-selected-zone-*.schema.json` files, one new browser
  addon file, and one new import + one new idle-scheduled installer entry
  in `ModelConvertersTab.js`. No existing exported function's signature,
  existing schema, or existing test assertion was changed by this work.
- The one behavioral change to already-shipped code is the new installer
  registration in `MODEL_CONVERTER_INSTALLERS`; it runs through the
  existing `installSafely` try/catch wrapper, so a failure in the new
  addon cannot break tab rendering. Reverting is a single-commit revert of
  the files listed above with no other coupling.
- `tests/fbx/run-all.mjs` (the existing certification gate used by
  `.github/workflows/fbx-stagedjson.yml`) passes end-to-end with every
  Phase 1-7 test registered in it; no existing test in that suite was
  weakened to make this pass.

## Explicit thresholds and authorities still required before release

Per the original plan's Phase 7 boundary ("Release only after explicit
thresholds and authorities are approved"), the checks above are the
mechanical/engineering evidence this implementation can produce
unsupervised. They are **not** a release approval by themselves. Before
release, an owner must still explicitly approve:

- the disposition taxonomy in Phase 5 (`CLOSED`/`CAPPED`/`MERGED`/
  `MULTI_SHELL`/`INVALID_TOPOLOGY`/`OTHER_GOVERNED`) against real
  engineering judgment, not just internal graph-theoretic consistency;
- the Phase 3/4 candidate-identity and host-review process against real
  organizational review authority (who counts as an approving reviewer);
- the `geometryCount` production ceiling for `runZonePackageQualification`
  (200 here is a fast CI-sized default, not a claim about real-model
  scale).

## Unavailable proof (explicitly not claimed)

Following this repository's convention of stating gaps rather than
omitting them:

- **No real TAY-A run.** The truth set here is synthetic. The real TAY-A
  `.fbx` source (~389 selected geometries, per the original task) is
  hosted on Google Drive and was not fetched into this environment; no
  TAY-A-derived geometry count, disposition distribution, or byte digest
  is claimed anywhere in Phases 1-7.
- **No hosted GitHub Actions run result** for this exact head is attached
  here; `tests/fbx/run-all.mjs` was run locally in this environment only.
  `.github/workflows/fbx-stagedjson.yml` already triggers on
  `contracts/fbx/**`, `tests/fbx/**`, and `docs/fbx/**`, so it will run
  automatically once this is pushed as a pull request.
- **No real browser/Worker lifecycle proof** for Phase 6. The download
  button's `Blob`/`URL.createObjectURL`/`revokeObjectURL` sequence follows
  the same pattern already shipped and used in
  `fbx-preview-zone-selector.js`, but was not exercised in an actual
  browser in this environment — only asserted statically (source-pattern
  presence, no Worker/canvas/parser imports).
