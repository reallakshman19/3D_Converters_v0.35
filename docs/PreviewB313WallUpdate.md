# Phase 4 Preview — B31.3 wall update

## Action

Phase 4 Preview exposes the explicit action:

```text
Update wall thickness as per B31.3 Sec II
```

The action is not automatic wall authority. It changes only rows that complete the governed material/factor, pressure, corrosion, OD, applicability and pipe-wall-selection chain.

## Runtime chain

```text
Phase 4 Preview Material column + T1
        ↓
B31.3 Material Factors material identity
        ↓
strict active S / E / W / Y at T1
(VERIFIED / PROJECT_APPROVED only)
        ↓
manual controlled S/E/W/Y fallback only if active factors are incomplete
        ↓
Preview P1 + corrosion + source-XML OD
        ↓
B31.3-2024 straight-pipe thickness API
        ↓
required nominal wall with fixed 12.5% negative mill tolerance
        ↓
Pipe Wall Master selector
        ↓
Preview wallThickness override + immutable-style audit evidence
```

## Material-column custody

The effective Phase 4 `Material` cell is the primary material identity input. That cell already follows the Preview material-authority order: process/line-list material evidence first, then governed piping-class/material-code fallback when process material is absent.

The Preview adapter resolves the displayed material into the merged B31.3 material catalog from PR #423.

Examples:

```text
ASTM A106-B     -> CS-A106-B
CS              -> CS-A106-B only when the project-family default is unique
ASTM A333-6     -> LTCS-A333-6
A312-TP304      -> SS-A312-TP304
A312-TP316      -> SS-A312-TP316
DSS             -> DSS-A790-S31803 only when the project-family default is unique
SDSS            -> SDSS-A790-S32760 only when the project-family default is unique
```

Project material-map spelling variants such as `A312-TP316` are normalized only for identity lookup; the Preview Material text and its provenance are not rewritten.

Reviewed `materialCodeMatchedMaterial` evidence may corroborate or disambiguate the Preview material. It never silently overrides a conflicting material identity.

Important negative controls:

- generic `SS` remains ambiguous unless reviewed material-code evidence identifies TP304 or TP316;
- a Preview material / reviewed material-code identity conflict blocks the row;
- reviewed material-code evidence that is not represented in the active B31.3 material catalog blocks the row instead of falling back to a different family default.

## B31.3 Material Factors linkage

For each unique resolved material + T1 group, the Preview panel shows:

- Preview Material and source;
- resolved B31.3 `materialId`;
- active factor status;
- an **Open B31.3 Material Factors** button.

That button deep-links to the Engineering `B31.3 Material Factors` tab with the resolved `materialId` and T1 context.

The Engineering tab edits a candidate working copy only. Preview reads the published active B31.3 factor master, not local candidate drafts.

## Factor authority

Preview always calls the material-factor resolver in:

```text
qualificationMode = strict
```

Therefore only `VERIFIED` / `PROJECT_APPROVED` active factor rows can become the automatic factor basis. `BENCHMARK_ONLY` data is never enabled by this adapter.

If strict active factors are incomplete at the exact Preview T1, the existing per-material/T1 manual basis may be used only when all of the following are explicit:

- allowable stress `S` and unit;
- `E`;
- `W`;
- `Y`;
- controlled source/reference.

Manual fallback is recorded as `MANUAL_EXPLICIT_FALLBACK`; it is not promoted into the active factor master and is not labelled design-authority data.

When controlled factors later become available in the active master, `ACTIVE_MASTER_STRICT` takes precedence over a retained manual fallback record.

## Basis key

New basis records are keyed by resolved material identity and T1:

```text
MATID:<materialId>|T1=<temperature>
```

Legacy raw material-text keys remain readable so existing #424 draft basis entries are not lost during integration.

## Pressure custody

Pressure-unit priority remains:

1. explicit Preview B31.3 basis pressure unit;
2. unambiguous line-list pressure column whose value matches P1;
3. source XML `<PressureUnits>` only when P1 provenance is XML;
4. otherwise fail closed.

## Dimension-standard custody

An explicit basis selection wins. Otherwise the resolved B31.3 material family supplies the Preview project inference:

- CS / LTCS -> ASME B36.10M;
- SS / DSS / SDSS -> ASME B36.19M.

The B31.3 material core itself still does not silently choose a pipe-dimension standard; this inference belongs only to the Phase 4 Preview adapter and is recorded in evidence.

## OD custody

The pressure calculation uses source-XML OD evidence. The Pipe Wall Master DN OD is a disambiguation/reference value only.

For the retained DN50 source-data warning:

```text
master reference OD = 60.0 mm
source candidates    = 60.3 mm, 26.7 mm
selected source OD   = 60.3 mm
```

The 26.7 mm fitting/flange endpoint is rejected as the pipe-calculation OD. The project master inconsistency is not silently corrected.

## Wall selection

The calculation always applies:

```js
negativeMillTolerance: { basis: 'percent', value: 12.5 }
```

The B31.3 API computes the required nominal wall; the merged Pipe Wall Master API selects the next adequate commercial wall/schedule. The Preview UI contains no duplicated pressure-thickness equation and no duplicated schedule-selection formula.

## Evidence

Successful rows write:

```text
config.overrides.wallThickness[wallKey]
config.overrides.__b313WallEvidence[wallKey]
```

The evidence includes:

- Preview material, material source and material-code evidence;
- resolved B31.3 material identity and resolution source;
- T1;
- factor-basis mode and factor sources;
- strict factor resolver result;
- manual fallback source when used;
- P1 provenance and pressure-unit provenance;
- source OD, master reference OD and parity delta;
- corrosion allowance;
- fixed 12.5% negative mill tolerance;
- B31.3 calculation result;
- selected wall, schedule/equivalents and margin.

The Preview Material cell receives a non-authoritative linkage badge (`B31.3 ID ✓` or `B31.3 MASTER ✓`) without changing the displayed material value. The wall cell receives `✓ B31.3` only after a successful wall update.

## Engineering qualification boundary

Merging this Preview adoption does not complete B31.3 design-authority qualification. Controlled B31.3-2024 `S/E/W/Y` population/review and the licensed-code-text engineering review of the production thickness implementation remain separate release/governance requirements.
