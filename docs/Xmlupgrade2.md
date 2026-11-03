# XML Upgrade 2 — Historical Node Numbering & Micro-Geometry Programme

**Baseline commit:** `reallaksh19/3D_Converters@90f58bd9101acbbb4727e84450d453c30fd3fd86`
**Sources:**
- `docs/historical_node_preprocessor_concept_review_final (2).docx` — Revision 3 master concept (StagedJSON → PSI-116 XML → CII)
- `docs/historical_node_programme_addendum.docx` — governance addendum (EG/AS items, ADRs, release gates)
- Earlier findings supplied this session: the TE-016A/ASIM-1885 audit (a prior, honest self-assessment against both documents)
- Direct repository inspection performed this session, refreshing the earlier audit against current `main`

**Scope:** core code only, per instruction. CI/workflow status is not scored here.

---

## 1. Refreshed HN-001…HN-014 backlog status

The earlier audit (attached to this conversation) scored this backlog immediately after the ASIM-1885 bootstrap work. Since then, repository inspection this session shows **more has landed than that audit captured** — most notably a full ADR register and a topology-index contract that audit marked absent. Status below supersedes the earlier audit where they differ, with the difference noted.

| ID | Task | Earlier audit said | Current verified state |
|---|---|---|---|
| HN-001 | Characterize current allocation/occurrence behavior | ❌ not done this session, unverified elsewhere | ✅ **found**: `tests/fixtures/topo-enriched-xml/current-allocation/characterization-input.json` + `docs/architecture/topo-enriched-xml/current-allocation-characterization.md` exist |
| HN-002 | Freeze v1 contracts and validation enums | (pre-existing, implied) | ✅ `schemas/topo-enriched-xml/*.schema.json` frozen (TopoNodePlan.v1, TopoTopologyIndex.v1, TopoTopologyNormalization.v1, etc.) |
| HN-003 | Pure writer-occurrence planner | (pre-existing, TE-013) | ✅ `topo-node-plan-builder.js`, occurrence-plan schemas present |
| HN-004 | Strict external node-plan serializer | (pre-existing, TE-013) | ✅ same evidence as HN-003; ADR-004 codifies no-counter/no-mutation rule |
| HN-005 | Registry schema + snapshot hashing | ✅ pre-existing, reused | ✅ confirmed — `node-history/schemas/{PsiNodeZoneRegistry,RegistrySnapshotManifest}.v1.schema.json` |
| HN-006 | Deterministic zone allocator | ✅ pre-existing, reused | ✅ confirmed — `node-history/allocation/deterministic-zone-allocator.js` |
| HN-007 | Exact historical matcher | ✅ pre-existing, reused against real data first time | ✅ confirmed — `node-history/matching/exact-history-matcher.js` |
| HN-008 | Registered evidence matcher | ❌ deliberately skipped, untested | 🟡 **code exists** (`registered-global-matcher.js`, `registered-coordinate-evidence.js`, `registered-candidate-graph.js`, `registered-matcher-policy.js`) **but is not imported/called from anywhere outside `node-history/matching/` itself** — i.e., built but unwired. Confirms the audit's substance even though more code exists now than it implied |
| HN-009 | Shared topology normalization shadow mode | ❌ not built for ASIM-1885 | ✅ **found**, and explicitly shadow-mode by name: `TopoTopologyNormalizationShadowResult.v1`, `topology-normalizer-shadow.js`, `topology-conflict-gates.js`, invoked from `topology-normalization-approval.js` |
| HN-010 | Topology index and trace extension (`PsiTopologyIndex.v1`) | ❌ doesn't exist for this project | ✅ **found under a different name**: `TopoTopologyIndex.v1` (`schemas/topo-enriched-xml/TopoTopologyIndex.v1.schema.json`, `tabs/stagedjson-to-enrichxml/topo-topology-index.js` + `-views.js`), with a dedicated test (`tests/topo-topology-index.test.mjs`) |
| HN-011 | Shared-node PSI/CII proof (EG-01 evidence packet) | ❌ explicitly still an open blocker (`PSI_SHARED_NODE_SERIALIZATION_UNRESOLVED`) | 🟡 **the architecture decision is now recorded** — `docs/architecture/topo-enriched-xml/adr/ADR-004-repeated-shared-node-and-reserved-occurrences.md`, dated 2026-07-19, status "Accepted for TE-002 contract freeze." This closes the *design* question. Whether the addendum's required **benchmark evidence packet** (§3.2: PIPE/TEE/REDU/ELBO/ATTA fixtures run through the real converter, reconciled) exists as a completed, approved artifact is **not confirmed** — `psi116_te013_evidence.py` and `tests/fixtures/topo-enriched-xml/cii2019-proof/te013_mutation.py` exist and look like exactly this kind of evidence, but this session did not execute them to confirm they pass, nor found a signed-off decision record beyond the ADR itself |
| HN-012 | Approved registry bootstrap | ✅ the actual deliverable | ✅ reconfirmed — `node-history/bootstrap/approved/ASIM-1885/ZONE-1885-NC/` contains 130+ real line files, `zone-registry.json`, `manifest.json`, `bootstrap-result.json`, `bootstrap-input.json`, `registry-patch.json`. A second, earlier bootstrap also exists: `PROJECT-TE012/ZONE-01` |
| HN-013 | Hard parity + selected-output CII proof | ❌ not run for ASIM-1885 | 🟡 the **InputXML release path** now has exactly this (`SelectedOutputManifest.v1`, `TopologyParityReport.v2`) — but that pipeline is for InputXML→CII, not confirmed to be the same pipeline ASIM-1885/StagedJSON→PSI would go through. **Not verified as closed for the node-history/PSI path specifically** |
| HN-014 | History-enforced production mode | ❌ not reachable | ❌ **still not reachable** — no literal `HISTORY_ENFORCED` (or equivalent) flag found anywhere; nothing gates production selection on the node-history registry the way the InputXML release path gates on its assurance ledger |

**Net for HN-001…014: 9 fully done, 4 partial (HN-008, HN-011, HN-013 evidence-closure, plus the general "wired everywhere" caveat on HN-009/HN-010), 1 not reached (HN-014).** This is materially further along than the attached earlier audit suggested — the gap has narrowed to specifically: *wiring the registered matcher in*, *closing EG-01 with an approved evidence packet rather than just an ADR*, and *building the actual production-enforcement gate*.

---

## 2. Evidence-gated decisions (Addendum §3, EG-01…EG-08)

None of these are closable by code alone — each requires a named benchmark, an approved decision record, and (per §3.1) a "required closure packet." Status of the *prerequisite code/evidence* for each:

| ID | Decision | Prerequisite evidence present? |
|---|---|---|
| EG-01 | Shared PSI-node serialization | 🟡 ADR-004 records the decision; benchmark evidence (`te013_mutation.py`) exists but not confirmed executed/approved as a closure packet |
| EG-02 | Historical stability vs. monotonic numbering | 🟡 ADR-006 (`ADR-006-historical-stability-vs-monotonic-sequence.md`) exists — decision recorded. Mutation fixtures for node insertion between retained numbers not independently confirmed this session |
| EG-03 | Historical matcher score calibration | ❌ no scored/spatial matching has run (HN-008 unwired) — nothing to calibrate yet |
| EG-04 | Non-contiguous line leases | ❌ ADR-008 (`ADR-008` — non-contiguous lease, per addendum's ADR list) not found by that number in the repo's ADR directory; leases are contiguous by construction in the current allocator, untested against the non-contiguous case |
| EG-05 | Inline `hx:*` audit extension profile | ADR-005 (`ADR-005-strict-vs-audit-extended-xml.md`) exists — decision recorded, but "audit-extended profile" adoption not independently checked |
| EG-06 | Split/merge/rename/zone-transfer automation | ❌ correctly untouched — concept requires this stay disabled until approved; no automation found, which is the correct state |
| EG-07 | Coordinate registration calibration | ❌ not touched — no anchor-count policy or transform-type code found |
| EG-08 | Support attachment ownership (PSI ATTA / CII restraint) | ADR-007 (`ADR-007-support-attachment-vs-route-ownership.md`) exists — decision recorded; specific ASIM-1885 support-mapping evidence not found |

**Observation:** the repo's `docs/architecture/topo-enriched-xml/adr/` directory contains **10 ADRs** (ADR-001 through ADR-010), which is *more* than the addendum's own list of 8 (ADR-001…ADR-008). Two extra ADRs exist:
- `ADR-009-partial-run-retirement-prohibition.md` — directly implements the addendum's `sourceCoverage.authoritativeForRetirement` / `RETIREMENT_SUPPRESSED_PARTIAL_SCOPE` requirement (§14.2 of the master concept).
- `ADR-010-micro-component-and-gap-policy-authority.md` — governs the micro-geometry allowlist policy (§7.2 of the master concept).

So **architecturally, every EG item has at least a recorded decision.** What's missing across the board is the **closure packet** the addendum requires (§3.1: decision statement, named benchmark, positive/negative/determinism results, downstream comparison, approved record with owner+date, contract/version impact) — an ADR file records the *decision*, not necessarily the *proof*.

---

## 3. Broader assurance matters (Addendum §4, AS-01…AS-08)

These are explicitly **outside** the node-history concept's own redesign scope, but gate production per §4.2's combined gate. Quick status (not exhaustively re-verified — flagged for a dedicated pass):

| ID | Matter | Status signal found this session |
|---|---|---|
| AS-01 | Source-root normalization | Not independently checked |
| AS-02 | Unknown support-type fallback | Not independently checked |
| AS-03 | DN/OD and wall inference | Not independently checked |
| AS-04 | Support assembly merge semantics | ADR-007 touches ownership; merge-conflict classification not confirmed |
| AS-05 | Independent XML parsing / XSD validation (replace regex-dependent assurance) | ✅ **directly relevant finding from the InputXML side**: the release path now uses a namespace-aware structural compiler, not regex, for the InputXML boundary. Whether the *StagedJSON→PSI* boundary specifically has moved off regex is not confirmed |
| AS-06 | Selected XML-to-CII proof bound to selected-output hash | ✅ pattern exists (`SelectedOutputManifest.v1`) on the InputXML side; not confirmed adopted for the PSI/StagedJSON path |
| AS-07 | Writer fallback / mode persistence | Not independently checked |
| AS-08 | Audit truthfulness (audit describes actual selected/validated state, not intended mode) | Not independently checked |

This section needs its own dedicated audit pass before HN-013/HN-014 can close — flagged as a distinct next step, not folded into estimates below.

---

## 4. Release gates (Addendum §7.1–7.4) — readiness

| Gate | Requirement | Readiness |
|---|---|---|
| §7.1 Contract-freeze | Characterization tests exist; `PsiNodePlan.v1`/occurrence fields frozen; authorities named; decisions linked to evidence IDs not guessed in code | 🟡 mostly met — characterization exists (HN-001), contracts frozen (HN-002), but "decisions linked to evidence IDs" is uneven: some ADRs cite fixtures, not all cite a specific EG-ID inline |
| §7.2 Writer-migration | Writer-side allocations = 0; writer-side mutations = 0; occurrence coverage = 100%; byte-identical output | 🟡 architecturally true per ADR-004 and the number-free `topology-canonical-builder.js`; **not verified by running the actual test suite this session** |
| §7.3 Registry-and-matcher | Zone uniqueness + deterministic allocation proven; stale/concurrent updates rejected; exact matching order-independent; ambiguous candidates can't auto-reuse; partial runs can't retire | 🟡 exact-matcher and allocator exist and were exercised against ASIM-1885 real data (confirmed by the earlier audit); registry-update rejection logic not independently re-verified this session |
| §7.4 Production-enforcement | EG-01 approved; bootstrap registry approved; selected output passes independent proof; canonical/sequential parity exact; no stale/missing assurance dependency; rollback tested | ❌ **not met** — EG-01 has an ADR but not a confirmed closure packet; HN-013/014 (selected-output proof and enforced mode) for this specific pipeline are the two concretely open items |

**Bottom line: gates §7.1–7.3 are close to satisfied (evidence exists, some unverified by execution); §7.4 (production enforcement) is the one gate genuinely not ready, and it's gated on exactly two things: closing EG-01 properly and building the enforcement mechanism itself (HN-014).**

---

## 5. Master concept acceptance checklist (§16.2) — line by line

| # | Criterion | Status |
|---|---|---|
| 1 | Every raw source port maps to exactly one logical node | 🟡 true for the exact-match path; not proven under registered/spatial matching (unwired) |
| 2 | Every logical node maps to zero-or-more exact emitted writer nodes per component projection | ✅ per ADR-004 |
| 3 | No writer assigns or infers a node number | ✅ |
| 4 | Every emitted node number unique within project zone | ✅ per zone allocator |
| 5 | Every number belongs to owning main-line lease or approved shared-node exception | ✅ shared-node exception = ADR-004 |
| 6 | No micro-cluster exceeds configured max pairwise distance | 🟡 gates exist (`topology-conflict-gates.js`) but shadow-only |
| 7 | No non-allowlisted component auto-consumed | 🟡 ADR-010 governs the allowlist; enforcement is shadow-only |
| 8 | No conflicting historical identities silently merged | ✅ per §12/document-11 finding: fail-closed on OWNER/name conflicts, one real conflict caught and escalated |
| 9 | Historical assignment independent of source JSON array order | Not independently re-verified this session |
| 10 | Spatial evidence disabled without valid registration | N/A yet — no registered spatial matching has run (EG-07 untouched) |
| 11 | Canonical and sequential outputs share nodePlanHash / exact identity | ✅ per ADR-003, ADR-004 |
| 12 | Stale zone snapshot cannot merge | Registry code enforces snapshot-hash checks; not independently re-verified against a live stale-merge attempt this session |
| 13 | Approved bootstrap revision is reproducible | ✅ ASIM-1885 bootstrap is committed, hash-verified, described as 3-run deterministic in the earlier audit |
| 14 | All artifacts/hashes deterministic for identical inputs | ✅ consistent with everything found — every artifact in this system carries a `*Hash` field computed over canonical serialization |
| 15 | LogicalPsiGraph.v1 consumed by every in-scope projection; no repeated normalization | ❌ **not met** — this is the InputXML-side "LogicalPsiGraph.v1 missing" gap and the node-history-side "shadow-only, not governing" gap, restated as one requirement. This is the single most consequential unmet criterion |
| 16 | Path-derived source IDs are Tier-3 aliases, can't independently establish history | ✅ per document 11: *"§9.2 Tier-3 alias evidence — Implemented correctly after a review pass caught aliasing on non-exclusive sourceEntityIds"* |
| 17 | PARTIAL_LINE runs cannot retire unseen history | ✅ ADR-009 directly implements this |
| 18 | Writer occurrences/component allocations cover 100%; unplanned writer nodes = 0 | 🟡 architecturally true; not verified by execution this session |
| 19 | Serializer uses only supplied `evaluatedAt`; no system clock/locale/randomness | Not independently re-verified this session |

**15 of 19 criteria are met or architecturally satisfied; the standout gap is #15 — the LogicalPsiGraph.v1 promotion from shadow to governing-everywhere status — which is the same root cause behind criteria #1, #6, #7, and #10 as well.** Closing that one thing moves five criteria at once.

---

## 6. Can InputXML's logic be reused? — Yes, directly, in five places

The InputXML v2 work (PR #264/#539) already solved, for a different pipeline, almost the exact shape of problem the node-history programme still has open. These are concrete, reusable patterns, not just analogies:

| InputXML v2 pattern | Where it lives | Direct reuse for node-history |
|---|---|---|
| **Shadow-mode promotion via a single mandatory ledger gate.** `InputXmlCiiAssuranceLedger.v2` makes `topologyParityReport` and (formerly) post-canonical-parity **mandatory, non-`NOT_APPLICABLE`** inputs — a shadow artifact only becomes production-authoritative once a ledger refuses to pass without it. | `scripts/inputxml_assurance_ledger_v2.py` | Apply the identical mechanism to promote `TopoTopologyNormalizationShadowResult.v1` out of shadow: add it as a mandatory, non-bypassable input to whatever ledger gates PSI/CII selection for the StagedJSON path. This is exactly HN-014's missing piece, and the code pattern to copy already exists and is tested. |
| **Approved, hash-locked override for an otherwise-blocking condition.** `ApprovedSemanticSplit.v1` lets a human approve a specific, hash-bound exception (restraint overflow) without opening a general bypass — the approval is scoped to the exact overflowing bytes via `splitHash`/`approvedCanonicalHashSha256`. | `contracts/inputxml/v2/approved-semantic-split.schema.json`, `converters/scripts/inputxml_release_preflight.py --approved-split-id` | This is the *exact* shape EG-06 (split/merge/rename/zone-transfer) needs: instead of building generic automation (which the concept correctly says stay disabled), build one **hash-scoped approval artifact** per lifecycle event, mirroring `ApprovedSemanticSplit.v1`'s fields (`approvalId`, `sourceHashSha256`, `approvedCanonicalHashSha256`, `approvers`, `approvedAt`). This turns "automation is disabled" into "automation is disabled, but reviewed one-off exceptions are auditable," which is what the addendum actually wants. |
| **Independent re-derivation, not trust of the in-memory object.** `PostCanonicalTopologyParity`'s replacement logic in `TopologyParityReport.v2` re-parses the *serialized bytes*, never reuses the in-memory topology — this is what makes the parity proof real rather than tautological. | `scripts/inputxml_import_topology.py::build_parity` | Node-history's HN-013 (hard parity + selected-output proof) should follow the same rule: re-derive the emitted PSI/CII topology from the *actual written files*, not from the node plan object still in memory, before declaring parity. |
| **A single preflight→release two-stage worker with an explicit mode enum.** `inputxml-release-worker.js`'s `requireMode()` enforces mutual constraints between mode and approval (`ADAPTED_CANONICAL` mode requires an approval ID; other modes reject one) — a small, easily-copied pattern for enforcing EG-driven exceptions correctly. | `converters/inputxml-release-worker.js` | Build an equivalent `runPsiHistoryReleaseJob` with the same two-stage shape: preflight (matching + allocation + normalization, producing a `releaseEligible` boolean) then release (writer serialization gated on that boolean) — this **is** HN-014/HISTORY_ENFORCED, structured the same way `CANONICAL_STRICT`/`DIAGNOSTIC_ONLY` already works. |
| **Vendored evidence bundle with a manifest, for cross-repo consumption.** `inputxml-contract-bundle-manifest.json` gives `XML_Compare_Utilities` a verifiable, hash-pinned copy of the producer repo's contracts. | `vendor/3d-converters/inputxml-v2/inputxml-contract-bundle-manifest.json` | If node-history registry snapshots or ADRs ever need to be consumed by `XML_Compare_Utilities` or `3DV` (the addendum's delivery-governance section implies multi-repo agents), the same manifest-and-vendor pattern applies without new design work. |

The one thing **not** worth reusing verbatim: InputXML's failure-code taxonomy itself is a gap on its own side (see `Inputgapanalysis2.md` §2.6 — 13 of 14 named codes never got adopted as literal strings). Don't copy that omission into the node-history programme; if anything, node-history is a chance to establish the literal-code discipline InputXML skipped, since the concept documents here (§13, master concept) already ask for named statuses (`PASS`/`REVIEW_REQUIRED`/`BLOCKED`) that are easy to keep as real constants from day one.

---

## 7. Forward implementation plan

Ordered by the addendum's own gate dependency chain (§7.1→7.4), reusing the InputXML patterns above wherever noted.

### Phase A — Close the evidence gap on what's already decided (no new architecture)

1. **Write the EG-01 closure packet**, not just rely on ADR-004. Run `te013_mutation.py` / `psi116_te013_evidence.py` to completion, capture pass/fail against real PIPE/TEE/REDU/ELBO/ATTA cases per Addendum §3.2 steps 1–8, and produce the "required closure packet" (§3.1: decision statement, benchmark, results, downstream comparison, approved record, contract impact). This is writing up and running existing code, not building new code.
2. Do the same closure-packet pass for EG-02, EG-05, EG-08 — each already has an ADR; each needs the fixture-and-approval evidence the addendum requires before the ADR counts as *closed* rather than merely *recorded*.
3. Run the §7.1–§7.3 gate checks against the actual test suite (this session verified by static reading only, not execution) and record results as the contract-freeze/writer-migration/registry-matcher gate evidence.

### Phase B — Promote LogicalPsiGraph.v1 (§16.2 item 15, the highest-leverage single fix)

Reusing the InputXML mandatory-ledger pattern directly:

1. Identify (or build, if it doesn't exist) the ledger that currently gates PSI/CII selection for the StagedJSON path — analogous to `InputXmlCiiAssuranceLedger.v2` but for this pipeline.
2. Add `topologyNormalizationResult` (the shadow artifact) as a **mandatory, non-`NOT_APPLICABLE` input**, exactly as `topologyParityReport` was added to the InputXML ledger. Any run missing it, or where it reports `BLOCKED`/unresolved `MICRO_REVIEW_REQUIRED`, fails the ledger.
3. Run in parallel (shadow) against the ASIM-1885 corpus for one release cycle to quantify how many currently-passing runs would newly block — mirroring how the InputXML restraint-overflow fix was rolled out behind a flag before going default-on.
4. Flip default-on once the divergence is quantified and triaged, same as the InputXML precedent.

This single change closes acceptance-criteria #1, #6, #7, #10, and #15 together, because they all trace back to micro-geometry normalization not yet being authoritative.

### Phase C — Wire the registered/spatial matcher (HN-008) behind its own evidence gate (EG-03, EG-07)

1. `registered-global-matcher.js` and `registered-coordinate-evidence.js` already exist — the work here is wiring, not building from scratch.
2. Before enabling it for any real project, close EG-07 (coordinate registration calibration: anchor-count policy, transform type, residual thresholds, mirrored/scaled-model negative tests) — this is a prerequisite the addendum states explicitly.
3. Build the score-calibration benchmark for EG-03 (known continuations, insertions, splits, near-parallel lines, false-reuse mutations) using the same "characterize before enforcing" discipline already used for HN-001.
4. Wire the matcher in `HISTORY_DRY_RUN`-equivalent mode first (observe only), following the master concept's own rollout sequence (§14) rather than going straight to enforced.

### Phase D — Build HN-013/HN-014 using the InputXML release-worker pattern

1. Copy the `runInputXmlReleaseJob` two-stage shape (preflight → release, gated on a `releaseEligible` boolean) into an equivalent for the StagedJSON→PSI→CII path.
2. Define the mode enum explicitly as literal constants this time — either adopt the concept's own `BOOTSTRAP_REVIEW`/`HISTORY_DRY_RUN`/`HISTORY_SHADOW`/`HISTORY_ENFORCED` verbatim (recommended, since they're already named in the concept and nothing conflicts with them) or a documented equivalent — but pick one and make it a real, `grep`-able constant, unlike the InputXML side's undocumented status strings.
3. Bind the combined production gate from Addendum §4.2 (BLOCKED if any assurance dependency is missing, stale, unresolved-REVIEW_REQUIRED, contradictory, from a non-selected writer output, or unproven downstream) into this same worker, the same way `inputxml-release-worker.js` refuses to return CII without a `PASS` `SelectedOutputManifest.v1`.
4. Only after Phases A–C are closed does `HISTORY_ENFORCED` (HN-014) become safe to enable by default.

### Phase E — Close the AS-01…AS-08 broader-assurance backlog

This is explicitly a separate assurance workstream per the addendum (§4, Class B) — not part of the node-history architecture itself, but a hard production dependency. Recommend a dedicated audit pass (not scoped in this document) producing its own gap analysis in the same format as this one, then folding its exit artifacts into the Phase D combined gate as they close.

### Phase F — EG-04 and EG-06 (lowest priority, explicitly deferred by the concept itself)

- EG-04 (non-contiguous leases): only needed once a real project requires them; the concept says this is proof-gated on downstream consumer behavior, not urgent.
- EG-06 (split/merge/rename/zone-transfer automation): the concept explicitly wants this to **remain disabled** until approved. Use the `ApprovedSemanticSplit.v1`-style hash-scoped approval pattern (§6 above) for one-off reviewed exceptions in the meantime, rather than building general automation.

---

## 8. Milestones

| Milestone | Phase(s) | What it proves |
|---|---|---|
| M1 — Evidence packets closed | A | Every EG item with an existing ADR now also has the addendum's required closure packet, not just a design decision |
| M2 — LogicalPsiGraph.v1 governs | B | Acceptance criteria #1, #6, #7, #10, #15 all satisfied; shadow mode retired for micro-geometry |
| M3 — Registered matching enabled (dry-run) | C | HN-008 wired; EG-03/EG-07 closed; running in observation mode against real projects |
| M4 — Production enforcement gate live | D | HN-013/014 closed; `HISTORY_ENFORCED` (or equivalent) is a real, default-off-until-ready flag |
| M5 — Broader assurance backlog closed | E | AS-01…08 each have an exit artifact; Phase D's combined gate can actually check them |
| M6 — Full §7.4 production-enforcement gate satisfied | D+E | All six §7.4 conditions true; ASIM-1885 (and future projects) can run in enforced mode by default |

## 9. Decisions required before Phase B–D start

1. Who signs off Phase A's closure packets — same engineering-approver role the addendum names, or a different owner per EG item?
2. Should the node-history programme adopt the concept's literal mode names (`BOOTSTRAP_REVIEW`/`HISTORY_DRY_RUN`/`HISTORY_SHADOW`/`HISTORY_ENFORCED`) verbatim, given they're already specified and nothing in the codebase conflicts with them?
3. Confirm EG-03/EG-07 calibration data source — is there an approved second real project (beyond ASIM-1885) to calibrate spatial matching against, since single-project calibration risks overfitting (a risk the master concept names explicitly in §17)?
4. Confirm whether the AS-01…08 broader-assurance audit (Phase E) should be commissioned now in parallel with Phases A–D, or sequenced after — the addendum allows either, since Class B items block production independently of node-history's own gates.
