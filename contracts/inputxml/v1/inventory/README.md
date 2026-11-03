# InputXML Contract Suite v1 — PR-A Repository Inventory

## Scope

This directory is the Phase/PR-A inventory for the future contract:

```text
source dialect
→ canonical engineering model
→ canonical InputXML
→ CII(2019)
```

No canonical XSD, Schematron, compiler, assurance ledger, or production converter change is introduced in PR-A.

## Authority baseline

- Canonical contract owner: `reallaksh19/3D_Converters`
- Authoritative CII(2019) consumer: `converters/scripts/inputxml_to_cii2019.py`
- `3D_Converters` baseline: `8d167b154a62705c098300ff9e34e51d094349a3`
- `XML_Compare_Utilities` baseline: `26207f1de8d1767cf34c44383a4f70974f0c5a00`
- PR #160 is merged and included in the baseline.
- No overlapping open InputXML schema PR was found at inventory time.

`XML_Compare_Utilities` contains review, transfer, reconciliation, orchestration, comparison, and mirrored conversion code. It does not supersede the `3D_Converters` canonical authority.

## Deliverables

- `inputxml-producer-inventory.json`
- `inputxml-consumer-inventory.json`
- `inputxml-dialect-inventory.json`
- `inputxml-field-occurrence.csv`
- `inputxml-component-shapes.json`

Exact paths are used for active modules. Glob records intentionally group test corpora, benchmark corpora, backups, and historical copies; grouped historical records are evidence only.

## Inventory method

The audit searched both repositories for the mission terms and their concrete implementations:

```text
InputXML
inputxml
enriched inputxml
categorized input
PIPINGMODEL
PIPINGELEMENT
CAESARII / XML_TYPE=Input
CategorizedInputXML
managed-stage
StagedJSON
PDF
RVM
UXML
InputXmlChangeSet
```

The search was followed through live call paths and repository audit documents. Generated fixtures and `.bak` files were classified separately from active authority.

`inputxml-field-occurrence.csv` is a code-level occurrence ledger. One row means that a field or block is read, written, normalized, detected, or explicitly absent at a named implementation boundary. It is not a raw string-frequency count.

## Authority findings

1. The Python CII(2019) writer is the only production projection authority, but its current intake is permissive: it does not enforce `XML_TYPE="Input"` or exactly one `PIPINGMODEL`.
2. Its parser relies on carry-forward/default semantics and accepts optional coordinate seeds.
3. Meaningful `ALLOWABLESTRESS` data is detected but not emitted.
4. Malformed restraint slots can be dropped; browser adapters and enrichers can also remove overflow beyond six slots.
5. `PRESSURE1..9` versus `PRESSURE_C1..9` is a live dialect split.
6. The component-topology writer emits positive bend counts without serializing `BEND` children.
7. `CategorizedInputXML` is a review/transfer representation with normalized blocks and embedded source evidence that can diverge.
8. The XML→CII InputXML sidecar is a diagnostic reconstruction, not the model consumed by the primary CII writer.
9. `seljson-to-inputxml.js` currently emits custom `<Root><Branch><Node>` XML, not `<CAESARII XML_TYPE="Input">`.
10. Several CII auxiliary sections exist in the writer layout without repository-grounded InputXML parser contracts.
11. Current `XML_Compare_Utilities/main` includes a deterministic ASME B36.10M/B36.19M bore-to-OD profile, but its propagation into canonical InputXML is not yet proven.

## PR-A blocking gaps

PR-B must not start until these gaps have an explicit owner and disposition:

- native InputXML benchmark provenance and version/profile separation;
- exact root, namespace, version and `PIPINGMODEL` cardinality policy;
- canonical pressure attribute spelling;
- sentinel versus explicit zero policy by field;
- carry-forward and inheritance legality by field;
- extension namespace and lineage-field policy;
- bend/tee/olet/reducer/rigid/restraint/hanger/nozzle ownership and count equations;
- restraint capacity policy that never silently removes source evidence;
- full `ALLOWABLESTRESS` and `CASE` field semantics;
- `DISPLACEMENTS`, `FORCESMOMENTS`, `UNIFORM`, `WIND`, `OFFSETS`, `EXPANSION JOINT`, `REDUCER`, and `FLANGES` InputXML ownership/field semantics;
- source-to-canonical disposition coverage for current merge, absorb, skip and synthetic topology decisions;
- policy for mirrored converter code in `XML_Compare_Utilities`.

## Phase gate

PR-B remains blocked until this inventory is reviewed and its `PR_A_BLOCKING` gaps are either resolved or accepted as explicit unsupported-blocking scope. No production converter output may change as part of that review.
