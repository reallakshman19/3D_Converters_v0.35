# ADR-007 — PDF Input Echo provenance, line-scope, and state-accounting authority

## Status

Accepted for PR-8/PR-8A implementation review. Production activation, migration, OCR, writer changes, and PR-9 are not authorized.

## Scope

This decision governs only:

- dialect `pdf-input-echo`;
- adapter `pdf-input-echo-to-canonical`;
- PDF extraction provenance;
- explicit source line scopes;
- line-scoped state reconstruction;
- `PdfInputEchoSourceAccountingProof.v1`.

The frozen Input Echo parser, compiler/dispatcher, canonical schemas and registries, production CII writer, serialization policy, publication protocol, browser runtime, managed-stage resolver, and UXML/RVM resolver remain unchanged.

## Binding statements

> Filename, Job Name, node identity, coordinates, adjacency, and process defaults are not piping-line authority.

> Extracted text is authoritative only when bound to immutable source-document and ordered page-text evidence.

> Every PIPE DATA block belongs to exactly one explicit line scope.

> State may carry only from the latest earlier decision for the same field in the same proven line scope.

> The first block of each line scope explicitly establishes every required line-start field.

> A ledger record and emitted XML attribute cannot validate one another. Both are independently compared with reconstructed source authority.

> `COMPLETE` requires exact block × field cardinality and complete semantic equality; dictionary overwrite or last-value-wins behavior is forbidden.

## Authority precedence

1. Raw source bytes.
2. `PdfInputEchoExtractionProvenance.v1`.
3. Ordered page-text manifest and complete extracted-text hash.
4. Explicit report Job Name and Date/Time.
5. `PdfInputEchoLineScopeSet.v1`.
6. Exact PIPE DATA block order and block content.
7. Explicit field markers in each block.
8. Frozen parser values from one isolated block.
9. Reconstructed block × field decisions under `PdfInputEchoLineStartPolicy.v1`.
10. Canonical InputXML candidate and canonicalization ledger, each independently checked against reconstructed authority.
11. `PdfInputEchoSourceAccountingProof.v1`.

The frozen parser decodes one isolated source block at a time. Its legacy document-wide state chain is never accepted as authority.

## Extraction-provenance contract

### Raw PDF

A raw PDF records and validates:

- source-document SHA-256 and byte length;
- document kind `PDF`;
- extractor identity and installed version;
- ordered page index and stable page identity;
- normalized page text, page SHA-256, and UTF-8 length;
- complete normalized extracted-text SHA-256 and length;
- deterministic provenance-object SHA-256.

Raw input is bounded to 64 MiB, extracted text to 32 MiB, and page count to 10,000. Empty or image-only text layers block. OCR is outside PR-8.

### Approved extracted text

Supplied text requires strict UTF-8 and a closed `PdfInputEchoExtractionProvenance.v1` manifest. Ordered page texts must reproduce the received normalized text exactly. Missing, duplicate, reordered, altered, generic, or restamped-but-contradictory evidence blocks.

## Exact line-scope contract

`lineScopes` is mandatory. Each scope contains:

- unique `lineScopeId`;
- unique `lineId`;
- explicit `sourceAuthority`;
- ordered `blockMembership`;
- matching `firstBlock` and `lastBlock`;
- non-empty `sourceEvidenceReferences`;
- deterministic scope hash.

Membership must be ordered, contiguous, non-overlapping, non-duplicated, and cover blocks `1..N` exactly. `lineId` or `defaultLine` alone does not legalize a source.

## Line-state policy

The first block of each line scope explicitly establishes:

- `DIAMETER`;
- `WALL_THICK`;
- `INSUL_THICK`;
- `CORR_ALLOW`;
- `TEMP_EXP_C1`;
- `PRESSURE_C1`;
- `HYDRO_PRESSURE`;
- `INSUL_DENSITY`;
- `FLUID_DENSITY`;
- `MATERIAL_NUM`.

Material name, elastic modulus, Poisson ratio, pipe density, and hot moduli 1–9 are also line-scoped. Optional absence is explicit on the line start and may be inherited only within that scope.

Every block × `ALL_STATE_FIELDS` pair has exactly one decision:

- `PDF_INPUT_ECHO_EXPLICIT_FIELD`;
- `PDF_INPUT_ECHO_INHERITANCE`;
- `PDF_INPUT_ECHO_EXPLICIT_ABSENCE`;
- `PDF_INPUT_ECHO_INHERITED_ABSENCE`.

## Independent PR-8A state-accounting closure

### Authoritative expected decisions

`scripts/inputxml_compiler/pdf_input_echo_accounting_state.py` reconstructs expected decisions from resolved immutable source-block evidence. It does not derive expected values, classifications, owners, predecessor/origin identities, line identity, disposition, or projection cardinality from the ledger or emitted XML under verification.

For each block × field, the reconstruction contains:

- source entity identity;
- decision source type;
- field and canonical value or absence;
- source block identity;
- line scope and line identity;
- line-state policy identity;
- predecessor block, element, and scope where inherited;
- explicit origin block and element where inherited;
- canonical and InputXML element owner;
- CII section applicability;
- projection cardinality;
- disposition;
- expected emitted canonical attribute and value where applicable.

### Exact semantic tuple

The ledger comparison is closed over:

```text
sourceEntityId
sourceType
sourceFields
canonicalElementIds
InputXMLElementIds
CIISection
projectionCardinality
disposition
```

Any extra, missing, or changed nested semantic field blocks. This detects value substitution, explicit/inherited classification substitution, absence-classification substitution, wrong field, wrong scope/line, wrong predecessor/origin, wrong owner, wrong cardinality, and wrong disposition.

### Exact cardinality before indexing

Before dictionary or set lookup, the proof requires:

```text
expected decision count == actual state-record count
unique actual sourceEntityId count == expected decision count
one actual record per expected block × field identity
```

Duplicate identical records and duplicate conflicting records both block. Equal-total-count field replacement still yields a missing expected identity and a duplicated replacement identity.

### Predecessor and origin ownership

Authoritative indexes are built from source/resolved evidence:

```text
blockId  -> blockIndex, entityId, lineScopeId, lineId
entityId -> blockId, blockIndex, lineScopeId, lineId
sourceEntityId -> reconstructed expected decision
```

For inherited decisions, the proof independently establishes that:

- predecessor block and element both exist and identify the same source owner;
- predecessor is in the current authoritative scope;
- predecessor precedes the current block;
- predecessor is the latest earlier decision for that field;
- origin block and element both exist and identify the same source owner;
- origin is in the current authoritative scope;
- origin decision is explicit field or explicit absence;
- origin value/absence equals the inherited ledger result;
- self-declared `predecessorLineScopeId` is evidence only and cannot override source ownership.

### Source, ledger, and XML comparison

The proof performs separate comparisons:

1. reconstructed source decision versus complete ledger semantic tuple;
2. reconstructed required-field value versus the owning emitted `PIPINGELEMENT` attribute;
3. ledger value versus the ledger-declared emitted element attribute;
4. reconstructed scope/line ownership versus ledger and emitted `LINE`.

Therefore coordinated ledger/XML value substitution still fails the source comparison even when ledger and XML agree with each other and downstream hashes are recomputed.

## PR-8A invariants

The proof retains the original document, provenance, page, scope, block, element, axis, auxiliary, unsupported-section, and line invariants and adds:

```text
stateDecisionCountMismatchCount
stateDecisionUniqueIdentityMismatchCount
missingStateDecisionCount
extraStateDecisionCount
duplicateStateDecisionCount
stateDecisionSemanticMismatchCount
stateDecisionSourceXmlMismatchCount
stateDecisionLedgerXmlMismatchCount
stateDecisionPredecessorOwnershipMismatchCount
stateDecisionOriginOwnershipMismatchCount
stateDecisionLineOwnershipMismatchCount
```

It also retains deterministic expected and actual semantic-tuple hashes and explicit mismatch collections for cardinality, semantics, source/XML, ledger/XML, predecessor, origin, and line ownership.

`COMPLETE` requires every invariant to equal zero.

## Geometry and unsupported engineering

Present delta axes are parsed. Omitted axes normalize to zero only under `OMITTED_AXIS_IS_ZERO_V1`. Three zero axes block.

Incomplete restraints, SIF/Tee records, meaningful special rigid identities, unsupported sections, and unparsed post-`NODENAMES` evidence remain preserved and blocking. PR-8/PR-8A does not add engineering projection authority.

## Determinism

Ordering follows page order, source-block order, line-scope order, `ALL_STATE_FIELDS` policy order, ledger record order, and emitted element order. Expected and actual semantic tuples are hashed through sorted-key canonical JSON. Protected Ubuntu and Windows jobs prove repeated-process and hash-seed stability.

## Unchanged boundaries

- Frozen parser: **UNCHANGED**
- Compiler and dispatcher: **UNCHANGED**
- Canonical schemas and registries: **UNCHANGED**
- Production CII writer: **UNCHANGED**
- Canonical serialization and publication: **UNCHANGED**
- OCR: **NOT IMPLEMENTED**
- Migration: **NOT AUTHORIZED**
- PR-9: **NOT STARTED**
