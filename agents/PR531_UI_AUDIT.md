# PR531 — Independent Fatigue UI / Product-Authority Audit

## Audit target

Repository: `reallaksh19/3D_Converters`

PR: `#531`

Branch: `agent/hp-ch9-fatigue-foundation-r3`

Current main audited before change: `f25f721dc35c30b2f7a911f31c26ccdf8a53c6ac`

Product path audited:

```text
tabs/hp-piping-class-tab.js
  -> engineering/hp-class-standardization/engineering-library.html
  -> engineering/hp-class-standardization/authority-package.html
  -> engineering/hp-class-standardization/index.html
  -> app.js + fatigue-authority-guard.js + ui.js
```

The audit was performed independently from the PR description. Findings were validated against the actual source/runtime path and the PR531 `USER_CALCULATED_KD3` contract.

### Audit evidence boundary

This is a **source/runtime-path and engineering-authority UI audit**. The current chat does not expose a controllable browser/runtime for screenshot capture, so a screenshot-based visual-polish, responsive-layout, keyboard-navigation and accessibility audit is `NOT_RUN`. No claim of full visual or WCAG validation is made here.

## Authority baseline

PR531 intentionally establishes:

```text
native CORE KD320 = NOT_QUALIFIED / FAIL_CLOSED
permitted interim path = USER_CALCULATED_KD3
Seq authority = USER_SUPPLIED
N authority = USER_SUPPLIED
n authority = GOVERNED_TRANSIENT_SPECTRUM
Ui / cumulative Miner usage = CORE_DERIVED
canUseForDesignAuthority = false
codeCompliance = false
```

Any UI or package behavior that allows native Seq reconstruction, native fatigue-curve life evaluation, or design-authority release is therefore a product-authority defect even if the underlying PR531 kernel remains fail-closed.

## Findings

### P0-01 — Browser UI could execute an unqualified native/automatic Seq route

**Confirmed.**

The legacy calculator exposed:

```text
mean-embedded
explicit-mean
```

and `app.js` contained executable automatic Seq logic, including a reviewer-entered beta/reference-amplitude correction path. The UI could report `Automatic Seq ready` even though PR531 removed the provisional KD320 implementation from the qualified foundation.

**Risk:** UI/product behavior contradicted the fail-closed calculation authority contract.

**Fix:**

- UI now exposes `User-calculated KD-3 — supply Seq and N` only.
- `CORE KD-3 — not qualified` is visible but disabled.
- `fatigue-authority-guard.js` hard-blocks any non-manual Seq mode even if DOM/package state is manipulated.
- legacy beta/Nref/term-limit controls are hidden and disabled.
- authority-package import rejects native/automatic Seq modes and legacy mean-stress execution parameters.

**Disposition:** FIXED / regression locked.

### P0-02 — Browser UI could calculate N from entered curve data despite USER_CALCULATED_KD3 requiring external N

**Confirmed.**

The legacy UI exposed automatic fatigue-curve interpolation and `app.js` could populate `Ni` from reviewer-entered curve points.

**Risk:** Product path could silently shift fatigue-life authority from the external calculation to CORE mathematical tooling without native KD-3 qualification.

**Fix:**

- UI now exposes `User-supplied permissible cycles N` only.
- `CORE fatigue-curve evaluation — not qualified` is visible but disabled.
- runtime guard blocks any non-manual curve mode.
- authority packages carrying automatic curve mode or embedded curve data are rejected.

**Disposition:** FIXED / regression locked.

### P0-03 — External-result completion could be rendered as a class-release candidate

**Confirmed.**

The legacy calculator could emit:

```text
Eligible for class-release review
```

while PR531's external KD-3 evaluator explicitly returns:

```text
canUseForDesignAuthority=false
codeCompliance=false
```

**Risk:** severe semantic authority escalation in the product UI.

**Fix:**

- review stage renamed from `Class Envelope` to `Review Envelope` in the live calculator view;
- release language now explicitly prohibits CORE-qualified KD-3, Code compliance and design-authority claims;
- runtime guard converts any residual legacy `Eligible for class-release review` result to:

```text
Review only — KD-3 design authority not established
```

- KD workflow status is prevented from presenting native authority as complete.

**Disposition:** FIXED / regression locked.

### P1-01 — Authority-package imports accepted legacy automatic KD-3 modes

**Confirmed.**

`authority-package-core.js` previously validated source manifests and package structure but did not constrain `seqMode` or `fatigueCurveMode` to the PR531 external-authority path.

**Fix:** package validation now requires:

```text
seqMode = manual
fatigueCurveMode = manual
```

and rejects beta/Nref/mean-term and embedded fatigue-curve data while native KD-3 remains unqualified.

**Disposition:** FIXED.

### P1-02 — Package `preparedBy` and `checkedBy` were not required to be independent

**Confirmed.**

An `approved-record` required `checkedBy` but allowed the same identity as `preparedBy`.

**Fix:** normalized prepared/checker identities must differ.

**Disposition:** FIXED.

### P1-03 — Approved row evidence was structurally under-validated

**Confirmed.**

The package layer previously checked row keys but did not require approved rows to have valid Seq, N and an external calculation/source reference.

**Fix:** approved row evidence now requires finite positive Seq, finite positive N and nonblank external source/calculation reference.

**Disposition:** FIXED for the positive-damage UI path.

### P1-04 — Zero-damage cycles are supported by the PR531 core but not faithfully represented by the legacy row UI

**Confirmed / unresolved.**

The PR531 `USER_CALCULATED_KD3` evaluator allows the qualified zero-damage case:

```text
CORE Salt = 0
Seq = 0
N = not applicable
Ui = 0
```

The legacy calculator row model uses blank numeric inputs that coerce to zero and `kdComplete()` requires `Seq > 0` and `Ni > 0`, so zero-damage and incomplete-input states are not cleanly distinguishable.

**Required successor fix:** move the UI to the canonical PR531 evaluator/result contract rather than extending the legacy DOM row model.

**Disposition:** OPEN — successor product-integration scope.

### P1-05 — Product UI remains pressure-cycle / wall-matrix centric

**Confirmed / accepted scope boundary.**

The live HP class workflow is explicitly a straight-pipe pressure-cycle prequalification tool. It is not yet a general VIII-3 load-state fatigue UI and should not be presented as one.

**Required successor fix:** future standalone VIII-3 fatigue product integration should use load-state pairs and locations as canonical entities rather than pressure pairs only.

**Disposition:** ACCEPTED PR531 SCOPE; do not broaden this PR.

### P1-06 — Outer package shell used production/approval language without an explicit authority qualifier

**Confirmed.**

The outer live path called the transport artifact a `Controlled production package` and exposed an `Approved record` lifecycle. Although this did not change calculation arithmetic, it could be read as stronger engineering authority than PR531 permits.

**Fix:**

- renamed the user-facing shell to `Controlled review package` / `Evidence Package`;
- changed the lifecycle label to `Checked / approved document record — no design authority` while retaining the schema value for compatibility;
- added a visible authority warning that package lifecycle is document/review custody only and does not establish ASME Code compliance, CORE KD-3 qualification or design authority.

**Disposition:** FIXED.

### P2-01 — Optional user Salt cross-check is not surfaced in the legacy calculator UI

The PR531 external evaluator supports optional user `Salt` and fails closed on mismatch against the CORE straight-pipe pressure-cycle Salt. The current calculator matrix does not expose this field or comparison state.

**Disposition:** OPEN — successor USER_CALCULATED_KD3 product integration.

### P2-02 — Per-cycle calculation provenance is coarser in the legacy UI than in the PR531 contract

PR531 supports per-cycle calculation basis including code, edition, method reference, calculation reference, calculated-by, optional checked-by and checked-at. The legacy UI primarily retains package-level prepared/checker custody plus row source IDs.

**Disposition:** OPEN — successor canonical JSON/UI integration.

## Files changed by this correction

```text
engineering/hp-class-standardization/authority-package-core.js
engineering/hp-class-standardization/authority-package.html
engineering/hp-class-standardization/index.html
engineering/hp-class-standardization/fatigue-authority-guard.js
package.json
tests/b313-chapter-ix-fatigue-ui-authority.test.mjs
agents/PR531_UI_AUDIT.md
```

## Regression intent

The new tests lock the following invariants:

```text
USER_CALCULATED_KD3 is the only accepted product fatigue mode
native/automatic Seq packages are rejected
automatic CORE fatigue-curve N packages are rejected
legacy beta/Nref mean-stress execution inputs are rejected
preparedBy != checkedBy for checked custody
approved row evidence requires Seq/N/source
live UI exposes disabled native CORE KD-3 choices
class-release wording cannot survive the runtime authority guard
```

Consolidated command:

```text
npm run verify:hp-chapter-ix-fatigue
```

### Validation truth

The pre-UI-correction fatigue foundation had a retained `22 PASS / 0 FAIL` focused receipt. The newly added UI/package authority regression suite has **not executed** on the current PR head.

GitHub Actions did create repository-wide workflow runs after the correction, but the observed jobs failed before a runner executed any step:

```text
Vibration AIV Controlled Source Qualification  -> failure, steps=[], runner_id=0
Vibration Production Freeze Validation          -> failure, steps=[], runner_id=0
Topology Edit Support Reprojection              -> failure, steps=[], runner_id=0
```

Therefore:

```text
POST_AUDIT_FATIGUE_TEST_STATUS = NOT_RUN
HOSTED_EXECUTION_STATUS = INFRASTRUCTURE_BLOCKED / ZERO_STEP
SOURCE_TEST_FAILURE_OBSERVED = NO
```

Do not treat the zero-step workflow conclusions as a numerical or source-test failure, and do not treat the earlier 22-test receipt as execution evidence for the new UI corrections.

## Remaining release position

This correction does **not** qualify native KD-3 and does **not** authorize merge/design release.

PR531 remains:

```text
DRAFT
native CORE KD320 = BLOCKED
USER_CALCULATED_KD3 = permitted review/intake path
canUseForDesignAuthority = false
codeCompliance = false
MERGE_AUTHORITY = OWNER_ONLY / NOT_GRANTED
```

Recommended next PR remains the canonical `USER_CALCULATED_KD3` product integration (registry/adaptor + JSON import/export + per-cycle provenance + optional Salt cross-check + zero-damage representation), followed by independent native KD320 qualification benchmarks before any native formula is enabled.
