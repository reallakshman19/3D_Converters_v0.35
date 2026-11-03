# AIV EI `.eit` Import & Round-Trip v1

## Purpose

Add an authority-safe import path for EI AVIFF v5 `.eit` JSON files and wire it into the AIV screening workbench.

This stage complements `AIV-EIT-Export-v1.md`. It does **not** make a historical `.eit` result authoritative. The import is a compatibility/evidence adapter into the existing AIV Source / Assessment / Relationship working state.

## Authority rule

Imported result values are evidence only:

```text
historical .eit line.aiv
        ↓
REVIEW_REQUIRED imported result trace
        ↓
editable AIV working inputs
        ↓
readiness
        ↓
registered VIB.AIV.ACOUSTIC screening run
        ↓
AivAssessmentResult.v1.lof = current screening authority
```

Permanent rules:

- imported `line.aiv` is never current screening authority;
- imported prior assessment metadata is also only a prior-result trace until rerun;
- configured Line/Case LOF remains non-authoritative;
- `designAuthority=false`;
- the UI contains no AIV numerical equations.

## Controlled compatibility source

The v5 compatibility source remains pinned to:

```text
repository  reallaksh19/Common
commit      3c8ddb89044061dd26f593604d4b547438c006f0
path        Energy-Institute-AVIFF---Worked-Examples.eit
Git blob    aaf3afe262b19f927fe05e0c44f07f08167fbfa0
size        10414 bytes
version     options.version = 5
shape       12 lines / 7 pipes / 15 streams / 3 AIV lines
```

The historical AIV values `0.29`, `0.29`, and `1.48` are compatibility evidence, not imported screening decisions.

## Import architecture

```text
EnergyInstituteEit.v5 JSON
        ↓
aiv-eit-import.js
        ├─ aiv-eit-import-authority.js
        ├─ aiv-eit-import-records.js
        └─ aiv-eit-import-topology.js
        ↓
AivEitImportPackage.v1
        ├─ Sources working rows
        ├─ Assessments working rows
        ├─ Source→Assessment working rows
        ├─ compatibility-only topology projection
        ├─ imported result trace
        └─ preserved original .eit document/evidence
```

The UI converts those rows through the normal `createAivInputTable(...)` path. There is no second AIV editable store.

## Legacy → current working-record mapping

### Sources

The v5 compatibility units are interpreted explicitly:

| `.eit` field | AIV working field |
|---|---|
| `mfr` | Mass Flow, `kg/h` |
| `usp` | Upstream Pressure, `bar`, `ABSOLUTE` |
| `dsp` | Downstream Pressure, `bar`, `ABSOLUTE` |
| `ust` | Upstream Temperature, `C` |
| stream `mw` | Molecular Weight, `g/mol` |
| `lnt` | manufacturer trim reduction, `dB` |

Modern additive fields such as Source Canonical ID, Source State, phase, sonic state and trim provenance are used when present.

For a modern multi-source line, source/case identity is resolved against additive stream identity before the legacy line-level `si` pointer. This prevents a two-source assessment from silently reusing the first stream for every source.

### Assessments

Modern additive assessment ID/type, branch geometry and duplex state are used when present.

For a legacy pipe without explicit inside diameter, the importer may derive:

```text
ID = OD - 2 × WT
```

That value is explicitly marked `REVIEW_REQUIRED` in provenance. It is a compatibility reconstruction, not independent source evidence.

### Relationships / distance

Distance is imported only from explicit `aiv_data.distance` evidence. No SVG/pixel distance is inferred.

A compatibility topology projection creates direct Source→Assessment connectivity only so the imported records can enter the normal readiness path. Its authority states:

```text
syntheticDirectPathProjection = true
svgPixelsAuthoritativeForDistance = false
designAuthority = false
```

It does not claim to reconstruct the original plant/flare graph.

## Legacy missing evidence

Historical v5 files do not necessarily contain all fields required by the current qualified AIV screening contract. In particular, old `.eit` records may omit:

- sonic/non-sonic state;
- physical source-to-assessment distance;
- modern assessment type / branch geometry;
- modern controlled provenance.

The importer does not invent these values. Missing current-screening evidence remains visible in the editable working state/readiness diagnostics.

Therefore the controlled historical worked-example `.eit` can be imported and preserved, but current screening rerun remains blocked until required modern engineering evidence is resolved.

## Round-trip preservation

The original imported v5 document is retained as compatibility evidence. After a registered AIV rerun, re-export updates AIV fields while preserving unrelated data.

Preservation covers:

- unknown top-level option fields;
- unknown line fields;
- unknown pipe fields;
- unknown stream fields;
- `mats` content;
- non-AIV modules on mixed-module lines;
- original legacy line/pipe/stream identifiers where possible.

For mixed-module lines, historical `maxLof` is preserved because it may represent a non-AIV governing mechanism. The current Assessment AIV result is written separately as `aivMaxAuthoritativeAssessmentLof` and to the AIV field.

### Identity anti-drift lock

Imported Source / Assessment / Case identities are locked for compatibility re-export. If those identities drift, re-export fails closed with:

```text
AIV_EIT_ROUND_TRIP_IDENTITY_CHANGED
```

This prevents an edited identity from creating a new current AIV line while silently leaving the old imported AIV result in the same document.

## Small flare expected round-trip

The two-RV example remains the modern high-information case:

```text
RV-101 effective PWL       160 dB
RV-102 effective PWL       154 dB
RV-101 distance             38 m
RV-102 distance             41 m
RV-101 point PWL            148.7540692513 dB
RV-102 point PWL            141.8662326132 dB
combined point PWL          149.5630257285 dB
Assessment screening LOF    0.29
Line/Case trace LOF         1.48 (non-authoritative)
```

Source IDs, Assessment ID, case, simultaneous-source group, segment IDs and explicit distance authority must survive export → import → rerun → export.

The existing example's FLM1 geometry/configuration mismatch remains a separate qualification finding; `.eit` compatibility does not upgrade arbitrary-geometry screening qualification.

## UI workbench

The AIV UI now follows a progressive engineering workflow:

```text
Start an AIV assessment
    ├─ Import EI .eit
    ├─ Load controlled EI D.2.3
    └─ Advanced XLSX / CSV imports
            ↓
Readiness
            ↓
Screening results
            ↓
Export JSON / Export EI .eit
```

Secondary tools are progressive disclosures:

- Flare network authoring + canvas;
- Controlled benchmark & assumptions;
- Raw working data tables;
- Qualification evidence & method trace.

This removes the previous equal-weight debug-console presentation where all raw engineering/evidence panels were expanded into one long column.

The qualified header/banner now uses qualified visual semantics rather than the previous red error-like styling. The flare authoring renderer no longer injects a competing local `<style>` block.

## Verification seam

Focused command:

```bash
npm run verify:aiv-eit-export
```

The seam includes:

- existing `.eit` export tests;
- controlled v5 reference anti-drift tests;
- import / authority / round-trip tests;
- workbench UI hierarchy tests.

Full AIV release and real-browser download/import acceptance remain independent release gates and must not be reported PASS unless executed.
