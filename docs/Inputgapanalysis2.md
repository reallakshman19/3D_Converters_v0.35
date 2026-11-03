# InputXML Gap Analysis 2 — Core Code Only

**Baseline commit:** `reallaksh19/3D_Converters@90f58bd9101acbbb4727e84450d453c30fd3fd86` (both concept docs read directly from this commit's `docs/` folder)
**Method:** direct clone + static analysis of application code. Per instruction, **all CI/workflow findings are out of scope** — this is a check of core code (schemas, converters, scripts, node-history, tabs) against the two InputXML concept documents only. Where a concept requirement is *only* enforceable by CI (e.g. schema-copy drift detection), that's noted as N/A-here rather than scored.
**Documents checked:**
- `docs/InputXML_Upgrade_Concept_Document.docx` ("Upgrade concept")
- `docs/InputXML_Compatibility_Adapter_Resolver_Concept.docx` ("Compatibility concept")

Legend: ✅ done · 🟡 partial / present under different name or scope / shadow-only · ❌ not found · N/A not core-code-checkable

---

## 1. Checklist against the Upgrade Concept

### 1.1 Contract family (§6)

| Concept contract | Repo artifact | Status |
|---|---|---|
| SourceInventory.v1 | `CanonicalSourceModel.v1` (`contracts/inputxml/v2/canonical-source-model.schema.json`) | ✅ different name, same role |
| CanonicalTopology.v1 | `CanonicalTopology.v2` (`contracts/inputxml/v2/canonical-topology.schema.json`) | ✅ |
| TopologyTraceLedger.v1 | present under this literal name (7 files reference it) | ✅ |
| TopologyParityReport.v1 | Merged into single `TopologyParityReport.v2` — see 1.6 below | 🟡 re-scoped, not missing |
| LogicalPsiGraph.v1 | Not found under this name. Closest: `TopoTopologyNormalization.v1` (shadow-mode micro-geometry) | ❌ literal contract absent; role partially covered |
| NodeHistoryMatchPlan.v1 | `TopoNodeHistoryMatchResult.v1` (`node-history/matching/registered-global-matcher.js`) | ✅ different name |
| PsiNodeAllocationPlan.v1 | `TopoNodeAllocationResult.v1` (`node-history/allocation/allocation-result.js`) | ✅ different name |
| PsiNodePlan.v1 | `TopoNodePlan.v1` (`schemas/topo-enriched-xml/TopoNodePlan.v1.schema.json`) — used by `topology-inputxml-writer.js`, `topology-numbering-projection.js`, `inputxml_import_topology.py` | ✅ different name, sole numbering authority confirmed in code |
| CanonicalInputXml.v1 | `inputxml-canonical-v1.xsd` fills this role; no JSON contract by this exact name | ✅ role covered by the XSD |
| InputXmlCiiAssuranceLedger.v1 | `InputXmlCiiAssuranceLedger.v2` (`contracts/inputxml/v2/`) | ✅ v2 supersedes v1 |
| PostCanonicalTopologyParity.v1 | Not a separate artifact — folded into `TopologyParityReport.v2`, whose `README.md` states: *"There is no separate post-canonical parity artifact."* | 🟡 deliberate re-scope |
| InputXmlCiiProjectionLedger.v1 | present under this literal name (5 files) | ✅ |
| CiiReparseProof.v1 | Not found under this literal name. Real equivalent: `converters/scripts/cii2019_reparse_proof.py`, `tests/test_inputxml_cii_reparse_proof.py` | ✅ role covered, different name |

**Net:** 11 of 13 named contracts exist under the same or a different, deliberately-documented name. **LogicalPsiGraph.v1** is the one genuine gap — micro-geometry normalization exists only in shadow mode (`TopoTopologyNormalizationShadowResult.v1`), not as a governing, consumed-everywhere contract.

### 1.2 Node identity, numbering, writer contract (§7)

| Requirement | Status | Evidence |
|---|---|---|
| Single immutable node-plan authority | ✅ | `TopoNodePlan.v1` is the sole authority for the release path; `topology-canonical-builder.js` docstring: *"CanonicalTopology.v2 with stable, **number-free** source-order IDs"* — no independent numbering left in it |
| Writers may not allocate/mutate numbers | ✅ | ADR-004 (in the node-history programme, reused here) codifies EMITTED/RESERVED occurrence semantics with no offset/counter fields |
| Node plan minimum model (§7.1 fields) | ✅ | `TopoNodePlan.v1` schema carries `logicalNodes`, `emittedOccurrences`, `rawPortMappings`, `componentProjection`, hash fields — matches the concept's field list closely |
| Historical registry (zone-global, main-line leases, immutable base-snapshot hash) | ✅ | `node-history/schemas/PsiNodeZoneRegistry.v1.schema.json`, `RegistrySnapshotManifest.v1.schema.json`; ASIM-1885/ZONE-1885-NC is a real, approved, committed bootstrap under `node-history/bootstrap/approved/` |

### 1.3 Micro-geometry (§8)

| Disposition named in concept | Found in code |
|---|---|
| CONSUME_MICRO_COMPONENT / SNAP_MICRO_GAP / MICRO_REVIEW_REQUIRED / HISTORY_CONFLICT_BLOCKED / JUNCTION_CHANGE_BLOCKED | Not found as these exact literal strings. Real implementation: `tabs/stagedjson-to-enrichxml/topology-normalization/{normalization-policy.js, topology-conflict-gates.js, topology-normalizer-shadow.js}` implements the same *mechanism* (candidate clustering, conflict gates, shadow evaluation) under different names |

**Status: 🟡.** The mechanism exists and is real, but it is explicitly **shadow-only** (`TopoTopologyNormalizationShadowResult.v1` — the literal schema name has "Shadow" in it). It has not been promoted to a production-authoritative gate. This matches the Upgrade concept's own recommended delivery order (§11.1, item 8: *"Introduce micro-geometry normalization in shadow mode"* comes before registry bootstrap and enforcement) — so this is arguably **on-schedule**, not behind.

### 1.4 Assurance gates and hash chain (§9)

| Gate | Status |
|---|---|
| Canonical contract gate | ✅ enforced via XSD/Schematron in the release preflight |
| Topology gate | ✅ `TopologyParityReport.v2` mandatory in `InputXmlCiiAssuranceLedger.v2` |
| Node-plan gate | ✅ `TopoNodePlan.v1` coverage checked; `NUMBERING_AUTHORITY`-class checks present |
| Post-canonical parity gate | ✅ folded into `TopologyParityReport.v2`'s independent re-parse (`ParsedInputXmlTopology.v1`) |
| CII projection gate | ✅ `InputXmlCiiProjectionLedger` present |
| Independent reparse gate | ✅ `cii2019_reparse_proof.py` + dedicated test |
| Hash chain (§9.2, 12 named hashes) | 🟡 a real hash chain exists (`canonicalTopologyHashSha256 → topoNodePlanHashSha256 → numberedTopologyProjectionHashSha256 → inputXmlHashSha256 → parsedInputXmlTopologyHashSha256 → topologyParityReportHashSha256`), but it does **not** use the concept's exact 12 field names, and it is shorter (folds several concept-named stages together) |
| NOT_APPLICABLE never substitutes for mandatory topology evidence | 🟡 mostly true — one legitimate exception found: `svgSceneHash: "NOT_APPLICABLE:INPUTXML_IMPORT"` for the InputXML-import path, which is a genuinely inapplicable field (no SVG scene involved), not a smuggled bypass |

### 1.5 Operating modes (§10)

Concept names three modes: `BOOTSTRAP_REVIEW`, `HISTORY_DRY_RUN`, `HISTORY_ENFORCED`. **None of these three literal strings exist anywhere in the codebase.** What exists instead, for the InputXML release path specifically, is a different three-mode set: `CANONICAL_STRICT` / `ADAPTED_CANONICAL` / `DIAGNOSTIC_ONLY` (`contracts/inputxml/v2/inputxml-compatibility-policy.schema.json`, enforced in `inputxml-release-worker.js`).

**Status: 🟡 — vocabulary mismatch, not a functional gap for the release path.** The two mode sets serve different purposes (the concept's modes govern the *node-history registry lifecycle*; the repo's modes govern *dialect-compatibility enforcement*), so this isn't a straight substitution — it means the Upgrade concept's specific registry-lifecycle mode machine (bootstrap → dry-run → enforced) has **not** been implemented as such anywhere in core code. It exists implicitly (ASIM-1885 was clearly bootstrapped, then presumably dry-run, and node-history matching/allocation is now real) but there is no explicit state field recording which mode a given run operated under.

### 1.6 Workstreams W1–W9 (§11)

| WS | Outcome required | Status |
|---|---|---|
| W1 — Assurance contract repair | Align topology parity producer/consumer shapes | ✅ done via `TopologyParityReport.v2` |
| W2 — Post-canonical topology parity | Prove canonical topology = final InputXML topology | ✅ done, folded into v2 report |
| W3 — Node-plan contracts | Logical/emitted/historical/engineering identities | ✅ `TopoNodePlan.v1` + node-history schemas |
| W4 — Pure writer conversion | Remove counters/+10/mutation from both PSI writers | ✅ per ADR-004 and `topology-canonical-builder.js` being number-free |
| W5 — Source inventory + logical graph | Normalize source evidence with auditable dispositions | 🟡 `CanonicalSourceModel.v1` exists; the *logical graph* (micro-geometry-normalized) is shadow-only, so this is partial |
| W6 — Historical registry and matcher | Bootstrap, register, one-to-one match, lifecycle | 🟡 registry + exact matcher done (ASIM-1885); registered/spatial matcher exists but unwired (see §1.2 of node-history analysis in `Xmlupgrade2.md`) |
| W7 — Zone lease allocator | Stable non-overlapping ranges, no auto-renumber | ✅ `node-history/allocation/deterministic-zone-allocator.js` |
| W8 — InputXML and topology adoption | Same node plan in PSI XML, canonical InputXML, component topology | ✅ confirmed — `TopoNodePlan.v1` used by `topology-inputxml-writer.js` |
| W9 — CII proof and rollout | Bind node-plan hashes through CII generation + reparse | ✅ done for the release path |

**7 of 9 workstreams fully closed; W5 and W6 partial**, both blocked on the same underlying item: micro-geometry normalization and the registered/spatial matcher are implemented but not yet promoted out of shadow/unwired state.

### 1.7 Module map (§15) — core code only

| Concept path | Reality |
|---|---|
| `node-preprocessor/psi-node-preprocessor.js` etc. | Doesn't exist under this name; real equivalent tree is `node-history/{registry,matching,allocation,bootstrap,operations}/*` and `tabs/stagedjson-to-enrichxml/{topology-normalization,production}/*` — a more elaborate, versioned structure than the concept sketched |
| `tabs/model-converters/converters/component-topology/topology-canonical-builder.js` | ✅ exists, and is now number-free as required |
| `tabs/model-converters/converters/component-topology/topology-parity-report.js` | ✅ exists (plus a `-v2.js` sibling) |
| `scripts/inputxml_assurance_ledger.py` | ✅ exists, plus `inputxml_assurance_ledger_v2.py` |

No core-code gap here — the actual module layout diverged from the concept's sketch (as the concept itself allowed: *"Exact filenames may be refined during implementation"*) but the ownership boundaries in §15.1 are respected: node-history code doesn't serialize XML, writers don't own numbering, the assurance ledger doesn't repair failed artifacts.

---

## 2. Checklist against the Compatibility Concept

### 2.1 Schema suite and copy policy (§2) — core-code-checkable parts only

| Requirement | Status |
|---|---|
| 3D_Converters `contracts/inputxml/v1` is authority | ✅ |
| Verified byte-identical copies in other repos | ✅ — `XML_Compare_Utilities/vendor/3d-converters/inputxml-v2/` now vendors `contracts/v1` and `v2` |
| Copy includes a provenance manifest with per-file hashes | 🟡 — exists, but named `inputxml-contract-bundle-manifest.json` (schema `InputXmlContractEvidenceBundle.v1`), not `schema-suite-provenance.json` as the concept specifies. Fields differ slightly (`upstreamRevision` vs `authorityCommit`) but the same evidence is present |
| CI enforcement of copy equality | N/A — explicitly out of scope per instruction |

### 2.2 Dialect adapters and resolvers (§6)

| Requirement | Status |
|---|---|
| 15 registered dialects, each with an adapter | ✅ confirmed 15/15, 1:1 coverage, correct status set (`IMPLEMENTED` / `EXCLUDED` for `nodeset-v1` / `IMPLEMENTED_BLOCKING` for the diagnostic sidecar) |
| 12 named resolvers (`InputXmlDialectResolver`, `NamespaceResolver`, `FieldAliasResolver`, `SentinelInheritanceResolver`, `UnitResolver`, `LineIdentityResolver`, `NodeReferenceResolver`, `ElementIdentityResolver`, `RestraintSlotResolver`, `CountResolver`, `ExtensionDispositionResolver`, `TopologyParityResolver`) | 🟡 **not verified as literal named modules.** These responsibilities are functionally distributed inside `scripts/inputxml_compiler/family_resolver.py` / `family_resolution.py` and the release preflight script, but there is no 1:1 file-per-resolver mapping. This is the same conclusion the earlier combined-concept document reached — a documentation gap, not necessarily a functional one, but still unverified at the code level |

### 2.3 Compatibility-mode UX (§4)

| Requirement | Status |
|---|---|
| Compatibility-mode control exists | ✅ but only for **one** converter |
| Applies to all InputXML producers/mutators/consumers listed in §4.1 (`stagedjson_to_inputxml`, `seljson_to_inputxml`, `pdf_to_inputxml`, `pdf_to_inputxml_cii14`, `inputxml_to_cii`, `inputxml14_to_cii`, topology InputXML writer) | ❌ **Only `inputxml_to_cii2019` has `inputXmlCompatibilityMode` in `converter-registry.js`.** The other six named converters/consumers have no such field at all |
| PASS / REVIEW_REQUIRED / BLOCKED disposition model | ✅ implemented, though via `status` fields rather than a single named enum matching the doc verbatim |

**This is the single largest concrete gap in the Compatibility concept.** The gate is real and well-built, but it covers ~1 of ~7 converters the concept requires it for.

### 2.4 Contracts (§7)

| Concept contract | Status |
|---|---|
| InputXmlCompatibilityRequest.v1 | ❌ not found under this name. Closest: the `options`/`compatibilityMode` payload passed into `inputxml-release-worker.js`, which is untyped/unschema'd at the request level |
| InputXmlNormalizationPlan.v1 | ✅ present (`contracts/inputxml/v2/inputxml-normalization-plan.schema.json`) |
| CanonicalInputXmlBundle.v1 | 🟡 role split across `SelectedOutputManifest.v1` + `InputXmlCiiAssuranceLedger.v2`, not one bundle object |

### 2.5 Normalization and enrichment policy (§9)

Spot-checked against `inputxml-field-adapter.js` and `inputxml_release_preflight.py`:

| Rule | Status |
|---|---|
| More than six restraints → block by default, no silent drop | ✅ **verified fixed** — `InputXmlRestraintOverflowError` is thrown; the field adapter's own docstring documents this |
| Alias mapping only when no canonical value conflicts | ✅ `normalizeInputXmlAttributeNames` explicitly checks `canonicalPresencePattern` before renaming |
| Missing LINE blocks rather than synthesizing a generic line | Not independently re-verified this session — flagged for follow-up, not scored |

### 2.6 Failure taxonomy (§10) — 14 named codes

| Code | In code? |
|---|---|
| INPUTXML_RESTRAINT_OVERFLOW | ✅ |
| INPUTXML_DIALECT_AMBIGUOUS | ❌ |
| INPUTXML_DIALECT_UNSUPPORTED | ❌ |
| INPUTXML_ALIAS_CONFLICT | ❌ |
| INPUTXML_NAMESPACE_INVALID | ❌ |
| INPUTXML_LINE_ID_UNRESOLVED | ❌ |
| INPUTXML_NODE_PLAN_MISSING | ❌ |
| INPUTXML_DUPLICATE_ACTIVE_NODE | ❌ |
| INPUTXML_UNSUPPORTED_BLOCKING_EVIDENCE | ❌ |
| INPUTXML_XSD_FAILED | ❌ |
| INPUTXML_SCHEMATRON_FAILED | ❌ |
| INPUTXML_TOPOLOGY_PARITY_FAILED | ❌ |
| INPUTXML_DOWNSTREAM_PROOF_FAILED | ❌ |
| INPUTXML_SCHEMA_COPY_DRIFT | ❌ (CI-adjacent anyway) |

**Only 1 of 14 named codes exists literally.** The underlying *checks* mostly happen (XSD failure surely blocks somewhere; dialect ambiguity is handled by `requireMode`'s validation), but **the standardized diagnostic vocabulary the concept specifies for governance and cross-team auditability was not adopted.** Each gate currently raises its own ad hoc error shape (`status: 'BLOCKED'` plus free-text or a locally-invented code) rather than the one shared taxonomy. This matters because it's exactly what makes gaps like this one hard to check mechanically — there's no `grep`-able single source of truth for "every failure mode this system can produce."

### 2.7 Integration by converter (§11)

| Converter/area | Concept expectation | Status |
|---|---|---|
| `stagedjson_to_inputxml` | ManagedStageAdapter → canonical topology/node plan → serializer, no local numbering | 🟡 uses `TopoNodePlan.v1` via the stagedjson-to-enrichxml production path, but has no `compatibilityMode` field of its own |
| `seljson_to_inputxml` | Custom model → canonical compiler | Not independently re-verified this session |
| `pdf_to_inputxml` / CII14 | PDF adapter with confidence/evidence | Not independently re-verified this session |
| `inputxml-field-adapter` | Retain only as legacy characterization | ✅ verified — production release path bypasses it entirely; only two named legacy converters still use it, which is documented as deliberate |
| `XML_Compare_Utilities` | Copy suite; use in reconciliation/sideload/topology workspace | ✅ vendored copy confirmed present |

---

## 3. Consolidated core-code gap list (ranked)

1. **Compatibility-mode gate covers 1 converter, not ~7.** `stagedjson_to_inputxml`, `seljson_to_inputxml`, `pdf_to_inputxml`, `pdf_to_inputxml_cii14`, `inputxml_to_cii`, `inputxml14_to_cii` have no `inputXmlCompatibilityMode`/policy field in `converter-registry.js`.
2. **LogicalPsiGraph.v1 / micro-geometry normalization is shadow-only**, not a governing, production-authoritative contract consumed by every downstream projection (this is also the leading edge of the node-history programme — see `Xmlupgrade2.md`).
3. **Standardized failure-code taxonomy not adopted.** 13 of 14 named diagnostic codes from the Compatibility concept don't exist literally; each gate invents its own error shape.
4. **12 named resolvers not verified as discrete modules** — functionally distributed inside larger compiler files, unconfirmed 1:1.
5. **Registry-lifecycle mode machine (`BOOTSTRAP_REVIEW`/`HISTORY_DRY_RUN`/`HISTORY_ENFORCED`) has no literal implementation** — the lifecycle clearly happened for ASIM-1885 in practice, but no field records which mode a run was in.
6. **InputXmlCompatibilityRequest.v1 has no typed contract** — the release worker's options payload is untyped at the request boundary.

## 4. Explicitly not gaps (corrects earlier assumptions from this conversation's own prior turns)

- Restraint overflow: **fixed**, not a live defect.
- Regex adapter holding production authority: **fixed** for the release path.
- Two missing topology-parity artifacts: **built**, merged into one `v2` artifact by deliberate design choice, documented as such.
- `bIdx`-based independent numbering in `topology-canonical-builder.js`: **gone** — the file is now explicitly number-free.
- Cross-repo schema copy: **now vendored** with a hash manifest (naming differs from the concept's suggested filename, but the evidence model is equivalent).
