# ADR-004 — Canonical InputXML-Family Resolution

## Status

Accepted for Agent IXCC-05 / PR-5 implementation.

## Scope

This decision governs only:

- `canonical-inputxml-v1`
- `caesar-inputxml-pressure1`
- `caesar-inputxml-pressure-c`
- `enriched-inputxml-app`
- `inputxml-fragment`
- `categorized-inputxml-v3`
- `cii14-inputxml`
- `xml-to-cii-diagnostic-sidecar`

Root/Branch/Node, SelectionJSON, managed-stage, PDF, UXML/RVM and NodeSet semantics are unchanged.

The production writer `converters/scripts/inputxml_to_cii2019.py` is read-only evidence and remains unchanged.

## Binding statements

> A registered alias is not a precedence rule.

> A missing sentinel is not an engineering value.

> Textually equal line names do not prove a continuous inheritance scope.

## Governing authorities

1. Canonical XSD and Schematron.
2. Field, alias, component and projection catalogs.
3. Dialect and adapter registries.
4. Unchanged production-writer and repository reference evidence.
5. Governing concept and ADR-001 through ADR-003.
6. Characterized legacy behavior.
7. Explicit compiler context permitted by a profile contract.

## Characterized pre-correction behavior

| Profile | Detection / override behavior | Context | Counts | Sentinel / inheritance | Unknown evidence | Candidate behavior | Required correction |
|---|---|---|---|---|---|---|---|
| canonical-inputxml-v1 | Canonical-looking CAESARII documents are deep-copied. Override compatibility is not independently proved. | Bypassed by direct path. | XSD/Schematron only; no adapter repair. | Bypassed by direct path. | Existing canonical content retained. | XSD/Schematron failure returns no candidate. | Preserve validation-only semantics; add explicit intake predicate and accounting proof. |
| caesar-inputxml-pressure1 | Selected when any `PRESSURE1..9` or `LINE_ID` occurs. Override can force incompatible input. | Generic version/job/north/defaultLine fallback. | Supplied assertions checked; omissions accepted. | Geometry sentinel becomes zero. State is keyed globally by line text. | Generic preservation/blocking. | Generic family candidate. | Prove Pressure1 lexical family, registry-only aliases, explicit contiguous scopes and prohibited geometry sentinels. |
| caesar-inputxml-pressure-c | Fallback family for noncanonical CAESARII input; may be selected without a Pressure-C marker. | Generic fallback. | Generic. | Generic. | Generic. | Generic family candidate. | Require a Pressure-C marker and prevent reinterpretation as Pressure1. |
| enriched-inputxml-app | Selected by known enrichment child names. | Generic fallback. | Generic. | Generic. | Known enrichment children preserved; unknown children block. | Generic family candidate. | Preserve known evidence without engineering override; reject incompatible overrides. |
| inputxml-fragment | `PIPINGELEMENT` or any `fragment` root; nested/mixed roots are not explicitly rejected. | Requires version/job/north; optional generic line fallback later. | Synthetic wrapper counts. | Generic family normalization. | Generic. | Generic family candidate. | Restrict accepted roots, validate context, account the synthetic wrapper, preserve source order and detect identity collisions. |
| categorized-inputxml-v3 | Root/schema XSD checked inside resolver after intake is claimed complete. | Version/north required; job name silently falls back to source name or `CATEGORIZED_CANONICAL`. | Synthetic wrapper counts. | Generic family normalization after overlay. | OriginalElement preserved; some review blocks are not reconciled. | Generic family candidate. | Move categorized XSD to intake gate, require job authority, reconcile overlays and line identity, account all review evidence. |
| cii14-inputxml | Version beginning with `14` is checked after canonical-looking detection; explicit override is not proved. | Generic fallback. | Generic. | Generic. | Generic. | Generic family candidate. | Preserve complete version identity, require CII14 source predicate and block unproved compatibility. |
| xml-to-cii-diagnostic-sidecar | Explicit override can route any InputXML-family document through the generic normalizer. | Generic fallback. | Generic. | Generic. | Diagnostic extension appended. | Always ledger-blocked with candidate. | Require explicit diagnostic selection and preserve the nonproduction boundary. |

### Characterized implementation defects

- `_compile_inputxml_family` is one permissive path for materially different profiles.
- `_normalize_element` converts `-1.0101` geometry deltas to `0`.
- line inheritance is stored in `dict[lineText]`, so a later discontinuous reuse revives stale state.
- context is treated as a generic fallback reservoir.
- equivalent canonical/alias duplicates are not fully accounted.
- ID sanitization has no collision registry.
- endpoint coordinates are not reconciled against deltas.
- categorized job name has a hidden fallback.
- source-accounting status is returned as `COMPLETE` unconditionally.
- categorized XSD failure is raised after `PROFILE_INTAKE_VALIDATED`.

## Explicit profile contracts

Each profile descriptor declares:

- `profileId`
- `adapterId`
- root and version predicates
- required source markers
- permitted aliases
- context permissions
- count policy
- sentinel policy
- line-scope policy
- unknown-attribute and unknown-child policy
- extension policy
- diagnostic-only status
- candidate policy

Detection chooses a candidate profile. The profile intake gate independently proves compatibility. A dialect override cannot waive a predicate.

## Profile predicates

### canonical-inputxml-v1

Requires `{COADE}CAESARII`, `XML_TYPE="Input"`, exactly one direct unqualified `PIPINGMODEL`, canonical field names and no adapter-only enrichment marker. Intake is copied without engineering mutation and validated directly.

### caesar-inputxml-pressure1

Requires at least one registered Pressure1-family alias (`PRESSURE1..9`) or `LINE_ID`. Canonical and alias forms may coexist only when type-equivalent.

### caesar-inputxml-pressure-c

Requires at least one `PRESSURE_C1..9` source attribute. Pressure1 presence does not make the profile invalid when a canonical Pressure-C marker exists; alias reconciliation still applies.

### enriched-inputxml-app

Requires at least one repository-declared enrichment child. Enrichment evidence is not geometry or engineering authority.

### inputxml-fragment

Accepted roots are:

- one direct unqualified `PIPINGELEMENT` root; or
- an unqualified `Fragment` wrapper containing only direct unqualified `PIPINGELEMENT` children.

Nested, empty and mixed wrappers block.

### categorized-inputxml-v3

Requires unqualified `CategorizedInputXML`, `schema="categorized-inputxml/v3"`, and categorized XSD success at `PROFILE_INTAKE_GATE`.

### cii14-inputxml

Requires a full CAESARII InputXML document whose complete lexical `VERSION` begins with segment `14`. The version string is never parsed through `float` or truncated.

### xml-to-cii-diagnostic-sidecar

Requires explicit profile selection. It is diagnostic-only and can never reach production acceptance.

## Alias authority

Only exact case-sensitive aliases in `InputXmlAliasRegistry.v1` are accepted.

For every canonical field:

1. gather canonical spelling and all profile-permitted registered aliases;
2. compare values using the field’s declared type;
3. if equivalent, emit one canonical value and record every source spelling;
4. if conflicting, block with `ALIAS_VALUE_CONFLICT` at `PROFILE_RESOLVER_GATE`;
5. never choose by source order or profile preference.

Wrong-case, punctuation-normalized, fuzzy and undocumented aliases are unknown evidence, not aliases.

## Sentinel policy

- `DELTA_X`, `DELTA_Y`, `DELTA_Z`: `-1.0101` is prohibited and blocks with `GEOMETRY_SENTINEL_PROHIBITED`.
- inheritance-enabled engineering fields: the sentinel means intake absence only.
- the first element of each scope must seed required section fields.
- a sentinel never becomes zero or a default.
- canonical output must contain no prohibited sentinel.

## Line-scope model

A `LineScopeState` represents one contiguous source segment:

```text
scopeId
lineIdentity
seedElementId
lastElementId
inheritedValues
```

A textual line change closes the current scope. Returning later to the same text creates a new scope and cannot revive earlier values. Every inherited value records its scope and seed.

## Count authority

Source `NUM*` values are assertions. Canonical values are recomputed from emitted canonical records.

| Field | Authority definition |
|---|---|
| NUMELT | direct canonical `PIPINGELEMENT` count |
| NUMNOZ | direct canonical nozzle-family record count |
| NOHGRS | active `PIPINGELEMENT/HANGER` record count |
| NUMBEND | `PIPINGELEMENT/BEND` record count |
| NUMRIGID | `PIPINGELEMENT/RIGID` record count |
| NUMEXPJNT | approved canonical expansion-joint projection count; currently zero |
| NUMREST | count of `PIPINGELEMENT` owners containing one or more active restraints |
| NUMFORCMNT | active `FORCESMOMENTS` record count; unsupported output is zero |
| NUMUNFLOAD | active `UNIFORM` record count; unsupported output is zero |
| NUMWIND | active `WIND` record count; unsupported output is zero |
| NUMELEOFF | active `OFFSETS` record count; unsupported output is zero |
| NUMALLOW | active `ALLOWABLESTRESS` record count; unsupported output is zero |
| NUMISECT | count of `PIPINGELEMENT` owners containing one or more active SIF records |

The `NUMREST` and `NUMISECT` owner-count definitions are fixed by the projection contract and Schematron. Repeated restraint/SIF records still contribute individually to auxiliary evidence and cardinality validation, not to those two CONTROL owner counts.

Full CAESARII family documents require all 13 source assertions. Fragment and categorized wrappers have no source CONTROL authority and generate assertions from emitted records.

## Context permissions

| Profile | Required | Optional | Prohibited engineering context |
|---|---|---|---|
| canonical | none | none | version, jobName, time, issueNo, north, defaultLine |
| pressure1 | none | none | all listed context fields |
| pressure-c | none | none | all listed context fields |
| enriched | none | none | all listed context fields |
| cii14 | none | none | all listed context fields |
| diagnostic sidecar | none | none | all listed context fields |
| fragment | version, jobName, north | time, issueNo, defaultLine | none beyond declared fields |
| categorized | version, jobName, north | time, issueNo | defaultLine |

Every accepted context-derived value is type-validated and ledgered. Runtime clock and hidden project-name fallbacks are forbidden.

## Identity policy

- preserve a valid unique source `ID`;
- sanitize only to satisfy the canonical NCName contract;
- preserve the original lexical ID as extension evidence when changed;
- detect duplicate source IDs and post-sanitization collisions;
- missing IDs use deterministic profile-declared identity (`E` plus source ordinal for family/fragment; categorized elementKey/original identity when available);
- collisions block with `IDENTITY_COLLISION`;
- geometry and node numbers are not identity disambiguators.

## Geometry reconciliation

Every emitted element requires explicit valid nodes and deltas. Identical endpoints and zero-length deltas block.

Endpoint coordinates are optional as a complete sextet. When present, exact decimal coordinate differences must equal the declared delta vector. There is no approved tolerance policy in PR-5, so disagreement blocks with `COORDINATE_DELTA_MISMATCH`. Coordinates are evidence and do not silently override deltas.

## Enrichment evidence

The known list remains limited to repository-declared enrichment families, including `DTXR_POS`, `PipingClass`, `Point_properties_basis`, `PipingClassBasis`, `SelectionJsonSourceIds`, `ComponentRefNo`, `SourceIdentity` and `TopologyEvidence`.

These records are preserved in the extension namespace in source order. They cannot override canonical nodes, deltas, dimensions, material, line or auxiliaries. Unknown engineering children are preserved and block.

## Fragment wrapper policy

Synthetic root/model records are accounted independently from source elements. Wrapper counts are generated from emitted records. Source element order is preserved. No version, job, north, issue or line value is invented.

## Categorized reconciliation

- categorized XSD validation occurs before profile resolution;
- `OriginalElement` is mandatory, securely parsed and must be one unqualified `PIPINGELEMENT`;
- `LineBlock/LineNo` is the authoritative line identity;
- `Line@id` and `Branchname`, when populated, must agree with `LineNo`;
- normalized numeric overlays compare by declared numeric type;
- string identities compare lexically after trimming;
- conflict blocks with `CATEGORIZED_OVERLAY_CONFLICT`;
- `OriginalElement` text and review evidence are preserved in extensions;
- job authority must be supplied explicitly in context.

## CII14 policy

The complete source version string is retained. Version segments are not converted through numeric types. Unsupported CII14 fields are preserved and block. Acceptance does not imply migration or writer changes.

## Diagnostic-sidecar boundary

The diagnostic-sidecar profile always produces a blocked outcome. A candidate may be published for inspection, but final blocking reconciliation evidence remains mandatory and the production writer is prohibited.

## Unknown evidence dispositions

| Classification | Disposition |
|---|---|
| CANONICAL_ENGINEERING | emit and account |
| REGISTERED_ALIAS | normalize and account |
| KNOWN_EXTENSION_EVIDENCE | preserve and account |
| KNOWN_UNSUPPORTED_ENGINEERING | preserve and block |
| UNKNOWN_NONENGINEERING | preserve only with positive classification evidence |
| UNKNOWN_ENGINEERING | preserve and block |

Writer ignorance is not evidence that a field is nonengineering.

## Source-accounting proof

Profile intake inventories every source element and attribute using deterministic source paths. The resolver records an accounting index with parent/child relationships and reconciles it with transformation records. `sourceAccountingStatus="COMPLETE"` is emitted only when every inventory identity is represented and the proof counts agree. Otherwise the result blocks at `SOURCE_ACCOUNTING_GATE`.

## Candidate and stage policy

| Failure | Gate | Candidate |
|---|---|---|
| incompatible override/profile marker | PROFILE_INTAKE_GATE | none |
| categorized XSD failure | PROFILE_INTAKE_GATE | none |
| alias/sentinel/scope/context/identity/geometry conflict before candidate | PROFILE_RESOLVER_GATE | none |
| accounting proof incomplete | SOURCE_ACCOUNTING_GATE | retained when available |
| direct canonical XSD/Schematron failure | XSD_GATE / SCHEMATRON_GATE | none |
| adapted canonical XSD/Schematron failure | XSD_GATE / SCHEMATRON_GATE | retained |
| blocking extension/unsupported evidence | LEDGER_GATE | retained |
| diagnostic-only production eligibility | LEDGER_GATE or PRODUCTION_ACCEPTANCE_GATE | retained |

## Material claims and actions

| Claim | Classification | Authority | Version | Location | Applicability | Confidence | Action |
|---|---|---|---|---|---|---|---|
| Geometry sentinel is prohibited | normative | field catalog + Schematron | v1 | F-009; element-topology | all adapted family profiles | 1.00 | block, never convert to zero |
| Pressure aliases are rename-only | normative | alias registry | v1 | patternAliases / collisionPolicy | Pressure1 and compatible adapted input | 1.00 | exact aliases only; conflict blocks |
| NUMREST/NUMISECT are owner counts | normative | projection contract + Schematron | v1 | controlEquations | all canonical candidates | 1.00 | retain owner-count semantics |
| Context is profile-specific | normative | governing concept | 1.0 | common engineering rules | in-scope profiles | 1.00 | explicit allow-list and ledger |
| Coordinate/delta tolerance exists | unresolved | none approved | n/a | n/a | family profiles | 1.00 | use exact reconciliation; block mismatch |
| Generic VALUE1…VALUE22 proves nozzle family mapping | unresolved | component catalog requires family validation | v1 | C-NOZZLE-FAMILIES | nozzle-bearing sources | 1.00 | preserve and block until mapping authority exists |
| CII14 version may be numeric-normalized | contradicted | governing mission + lexical schema | PR-5 | cii14 profile | CII14 intake | 1.00 | preserve complete lexical version |

## Compatibility impact

This increment intentionally blocks sources previously accepted through geometry-sentinel zeroing, discontinuous line-state revival, incompatible dialect overrides, hidden categorized job names, unproved nozzle mappings and identity collisions. Valid canonical documents remain semantically unchanged before deterministic serialization.

## Serialization and publication impact

`InputXmlDeterministicSerializationPolicy.v1`, committed artifact names, same-stem lock, staging, rollback and validation commit-marker protocol remain unchanged. Profile corrections must produce deterministic inputs to the existing serializer rather than changing the serialization policy.

## Migration

Migration is not authorized.
