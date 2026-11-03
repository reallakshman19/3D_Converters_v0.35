# AIV EI `.eit` Export v1

## Purpose

Add an EI AVIFF v5 compatibility export beside the existing rich AIV screening JSON export.

The `.eit` extension contains JSON. The compatibility source is pinned to:

```text
repository  reallaksh19/Common
commit      3c8ddb89044061dd26f593604d4b547438c006f0
path        Energy-Institute-AVIFF---Worked-Examples.eit
Git blob    aaf3afe262b19f927fe05e0c44f07f08167fbfa0
size        10414 bytes
version     options.version = 5
shape       12 lines / 7 pipes / 15 streams / 3 AIV lines
```

The source contains historical AIV anchors `0.29` and `1.48`. Those values define file compatibility only. They do not redefine current AIV authority.

## Permanent authority rule

Current AIV screening authority is assessment-level:

```text
AivAssessmentResult.v1.lof = authoritative screening result
AivLineCaseSummary.v1.lof  = configured trace / non-authoritative
```

Therefore:

```text
.eit lines[].aiv    = authoritative Assessment LOF
.eit lines[].maxLof = authoritative AIV LOF represented by this AIV-only export
```

A configured/non-authoritative line/case trace such as `1.48` MUST NOT populate `lines[].aiv` or `lines[].maxLof`.
It may be retained only in additive trace metadata:

```text
aivConfiguredLineCaseTraceLof
aivConfiguredLineCaseTraceAuthoritative = false
```

For the small two-RV flare example this means:

```text
RV-101 effective source PWL      160 dB
RV-102 effective source PWL      154 dB
combined assessment point PWL    149.56302572849327 dB
Assessment screening LOF         0.29
configured Line/Case trace LOF   1.48 (non-authoritative)
.eit lines[].aiv                  "0.29"
```

## Adapter architecture

```text
AivCalculatorResult.v1
+ AivScreeningExportPackage.v1
+ optional AivFlareNetwork.v1 path evidence
             ↓
aiv-eit-contract.js
             ↓
aiv-eit-units.js
        ↙            ↓                 ↘
aiv-eit-geometry.js  aiv-eit-source-detail.js  aiv-eit-stream-record.js
        ↘            ↓                 ↙
             aiv-eit-document.js
                     ↓
             aiv-eit-authority.js
                     ↓
               aiv-eit-export.js
                     ↓
         EnergyInstituteEit.v5 document
                     ↓
         aiv-screening-result.eit
```

UI modules dispatch export only. They contain no EIT engineering conversion equations.

## Mapping

| Current AIV | `.eit` v5 |
|---|---|
| Assessment / line case | `lines[]` |
| Assessment main geometry | `pipes[]`, normalized to mm |
| Source process basis | `streams[]` |
| max contributing effective source PWL | legacy `pwl` |
| authoritative Assessment LOF | `aiv` |
| source-specific compatibility + modern trace | stringified `aiv_data` |
| mass flow | `mfr` in kg/h |
| upstream pressure | `usp` in bar absolute |
| downstream pressure | `dsp` in bar absolute |
| upstream temperature | `ust` in °C |
| molecular weight | `mw` in g/mol-equivalent (`kg/kmol` has the same numerical value) |
| low-noise trim reduction | `lnt` in dB |
| explicit physical distance | additive `distance` / `distanceUnit` |
| simultaneous-source group | additive `simultaneousSourceGroup` |
| flare path segments | additive `segmentIds` |

`aiv_data` remains a JSON-stringified array for compatibility with the controlled v5 reference.

## Unit policy

Compatibility normalization is converter-only and uses the central Engineering Calculation unit converter where that quantity is supported:

- mass flow → kg/h;
- pressure → bar absolute;
- temperature → °C;
- pipe OD / ID / wall thickness → mm;
- molecular weight → g/mol-equivalent;
- low-noise trim → dB.

Gauge pressure is exportable only when the source also carries explicit reference-pressure value, source, and source revision; otherwise export fails closed. No fallback atmospheric pressure is invented.

## Flare-network distance policy

SVG coordinates remain presentation-only.

When flare-network evidence exists, exported path metadata uses the existing calculated relationship/path evidence:

```text
segmentIds
physicalDistanceM
distanceAuthority
```

No distance is calculated from SVG pixels inside the exporter.

## Anti-drift reference verifier

`scripts/verify-aiv-eit-v5-reference.mjs` accepts the controlled `.eit` file and checks:

- byte length = `10414`;
- Git blob SHA-1 = `aaf3afe262b19f927fe05e0c44f07f08167fbfa0`;
- `options.version = 5`;
- arrays `lines`, `pipes`, `streams` exist;
- exact collection counts `12 / 7 / 15`;
- exactly three AIV lines;
- historical `0.29` and `1.48` AIV anchors remain present.

A changed source is a compatibility-review event; it must not silently redefine the adapter contract.

## Verification

Focused command:

```bash
npm run verify:aiv-eit-export
```

Current focused candidate evidence: **12 / 12 PASS**.

Coverage includes:

- assessment-authority export;
- explicit prevention of configured line/case LOF promotion;
- multi-source flare trace;
- stringified `aiv_data`;
- kg/h, bar absolute and °C conversions;
- pipe geometry normalization to mm;
- molecular-weight normalization;
- gauge pressure fail-closed without explicit reference evidence;
- canonical IDs retained additively;
- controlled v5 reference identity/count anchors;
- reference drift failures.

The UI displays both `Export screening result JSON` and `Export EI .eit`, and routes `.eit` generation through the execution controller. Full AIV release/browser validation remains independent from focused adapter tests. GitHub Actions runs that were created for the current PR were not started because the repository Actions budget was exhausted; those runs are environment-blocked rather than test failures.
