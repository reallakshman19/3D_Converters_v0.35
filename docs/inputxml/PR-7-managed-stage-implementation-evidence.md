# PR-7 — Corrected Managed-Stage Implementation Evidence

## Review stack

| Batch | Pull request | Authority boundary |
|---|---|---|
| PR-7A | #234 | production reconciliation core |
| PR-7B | #239 | exploit-oriented qualification |
| PR-7C | #240 | focused corpus and profile/InputXML gates |
| PR-7D | #241 | workflow, ADR, and final evidence gate |

The stack is rooted at current `main`. Each child is a direct descendant of the exact preceding head and contains only its declared batch delta. Exact final SHAs and workflow run IDs are recorded in PR #241 after the immutable final head completes.

Starting dependency: PR #225, merge SHA `17d4b94ff6dd2f5a8d5b8b2354d2f324319d0220`.

## Material claims

| Claim | Classification | Authority | Version | Location | Applicability | Confidence | Action |
|---|---|---|---|---|---|---|---|
| Managed-stage intake rejects invalid UTF-8, duplicate keys, non-finite values, trailing data, oversized sources, ambiguous roots, and unrelated JSON before Node execution. | IMPLEMENTED_AND_TESTED | strict intake contract | `ManagedStageIntake.v1` | `managed_stage_intake.py`; intake/profile tests | `managed-stage-json` | HIGH | Retain Python as media/profile intake authority. |
| The only accepted roots are a non-empty top-level array or exactly one non-empty `objects`, `hierarchy`, or `branches` array. | IMPLEMENTED_AND_TESTED | ADR-006 | corrected PR-7 | intake and corpus | managed-stage root predicate | HIGH | Reject competing or inferred collections. |
| The Node request is decoded with fatal UTF-8 and duplicate-key rejection before object construction, including nested context objects. | IMPLEMENTED_AND_TESTED | bridge request contract | `InputXmlManagedStageBridgeRequest.v1` | `strict_json_request.mjs`; bridge-request tests | bridge input | HIGH | Treat duplicate request fields as an internal request failure. |
| Bridge execution has true in-flight stdout/stderr caps and kills the child when a cap or deadline is exceeded. | IMPLEMENTED_AND_TESTED | bounded process contract | corrected PR-7 | `managed_stage_process.py`; containment tests | subprocess transport | HIGH | Keep full RSS characterization deferred to PR-10. |
| The bridge result is closed and includes source, topology, engineering, trace, InputXML, parsed topology, SVG, parity, metrics, issues, and diagnostics. | IMPLEMENTED_AND_TESTED | result contract | `InputXmlManagedStageBridgeResult.v1` | Node bridge and identity verifier | artifact closure | HIGH | Reject unknown or missing result fields. |
| Raw SHA-256, SourceEnvelope identity, profile, adapter, file ID, revision, and entity schema close across all returned artifacts. | IMPLEMENTED_AND_TESTED | source identity contract | v1 | identity and artifact-closure tests | artifact identity | HIGH | Block before topology use on disagreement. |
| Source entity and port identities are independently derived from exact occurrence paths and duplicate/collision checked before indexing. | IMPLEMENTED_AND_TESTED | source graph identity | v1 | entity verifier | source model | HIGH | Preserve source-array order and exact owner relationships. |
| A mapped source port belongs to exactly one canonical node before any source-port dictionary is constructed. | IMPLEMENTED_AND_TESTED | canonical port-owner relation | corrected PR-7 | `managed_stage_topology.py`; trace-ownership tests | mapped ports | HIGH | Block `MANAGED_STAGE_SOURCE_PORT_OWNER_AMBIGUOUS`; never overwrite. |
| Mapped ports bind to exact incident `PE-*` elements; point and intentional-nonprojection ports remain explicit evidence-only decisions. | IMPLEMENTED_AND_TESTED | canonical incidence and accounting | corrected PR-7 | port-coverage module | source-port accounting | HIGH | Generic preservation cannot certify coverage. |
| Canonical topology is independently verified for schema, hash, IDs, incidence, coordinates, source ancestry, merges, junctions, boundaries, supports, rigids, and build issues. | IMPLEMENTED_AND_TESTED | `CanonicalTopology.v1` | v1 | topology verifier | topology authority | HIGH | Python verifies and does not reconstruct route geometry. |
| Every trace relation is reconstructed independently from source and canonical arrays, not accepted merely because its IDs exist. | IMPLEMENTED_AND_TESTED | trace relation contract | corrected PR-7 | `managed_stage_trace_relations.py` | all source trace records | HIGH | Compare node/edge/point/junction/boundary/affected/branch/InputXML/child ownership exactly. |
| Projection cardinality, operation, loss classification, merge authority, deferred properties, disposition, and status are independently derived and compared. | IMPLEMENTED_AND_TESTED | trace semantic contract | corrected PR-7 | trace relation verifier | trace semantics | HIGH | Valid-ID/wrong-owner and semantic substitutions block after restamping hashes. |
| Python and JavaScript hash identical canonical bytes for every valid finite number under ECMAScript `JSON.stringify` semantics. | IMPLEMENTED_AND_TESTED | canonical artifact hash contract | `fnv1a64-canonical-json-v1` | hash modules and shared vector contract | canonical, trace, parsed, SVG, parity hashes | HIGH | Preserve IEEE-754 coercion, negative-zero normalization, UTF-16 key order, and exact exponent thresholds. |
| Shared numeric vectors cover zero, negative zero, exponent boundaries, unsafe integers, residual fractions, rounding boundaries, maximum finite, and minimum positive values. | IMPLEMENTED_AND_TESTED | numeric vector contract | `InputXmlManagedStageCanonicalNumberVectors.v1` | compiler contract and Ubuntu/Windows tests | cross-language determinism | HIGH | Any byte or hash mismatch blocks the workflow. |
| RESTRAINT ownership is reconstructed through child ID, support ID, source IDs, canonical node, InputXML node, and owning PIPINGELEMENT. | IMPLEMENTED_AND_TESTED | InputXML child relation contract | corrected PR-7 | `managed_stage_inputxml_relations.py` | parsed RESTRAINT children | HIGH | Child relocation or support-identity exchange blocks. |
| RIGID ownership is reconstructed through child ID, source rigid IDs, canonical edge, owner element, weight, body count, assignment authority, and weight authority. | IMPLEMENTED_AND_TESTED | InputXML child relation contract | corrected PR-7 | child relation verifier | parsed RIGID children | HIGH | Rigid relocation or source exchange blocks. |
| Missing rigid weight is represented as `weightKg: null` and `weightAuthority: MISSING`, never numeric zero. | IMPLEMENTED_AND_TESTED | rigid weight evidence contract | corrected PR-7 | `topology-rigid-weight.js`; engineering verifier | rigid projection | HIGH | Preserve absence and block required projection. |
| Positive rigid weight requires explicit `RESOLVED_WEIGHT_KG` or `SOURCE_WEIGHT_KG` authority and must agree across engineering, canonical, and InputXML evidence. | IMPLEMENTED_AND_TESTED | rigid engineering policy | corrected PR-7 | engineering/topology/child verifiers | rigid projection | HIGH | Missing authority or disagreement blocks. |
| Complete topology InputXML is securely parsed; element and child trace attributes are independently verified and removed individually into extension evidence. | IMPLEMENTED_AND_TESTED | managed-stage InputXML policy | corrected PR-7 | InputXML element/control modules | candidate construction | HIGH | Regex mutation and generic family repair are prohibited. |
| Producer `NUM*` values are assertions compared with PR-5 owner/count authority and are not silently rewritten. | IMPLEMENTED_AND_TESTED | PR-5 count authority | canonical contract v1 | InputXML control and tamper tests | control counts | HIGH | Record asserted/actual disagreement and block. |
| Required sentinels block; optional absence may be removed only with registered evidence. | IMPLEMENTED_AND_TESTED | sentinel policy | corrected PR-7 | InputXML sanitizer tests | candidate values | HIGH | Missing, unresolved, and zero remain distinct. |
| Parsed topology, SVG scene, parity report, metrics, and exact child ownership are mandatory acceptance evidence. | IMPLEMENTED_AND_TESTED | parity closure contract | corrected PR-7 | parity wrapper and metric verifier | artifact acceptance | HIGH | Missing, stale, forged, or relationally inconsistent evidence blocks. |
| Source-accounting COMPLETE is certified only by post-verification semantic source decisions. | IMPLEMENTED_AND_TESTED | `InputXmlManagedStageSourceAccountingProof.v1` | v1 | accounting module | source accounting | HIGH | Inventory, closure, document, digest, extension, and index records are non-authoritative. |
| `selfCertificationCount` becomes nonzero when a non-authority record associated with a source occurrence claims coverage. | IMPLEMENTED_AND_TESTED | accounting anti-self-certification contract | corrected PR-7 | accounting module and review-regression test | source accounting | HIGH | Identify the offending record and block completion. |
| Accepted, blocked-with-candidate, and blocked-without-candidate artifacts remain deterministic across processes, hash seeds, Ubuntu, and Windows. | WORKFLOW_GATED | deterministic compiler contract | current | Canonical Compiler matrix | compiler artifacts | HIGH | Require all matrix jobs to complete successfully. |
| Blocked managed-stage bundles never invoke the production CII writer. | IMPLEMENTED_AND_TESTED | assured projection gate | current | blocked-publication tests | production containment | HIGH | Preserve downstream writer isolation. |
| Static, parity, support, ASIM-1835, 1885_NC, and PSI116 proofs protect shared producer behavior. | WORKFLOW_GATED | component-topology contracts | current | Canonical Compiler and parity workflow | shared producer | HIGH | Treat producer regression as a merge blocker. |
| The corrected stack is rooted at current main and every child is a strict descendant with zero commits behind its parent. | VERIFIED_REPOSITORY_FACT | Git commit ancestry | corrected stack | PR #234/#239/#240/#241 | review lineage | HIGH | Reverify after every head-changing correction. |
| The production CII writer, canonical serialization policy, publication protocol, browser UI, and other profile semantics are unchanged. | VERIFIED_SCOPE_BOUNDARY | repository diff and governing ADRs | current | corrected PR-7 stack | repository | HIGH | Treat contrary changes as scope blockers. |

## Exploit qualification

The corrected qualification suite includes:

- valid canonical node, edge, point-feature, junction, boundary, affected-edge, branch-edge, and InputXML element IDs substituted into the wrong source trace;
- trace cardinality, operation, loss classification, merge authority, deferred properties, status, and disposition substitution;
- one valid source port inserted into a second canonical node with hashes recomputed;
- RESTRAINT and RIGID children moved to another valid PIPINGELEMENT;
- support and rigid source identities exchanged while child IDs and counts remain valid;
- shared Python/JavaScript numeric byte and hash vectors;
- duplicate bridge-request keys at top level and nested context depth;
- missing rigid weight retained as structured absence;
- non-authority source-certification attempts;
- stdout overflow, stderr overflow, timeout, and bounded success.

## Validation authority

The final PR-7D head must complete successfully with no queued, skipped, cancelled, or in-progress required jobs:

- InputXML Schema Suite;
- InputXML Canonical Compiler and its full managed-stage exploit suite;
- Ubuntu and Windows cross-language/determinism/containment jobs;
- InputXML Assurance Ledger;
- InputXML Assured CII Projection;
- InputXML End-to-End Regression Matrix;
- component-topology static, parity, and support tests;
- ASIM-1835 and 1885_NC producer proofs;
- PSI116 component-topology regression.

Final immutable head SHAs and workflow run IDs are recorded in PR #241 after documentation changes complete and the workflows rerun.

## Deferred and unchanged

New bend engineering, Tee/Olet SIF projection, unsupported inline production engineering, full RSS characterization, full-corpus expansion, migration, browser redesign, and production activation remain unauthorized.

Production CII writer: **UNCHANGED**  
Canonical serialization policy: **UNCHANGED**  
Publication protocol: **UNCHANGED**  
Migration: **NOT AUTHORIZED**  
PR-8: **NOT STARTED**  
Merge status: **NOT MERGED**
