# PR-6 Root/SelectionJSON Implementation Evidence

Every material claim uses the required eight-field schema. The PR #225 review corrections are included as amended claims.

## C-01 — Generic Root selection

Claim: A valid unqualified Root resolves only as XML Builder unless SelectionJSON is explicitly selected.

Classification: REPOSITORY-CONTRACT.

Authority: dialect registry, adapter registry, ADR-005.

Version: PR-6.

Location: `topology_profiles.py; xml.py`.

Applicability: both profiles.

Confidence: HIGH.

Action: Reject incompatible override and never infer from filename.

## C-02 — SelectionJSON producer identity

Claim: When Producer exists for SelectionJSON it must equal selectionjson-transfer-v1; producer and Profile contradictions are independent.

Classification: PROFILE-CONTRACT.

Authority: SelectionJSON producer fixture and PR #225 review.

Version: PR-6 amended.

Location: `topology_profiles.py; SelectionJSON tests/corpus`.

Applicability: seljson-custom-root.

Confidence: HIGH.

Action: Block contradictory producer at PROFILE_INTAKE_GATE.

## C-03 — Parser boundary

Claim: Node receives versioned JSON only; malformed XML, DTDs, entities and non-UTF-8 Root block before topology resolution.

Classification: SECURITY-CONTRACT.

Authority: ADR-001 and secure lxml parser configuration.

Version: InputXmlTopologyBridgeRequest.v1.

Location: `xml.py; topology_bridge_io.py`.

Applicability: both profiles.

Confidence: HIGH.

Action: No handwritten XML parser or recovery.

## C-04 — Branch occurrence identity

Claim: A branch occurrence is identified by its exact source path; Branchname is separate display/path evidence.

Classification: REPOSITORY-CONTRACT.

Authority: real-shaped XML Builder producer fixture.

Version: PR-6 amended.

Location: `topology_source.py; topology_source_model.py`.

Applicability: both profiles.

Confidence: HIGH.

Action: Preserve Branchname without using it as line identity.

## C-05 — Line identity multiplicity

Claim: LineNo or compatible LINE_ID is line identity; repeated line identity across branch occurrences is legal and does not merge state.

Classification: REPOSITORY-CONTRACT.

Authority: producer-shaped repeated-line fixture and review finding.

Version: PR-6 amended.

Location: `topology_source.py; topology_engineering.py`.

Applicability: both profiles.

Confidence: HIGH.

Action: Block only missing or conflicting LineNo/LINE_ID.

## C-06 — Node identity

Claim: Source path identifies occurrence; positive integer NodeNumber identifies canonical node and duplicate numbers block.

Classification: CANONICAL-CONTRACT.

Authority: canonical XSD and writer global numeric namespace.

Version: PR-6.

Location: `topology_source.py; strict_root_topology.cjs`.

Applicability: both profiles.

Confidence: HIGH.

Action: Never overwrite or coordinate-merge nodes.

## C-07 — Adjacency authority

Claim: Consecutive direct Node children define adjacency only under the registered producer order contract.

Classification: REPOSITORY-CONTRACT.

Authority: producer serialization and route fixtures.

Version: DIRECT_NODE_CHILD_ORDER_REGISTERED_PRODUCER_V1.

Location: `strict_root_topology.cjs; topology_bridge_relations.py`.

Applicability: accepted branches.

Confidence: MEDIUM-HIGH.

Action: Block invalid intermediate evidence; never connect around it.

## C-08 — Bridge relational completeness

Claim: Python reconstructs nodes, edges and owner edges from the request and requires exact relational equality for all bridge arrays.

Classification: SECURITY-CONTRACT.

Authority: PR #225 review correction gate.

Version: InputXmlTopologyBridgeResult.v1.

Location: `topology_bridge_relations.py`.

Applicability: every bridge result.

Confidence: HIGH.

Action: Block omissions, duplicates, owner changes and edge/mapping mismatch.

## C-09 — Bridge evidence completeness

Claim: Metrics must equal both source counts and returned arrays; proof counts and independent topology hash must match.

Classification: SECURITY-CONTRACT.

Authority: PR #225 review correction gate.

Version: InputXmlStrictTopologyProof.v1.

Location: `topology_bridge_evidence.py`.

Applicability: every bridge result.

Confidence: HIGH.

Action: A self-consistent recomputed bridge hash cannot legalize omitted evidence.

## C-10 — Component coverage

Claim: Every source node requires exactly one component mapping to the independently reconstructed incident edge.

Classification: EVIDENCE-CONTRACT.

Authority: source node component fields and ownership convention.

Version: PR-6 amended.

Location: `topology_bridge_relations.py; topology_components.py`.

Applicability: all source nodes.

Confidence: HIGH.

Action: Block missing, duplicate or wrong-owner component mappings.

## C-11 — Auxiliary coverage

Claim: Every source Restraint or CustomRestraint requires exactly one mapping to its containing node and verified owner edge.

Classification: EVIDENCE-CONTRACT.

Authority: source nesting and canonical restraint owner contract.

Version: PR-6 amended.

Location: `topology_bridge_relations.py; topology_restraints.py`.

Applicability: all source auxiliaries.

Confidence: HIGH.

Action: Block omitted, duplicate or wrong-owner mappings.

## C-12 — Inventory is not authority

Claim: Building source inventory creates no ledger decision and cannot satisfy accounting coverage.

Classification: EVIDENCE-CONTRACT.

Authority: PR #225 review correction gate and PR-5 accounting principle.

Version: PR-6 amended.

Location: `topology_inventory.py`.

Applicability: all source occurrences.

Confidence: HIGH.

Action: Treat inventory only as the set to reconcile.

## C-13 — Semantic accounting authority

Claim: Exactly one TOPOLOGY_SOURCE_DECISION per inventory identity is the sole accounting authority.

Classification: EVIDENCE-CONTRACT.

Authority: PRIOR_TRANSFORMATION_DECISION_REQUIRED.

Version: InputXmlTopologySourceAccountingProof.v1.

Location: `topology_source_decisions.py; topology_accounting.py`.

Applicability: both profiles.

Confidence: HIGH.

Action: Block missing, duplicate or unexpected semantic decisions.

## C-14 — Blanket certification exclusion

Claim: Generic inventory, document projection, full-source extension and accounting-index records cannot certify source coverage.

Classification: EVIDENCE-CONTRACT.

Authority: PR #225 review correction gate.

Version: PR-6 amended.

Location: `topology_accounting.py; tamper tests`.

Applicability: all source occurrences.

Confidence: HIGH.

Action: A deliberate exact-ID blanket record remains unaccounted.

## C-15 — Coordinate authority

Claim: Coordinates are geometry evidence only and transform exactly from (x,y,z) to (x,z,-y) millimetres.

Classification: PROJECT-ENGINEERING-CONTRACT.

Authority: producer/browser transform and fixtures.

Version: ROOT_XYZ_MM v1.

Location: `topology_engineering.py`.

Applicability: both profiles.

Confidence: MEDIUM-HIGH.

Action: No tolerance, sentinel, coalescing or proximity connection.

## C-16 — Synthetic topology prohibition

Claim: The strict path contains no coalescing, filler, ray, midspan split, synthetic node or invalid-node repair operation.

Classification: IMPLEMENTATION-INVARIANT.

Authority: strict engine and prohibited metric policy.

Version: strict-root-topology-engine 1.0.0.

Location: `strict_root_topology.cjs; topology_bridge_evidence.py`.

Applicability: both profiles.

Confidence: HIGH.

Action: Require every prohibited-operation metric to be zero.

## C-17 — Candidate and writer gate

Claim: Retained unsupported components may yield BLOCKED_WITH_CANDIDATE, but no blocked result loads the production writer.

Classification: PRODUCTION-GATE-INVARIANT.

Authority: compiler state machine and assured projection wrapper.

Version: existing gate contract.

Location: `topology_candidate_policy.py; blocked publication test`.

Applicability: blocked fixtures.

Confidence: HIGH.

Action: Publish blocked evidence; keep writer uninvoked.

## C-18 — Unchanged boundaries

Claim: Browser topology, production writer, serialization, publication, out-of-scope profiles, migration and PR-7 remain unchanged.

Classification: ARCHITECTURE-INVARIANT.

Authority: Work Pack scope.

Version: PR-6.

Location: `PR diff and required workflows`.

Applicability: repository.

Confidence: HIGH.

Action: Disclose no production activation; do not begin PR-7.
