# PR-8 / PR-8A — PDF Input Echo implementation evidence

## Authority and scope

Issue #247 is the sole Work Pack. The PR-8A corrective comment authorizes continuation on PR #248 and conditional merge only after exact final-head validation.

Affected profile:

```text
pdf-input-echo
pdf-input-echo-to-canonical
```

Implementation base:

```text
ba8b4e43698e1bed8e30f25832659603b40e86b2
```

Corrective code-validation head:

```text
57ddd5f37f6a86b3a78354dc76e6b802ea2dc811
```

The documentation-final PR head and its final workflow runs are recorded authoritatively in PR #248 after this evidence update, because a Git commit cannot embed its own resulting SHA.

## Material claims

| Claim | Classification | Authority | Version | Location | Applicability | Confidence | Action |
|---|---|---|---|---|---|---|---|
| Raw PDF and approved extracted text are bound to immutable source-document, ordered page-text, extractor, and complete extracted-text evidence. | IMPLEMENTED_AND_TESTED | Issue #247 | `PdfInputEchoExtractionProvenance.v1` | `pdf_input_echo_provenance.py`; provenance tests | PDF Input Echo intake | HIGH | Reject missing, altered, reordered, generic, image-only, or contradictory extraction evidence. |
| Every PIPE DATA block belongs to exactly one explicit line scope; filename, Job Name, nodes, coordinates, and defaults are not line authority. | IMPLEMENTED_AND_TESTED | Issue #247 | `PdfInputEchoLineScopeSet.v1` | `pdf_input_echo_scopes.py`; line-scope tests | all PDF sources | HIGH | Block missing, overlapping, duplicated, gapped, or reordered ownership. |
| The frozen parser is invoked once per isolated block and its legacy document-wide state chain is not authority. | IMPLEMENTED_AND_TESTED | Issue #247 source-reality correction | PR-8 | `pdf_input_echo_state.py` | state decoding | HIGH | Keep `converters/scripts/pdf_to_inputxml.py` unchanged. |
| Every required line-start field is explicit and optional material/mechanical state is also line-scoped. | IMPLEMENTED_AND_TESTED | `PdfInputEchoLineStartPolicy.v1` | v1 | state modules and tests | block × field state | HIGH | Block sentinel, missing, duplicate-marker, or cross-line values. |
| PR-8A reconstructs exactly one expected decision for every resolved source block × `ALL_STATE_FIELDS` without using mutable ledger or emitted XML as expected-value authority. | IMPLEMENTED_AND_TESTED | PR-8A corrective Work Pack | `PdfInputEchoSourceAccountingProof.v1` | `pdf_input_echo_accounting_state.py` | state accounting | HIGH | Require independent expected-decision reconstruction before acceptance. |
| The closed semantic tuple includes source identity/type/fields, canonical and InputXML owners, CII section, projection cardinality, and disposition. | IMPLEMENTED_AND_TESTED | PR-8A complete-tuple requirement | v1 | accounting-state helper; exploit tests | every state record | HIGH | Block any nested semantic difference, including classification, owner, field, line/scope, predecessor/origin, cardinality, and disposition. |
| Exact state cardinality is checked before grouping: total count, unique identity count, missing identities, extra identities, and duplicates must all close. | IMPLEMENTED_AND_TESTED | PR-8A cardinality requirement | v1 | accounting-state helper | state ledger | HIGH | Block identical duplicates, conflicting duplicates, and equal-count field replacement. |
| Predecessor and origin ownership are resolved from authoritative block/entity indexes, not self-declared scope fields. | IMPLEMENTED_AND_TESTED | PR-8A ownership requirement | v1 | accounting-state helper | inherited values and absences | HIGH | Prove same scope, earlier/latest predecessor, explicit origin, and equal origin/result value. |
| Reconstructed source values, ledger values, emitted required-field attributes, and emitted `LINE` are compared independently. | IMPLEMENTED_AND_TESTED | PR-8A restamped-substitution requirement | v1 | accounting-state helper and accounting proof | canonical candidate and ledger | HIGH | Block coordinated ledger/XML substitutions even when both agree with each other. |
| `COMPLETE` requires every original and PR-8A invariant to equal zero. | IMPLEMENTED_AND_TESTED | Issue #247 and PR-8A | `PdfInputEchoSourceAccountingProof.v1` | `pdf_input_echo_accounting.py` | source accounting | HIGH | Emit blocking accounting decision on any mismatch. |
| Omitted axes normalize only under `OMITTED_AXIS_IS_ZERO_V1`; unsupported engineering remains preserved and blocking. | IMPLEMENTED_AND_TESTED | Issue #247 containment | v1 | element/auxiliary modules and tests | geometry and auxiliaries | HIGH | Do not invent engineering semantics. |
| Canonical XML, ledger, proof, and validation remain deterministic across repeated processes, hash seeds, Ubuntu, and Windows. | WORKFLOW_GATED | protected compiler workflow | current | determinism tests and jobs | deterministic artifacts | HIGH | Require both platform jobs on exact final head. |
| The 14-dialect full-chain matrix remains intact and only supplies strengthened PDF evidence through the focused launcher. | IMPLEMENTED_AND_TESTED | Issue #247 protected matrix rule | current | PDF E2E launcher and workflow | all registered dialects | HIGH | Preserve 14 cases, 12 full-chain passes, and 2 expected blocks. |
| Frozen parser, compiler/dispatcher, schemas, registries, production writer, serialization, publication, and unrelated programmes are unchanged. | VERIFIED_SCOPE_BOUNDARY | Issue #247 and PR-8A ownership | current | final PR diff | repository | HIGH | Treat any contrary diff as a merge blocker. |

## Exact reconstructed semantic tuple

For each source block × field, the expected decision contains, as applicable:

```text
sourceEntityId
sourceType
field
canonical value or explicit absence
sourceBlockId
lineScopeId
lineId
lineStatePolicyId
predecessorBlockId
predecessorElementId
predecessorLineScopeId
originBlockId
originElementId
canonicalElementId
InputXML element owner
CIISection
projectionCardinality
disposition
expected emitted canonical attribute/value
```

The exact ledger tuple compared is:

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

Nested `sourceFields` equality is closed; missing and extra keys are mismatches.

## PR-8A invariants

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

The proof also retains explicit mismatch arrays and deterministic expected/actual semantic-tuple SHA-256 values.

## Mandatory exploit qualification

The focused accounting suite proves that each attack blocks and exposes the expected nonzero invariant or mismatch reason:

1. inherited `DIAMETER` ledger value and emitted attribute changed together;
2. explicit field ledger value and emitted attribute changed together;
3. explicit decision reclassified as inherited;
4. predecessor changed to another line while the self-declared predecessor scope falsely remains current;
5. predecessor changed to a non-latest earlier block in the same line;
6. origin changed to another valid explicit block with the same numeric value;
7. otherwise identical state-decision record duplicated;
8. canonical/InputXML owner changed to another valid element and that element restamped consistently;
9. ledger line/scope and emitted `LINE` changed together to other valid identities;
10. one decision removed and replaced by another valid field decision while total count remains unchanged.

Additional retained attacks cover conflicting duplicates, block removal, block/element cardinality mismatch, provenance restamping, unsupported-section omission, line-scope substitution, extraction tamper, line-start failure, duplicate markers, and cross-platform determinism.

## Corrective code-head validation

Exact head:

```text
57ddd5f37f6a86b3a78354dc76e6b802ea2dc811
```

Focused accounting tests:

```text
18 passed
```

Full canonical compiler suite:

```text
318 tests passed
```

| Workflow | Run ID | Job ID(s) | Result |
|---|---:|---:|---|
| InputXML Schema Suite | `29828781471` | `88628201293` | PASS |
| InputXML Canonical Compiler | `29828781545` | validate `88628201518`; Ubuntu `88628201491`; Windows `88628201388` | PASS |
| InputXML Assurance Ledger | `29828781453` | `88628200971` | PASS |
| InputXML Assured CII Projection | `29828781451` | `88628200964` | PASS |
| InputXML End-to-End Regression Matrix | `29828781469` | `88628201187` | PASS |

The compiler validate job includes all protected PR-7 managed-stage qualification, shared component-topology producer proofs, the complete PDF suite, and direct canonical CLI smoke.

## Unchanged and deferred

Production CII writer: **UNCHANGED**  
Frozen parser: **UNCHANGED**  
Compiler and dispatcher: **UNCHANGED**  
Schemas and registries: **UNCHANGED**  
Canonical serialization/publication: **UNCHANGED**  
OCR: **NOT IMPLEMENTED**  
Migration: **NOT AUTHORIZED**  
PR-9: **NOT STARTED**
