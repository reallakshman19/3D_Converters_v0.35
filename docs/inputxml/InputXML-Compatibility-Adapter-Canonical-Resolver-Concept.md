# InputXML Compatibility Adapter and Canonical Resolver

## Governing Concept and Implementation Architecture

| Field | Value |
|---|---|
| Repository | `reallaksh19/3D_Converters` |
| Version | 1.0 |
| Date | 19 July 2026 |
| Governing baseline | `main` after `c2bb88cbd1f96b56d37ba67f9fc3ca2931da43ab` |
| Merged architecture increment | PR #213 - Runtime contract bundle closure |
| Status | Governing concept for phased implementation |
| Production CII writer | Unchanged; callable only after production acceptance `PASS` |

> **Fail closed. Preserve evidence. Never infer missing engineering data.**

## 1. Executive decision

Implement a registry-driven compiler orchestrator with isolated profile resolvers.

Detection selects a candidate profile; it does not constitute acceptance. Every successful path must complete source accounting, canonical XSD validation, Schematron validation, ledger completeness and production acceptance before the unchanged CII writer can be invoked.

The binding implementation order is:

```text
Architecture correctness
  -> Process correctness
     -> Profile correctness
        -> Determinism and resource containment
           -> Corpus and parity
              -> CII integration gate
                 -> Controlled migration
```

This document does not legalize unsupported source data, authorize production migration, change canonical schemas or authorize changes to the production CII writer.

## 2. Scope

### In scope

- Runtime closure of the dialect registry, adapter registry and executable resolver set.
- Secure intake and explicit dialect decision for XML, JSON, PDF and geometry-derived sources.
- Profile-specific parsing, normalization and source-evidence reconciliation.
- Canonical candidate construction, XSD, Schematron and ledger-completeness validation.
- Deterministic artifact publication and hashes.
- Resource characterization and bounded failure behavior.
- Pre-writer acceptance, legacy parity, staged migration and rollback.

### Out of scope

- Changing the production CII writer to compensate for canonicalization defects.
- Inferring missing geometry, line identity, engineering dimensions, ownership or semantics.
- Coordinate-only node merging, ray/proximity promotion or synthetic topology fillers.
- Treating filenames, legacy acceptance or downstream success as validity evidence.
- Production rollout before profile, parity, deterministic and resource gates pass.

## 3. Governing principles

1. **Fail closed.** Any unresolved structural, semantic, topology, ownership, provenance, accounting or deterministic discrepancy blocks production acceptance.
2. **Registry closure is mandatory.** Every dialect has exactly one declared outcome and runtime resolvers exactly match implemented profiles.
3. **Detection is not acceptance.** Detection or override selects a resolver; it cannot waive validation or legalize invalid evidence.
4. **Source authority is profile-specific.** Managed-stage source, topology and trace evidence may outrank compatibility XML.
5. **No silent loss.** Every relevant source entity, field, port, component and auxiliary receives an explicit disposition. Generic `DROP` and `SKIP` are forbidden.
6. **Line-scoped state.** Inheritance cannot cross line boundaries; the first element of each line establishes required state.
7. **Topology requires authoritative evidence.** Coordinates, tolerance, rays, document order and nearest match are not connection or ownership authority.
8. **Blocked paths retain evidence.** Ledger and validation are retained even when canonical XML is absent.
9. **Deterministic results.** Identical source, context, contract bundle and runtime produce identical status, artifacts and hashes.

## 4. Current state

PR #213 was merged as `c2bb88cbd1f96b56d37ba67f9fc3ca2931da43ab`.

Before XML, JSON or PDF parsing, the compiler now:

- loads the dialect registry and compiler adapter registry as one runtime contract bundle;
- rejects duplicate JSON keys, invalid schemas, duplicate identities and incorrect profile cardinality;
- requires exact equality across all fourteen dialect and adapter outcomes;
- verifies adapter identity, acceptance/status compatibility and result policies;
- verifies runtime resolver equality with implemented adapter profiles;
- calculates a deterministic contract-bundle digest;
- records contract metadata in the ledger and validation report;
- returns `BLOCKED` at `CONTRACT_BUNDLE_GATE` with retained evidence on failure.

The merged increment does not change profile engineering semantics, XSD, Schematron, the CII writer or migration status.

## 5. Target architecture

```text
Compiler Orchestrator
├── Contract Bundle Gate
├── Source Intake Gate
├── Dialect Decision
├── Registered Profile Dispatcher
├── Profile Resolver
├── Source Accounting and Reconciliation
├── Canonical Candidate Builder
├── XSD Validator
├── Schematron Validator
├── Ledger Completeness Gate
├── Production Acceptance Gate
├── Deterministic Artifact Publisher
└── Optional unchanged CII writer invocation
```

The orchestrator owns the final `PASS/BLOCKED` decision. A profile resolver may produce a canonical candidate and diagnostics but may not independently declare production acceptance.

## 6. Compiler state machine

```text
INITIALIZED
  -> CONTRACT_BUNDLE_VERIFIED
  -> SOURCE_ENVELOPE_CREATED
  -> DIALECT_RESOLVED
  -> INTAKE_VALIDATED
  -> SOURCE_PARSED
  -> SOURCE_ACCOUNTED
  -> CANONICAL_CANDIDATE_BUILT
  -> XSD_VALIDATED
  -> SCHEMATRON_VALIDATED
  -> LEDGER_VALIDATED
  -> PRODUCTION_ACCEPTED
  -> ARTIFACTS_PUBLISHED
  -> OPTIONAL_CII_PROJECTED
```

Any transition may terminate in `BLOCKED`. The validation report must identify `blockedAt`, `completedStages`, blockers, diagnostics and available evidence.

## 7. Stable result and artifact contract

| Status | Meaning | CII projection |
|---|---|---|
| `PASS` | All profile, accounting, canonical, ledger and production gates passed. | Permitted by an explicit downstream gate. |
| `BLOCKED` | One or more required decisions remain invalid or unresolved. | Prohibited. |

Stable output names remain:

```text
<stem>.canonical.input.xml
<stem>.canonicalization-ledger.json
<stem>.canonical-validation.json
```

Ledger and validation are always retained. A blocked canonical candidate may exist for inspection, so file existence must never be used as acceptance.

## 8. Binding process sequence

1. Verify contract-bundle closure.
2. Create source envelope and source hash.
3. Parse media securely.
4. Resolve registered dialect or explicit profile selection.
5. Apply profile-specific intake requirements.
6. Invoke the authoritative registered parser or topology engine.
7. Account all relevant source entities, ports, components and assertions.
8. Apply registered alias, lexical, sentinel and line-state normalization.
9. Reconcile against stronger source, topology, trace and ownership evidence.
10. Build canonical candidate and extension evidence.
11. Validate canonical XSD.
12. Validate canonical Schematron.
13. Validate ledger completeness, mappings, dispositions and hashes.
14. Evaluate production blockers.
15. Serialize and publish artifacts deterministically and atomically.
16. Optionally invoke the unchanged CII writer for `PASS` only.

No later validation success may compensate for a failed earlier gate.

## 9. Common engineering rules

### Dialect selection

- Overrides must name a registered profile and remain evidence only.
- Generic `Root/Branch/Node` selects XML Builder unless explicit SelectionJSON identity is supplied.
- SelectionJSON is never inferred from filename.
- Diagnostic-only and excluded profiles cannot become `PASS` through override.

### Aliases and counts

- Gather canonical spelling and all registered aliases before selecting a value.
- Equivalent values normalize to canonical spelling while retaining source spellings.
- Conflicting values produce `REJECT_INVALID`; source order does not resolve them.
- Source counts are checked before canonical counts are recomputed.

### Sentinel and inheritance

| Condition | Required handling |
|---|---|
| Omitted delta explicitly defined as zero by the source profile | Normalize with named evidence. |
| Sentinel with prior state in the same line | Inherit within that line and ledger it. |
| Missing/sentinel state on first element of a line | `BLOCKED`. |
| Cross-line carry | `BLOCKED`. |
| Sentinel retained as canonical geometry | `BLOCKED`. |

### Unknown evidence

| Disposition | Production effect |
|---|---|
| `PRESERVE_EXTENSION` | Nonblocking only when explicitly safe. |
| `DEFER_EXPLICITLY` | `BLOCKED`. |
| `UNSUPPORTED_BLOCKING` | `BLOCKED`. |
| `REJECT_INVALID` | `BLOCKED`. |

## 10. Profile resolver contracts

| Profile | Resolver responsibility |
|---|---|
| `canonical-inputxml-v1` | Direct XSD/Schematron validation with complete error evidence. |
| `caesar-inputxml-pressure1` | Normalize `PRESSUREn` and `LINE_ID`; enforce line-scoped inheritance and sentinel rules. |
| `caesar-inputxml-pressure-c` | Normalize provenance and counts without compatibility assumptions. |
| `enriched-inputxml-app` | Preserve enrichment evidence without promoting it to engineering authority. |
| `inputxml-fragment` | Require explicit document context; no filename or current-clock defaults. |
| `categorized-inputxml-v3` | Reconcile normalized blocks against `OriginalElement`; block contradictions. |
| `cii14-inputxml` | Apply versioned intake normalization and preserve version evidence. |
| `xml-builder-root-branch-node` | Use authoritative topology with coalescing/fillers/default enrichment disabled. |
| `seljson-custom-root` | Require explicit profile identity and preserve source/producer identity. |
| `managed-stage-json` | Treat source model, topology and trace ledger as authority; account every component and port. |
| `pdf-input-echo` | Require provenance, source Job Name/Date-Time, explicit line scopes and no current-clock fallback. |
| `uxml-rvm-intake` | Require explicit coordinate frame, exact connections <= 0.001 mm, OD and line identity; non-PIPE unsupported. |
| `xml-to-cii-diagnostic-sidecar` | Always `BLOCKED` until independent source reconciliation. |
| `nodeset-v1` | Always excluded comparison-only artifact. |

## 11. Identity, topology and ownership

Source identity, topology and auxiliary ownership are separate dimensions.

| Evidence | May establish | Does not establish alone |
|---|---|---|
| Explicit source connection/port reference | Connection identity and adjacency. | Dimensions or restraint semantics. |
| CanonicalTopology and TopologyTraceLedger | Canonical lineage and loss classification. | Validity when source accounting or hashes disagree. |
| Exact UXML connection <= 0.001 mm | One declared exact shared-node relation. | Tolerance/ray/support relations. |
| Source auxiliary reference | Ownership when unique and reconciled. | Ownership by nearest or first match. |
| Coordinates/proximity | Geometric comparison evidence. | Connection, identity or ownership. |
| Document order | Sequence evidence. | Topology or ownership authority. |

## 12. Determinism, security and resources

The implementation must define stable rules for source/component/port ordering, topology ordering, node numbering, element and auxiliary order, namespace prefixes, XML child and attribute order, decimal normalization, UTF-8/newlines, ledger IDs, diagnostic order, JSON order and hash inputs.

Security controls include disabled XML entity/network resolution, strict JSON duplicate-key rejection, bounded PDF extraction, bounded subprocess duration/output, bounded diagnostics and atomic publication.

Resource evidence must measure Python RSS, child RSS, combined peak, source bytes, component/port/topology counts, bridge output, XML size, ledger size and temporary disk.

Streaming or external storage cannot be approved until it proves identical accounting, topology, numbering, ownership, ordering, diagnostics, bytes and hashes.

## 13. Phased implementation plan

| Phase | Name | Primary work | Exit gate |
|---|---|---|---|
| 0 | Authority and evidence baseline | Freeze governing artifacts, current behavior, conflicts and rollback identity. | Every authority/conflict has an immutable identity and owner. |
| 1 | Architecture repair | Runtime closure, state machine, resolver result contract, early ledger and atomic publisher. | Split-brain blocks before parse; every failure returns evidence. |
| 2 | Common process logic | Dialect decision, aliases, counts, sentinel/line state, unknown evidence and validation accumulation. | Adversarial artifacts block at the correct stage with complete evidence. |
| 3 | Profile resolver correction | Correct canonical family, Root/SelectionJSON, managed-stage, PDF and UXML/RVM behavior. | Every profile has deterministic positive, negative and blocked outcomes. |
| 4 | Determinism and resources | Ordering, serialization, security limits, memory measurement and containment. | Repeated runs match and resource envelope is met. |
| 5 | Corpus and parity | Full fourteen-profile corpus, trial-by-fire, adversarial and legacy cases. | Every result and difference classification is approved. |
| 6 | Controlled CII integration | Strict pre-writer gate and unchanged-writer parity. | No blocked, diagnostic or excluded source reaches the writer. |
| 7 | Migration and rollback | Shadow mode, limited activation, telemetry and rollback. | Rollout is reversible and evidence-complete. |

## 14. Pull request sequence

| Order | Scope |
|---|---|
| Merged | Runtime contract-bundle and registry-closure gate - PR #213 / `c2bb88c...` |
| PR-2 | Explicit compiler state machine and standardized resolver outcomes |
| PR-3 | Complete failure ledger and atomic artifact publication |
| PR-4 | Deterministic serialization and hash authority |
| PR-5 | Canonical and CAESAR InputXML-family corrections |
| PR-6 | Root/Branch/Node and SelectionJSON topology hardening |
| PR-7 | Managed-stage source-accounting reconciliation |
| PR-8 | PDF provenance and line-scope correction |
| PR-9 | UXML/RVM exact-topology and coordinate-context correction |
| PR-10 | Resource characterization and approved containment |
| PR-11 | Full corpus, adversarial tests and reproducibility |
| PR-12 | Legacy parity and unchanged-writer integration gate |
| PR-13 | Shadow migration, telemetry and rollback validation |

Every PR must state authority, affected profiles, new blockers, compatibility impact, ledger impact, deterministic/resource impact, parity evidence, rollback scope and confirmation that the production writer is unchanged.

## 15. CII integration gate

The writer may be invoked only when:

```text
validation.status == PASS
AND canonical XSD == PASS
AND canonical Schematron == PASS
AND ledger completeness == PASS
AND blocking disposition count == 0
AND contract bundle verified == true
AND deterministic artifact publication verified == true
```

Writer parity includes control counts, elements, node numbering, bends, rigids, restraints, SIF/tee records, hangers, nozzles, numeric fields, indexes, lineage and hashes.

## 16. Migration and rollback

Migration proceeds profile by profile:

1. **Shadow:** legacy remains production; classify every difference.
2. **Limited activation:** enable profiles with completed evidence and parity only.
3. **Profile expansion:** activate one resolver family at a time with observation metrics.
4. **General availability:** named approval, complete corpus, deterministic/resource evidence and writer parity.

Immediate rollback triggers include contract mismatch, missing ledger/validation, nondeterministic results, blocked source reaching the writer, accounting/topology/ownership regression, unclassified CII differences, resource ceiling violations and atomic-publication failure.

## 17. Immediate next implementation increment

Implement the explicit compiler state machine and standardized resolver-result contract.

The next PR must:

- preserve current external `PASS/BLOCKED` status and filenames;
- add named stages and legal transitions;
- introduce a structured resolver outcome with profile identity, optional canonical candidate, source-accounting summary, ledger records, diagnostics, blockers and metrics;
- make the orchestrator the only owner of final production acceptance;
- provide `blockedAt` and `completedStages` for all failure paths;
- preserve existing accepted and blocked outcomes through compatibility tests;
- avoid profile engineering-semantic changes in the same PR.

## Appendix - Governing repository artifacts

- `contracts/inputxml/v1/inputxml-dialect-registry.json`
- `contracts/inputxml/v1/compiler/inputxml-compiler-adapters.json`
- `contracts/inputxml/v1/inputxml-canonical-v1.xsd`
- `contracts/inputxml/v1/inputxml-semantic-rules-v1.sch`
- `contracts/inputxml/v1/inputxml-extension-v1.xsd`
- `contracts/inputxml/v1/catalogs/inputxml-alias-registry.json`
- `scripts/inputxml_compiler/compiler.py`
- `scripts/inputxml_compiler/contract_bundle.py`
- `scripts/inputxml_compiler/base.py`
- `scripts/inputxml_compiler/*.py`
- `scripts/inputxml_assurance_ledger.py`
- `.github/workflows/inputxml-canonical-compiler.yml`
- `.github/workflows/inputxml-e2e-regression-matrix.yml`
