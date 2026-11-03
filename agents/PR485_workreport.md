# PR485 — SBC Figures T3-1…T3-4 Digitization

## Recovery Header

```text
HANDOVER_READINESS: READY
PR_RECOVERY_STATE: RECOVERABLE
TAKEOVER_AUTHORITY: READ_ONLY
PR_HEAD_OBSERVED: f7ed89c8278616ff80f5bf86f53b460f77afa31c
REPORT_BASIS_HEAD: f7ed89c8278616ff80f5bf86f53b460f77afa31c
MAIN_HEAD_LAST_CHECKED: 36748e381012bb52ba720cc288101948115721bb
MERGE_BASE: 36748e381012bb52ba720cc288101948115721bb
REPORT_SYNC: CURRENT
APPENDIX_A_STATUS: CURRENT
GROUNDING_EPOCH: GE-PR485-002
CURRENT_STAGE: Stage 3 — figure semantics qualified; curve digitization HARD_STOP
CURRENT_BLOCKER: BLOCKED_SOURCE_IMAGE + CONTROLLED_SOURCE_RECONCILIATION_REQUIRED
HIGHEST_RISK: reconstructing or fitting curve coordinates from OCR text / worked examples without actual calibrated graph geometry
EXACT_NEXT_ACTION: provide or make reachable either (a) the exact controlled EI PDF `9d3eccc...` for deterministic rendering, or (b) lossless/high-resolution renders of printed pages 82-84 containing Figures T3-1…T3-4. Re-enter WRITE_ALLOWED only after all four figures pass axis/series/calibration-resolution qualification.
```

Work intent: `INVESTIGATE / VALIDATE / HANDOVER`
Criticality: `ENGINEERING_CRITICAL`
PR: #485
Branch: `agent/vibration-t3-span-curve-digitization`
Source issue: #450
Base: `main@36748e381012bb52ba720cc288101948115721bb`
PR state: `DRAFT / OPEN / MERGEABLE / UNMERGED / MERGE NOT AUTHORIZED`
Coordination: `SAFE` — #484 explicitly excludes curve data; no competing digitization PR found.

## Handover in 60 Seconds

### What is proven
- Multiple independent EI AVIFF 2nd-edition copies agree on all four figure identities, titles, printed pages, axis quantities/ranges, and LOF labels.
- The figures are linear-axis plots with `Pipe Diameter (in)` on x, using source ticks from 0.25 through 2.00 in.
- Y is `Modified Span length (m)`.
- Figure metadata:
  - T3-1, printed page 82: `Maximum Span connected to main line and involving mass`; y range 0..4.5 m; visible boundary labels LOF 0.7 / 0.6 / 0.4 / 0.2.
  - T3-2, printed page 83: `Maximum span length connected to main line and with no additional mass`; y range 0..8 m; boundary labels 0.7 / 0.6 / 0.4 / 0.2.
  - T3-3, printed page 83: `Maximum span length for subsequent spans and involving mass`; y range 0..3.5 m; boundary labels 0.7 / 0.6 / 0.4 / 0.2.
  - T3-4, printed page 84: `Maximum span length for subsequent spans and with no additional mass`; y range 0..6 m; printed boundary labels 0.7 / 0.6 / 0.4 / 0.3. The worked example can still classify a point as 0.2 below the lowest shown boundary; do not rewrite the printed 0.3 label to 0.2.
- EI worked-example classification checks independently constrain several points/regions:
  - T3-1: diameter 1.5 in, modified span 1.286 m -> LOF 0.2;
  - T3-1: diameter 2 in, modified span 4.286 m -> LOF 0.6;
  - T3-3: diameter 1.5 in, span 2.3 m -> LOF 0.6;
  - T3-4: diameter 1.5 in, span 1.4 m -> LOF 0.2.
- Independent SwRI/Texas A&M tutorial reproduces Figure T3-1 in its case studies and provides further classifications such as modified span 4.0 m -> 0.7 in one case and 3.3 m -> 0.6 in another. These are validation constraints only, not sufficient to reconstruct the curve.

### What is NOT proven
- No calibrated pixel/coordinate geometry for any of the four EI curves has been obtained.
- No digitization pass A exists.
- No independent pass B exists.
- No point-by-point reconciliation or digitization tolerance exists.
- No curve candidate JSON exists.
- No interpolation dataset has been published.

### Why this is a hard stop
Every currently reachable EI copy exposes graph text/OCR but not reproducible image coordinates. Attempts to obtain actual graph images were exhausted through:
1. Texas A&M authoritative repository item: `01_Simons.pdf` file is indexed, but web fetch times out and direct file download is unavailable in this runtime.
2. Slideshare reproduction of EI T3-1: exact Figure 19 image URL was resolved, but CDN image fetch returns cache-miss / direct download unavailable.
3. PDFCoffee / StudyLib / Scribd EI copies: graph OCR/title/axis text is accessible, but the downloadable PDF/image body is not available to the current tools at calibration quality.
4. Web image search: exact-title searches did not return the target EI graph images.
5. Exact controlled Git PDF: metadata/blob/size are known, but the binary still cannot be materialized/rendered here.

OCR line ordering cannot encode curve geometry reliably. Worked-example classifications are sparse validation points and MUST NOT be used to fit or reverse-engineer the missing curves.

## Mission

Recover Figures T3-1…T3-4 as a governed piecewise point dataset with explicit source image lineage, axis calibration, two independent digitization passes, reconciliation evidence, and forbidden extrapolation.

Target remains uncreated:
```text
docs/Masters/Vibration/ei-aviff-t3-sbc-span-curves.candidate.json
```

## Controlled source

```text
repository = reallaksh19/Common
commit     = fb549185b9b27edc2379734240320a85c5bef9f6
path       = EI - AVIFF Guidelines 2nd Edition.pdf
blob       = 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
size       = 10348594
required printed pages = 82, 83, 84
render status = BLOCKED_ENVIRONMENT
```

## Hard-stop criteria / disposition

| Requirement | Status | Observation | Oracle |
|---|---|---|---|
| figure titles/pages | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE |
| axis labels/units | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE |
| axis numeric ranges | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE |
| LOF boundary labels | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE |
| actual curve geometry | NOT_RUN | NOT_OBSERVED | AUTHORITATIVE_REFERENCE |
| reproducible pixel-axis anchors | NOT_RUN | NOT_OBSERVED | AUTHORITATIVE_REFERENCE |
| source-image resolution qualification | FAIL | source images inaccessible at calibration resolution | AUTHORITATIVE_REFERENCE |
| digitization pass A | NOT_RUN | blocked by image qualification | INDEPENDENT_REPRODUCTION |
| independent pass B | NOT_RUN | blocked by image qualification | INDEPENDENT_REPRODUCTION |
| pass-A/pass-B tolerance reconciliation | NOT_RUN | no point sets | INDEPENDENT_REPRODUCTION |
| controlled-source reconciliation | NOT_RUN | controlled PDF unavailable | AUTHORITATIVE_REFERENCE |

Stage decision: `HARD_STOP / BLOCKED_SOURCE_IMAGE`.

## Protected invariants

- no point may be inferred solely from OCR label position;
- no curve may be polynomial-fitted from worked examples;
- worked examples remain validation evidence, not equation-generation input;
- x/y axes and units must be calibrated from a real render;
- T3-4 printed boundary label `LOF=0.3` must be preserved unless actual source-image inspection proves otherwise;
- extrapolation remains forbidden;
- publication/engineering authority remains frozen;
- non-curve data from #484 is not duplicated here.

## Authority Freeze

```text
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
masterValuesPublished = false
publicationState      = BLOCKED_SOURCE_IMAGE
qualificationStatus   = NOT_QUALIFIED
```

## Validation / live-state ledger

| Check | STATUS | OBSERVATION | ORACLE | Basis |
|---|---|---|---|---|
| live main grounding | PASS | REMOTE_EXECUTION | NONE | main remains `36748e38...` |
| PR scope/diff | PASS | REMOTE_EXECUTION | NONE | report only |
| figure semantic cross-copy agreement | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | multiple EI copies |
| worked-example classification constraints | PASS | SOURCE_INSPECTION | AUTHORITATIVE_REFERENCE | EI examples / independent tutorial |
| actual PDF screenshot/image calibration | NOT_RUN | NOT_OBSERVED | AUTHORITATIVE_REFERENCE | no application/pdf/image body obtainable |
| GitHub status contexts | NOT_RUN | REMOTE_EXECUTION | NONE | zero contexts |
| inline review threads | PASS | REMOTE_EXECUTION | NONE | zero threads |
| curve candidate validation | NOT_RUN | NOT_OBSERVED | INDEPENDENT_REPRODUCTION | no candidate published |

Negative assurance:
- added no engineering values/points;
- added no interpolation/fitting algorithm;
- added no curve candidate file;
- added no production resolver/calculator;
- changed no T2.8/T2.9/T4/non-curve T3 data;
- changed no workflows/dependencies/authority.

## Changed-File Ledger

Current PR changed-file set is intentionally report-only:
- `agents/PR485_workreport.md`

No curve artifact is created while source-image qualification fails.

## Appendix A — Implementation Takeover Qualification

`APPENDIX_A_STATUS: CURRENT`
`TAKEOVER_AUTHORITY: READ_ONLY` while source-image hard stop remains.

Re-enable engineering write authority only after a new grounding epoch proves all four source figures have readable graph geometry and reproducible calibration anchors. Then:
- A1 trace exact rendered page/image hash and figure crop;
- A2 verify axes/series labels and distinguish all boundary curves;
- A3 preserve candidate/authority separation;
- A4 execute independent pass A/B point picking with predeclared reconciliation tolerance;
- A5 commit only curve candidate + digitization provenance/reconciliation + focused tests.

## Next-Agent Handover

Do not reconstruct curves from OCR or worked-example points.
Do not start final integration/authority publication while Figures T3-1…T3-4 remain unavailable as calibrated datasets.
Exact continuation trigger: materialize the controlled PDF or supply lossless/readable renders of printed pages 82-84.
Then resume with deterministic calibration -> pass A -> pass B -> reconciliation.

Handover readiness: `READY`.
No merge is authorized.
