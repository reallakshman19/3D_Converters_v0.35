# PR505 — SBC P0 Governed Master Gate

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: WRITE_ALLOWED
PR: 505
BASE_MAIN: 353d905a7af3bc566ba5572771fa2d16c1617a48
BRANCH: agent/sbc-p0-governed-master
CRITICALITY: ENGINEERING_CRITICAL
CURRENT_STAGE: fail-closed source qualification gate complete / uploaded complete-register corroboration recorded / curve geometry unresolved
HIGHEST_RISK: publishing the supplied T3-1..T3-4 digitization despite independent D7 contradictions
EXACT_NEXT_ACTION: obtain a controlled readable render of Figures T3-1..T3-4 or a corrected independent digitization that reproduces D7; only then replace the rejected curve representation and rerun the source gate before any runtime/master activation.
```

## Mission / Outcome

User supplied the pinned candidate package:

`reallaksh19/Advanced_Analysis@6111ddbc0f27dd95b50a80c569a2c4daba3b3921/docs/EI data`

and subsequently uploaded:

`EI_AVIFF_Complete_Master_Register.md`

The uploaded complete register has been fingerprinted as:

```text
sizeBytes = 33272
sha256    = 1b88b6e1b8345eff89f751b196fb9fd29d73103d7bba67ccb49f6e9a7cd5f29a
status    = PASS_CORROBORATION_ONLY
```

The register now states the worked-example-correct combination rule and explicitly records the PR505 governance state: T3-1/T3-2/T3-3 tables qualified in the register, combination formula qualified in the register, T3-1..T3-4 curves blocked/quarantined. Because this uploaded file does not provide calibrated curve geometry, it does not independently resolve the D7 curve conflict and has no authority effect.

PR505 deliberately does **not** promote the supplied T3 curve values. It adds a permanent fail-closed qualification gate and release regression so a contradictory chart digitization cannot silently become a governed SBC master.

Current production Type-3 calculation semantics are preserved. No calculation equation, runtime resolver, UI behavior, screening authority or design authority is changed.

## Live Reconciliation

Initial base was `0fb4be2a03aa455efe5d476c8a8ba4e82b732b95`.

While PR505 was active, main advanced via AIV PR #504 to:

`353d905a7af3bc566ba5572771fa2d16c1617a48`

PR #504 changes AIV master/UI paths plus `package.json`; it does not overlap PR505's six paths. PR505 was reconciled with current main using a two-parent commit and preserves all #504 changes.

## Source Reconciliation

### PASS — non-curve table parity

The supplied P0 dataset matches the already-merged #484 candidate values for every row in:

- Table T3-1 fitting span factors — 15 rows;
- Table T3-2 first-span minimum lengths — 8 rows;
- Table T3-3 between-main-lines minimum lengths — 8 rows.

Pinned candidate blobs:

```text
T3-1 fitting factors   1c21cd7c856cd9656c50aeb0c6a0d5fc1e0dd319
T3-2 first-span limits 9da7aa1b4df520ad000bae4a034da2460a899629
T3-3 between-main      86dd78e684c3497ae968c69abf276cc69ccb07f1
```

These stay `CANDIDATE / engineeringAuthority=NONE / screeningAuthority=NOT_AUTHORIZED`. Cross-repo parity is evidence, not authority promotion.

### PASS — final SBC combination semantics

Pinned EI worked examples D5/D6/D7 prove:

```text
mainLineAdjusted = mainLineLof * 1.42
SBC LOF = min(mainLineAdjusted, SBC Modifier)
```

Independent examples:

```text
D5 = min(1.0 * 1.42, 0.66) = 0.66
D6 = min(0.49 * 1.42, 0.70) = 0.6958 ~= 0.696
D7 = min(1.0 * 1.42, 0.70) = 0.70
```

The uploaded complete register now agrees with this rule. The earlier product-formula sentence in `P0_SBC_Master_Data.md` remains rejected as conflicting with the worked examples. Existing `converters/vibration/sbc/type3-user-data.js` already uses the worked-example-correct minimum rule and was not modified.

### FAIL — supplied curve pack versus D7

Worked Example D7 independently requires:

```text
T3-1: D=1.5 in, modified first span=0.9/0.7=1.285714... m -> LOFGEOM(D)=0.2
T3-3: D=1.5 in, mass span=2.3 m                    -> LOFGEOM(F)=0.6
T3-4: D=1.5 in, no-mass span=1.4 m                 -> LOFGEOM(G)=0.2
```

Applying the supplied P0 threshold rows and their stated threshold logic yields:

```text
T3-1 -> 0.4  FAIL
T3-3 -> 0.7  FAIL
T3-4 -> 0.3  FAIL
```

One contradiction is sufficient to block publication; the supplied pack has three. The uploaded complete register preserves these same curve values and explicitly quarantines them, so it corroborates rather than resolves the blocker.

### SECONDARY SOURCE RECOVERY — CORROBORATION ONLY

A public text rendering of the EI 2nd Edition independently corroborates figure axes/LOF labels and the same D7 chart readings. It does not expose calibrated curve-line geometry/coordinates. The attempted PDF download/render path was unavailable in this runtime. No curve reconstruction was performed from D7 alone.

## Implemented Capability

### `converters/vibration/sbc/t3-p0-source-gate.js`

- pins exact `Advanced_Analysis` commit and source blobs;
- preserves the worked-example minimum combination rule;
- evaluates the supplied D7-relevant threshold rows deterministically;
- returns `BLOCKED_SOURCE_DATA_CONFLICT` when D7 parity fails;
- `assertSbcT3P0MasterPublicationQualified()` throws `SBC_T3_P0_MASTER_NOT_QUALIFIED` instead of allowing publication;
- authority remains NONE / NOT_AUTHORIZED / design false / master-data false.

### `ValidationRecords/VibrationMasters/advanced-analysis-sbc-p0-qualification-v1.json`

Machine-readable receipt containing table parity, combination-rule disposition, all three D7 conflicts, uploaded complete-register fingerprint/corroboration, publication decision and required resolution.

### `scripts/validate-vibration-sbc-p0-master.mjs`

Operator validation command. It prints the qualification envelope and exits non-zero when publication is blocked.

### `tests/vibration-sbc-p0-source-gate.test.mjs`

Pins exact source object identities, all non-curve table rows, D5/D6/D7 combination oracles, rejected candidate outputs 0.4/0.7/0.3, and fail-closed publication error code.

### Coordinated release gate

`scripts/verify-vibration-fit-release.mjs` includes the source-gate regression. Controlled manifest is **54 test files**.

## Authority / Invariants

```text
new SBC master engineeringAuthority = NONE
screeningAuthority                  = NOT_AUTHORIZED
designAuthority                     = false
masterDataAuthority                 = false
curve runtime activation            = false
manual User Engineering Data        = retained
current Type-3 combination formula  = unchanged
uploaded complete register          = corroboration only
```

No missing value becomes zero. No interpolation or extrapolation is introduced. No source conflict is hidden by fitting/reconstructing curves to worked-example points.

## Changed-File Ledger

```text
ValidationRecords/VibrationMasters/advanced-analysis-sbc-p0-qualification-v1.json  NEW/UPDATED
agents/PR505_workreport.md                                                    NEW/UPDATED
converters/vibration/sbc/t3-p0-source-gate.js                                 NEW
scripts/validate-vibration-sbc-p0-master.mjs                                  NEW
scripts/verify-vibration-fit-release.mjs                                      +1 test path
tests/vibration-sbc-p0-source-gate.test.mjs                                   NEW
```

No changes to `type3-user-data.js`, `facility.js`, SBC UI runtime, master resolver, engineering equations, screening/design authority or AIV PR504 files.

## Backup / Recovery Ledger

Repository-local `node utils/backup.js save` is environment-blocked because this connector runtime has no authenticated checkout. Exact Git blobs are retained as recovery evidence; the backup CLI is **NOT_RUN**.

```text
qualification receipt pre-upload-update 550ba39a017621540521ba0b7adf896365eace17
workreport pre-upload-update            1e7fa1a8ed7bd96c1180b7a3b07e5701848f3cf5
```

## Validation Ledger

| Check | STATUS | OBSERVATION | ORACLE / limitation |
|---|---|---|---|
| live main grounding | PASS | current main `353d905...` | GitHub |
| uploaded complete register fingerprint | PASS | 33,272 bytes; SHA-256 `1b88b6e1...` | exact uploaded bytes |
| uploaded register formula/governance | PASS_CORROBORATION | correct min rule; tables/formula qualified in register; curves quarantined | user-supplied register |
| T3-1/T3-2/T3-3 table parity | PASS | all supplied rows match existing candidates | pinned supplied P0 dataset |
| D5/D6/D7 final combination | PASS | bounded Node execution: 0.66 / 0.6958 / 0.7 | independent worked examples |
| supplied curve pack vs D7 | FAIL (expected gate result) | 0.4 / 0.7 / 0.3 vs 0.2 / 0.6 / 0.2 | independent D7 worked example |
| calibrated curve geometry recovery | NOT_RUN / UNAVAILABLE | no readable calibrated curve geometry | no digitization |
| publication guard | PASS_SOURCE_CONTRACT | throws `SBC_T3_P0_MASTER_NOT_QUALIFIED` | source inspection |
| exact new Node test file | NOT_RUN | no authenticated repository checkout | n/a |
| exact 54-file FIT/VIB release suite | NOT_RUN | no authenticated repository checkout | n/a |
| browser acceptance | NOT_RUN | no browser checkout | n/a |

The expected curve-qualification FAIL is the evidence that triggers safe blocking; it is not represented as engineering qualification.

## Coordination

- #484 merged: matching non-curve candidate T3 tables.
- #485 merged: prior curve-image hard stop; PR505 shows the supplied digitization still cannot clear it.
- #480 remains stale open/draft source inventory and should not substitute for PR505.
- #504 merged while PR505 was active; no exact-file overlap; PR505 preserves it.
- Uploaded complete register aligns with PR505 governance and is recorded as corroboration-only evidence.

## Appendix A — Implementation Takeover Qualification

### A1 Production Trace
`facility.js -> calculateSbcType3FromUserEngineeringData -> resolveBlockedVibrationData`. Current production still consumes explicit project input unless an independently governed value is supplied.

### A2 Current Failure Isolation
The unresolved blocker is specifically T3-1..T3-4 curve geometry/data. The final Type-3 combination rule and non-curve table values are not the failure.

### A3 Authority / Invariant
Do not publish the Advanced_Analysis curve thresholds until a corrected controlled representation reproduces D7. Preserve `designAuthority=false` and `screeningAuthority=NOT_AUTHORIZED`.

### A4 Independent Validation
D7 is the immediate curve oracle. Any replacement digitization must reproduce its three stated readings without tuning the oracle to implementation output, then receive boundary/interpolation testing across the full nominal-size domain.

### A5 Next Minimal Patch
Replace only the rejected curve candidate representation after controlled figure recovery. Rerun the source gate; only a PASS may unlock a separate runtime/master-publication change.

## Merge State

PR505 is draft/open. Merge is **NOT AUTHORIZED**.
