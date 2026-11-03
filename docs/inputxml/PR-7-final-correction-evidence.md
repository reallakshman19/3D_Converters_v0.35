# PR-7 Final Correction Evidence

This document records the final review corrections applied before PR-7 closure. Each material claim uses the governing eight-field claim schema.

## Claim 1 — Source-component route conservation

| Field | Evidence |
|---|---|
| Claim | Every managed-stage route component is reconciled through its producer-owned ports, canonical nodes, canonical edges, and exact InputXML element identities before source accounting can complete. |
| Classification | VERIFIED IMPLEMENTATION CLAIM |
| Authority | Managed-stage profile contract; component policy; source and canonical topology artifacts |
| Version | PR-7 final correction |
| Location | `scripts/inputxml_compiler/managed_stage_component_closure.py`; `managed_stage.py` |
| Applicability | `managed-stage-json` / `managed-stage-to-canonical` only |
| Confidence | HIGH — exploit tests remove valid PIPE ancestry and restamp the complete artifact hash chain |
| Action | Block with `MANAGED_STAGE_COMPONENT_MAPPING_INCOMPLETE` when exact conservation is absent. |

## Claim 2 — Source-port owner and position coupling

| Field | Evidence |
|---|---|
| Claim | A canonical node's source entities must equal the owners of its source ports, and the node position and residual must reconcile to producer-owned port or authorized support-attachment positions. |
| Classification | VERIFIED IMPLEMENTATION CLAIM |
| Authority | `ComponentTopologySourceModel.v1`; `CanonicalTopology.v1` |
| Version | PR-7 final correction |
| Location | `managed_stage_component_closure.py` |
| Applicability | All mapped managed-stage source ports |
| Confidence | HIGH — wrong-owner and shifted-position tamper tests block after hash restamping |
| Action | Reject owner, position, residual, or endpoint disagreement before trace evidence is consumed. |

## Claim 3 — Component-filtered port element coverage

| Field | Evidence |
|---|---|
| Claim | A source port may certify only InputXML elements owned by its exact source component or an explicitly authorized managed merge, not every element incident at a shared canonical node. |
| Classification | VERIFIED IMPLEMENTATION CLAIM |
| Authority | Verified component mappings and canonical incidence |
| Version | PR-7 final correction |
| Location | `scripts/inputxml_compiler/managed_stage_port_coverage.py` |
| Applicability | Managed-stage semantic source-port decisions |
| Confidence | HIGH — unrelated valid incident-element injection increments a blocking accounting invariant |
| Action | Intersect incident elements with verified component ownership and block an empty intersection. |

## Claim 4 — Per-component source-accounting invariants

| Field | Evidence |
|---|---|
| Claim | `InputXmlManagedStageSourceAccountingProof.v1` measures component mappings, port owners, positions, edge cardinality, InputXML cardinality, and unrelated incident-element coverage independently of global population unions. |
| Classification | VERIFIED IMPLEMENTATION CLAIM |
| Authority | Source-accounting proof contract |
| Version | PR-7 final correction |
| Location | `scripts/inputxml_compiler/managed_stage_accounting.py` |
| Applicability | Final managed-stage source-accounting gate |
| Confidence | HIGH — focused missing-mapping and unrelated-element tamper tests block completion |
| Action | Permit `COMPLETE` only when every registered invariant equals zero. |

## Claim 5 — Closed request-object semantics

| Field | Evidence |
|---|---|
| Claim | Managed-stage bridge requests are decoded into null-prototype records, properties are created as own data properties, and required fields are checked with own-property semantics. |
| Classification | VERIFIED SECURITY CLAIM |
| Authority | `InputXmlManagedStageBridgeRequest.v1` closed-field contract |
| Version | PR-7 final correction |
| Location | `strict_json_request.mjs`; `node_managed_stage_bridge.mjs` |
| Applicability | Top-level request and nested context, intake, and producer-policy records |
| Confidence | HIGH — `__proto__`, `prototype`, `constructor`, duplicate-key, and inherited-authority attacks are tested |
| Action | Reject missing, extra, inherited, duplicated, or prototype-special request fields before topology execution. |

## Claim 6 — Exact JSON whitespace

| Field | Evidence |
|---|---|
| Claim | The JavaScript strict request parser accepts only space, tab, line feed, and carriage return as JSON whitespace. |
| Classification | VERIFIED SECURITY CLAIM |
| Authority | JSON grammar |
| Version | PR-7 final correction |
| Location | `strict_json_request.mjs` |
| Applicability | Managed-stage bridge request bytes |
| Confidence | HIGH — non-JSON Unicode whitespace is rejected by qualification tests |
| Action | Fail closed on all other whitespace code points. |

## Claim 7 — Prototype-key canonical hashing

| Field | Evidence |
|---|---|
| Claim | Canonical hashing preserves `__proto__`, `prototype`, and `constructor` as ordinary data keys in both JavaScript and Python, with ECMAScript UTF-16 key ordering. |
| Classification | VERIFIED DETERMINISM CLAIM |
| Authority | `fnv1a64-canonical-json-v1` |
| Version | PR-7 final correction |
| Location | `topology-deterministic-hash.js`; `managed_stage_hashes.py`; canonical vector contract |
| Applicability | Managed-stage artifact semantic hashes |
| Confidence | HIGH — exact canonical bytes and FNV-1a hashes are compared cross-language on Ubuntu and Windows |
| Action | Reject non-finite or unsupported values and preserve every registered own data key. |

## Claim 8 — Strict Unicode and surrogate closure

| Field | Evidence |
|---|---|
| Claim | Unpaired UTF-16 surrogate code units are rejected at source, context, bridge-request, bridge-result, and artifact-hash boundaries; valid non-BMP text remains supported. |
| Classification | VERIFIED SECURITY AND DETERMINISM CLAIM |
| Authority | Strict UTF-8 media contract and shared canonical hash contract |
| Version | PR-7 final correction |
| Location | `managed_stage_intake.py`; `managed_stage_bridge_io.py`; `managed_stage_hashes.py`; `strict_json_request.mjs`; `topology-deterministic-hash.js` |
| Applicability | All managed-stage text entering semantic evidence |
| Confidence | HIGH — high-surrogate, low-surrogate, non-BMP, U+2028, U+2029, and control-character vectors are exercised cross-platform |
| Action | Return a registered fail-closed diagnostic rather than allowing encoding divergence or an unhandled exception. |

## Claim 9 — Unchanged downstream authorities

| Field | Evidence |
|---|---|
| Claim | PR-7 does not modify the production CII writer, deterministic serialization policy, publication protocol, or browser UI/runtime. |
| Classification | VERIFIED SCOPE CLAIM |
| Authority | Final changed-file review |
| Version | PR-7 final correction |
| Location | PR #234, #239, #240, and #241 changed-file sets |
| Applicability | Entire PR-7 delivery |
| Confidence | HIGH |
| Action | Keep migration and production activation unauthorized; do not begin PR-8 within PR-7. |

Production CII writer: **UNCHANGED**

Canonical serialization policy: **UNCHANGED**

Publication protocol: **UNCHANGED**

Migration: **NOT AUTHORIZED**

PR-8: **NOT STARTED**
