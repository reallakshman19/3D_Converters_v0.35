# PR547 Work Report — T2.9 Controlled-Source Reconciliation

## Recovery header

```text
WORK_INTENT: QUALIFICATION_EVIDENCE
CRITICALITY: ENGINEERING_CRITICAL
REPOSITORY: reallaksh19/3D_Converters
SOURCE_ISSUE: #545
PARENT_PROGRAMME: #450
ORIGINAL_BASE: main@d2d02ed56ee1c94d89ddc4c63fa58f0ce97a84df
LATEST_MAIN_CHECKED: 08314a2632384cb69cd6e43efba6f02d1772e121
PR_HEAD_BEFORE_THIS_REFRESH: 445a21ea28fb4d2e368e545e10e7bc51f5defcf1
BRANCH: agent/t29-pf01-controlled-source-reconciliation
PR: #547 / DRAFT / OPEN / UNMERGED
CURRENT_STAGE: T29-PF-01 controlled source + method qualification
APPENDIX_A: 90/100 — NOT QUALIFIED
A2_METHOD_ISOLATION: 15/20 — BLOCKING
NUMERICAL_KERNEL: NOT AUTHORIZED
MASTER_ACTIVATION: NOT AUTHORIZED
SCREENING_AUTHORITY: NOT_AUTHORIZED
DESIGN_AUTHORITY: false
MERGE_AUTHORITY: OWNER_ONLY / NOT_GRANTED
EXACT_NEXT_ACTION: execute the exact pinned Common PDF against the deterministic T2.9 locator/request, reconcile T2.9.2 table/equation/Flowchart T2-9 predicates and equality directions, freeze branch/boundary oracles, rescore A2/total, and only then consider a pure candidate kernel.
```

## Mission

Qualify the controlled EI AVIFF T2.9 Cavitation / Flashing method behind:

```text
VIB.CAVITATION.FLASHING
```

without converting secondary publications, retained benchmarks, synthesized equations, or target parity into engineering authority.

PF-01 is an evidence/contract slice only. It does **not** add a numerical cavitation/flashing decision kernel, activate the candidate FL table, change the central calculation registry, or grant Screening/design authority.

---

## Controlled source custody

```text
repository = reallaksh19/Common
commit     = fb549185b9b27edc2379734240320a85c5bef9f6
path       = EI - AVIFF Guidelines 2nd Edition.pdf
git blob   = 9d3eccc56429411e17c07a579bdebbd13cb0bdc5
size       = 10,348,594 bytes
edition    = 2nd Edition
```

Current source-register entry:

```text
masterId          = EI_AVIFF.T2.9.VALVE_RECOVERY_FACTORS.v1
sourceState       = RECONCILIATION_REQUIRED
locator           = null
extractionReceipt = null
```

Observed execution routes remain:

```text
GitHub text/blob connector binary decode     BLOCKED
GitHub contents base64 for >1 MB PDF         CONTENT NOT MATERIALIZED
web/raw PDF fetch                             CACHE_MISS
local runtime raw download                    DNS_BLOCKED
connected Google Drive AVIFF search           NO MATCH
trusted PR GitHub Actions                     ZERO RUNS SCHEDULED
```

Therefore:

```text
controlled source Git identity    PASS
controlled PDF content execution  NOT_RUN / ENVIRONMENT_BLOCKED
page selection                    PROVISIONAL / UNVALIDATED
page hashes                       UNAVAILABLE
section hash                      UNAVAILABLE
DocumentEvidence extraction       NOT_RUN / ENVIRONMENT_BLOCKED
```

No missing source execution is represented as PASS.

---

## #481 candidate retained without promotion

Four independently corroborated publication copies previously retained:

```text
Ball       FL = 0.60
Butterfly  FL = 0.62
Globe      FL = 0.90
Gate       FL = 0.60
```

Candidate arithmetic relation:

```text
delta = FL^2 * (P1 - 0.96 * Pv)
```

Independent replay:

```text
FL = 0.90
P1 = 13,789,500 Pa
Pv = 152,926 Pa

delta = 11,050,579.7424 Pa
```

Unit pair:

```text
P1 = 137.895 bar
Pv = 1.52926 bar
FL = 0.90

delta = 110.505797424 bar
```

These are qualification arithmetic only. Pressure basis, pressure tapping semantics and the physical meaning of the calculated threshold remain controlled-source questions.

Authority remains:

```text
publicationState       = CANDIDATE
qualificationStatus    = NOT_QUALIFIED
masterValuesPublished  = false
engineeringAuthority   = NONE
screeningAuthority     = NOT_AUTHORIZED
designAuthority        = false
```

Unknown valve type remains `NOT_READY`; fuzzy, nearest and generic FL fallback remain prohibited.

---

## Conflicting synthesis quarantine

Investigation source:

```text
repository = reallaksh19/Advanced_Analysis
commit     = 76eb4bd075ce2e8e2442d02b2798df7be491fb4b
path       = docs/EI data/P1_Valve_Transient_and_Cavitation.md
blob       = f27764534a9bee88e3b4e2d1b12da046ccfced5d
```

It proposes sigma/Kc/FF equations, trim-specific FL rows and a four-regime LOF tree. It remains:

```text
CORROBORATION / INVESTIGATION ONLY
ENGINEERING AUTHORITY = NONE
PRODUCTION USE = PROHIBITED PENDING CONTROLLED EI RECONCILIATION
```

Frozen conflicts include:

```text
Ball        0.60 candidate vs 0.50 / 0.75 synthesis variants
Butterfly   0.62 candidate vs 0.55 / 0.68 / 0.70 synthesis variants
Globe       generic 0.90 vs trim/orientation taxonomy
Gate        0.60 candidate vs synthesis omission
Equation    0.96*Pv candidate relation vs pressure-dependent FF*Pv synthesis
Branches    no qualified #481 decision tree vs synthesis sigma/Kc four-regime tree
```

Controlling rule:

```text
CONTROLLED EI SOURCE DECIDES
```

---

## Source-gate hardening completed

### Deterministic locator

`scripts/locate-vibration-t29-controlled-source.mjs` now exposes pure page scoring/ranking and only treats a page as a navigation candidate when it contains:

```text
an explicit T2.9 / T2.9.1 / T2.9.2 identifier
OR
both cavitation and flashing terms
```

Generic `pressure recovery` or `recovery factor` text alone cannot make a page a T2.9 candidate.

Ranking priority is deterministic, with explicit `T2.9.2` evidence strongest. The locator publishes hashes/counts/selection metadata only and still requires reviewer selection.

### Provisional extraction request

Current hypothesis remains:

```text
printed page = 69
PDF page     = 77   PROVISIONAL
identifier   = T2.9.2
```

The provisional table anchors are:

```text
T2.9.2
Ball
Butterfly
Globe
Gate
```

They are navigation/reconciliation anchors only. A wrong page or occurrence count fails closed.

### CI source custody

The CI-only test no longer logs controlled EI source text. Public CI evidence is limited to:

```text
source Git blob + size
pdftotext version
page hash
UTF-8 byte count
line count
token counts
selection reason / rank
extraction manifest hashes/authority
```

The private source text itself is not emitted to Actions logs.

Local validation performed for this hardening:

```text
locator JavaScript syntax          PASS
CI-test JavaScript syntax          PASS
pure locator candidate behavior    PASS
```

Exact-PDF integration remains `NOT_RUN / ENVIRONMENT_BLOCKED`.

---

## Retained worked-example audit

Repository benchmark:

```text
Benchmarks/VibrationIntegrity/ei-aviff-multimechanism-worked-examples-v1.json
blob = cb945296ea86186afc1cbb45f50ee94c017adca4
authority = WORKED_EXAMPLE_VALIDATION_ONLY
```

Its explicit T2.9 entry is:

```text
caseId    = EI-NO-EXAMPLE-CAV-FLASH
mechanism = CAVITATION_FLASHING
mode      = NO_RETAINED_EXAMPLE
```

Therefore the retained multimechanism benchmark provides **no T2.9 branch or LOF oracle**. PF-01 now records this negative evidence permanently; no future implementation may infer no-cavitation/cavitation/flashing boundaries from that benchmark set.

---

## Independent validation package

Available now:

```text
four FL candidate lookup vectors
unknown/blank valve fail-closed vectors
Globe arithmetic replay
Pa/bar unit-invariance pair
missing Pv / pressure-basis failure vectors
reserved NO_CAVITATION / CAVITATION / FLASHING vectors
reserved equality / below / above boundary vectors
explicit NO_RETAINED_EXAMPLE benchmark evidence
```

Still unavailable:

```text
source-qualified NO_CAVITATION branch oracle
source-qualified CAVITATION branch oracle
source-qualified FLASHING branch oracle
source-qualified exact equality disposition
source-qualified just-below / just-above outcomes
source-qualified LOF outcomes
```

Expected branch values remain `null`; they must not be populated from runtime output or the Advanced_Analysis synthesis.

---

## Appendix A qualification

```text
A1 source / production trace       19/20
A2 exact method isolation          15/20   BLOCKING
A3 authority / invariants          20/20
A4 independent validation          17/20
A5 minimal implementation slice    19/20
TOTAL                              90/100
```

Required before numerical candidate implementation:

```text
total >= 92/100
minimum every challenge >= 17/20
A1 >= 18
A2 >= 18
review disposition = QUALIFIED_FOR_T29_CANDIDATE_IMPLEMENTATION
```

Current disposition:

```text
NOT_QUALIFIED_FOR_T29_CANDIDATE_IMPLEMENTATION
```

The new hardening and no-example evidence improve falsification and custody but do not justify increasing A2. Exact EI predicates/equality directions are still absent.

---

## Candidate-kernel contract — structure only

Future stages remain:

```text
validateInput
normalizeUnitsAndPressureEvidence
evaluateApplicability
resolveVapourPressureEvidence
resolveFL
calculateQualifiedIntermediates
evaluateQualifiedDecisionBranches
buildCandidateEvidence
```

Still blocked:

```text
sigma             BLOCKED_CONTROLLED_SOURCE
Kc                BLOCKED_CONTROLLED_SOURCE
FF                BLOCKED_CONTROLLED_SOURCE_CONFLICT
regime boundaries BLOCKED_CONTROLLED_SOURCE
LOF               BLOCKED_CONTROLLED_SOURCE
```

No executable equation has been added in PF-01.

---

## Main drift / overlap

Latest `main` checked:

```text
08314a2632384cb69cd6e43efba6f02d1772e121
```

Relative to PF-01 original base, the only net main-tree addition is:

```text
Benchmarks/v11-v14.zip
```

Exact binary inspection shows the ZIP contains:

```text
SYS-0001-v14.CII
SYS-0001-v11.cii
```

It is unrelated CII benchmark content, not T2.9 evidence. No T2.9 overlap was found.

Shared UI boundaries remain untouched; #539/#540 still own overlapping VIB family/authority presentation surfaces.

---

## Current PF-01 files

```text
ValidationRecords/VibrationMasters/t29-pf01-source-contract-v1.json
ValidationRecords/VibrationMasters/t29-pf01-source-extraction-request-v1.json
ValidationRecords/VibrationMasters/t29-pf01-reconciliation-matrix-v1.json
ValidationRecords/VibrationMasters/t29-pf01-benchmark-matrix-v1.json
ValidationRecords/VibrationMasters/t29-pf01-qualification-progress-v2.json
ValidationRecords/VibrationMasters/t29-pf01-candidate-contract-v1.json
scripts/locate-vibration-t29-controlled-source.mjs
tests/vibration-t29-pf01-contract.test.mjs
tests/vibration-t29-controlled-source-ci.test.mjs
agents/PR547_workreport.md
```

No production numerical module, active master resolver, central registry mutation, family UI or authority promotion is in the PR.

---

## Validation ledger

```text
repository/source identity                  PASS
#481 candidate custody                      PASS
synthesis conflict mapping                  PASS_SOURCE
arithmetic replay                           PASS
unit invariance                             PASS
locator syntax                              PASS
CI probe syntax                             PASS
locator pure ranking behavior               PASS
no-retained-example audit                   PASS_SOURCE
main drift / T2.9 overlap                   PASS
controlled PDF execution                    NOT_RUN / ENVIRONMENT_BLOCKED
DocumentEvidence extraction                 NOT_RUN / ENVIRONMENT_BLOCKED
trusted PR Actions                          NOT_RUN / ZERO RUNS
full repository Node suite                  NOT_RUN
browser/product validation                  NOT_APPLICABLE at PF-01
```

No `NOT_RUN` state is represented as PASS.

---

## Remaining hard stops

```text
CONTROLLED_T29_DOCUMENT_EVIDENCE_NOT_EXECUTED
EXACT_T29_BRANCH_PREDICATES_UNRESOLVED
EXACT_EQUALITY_DIRECTIONS_UNRESOLVED
PRESSURE_BASIS_AND_TAPPING_LOCATIONS_UNRESOLVED
FL_TAXONOMY_CONFLICT_UNRESOLVED
PRESSURE_DROP_EQUATION_CONFLICT_UNRESOLVED
DECISION_BRANCH_ORACLES_PENDING_CONTROLLED_SOURCE
APPENDIX_A_BELOW_GATE
```

## Exact continuation

```text
exact pinned Common PDF
  -> deterministic T2.9 locator
  -> confirm/update reviewer page selection
  -> generic hash-bound DocumentEvidence extraction
  -> reconcile T2.9.2 FL table
  -> reconcile exact equation/property definitions
  -> reconcile Flowchart T2-9 predicates + equality directions
  -> freeze independent branch/boundary oracles
  -> rescore A2 and total
```

Only after:

```text
QUALIFIED_FOR_T29_CANDIDATE_IMPLEMENTATION
```

may a subsequent PR implement the pure candidate numerical kernel.

Screening promotion remains a separate later authority decision.
