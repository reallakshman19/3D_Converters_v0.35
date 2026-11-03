# PR486 — Generic Vibration Master Source Register / Extractor

## Recovery header

- Source task: #450
- PR / branch: `#486` / `agent/vibration-master-source-extractor`
- Base at allocation: `main@36748e381012bb52ba720cc288101948115721bb`
- Initial PR head: `85af3a1274aef10a9d7fedc8ce60e6b62c9a16d3`
- Tested code checkpoint: `168a477c9e837632a316c0a486d6ca7fb73898f2`
- Work intent: IMPLEMENT
- Criticality: ENGINEERING_CRITICAL
- Recovery state: CONTINUE
- Coordination: COORDINATION_REQUIRED
- Authority invariant: source identity / locator / extraction evidence only; no numerical master values or authority promotion.

## Mission

Implement the next independent #450 rung after PR #483: a program-level vibration master source register contract plus a generic fail-closed controlled-PDF extractor that generalizes the proven AIV `pdftotext -layout` pattern.

This work does not revive superseded PR #452 behavior, does not duplicate DocumentEvidence v2 table extraction from #470/#480, and does not publish SBC/T2.8/T2.9/T4 values.

## Live grounding and coordination

Allocation baseline: `main@36748e381012bb52ba720cc288101948115721bb`.

Related open PR boundaries at implementation time:
- #480 owns SBC source inventory / DocumentEvidence recovery planning.
- #483 owns `VibrationMaster.v1` registry/resolver framework.
- #471 owns bounded T2.8 candidate evidence.
- #479 owns FIT reproducibility/release closure.

No exact-file overlap was found. Conceptual source-governance overlap with #480 is explicitly separated: PR486 provides generic program-level source register/extraction machinery; #480 remains the SBC target inventory and future reviewer-selected DocumentEvidence path.

## Appendix A — Implementation authorization

### A1 Production Trace — 19/20

#450 requires exact source repository/commit/path/blob/size plus printed/PDF page, locator, extraction tool/version, page hashes and section hash before recovered master values can advance. Main had a source-specific AIV extractor and DocumentEvidence v2 table transport, but no generic source-register/extractor contract.

### A2 Current Failure Isolation — 19/20

The missing capability was a reusable evidence boundary that can independently verify source bytes, extract deterministic layout text, validate explicit reviewer page selections/anchors, and emit hash-only source receipts without publishing licensed source text or engineering values.

### A3 Authority / Invariant — 20/20

Verified invariants:
- wrong Git blob or byte size hard fails;
- page selection is explicit and strictly increasing;
- required anchors fail on missing or unexpected occurrence count;
- extraction receipts publish hashes/metadata, not anchor/source text;
- private review text is optional/local only;
- DocumentEvidence v2 remains the table extraction/reconciliation transport;
- blocked sources cannot enter extraction;
- no candidate master is activated;
- no numerical/screening/design authority changes.

### A4 Independent Validation — 18/20

Synthetic PDF bytes/text pages and a fake `pdftotext` executable validate the machinery independently of retained EI numerical values. Tests exercise byte mismatch, deterministic page/section hashing, anchor ambiguity/missing behavior, CLI output, private-review separation, source-register state validation, program target coverage and blocked-source handling.

### A5 Minimal Patch — 19/20

New files only:
- `scripts/vibration-master-source-register.mjs`
- `scripts/extract-vibration-master-source.mjs`
- `docs/Masters/Vibration/source-register.json`
- `tests/vibration-master-source-extractor.test.mjs`
- `agents/PR486_workreport.md`

No existing production/test file was changed.

**Qualification score: 95/100; minimum challenge 18/20 — PASS.**

## Implemented capability

### `VibrationMasterSourceRegister.v1`

The program source register now:
- pins the controlled EI 2nd Edition guidance object by repository, commit, path, Git blob and byte size;
- covers 19 #450 source-governance targets;
- distinguishes `TABLE`, `RULE`, `CURVE`, `EQUATION`, `PROJECT_EVIDENCE`, and explicit `UNRESOLVED` source form;
- uses explicit lifecycle states including `SOURCE_PINNED`, `RECONCILIATION_REQUIRED`, and `BLOCKED_SOURCE`;
- never infers state from blank locator fields;
- marks navigation-only printed-page/identifier data as `NAVIGATION_ONLY` with no PDF-page/hash qualification claim;
- keeps advanced deadleg, corrugation, and slug entries `BLOCKED_SOURCE` with no fake source reference.

Register deterministic hash at tested checkpoint:

```text
sha256:6440ee7eb19e587cc8b418b92c7c69d587ad51cc4c1d0b00d41de2ccabfb6fde
```

### Generic controlled-PDF extractor

`extract-vibration-master-source.mjs`:
- verifies actual Git blob SHA-1 and exact byte size before extraction;
- runs `pdftotext -layout` and records tool/version;
- requires an explicit `VibrationMasterSourceExtractionRequest.v1`;
- requires explicit ordered PDF page numbers;
- validates request locator against any existing navigation-only register locator;
- requires explicit anchor strings and expected occurrence counts;
- hashes selected pages and joined selected text;
- writes `VibrationMasterSourceExtraction.v1` hash-only receipts;
- hashes anchor text in the receipt instead of publishing anchor text;
- optionally writes selected source text only to a separately requested private-review output;
- does not parse table values and does not publish master values.

## Executed validation

```text
node --check scripts/vibration-master-source-register.mjs       PASS
node --check scripts/extract-vibration-master-source.mjs       PASS
node --check tests/vibration-master-source-extractor.test.mjs  PASS
node --test tests/vibration-master-source-extractor.test.mjs   PASS 15/15
fake-pdftotext CLI end-to-end                                 PASS
published tested Git blobs vs local precomputed blobs          PASS 4/4
```

Exact tested Git blob IDs:

```text
scripts/vibration-master-source-register.mjs
  696d1bdf66037de76be81cbb01f60859068e50dd
scripts/extract-vibration-master-source.mjs
  23c31763a231ba9fda05dbcb4413f00f7e977945
docs/Masters/Vibration/source-register.json
  7fd8798bc8a6687df81455b98a7a2daffe0d9224
tests/vibration-master-source-extractor.test.mjs
  f59d7d71e1b10e1467a399926bf7eb441c2fd1c3
```

Module line limits at tested checkpoint:

```text
vibration-master-source-register.mjs   218
extract-vibration-master-source.mjs    281
source extractor regression            298
```

## Validation not executed

```text
exact controlled EI PDF extraction     NOT_RUN
source-specific PDF page/hash binding  NOT_RUN
DocumentEvidence table extraction      NOT_APPLICABLE to this generic PR
master reconciliation                  NOT_APPLICABLE
numerical calculator qualification     NOT_APPLICABLE
browser validation                     NOT_APPLICABLE
```

The exact EI PDF run is intentionally not reported as PASS. This PR validates generic machinery; later source-specific recovery must execute it against the controlled binary and explicit reviewer request.

## Authority boundary

```text
masterValuesPublished = false
engineeringAuthority  = NONE
screeningAuthority    = NOT_AUTHORIZED
designAuthority       = false
```

Existing AIV screening authority is not changed by this source register.

## Backup compliance

No existing production/test file was edited. Before updating/removing existing handoff files, exact current Git blobs were reconstructed locally and matched:

```text
agents/PR486_workreport.md
  e527cd715909b0d8808248eb9d809949493c1a0d
agents/WIP-VIBMASTER-SOURCE-EXTRACTOR_workreport.md
  03d2e42a4c298bcfe06bcc179412b452a6846260
```

Then the repository backup utility was executed:

```text
node utils/backup.js save agents/PR486_workreport.md "PR486 validation ledger refresh"
node utils/backup.js save agents/WIP-VIBMASTER-SOURCE-EXTRACTOR_workreport.md "PR486 retire pre-PR WIP after durable PR handoff"
```

Both backups PASS. The pre-PR WIP is retired; this file is the single durable handoff.

## Negative assurance

Unchanged:
- all vibration numerical kernels;
- AIV screening authority;
- FIT authority;
- #480 inventory/evidence selections;
- #471 T2.8 candidate values/evidence;
- DocumentEvidence v2 transport contracts;
- engineering UI behavior.

## Highest remaining risk

The next source-specific extraction can only be trusted after the exact controlled EI PDF bytes and explicit reviewer-selected PDF pages/anchors are supplied to this extractor. Navigation-only printed-page hints in the register are not extraction qualification.

## EXACT_NEXT_ACTION

Use the generic extractor on the first source-pinned #450 target with an explicit reviewer request, bind actual PDF page hashes, then hand the resulting extraction receipt to the appropriate reconciliation path: DocumentEvidence v2 for tables, dedicated rule recovery for rule graphs, and controlled rendering/dual digitization for curves.