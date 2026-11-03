# PR-F — Assured InputXML → CII(2019) Projection

PR-F adds a guarded projection path around the production writer:

```text
canonical InputXML v1
+ InputXmlCiiAssuranceLedger.v1 PASS
+ InputXmlFieldCatalog.v1
+ InputXmlCiiProjectionContract.v1
→ field-catalog reconciliation
→ converters/scripts/inputxml_to_cii2019.py
→ actual serialized CII(2019)
→ independent section/pointer parser
→ InputXmlCiiProjectionLedger.v1
```

The official controller is `inputxml_to_cii2019_assured_projection.py`. It reconciles PR-E readiness with the field catalog and delegates strict writer verification to `inputxml_to_cii2019_assured.py`. Neither module is a second CII writer; CII generation remains owned by `inputxml_to_cii2019.py`.

## Field-catalog reconciliation

PR-E supplies pre-writer section readiness, but PR-F treats `InputXmlFieldCatalog.v1` as the final field-level projection authority:

- `PROJECTED` — PR-E planned sections must exactly match the catalog sections and actual writer targets must be proven;
- `VALIDATION_ONLY` — retained as evidence only, with no CII target;
- `PRESERVE_EXTENSION` — retained as evidence only, with no CII target;
- `UNSUPPORTED_BLOCKING` — blocks the assured writer path.

This prevents metadata such as `PIPINGMODEL@NORTH_X/Y/Z`, which the catalog classifies as `PRESERVE_EXTENSION`, from being falsely assigned to a CII coordinate record.

## Strict assured policy

The assured path requires:

- canonical `{COADE}CAESARII` with `XML_TYPE="Input"`;
- exactly one direct unqualified `PIPINGMODEL`;
- explicit `TIME` in `YYYY/MM/DD HH:MM:SS` form;
- explicit element ID, nodes, deltas, OD, wall, material, line, endpoint names, and endpoint coordinates;
- a PASS `InputXmlCiiAssuranceLedger.v1` whose canonical hash matches the exact XML bytes;
- PASS canonicalization, canonical validation, and CII-readiness gates.

It forbids:

- current-clock substitution;
- partial or implicit coordinate anchoring;
- raw section or element overrides;
- reference-CII payload substitution;
- compatibility-mode writer overrides;
- unapproved hanger or nozzle defaults;
- inferred reducers;
- meaningful SIF fields that the writer does not project;
- any production-writer warning in strict mode.

The existing unassured CLI remains unchanged. It does not produce an assurance claim.

## Actual-index proof

The verifier parses the final writer output and validates:

- section order against `InputXmlCiiProjectionContract.v1`;
- exactly 15 lines per `ELEMENTS` record;
- actual one-based element indexes;
- actual BEND, RIGID, RESTRANT, SIF&TEES, NODENAME, and REDUCERS pointers from ELEMENTS rows 12–14;
- record-width divisibility for each supported auxiliary section;
- every nonzero pointer resolving to a real record;
- every emitted auxiliary record being owned by at least one element;
- contiguous one-based auxiliary indexes;
- COORDS declared count, row count, unique node identity, and element endpoint ownership;
- MISCEL_1 material position by actual element ordinal, payload line, and slot.

## CLI

```bash
python converters/scripts/inputxml_to_cii2019_assured_projection.py \
  --input model.canonical.input.xml \
  --assurance-ledger model.inputxml-cii-assurance-ledger.json \
  --field-catalog contracts/inputxml/v1/catalogs/inputxml-field-catalog.json \
  --projection-contract contracts/inputxml/v1/catalogs/inputxml-cii-projection-contract.json \
  --output model.cii \
  --projection-ledger model.inputxml-cii-projection-ledger.json
```

## Outputs

A successful run writes:

```text
<output>.cii
<inputxml-cii-projection-ledger.json>
```

The projection ledger records:

- exact canonical, assurance, field-catalog, projection-contract, and CII hashes;
- writer strictness policy;
- section payload and record counts;
- one row per InputXML element with actual pointers;
- one row per PR-E assurance record with its original plan, catalog status, effective sections, and proven CII section/index targets;
- blocking diagnostics.

A blocked run writes the projection ledger but does not write CII output.

## Current approved scope

PR-F proves base ELEMENTS/COORDS/NODENAME/MISCEL_1 material projection and explicit BEND, RIGID, RESTRANT, and NODE-only SIF pointers. Hangers, nozzles, explicit reducers, allowable-stress overrides, and other unsupported auxiliary families remain blocked until their field-complete projection contracts are approved.
