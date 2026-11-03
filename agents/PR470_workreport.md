# PR Mission Control

Mission: integrate XML_Compare_Utilities DocumentEvidence v1 as the governed Stage 5C source-evidence path for vibration master recovery.
Source task / issue: #450
PR number: #470
Branch: `agent/document-evidence-stage5c`
Base commit: `994f43521b5aa6e4dd397efd9300ce21943d056d`
PR status: OPEN / READY / OWNER MERGE AUTHORIZED
Current stage: Stage 9 — owner merge authorization
Last completed stage: Stage 8 — final validation and GitHub audit
Engineering status: production evidence consumer COMPLETE; controlled EI table extraction NOT EXECUTED
Validation status: local task gates PASS; GitHub Actions INFRASTRUCTURE_BLOCKED; controlled-source execution BLOCKED_ENVIRONMENT
Current blocker: exact controlled PDF bytes cannot be materialized in this runtime; GitHub Actions jobs cannot start because an Actions budget is preventing further use
Exact next action: merge #470 as explicitly authorized by the Owner; retain both external blockers as unresolved follow-up gates before any claim of completed controlled-source recovery or engineering authority

## Handover in 60 Seconds

### Implemented
- XML contract pinned to `reallaksh19/XML_Compare_Utilities@e7a394fd7f35c34cda5cad13df55cae2dd37bca2`, OpenAPI 1.4.1.
- Controlled EI source Git identity independently verified: `reallaksh19/Common@fb549185b9b27edc2379734240320a85c5bef9f6`, `EI - AVIFF Guidelines 2nd Edition.pdf`, blob `9d3eccc56429411e17c07a579bdebbd13cb0bdc5`, size 10,348,594 bytes. Current Common main still carries the same blob/size.
- Production v2 client: advisory `/v2/tables/discover` and explicit-page `/v2/tables/extract` only.
- Exact source SHA-256, SourceIdentity, page-set, OCR option and generic-authority boundaries are fail-closed.
- Semantic target profile contains no PDF page defaults or engineering values.
- Table-capable target set: SBC fitting span factors, first-span limits, between-main-lines limits, T2.8 valve closure characteristics, T2.9 valve recovery factors, T4 wall modifier.
- SBC geometry/location score targets explicitly require non-table rule evidence.
- Figures T3-1…T3-4 explicitly rejected from this table path.
- Receipt kernel requires `Observation.v1` plus complete `TablePass.v1` source/surface/candidate/cell lineage.
- Evidence state, publication state and engineering authority are separate.
- `accepted` can produce only `publicationState=CANDIDATE`; it never publishes master values or authority.
- Numeric disagreement remains review-required; confidence does not choose a value.
- Multiple candidates without explicit selection remain review-required; missing candidates/malformed lineage/option drift/authority leakage fail closed.
- Operator commands:
  - `npm run recover:vibration-stage5c-evidence -- discover --api <url> --out <json>`
  - `npm run recover:vibration-stage5c-evidence -- extract --api <url> --selection <json> --out <json>`
  - `npm run verify:vibration-stage5c-evidence`

### Final software validation
- combined Node regression suite: **PASS 17/17**;
- provider-reported controlled Git identity checks: **PASS 2/2**;
- real localhost HTTP round-trip through CLI discovery: **PASS**;
- `node --check` for all four production modules: **PASS**;
- production file physical lines: client 159, targets 159, receipt 190, CLI 136; all <300;
- largest audited function: 38 logical lines; within the Common <40 practical guideline.

### Controlled-source execution disposition
`BLOCKED_ENVIRONMENT`, not failed and not simulated.

Available evidence:
- exact controlled Git commit/blob/path/size: PASS;
- connected GitHub binary interface: large PDF metadata visible, body unavailable;
- direct Git materialization probe: failed with `Could not resolve host: github.com`;
- direct raw HTTP materialization probe: failed with name-resolution error.

Therefore:
```text
controlledSourceGitIdentity = PASS
controlledSourceBytesExecuted = false
stage5cPdfDiscovery = NOT_RUN
stage5cPdfExtraction = NOT_RUN
exactStage5cPages = UNVALIDATED
exactStage5cValues = UNVALIDATED
```
Historical #452 page hints and local fixtures are not substituted.

### GitHub workflow disposition
Two workflows were associated with the final audited implementation head:
- `Vibration AIV Controlled Source Qualification`
- `Topology Edit Support Reprojection`

Both were reported as failures by GitHub, but their jobs contained no executed steps. The check annotations state: `The job was not started because an Actions budget is preventing further use.`

Therefore the PR does **not** claim repository CI success and no gate is weakened or relabeled as passing.

### Owner merge authorization
On 2026-08-14 the Owner explicitly instructed `merge`. That instruction authorizes integrating this implementation despite the two unresolved external gates above. It does **not** convert `BLOCKED_ENVIRONMENT`, `INFRASTRUCTURE_BLOCKED`, `NOT_RUN`, or `UNVALIDATED` states into PASS, and it does not authorize engineering/screening/design authority or master publication.

# Authority / publication freeze

```text
source extraction PASS      != calculation qualification
accepted evidence            != master publication
publicationState=CANDIDATE  != RECONCILED / APPROVED_SCREENING
worked fixture PASS          != controlled EI execution
chart digitization PASS      != design authority
```

Every #470 receipt fixes:
```text
engineeringAuthority = NONE
screeningAuthority   = NOT_AUTHORIZED
designAuthority      = false
masterValuesPublished = false
```

# Mission Status

| Work item | Final status | Evidence |
|---|---|---|
| XML shared DocumentEvidence baseline | COMPLETE | XML main `e7a394fd...` |
| stale #452 classification | COMPLETE | ADAPT / REJECT / DEFER matrix |
| controlled source Git identity | PASS | pinned/current Common trees agree |
| v2 transport consumer | PASS | focused tests |
| semantic Stage 5C table target gate | PASS | focused tests |
| evidence receipt kernel + CLI | PASS | tests + localhost HTTP |
| controlled EI API execution | BLOCKED_ENVIRONMENT | exact bytes unavailable |
| repository GitHub Actions | INFRASTRUCTURE_BLOCKED | Actions budget prevented job start |
| owner merge authorization | PASS | explicit Owner instruction on 2026-08-14 |
| master normalization/publication | DEFERRED | separate reviewed PR required |
| T3-1…T3-4 digitization | DEFERRED | separate chart qualification |

# Reuse / Adapt / Reject Matrix

| Historical #452 module | Classification | Reason |
|---|---|---|
| `fetch-vibration-master-sections-via-api.mjs` | ADAPT | obsolete v1 search/convert replaced by v2 explicit-page evidence |
| `inventory-vibration-master-sources.mjs` | ADAPT | provenance constants useful; page hints are navigation only |
| `reconcile-vibration-master-tables.mjs` | REJECT primary path | v2 provides stronger structured observations/passes/decisions |
| `normalize-vibration-master-tables.mjs` | DEFER | belongs after independent source-target review |
| curve targets | REJECT from #470 | chart calibration/digitization is separate |

# Stage Execution Record

1. **Stage 1 COMPLETE** — living report created before production code; authority freeze recorded.
2. **Stage 2 COMPLETE** — draft PR #470 allocated; report renamed.
3. **Stage 3 COMPLETE** — #452 classified; controlled source Git object refreshed.
4. **Stage 4 COMPLETE** — v2 transport/source/page/authority boundaries implemented and tested.
5. **Stage 5 COMPLETE** — semantic table target gate implemented; non-table and curve targets fail closed.
6. **Stage 6 COMPLETE** — evidence receipt kernel + operator CLI implemented; focused suite/HTTP smoke passed.
7. **Stage 7 COMPLETE WITH BLOCKER** — exact source execution attempted but environment cannot materialize controlled bytes; no values/pages claimed.
8. **Stage 8 COMPLETE** — changed-file set, final head, local gates and GitHub workflow disposition audited.
9. **Stage 9 MERGE AUTHORIZED** — Owner explicitly authorized integration with external blockers preserved as unresolved follow-up state.

# Changed-File Ledger

Expected and final PR file set is exactly eight files:

| File | Purpose | Validation |
|---|---|---|
| `agents/PR470_workreport.md` | living engineering handover | current |
| `package.json` | recover/verify operator commands | equivalent command path tested |
| `scripts/recover-vibration-stage5c-via-document-evidence.mjs` | operator CLI/orchestrator | PASS localhost HTTP |
| `scripts/vibration-stage5c-document-evidence-client.mjs` | fail-closed v2 transport | PASS |
| `scripts/vibration-stage5c-evidence-receipt.mjs` | source-target decision/lineage kernel | PASS |
| `scripts/vibration-stage5c-targets.mjs` | controlled-source/domain target gate | PASS |
| `tests/vibration-stage5c-document-evidence.test.mjs` | transport/target/source regressions | PASS |
| `tests/vibration-stage5c-recovery.test.mjs` | receipt/CLI regressions | PASS |

# Explicitly Not Validated / Not Published
- exact Stage 5C PDF page or printed-page mapping;
- any EI table value or normalized master row;
- SBC geometry/location score rules;
- Figures T3-1…T3-4 axes/curve points/interpolation;
- calculation, screening or design authority.

# Forward Sequence

1. Restore/enable GitHub Actions budget so repository jobs can actually execute.
2. In a runtime with the exact controlled PDF bytes and XML service, run `discover` against the pinned bytes.
3. Reviewer explicitly selects exact pages, locator and candidate IDs; then run `extract` and retain the evidence receipt.
4. Separate future PR: independent semantic row normalization/reconciliation and candidate-master publication.
5. Separate chart program: T3-1…T3-4 calibration/digitization/overlay/error/review.

# Next-Agent Handover

Software implementation in #470 is complete and locally validated. Owner merge authorization is explicit and does not imply the blocked external gates passed.
After merge, treat the integration as available infrastructure, **not** as a completed controlled-source Stage 5C recovery release.
Do **not** infer pages/values from historical hints or fixtures.
Resume from the two external prerequisites: Actions execution and exact PDF byte materialization.