# WIP-fit-drift-01 — FIT machine truth / drift hardening

## Mission

Deliver `FIT-DRIFT-01` for `VIB.FIV.FLOW_TURBULENCE`: one machine-readable Engineering Work Pack, a deterministic drift validator, UI projection repair, stale-document classification/reconciliation, and a regression gate. No FIT numerical-method or authority promotion is authorized.

Owner issue: #443. Parent vibration gate: #429. Merge authority remains Owner-only.

## Live grounding

```text
CURRENT_MAIN_SHA              d12ca2d53d1ea0174e1b91fbe3105137fdd2a42b
CURRENT_BRANCH                agent/fit-drift-01-workpack
CURRENT_PR                    NONE / WIP
FIT_ADAPTER_BLOB              eef88d59846a5c779d5f56b71b9502955ddf1b41
ACTIVE_REGISTRY_STATE         ACTIVE
CURRENT_TEST_MANIFEST_COUNT   57 (pre-mutation observation)
CURRENT_PRODUCT_FREEZE_STATE  BLOCKED / NOT FROZEN
```

Open FIT proposal PRs:

```text
#539 OPEN/DRAFT — stale production/lifecycle proposal; diverged from current main
#540 OPEN/DRAFT — stacked authority-boundary proposal; diverged from current main
```

Repository-wide lifecycle proposal:

```text
#564 OPEN/DRAFT — RESERVED -> QUALIFIED -> ACTIVE -> DEPRECATED
main has no converters/engineering-calculations/lifecycle.js
```

Do not copy #564 into FIT. Capability lifecycle remains separate from method qualification.

## Current FIT truth

```text
capabilityId          VIB.FIV.FLOW_TURBULENCE
methodRevision        ei-aviff2-fit-screening-v1
calculationState      IMPLEMENTED
qualificationState    SCREENING
engineeringAuthority  SCREENING
screeningAuthority    AUTHORIZED_BOUNDED
designAuthority       false
codeCompliance        false
registry               ACTIVE
full vibration         INCOMPLETE
product freeze         BLOCKED / NOT FROZEN
```

PR #499 is the merged bounded-screening engineering qualification event. PR #511 merged the product-freeze machinery/evidence work but explicitly did not establish the official URL-based Product Freeze.

## Protected engineering invariants

- FIT is main-line Flow-Induced Turbulence only.
- `60 <= Dext <= 219.1 mm` bounded screening.
- `219.1 < Dext < 273 mm` excluded / fail closed (QST-003).
- `273 <= Dext <= 762 mm` bounded screening.
- QST-003 may not be resolved by interpolation, nearest family, nominal-size inference, workbook selector, or user-entered family.
- Advanced path requires `FLEXIBLE_SMALL|FLEXIBLE_LARGE`, standard LOF >= 1, actual `fn`, and `1 Hz < fn <= 3 Hz`.
- Exactly 1 Hz excluded; exactly 3 Hz included.
- No `safe=true`, `pass=true`, `designAcceptable=true`, or universal vibration score.
- Product Freeze is independent of method qualification.

## Takeover qualification — Appendix A

```text
A1 Production Trace              20/20
A2 Current Failure Isolation     20/20
A3 Authority / Invariant         20/20
A4 Independent Validation        18/20
A5 Next-Commit / Minimal Patch   20/20
TOTAL                            98/100
minimum challenge                18/20
```

A4 is intentionally not scored as executable runtime proof: this connector runtime has not executed the Node/browser suites. Controlled benchmark/source identities and merged qualification/freeze records were independently re-read.

```text
TAKEOVER_DECISION   CONTINUE from fresh current main
OLD_BRANCH_RULE     SUPERSEDE direct continuation of #539/#540
TAKEOVER_AUTHORITY  IMPLEMENTATION within FIT-DRIFT-01 scope
```

## Current drift / failure isolation

1. `tabs/engineering-calculation-console-view.js` hard-codes FIT `BENCHMARK ONLY` although the registered definition is `SCREENING`.
2. `tabs/engineering-calculation-vibration-family.js` says no mechanism has screening authority although FIT and AIV are registered `SCREENING` calculations.
3. `docs/vibration/FIT-Source-Basis-Evidence-v1.md` still presents `BENCHMARK_ONLY / NONE / NOT_AUTHORIZED` as current authority.
4. `docs/vibration/FIT-source-register.md` still presents `NUMERICAL_METHOD_BLOCKED / ENGINEERING_AUTHORITY_NONE` without historical classification.
5. Current FIT qualification/scope documents retain older release-suite count prose; the executable manifest is the only count oracle.

## Benchmark state

```text
FIT-EI-WORKED-EXAMPLES-V1
  10 controlled cases = 8 Appendix D2.1 + 2 Appendix D4

FIT-INDEPENDENT-HAND-BENCHMARKS-V1
  independent standard-family, advanced, threshold, support-boundary,
  unit-invariance, QST-003 fail-close and fn-boundary evidence
```

Production output must never create/correct expected values, relax tolerance, or fit a benchmark.

## Coordination / file overlap

```text
#539  COORDINATION_REQUIRED
      overlaps proposed UI projection files; branch is diverged/stale proposal only

#540  COORDINATION_REQUIRED
      overlaps UI and FIT release-gate paths; branch is stacked/diverged proposal only

#564  SAFE exact-file scope if this WIP does not edit
      converters/engineering-calculations/lifecycle.js or
      tabs/engineering-calculation-console-sections.js
      conceptual lifecycle overlap remains explicitly quarantined
```

## Planned changed-file ledger

New:

```text
engineering/workpacks/VIB-FIT.json
scripts/verify-engineering-workpack.mjs
tests/vibration-fit-workpack-drift.test.mjs
agents/WIP-fit-drift-01_workreport.md
```

Existing, subject to backup custody before edit:

```text
package.json
scripts/verify-vibration-fit-release.mjs
tabs/engineering-calculation-console-view.js
tabs/engineering-calculation-vibration-family.js
docs/vibration/FIT-Source-Basis-Evidence-v1.md
docs/vibration/FIT-source-register.md
```

No FIT equation/correlation/master/benchmark/tolerance/applicability/methodRevision/authority mutation. No `.github/workflows/*` change.

## Validation ledger

```text
STATUS       OBSERVATION                                      ORACLE
PASS         live main SHA re-read                            GitHub branch ref
PASS         FIT adapter/registry current authority inspected current production source
PASS         57-file pre-mutation manifest counted            release manifest source
PASS         #499 bounded screening event is merged            merged PR record
PASS         #511 official freeze remained blocked             merged PR record/protocol
NOT_RUN      npm run workpack:verify -- VIB-FIT                connector runtime
NOT_RUN      npm run verify:vibration-fit-release               connector runtime
NOT_RUN      official Chromium Product Freeze                   protocol requires served browser journey
```

## Highest risk

Creating a second independent FIT status model rather than a checked contract. The work pack must be validated against runtime registry/adapter behavior and consumed as a guardrail; UI must project registered calculation metadata rather than invent a new FIT-only authority constant.

## EXACT_NEXT_ACTION

Create backup custody for every existing file listed above, then add `engineering/workpacks/VIB-FIT.json` and the generic work-pack validator without modifying FIT numerical code.