# InputXML Contract Suite v1 — PR-C Schema and Golden Corpus

## Scope

PR-C implements the structural and semantic validation layer approved by PR-B. It does not modify `inputxml_to_cii2019.py`, producer modules, UI, benchmarks, or generated CII output.

## Files

- `inputxml-canonical-v1.xsd` — strict canonical `CAESARII XML_TYPE="Input"` contract
- `inputxml-extension-v1.xsd` — explicit preservation and blocking evidence namespace
- `categorized-inputxml-v3.xsd` — review/transfer representation contract
- `inputxml-semantic-rules-v1.sch` — count, topology, ownership, capacity, and production-gate rules
- `inputxml-dialect-registry.json` — fourteen separate intake/review/excluded profiles
- `golden/manifest.json` — expected validation result for each corpus document
- `golden/positive/*` and `golden/negative/*`
- `scripts/validate-inputxml-schema-suite.py`
- `.github/workflows/inputxml-schema-suite.yml`

## Namespace policy

Canonical documents use:

```xml
<CAESARII xmlns="COADE" XML_TYPE="Input">
  <PIPINGMODEL xmlns="">
    <PIPINGELEMENT .../>
  </PIPINGMODEL>
</CAESARII>
```

The root is `COADE`-qualified. Engineering child elements are unqualified, matching repository benchmark structure. Extension evidence uses only:

```text
urn:reallaksh19:inputxml:extension:v1
```

Unknown unqualified elements and attributes fail XSD validation.

## Canonical restrictions

- exactly one direct `PIPINGMODEL`;
- one or more `PIPINGELEMENT` records;
- canonical names only (`PRESSURE_C1..9`, `LINE`);
- positive integer node IDs;
- explicit finite delta geometry;
- deterministic child order and cardinality;
- at most one `BEND`, one `RIGID`, two `SIF`, and six `RESTRAINT` records per owner;
- complete endpoint-coordinate pairs or no absolute coordinate seed;
- no unsupported unqualified auxiliary blocks;
- explicit 22-value canonical nozzle records;
- extension records require source path, disposition, criticality, and confidence.

The vendor benchmark dialect is evidence for intake adapters, not a canonical golden file. For example, it uses `PRESSURE1..9`, sentinel inheritance, and unsupported auxiliary blocks that must be normalized, preserved, or blocked before canonical validation.

## Schematron production rules

The semantic gate verifies:

- every `NUM*` assertion against canonical child counts;
- unsupported CONTROL counts are zero;
- approximate unit north vector;
- no sentinel or zero-length geometry;
- no duplicate directed node pair;
- first element of each `LINE` scope carries section context;
- complete coordinate triplets;
- bend angle/node pairing;
- restraint/SIF/hanger ownership;
- unique restraint slots and CII restraint-type range;
- `UNSUPPORTED_BLOCKING` extension evidence fails production validation.

## Golden corpus

The corpus currently contains ten cases:

- three positive documents;
- four XSD-negative documents;
- three semantic-negative documents.

The validator compiles all XSDs and the ISO Schematron, then proves each document reaches its declared result. Negative files are required evidence, not ignored failures.

## PR-D gate

A dialect adapter may emit canonical InputXML only when:

1. its dialect is registered;
2. all aliases are normalized;
3. every transformation decision is ledgered;
4. the output passes canonical XSD and Schematron;
5. unsupported blocking evidence remains a blocking diagnostic.

CategorizedInputXML requires reconciliation; source evidence extraction alone is insufficient.
