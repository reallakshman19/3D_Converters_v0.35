# Vibration Integrity — EI AVIFF Worked-Example Validation v1

## Execution binding

- Machine record: `ValidationRecords/VibrationIntegrity/ei-aviff-multimechanism-validation-v1.json`
- Validated implementation commit: `25ea66b2b8793fa77489ce6a0ff5ec20554e24b2`
- Controlled source: `reallaksh19/Common@fb549185b9b27edc2379734240320a85c5bef9f6`
- Focused Stage 6–11 execution: **15 / 15 PASS**
- Full `npm run verify:vibration-fit-release` (43 controlled test files): **NOT_RUN**
- Browser acceptance: **NOT_RUN**
- Engineering authority: `NONE`
- Screening authority: `NOT_AUTHORIZED`
- Design authority: `false`

The JSON record is the step-by-step source of truth. `PASS` means the named step was actually recomputed in this execution or is backed by the pinned executed AIV receipt. `SOURCE_REPLAY` / `NOT_RUN` is not calculator qualification.

## AUTO-mode stage decisions

| Stage | Decision | Validation |
|---|---|---|
| 6 — Mechanical excitation | `IMPLEMENTED_BENCHMARK_ONLY` | PASS on four retained D2 records |
| 7 — Deadleg pulsation | `IMPLEMENTED_BENCHMARK_ONLY_STANDARD_ONLY` | Standard T2.6 PASS; advanced path PARTIAL/source replay |
| 8 — AIV | `EXTERNAL_ACTIVE_PR` | PR #446 D.2.3 receipt 22/22 PASS; PR #448 changes no AIV solver |
| 9 — Valve transients | `IMPLEMENTED_BENCHMARK_ONLY_DRY_GAS_SUBPATH` | Two dry-gas D2 cases PASS; liquid D4 REVIEW_REQUIRED |
| 10 — Thermowell / SBC | `SOURCE_REPLAY_PARTIAL` | Available arithmetic PASS; full methods not implemented |
| 11 — no populated retained examples | `DEFERRED` | BLOCKED_NO_CONTROLLED_EXAMPLE |
| 12 — screening-authority review | `NOT_STARTED_MANUAL_GOVERNANCE` | AUTO MODE does not authorize promotion |

## Validation totals

Across 25 retained/coverage cases:

- **9 PASS**
- **10 PARTIAL**
- **1 REVIEW_REQUIRED**
- **5 DEFERRED**

### FIT — five cases

All five published FIT cases pass independent arithmetic cross-checks for `rhoV²`, viscosity factor, support class, standard `Fv`, and standard LOF. They are marked **PARTIAL**, not PASS, because the connector-only environment could not execute the complete exact-head repository import graph. The real production FIT path remains covered by the 43-file release gate, which is `NOT_RUN` here.

Representative LOF checks:

| Case | Published | Independent actual |
|---|---:|---:|
| Recycle suction | 0.276 | 0.27668688 |
| Relief upstream | 0.338 | 0.33925817 |
| Relief downstream | 0.881 | 0.88041226 |
| Separator inlet | 0.260 | 0.26038168 |
| Produced water | 3.150 | 3.15194690 |

### Mechanical excitation — four cases

The EI T2.3 source categories are implemented as a bounded benchmark-only method. Each retained D2 record independently reproduces motor/alternator `0.40`, centrifugal compressor `0.20`, and governing LOF `0.40`. The 15 kW motor threshold and unsupported-type fail-closed behavior are permanent regressions.

### Deadleg pulsation — three cases

The simplified EI T2.6 standard path is implemented and independently reproduces:

| Branch | Published Fv / Fs / ratio / LOF | Actual |
|---|---|---|
| Recycle discharge | 52.2 / 18.4 / 2.83 / 1.00 | 52.3399 / 18.4350 / 2.8392 / 1.00 |
| PSV bypass upstream | 293.4 / 313.4 / 0.94 / 0.29 | 293.7822 / 313.3947 / 0.9374 / 0.29 |
| PSV bypass downstream | 1076.8 / 80.2 / 13.42 / 1.00 | 1072.7827 / 80.2276 / 13.3717 / 1.00 |

The downstream branch remains **PARTIAL** overall because retained advanced non-resonant/resonant values (`5.37`, `268.35`) are source evidence only; the standard calculator does not fabricate advanced results.

### AIV — three cases

AIV remains owned by active PR #446. The validation record pins its machine receipt:

- PR head: `92720d93da0d34fe817302c1f2b00187676c6c08`
- validated code: `64485a51ffe78102ba3b966d43ba68e13f511130`
- receipt blob: `6d3cd2f7d71ab47d2825d802628f18c0782ffdc7`
- receipt: **22 / 22 PASS**

The relief-line case validates raw PWL `164.685... dB` and LOF `1.48`. The two recycle rows validate their available PWL evidence but remain PARTIAL because the pinned receipt does not prove those exact line-case LOFs.

### Valve transients

Dry-gas rapid opening is implemented benchmark-only:

| Case | Published Fmax / Flim / LOF | Actual |
|---|---|---|
| Relief upstream | 6.28 / 1.67 / 3.77 | 6.28563 / 1.66380 / 3.77788 |
| Relief downstream | 6.28 / 3.55 / 1.77 | 6.28563 / 3.54879 / 1.77120 |

Produced-water liquid closure is **REVIEW_REQUIRED**. Independent arithmetic reproduces the available speed-of-sound, initial surge/force, closure parameters, corrected force and limit-force steps, but the full closure-adjusted `Psurge` equation is not promoted. More importantly, the governing D.4.2 worked example gives LOF `0.70` while the retained DOCX line listing contains `0.06`. Both values are preserved in the record.

### Thermowell

Independent arithmetic reproduces Reynolds number (`300564` vs `300600`) and vortex shedding frequency (`80.667 Hz` vs `80.6 Hz`). Full ASME PTC 19.3 TW-2016 structural-frequency/stress/LOF calculation remains source replay only, so the case is PARTIAL.

### Small-bore connection

The retained D.5 arithmetic reproduces geometry LOF `0.66`, SBC modifier `0.66`, and final LOF `0.66`. The underlying TM-03 fitting/length/valve/schedule/diameter score-selection tables are not implemented, so the case is PARTIAL.

### Mechanisms without populated retained examples

Reciprocating/PD pulsation, rotating stall, corrugation pulsation, slug flow, and cavitation/flashing remain **DEFERRED**. Empty retained headings are not qualification evidence.

## Remaining gates

1. Run `npm run verify:vibration-fit-release` in a complete checkout at the exact candidate head (43 controlled test files).
2. Run real-browser input/edit/source-navigation/current→stale flows.
3. Complete independent vibration-engineering review.
4. Resolve the produced-water transient source discrepancy and control the full liquid-closure method before promotion.
5. Stage 12 remains a separate manual governance event; no screening/design authority is implied by this record.
