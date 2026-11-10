"""R3 mass-stage custody: source tokens are NOT physical-mass authority."""
from __future__ import annotations

from collections import defaultdict
from .field_inventory import numeric


def mass_custody_report(*, original_inventory, effective_inventory,
                        source_stage_match, r1_ledger, reversibility):
    """Separate original BM2 tokens, effective XML, writer selection and CII.

    Same ComponentRefNo / repeated positive Weight does *not* prove that
    distinct physical masses exist. This read-only report cannot promote an
    interpolated, propagated or catalog-suggested value to physical authority.
    """
    eff_nodes={n["nodeIdentity"]:n for n in effective_inventory["nodes"]}
    effective_weights=defaultdict(list)
    for f in effective_inventory["fields"]:
        if f["sourceFieldPath"]!="Node/Weight" or f["sourceNodeIdentity"] is None:
            continue
        effective_weights[f["sourceNodeIdentity"]].append(f)
    original_fields={}
    if original_inventory:
        original_fields={f["fieldId"]:f for f in original_inventory["fields"]}
    upstream_by_effective={r["effectiveFieldId"]:r for r in source_stage_match["relationships"]}
    sources_by_node=defaultdict(list)
    for item in r1_ledger["sourceNodes"]:
        if item.get("componentRefNo"):
            sources_by_node[item["componentRefNo"]].append(item)
    emitted_by_writer=defaultdict(list)
    for item in reversibility["relationships"]:
        if item["ciiField"]!="RIGID.weight" or not item.get("sourceNodeIdentity"):
            continue
        emitted_by_writer[item["sourceNodeIdentity"]].append(item)
    groups=[]
    seen_node_ids=set()
    for component,source_nodes in sorted(sources_by_node.items()):
        entries=[]
        for node in source_nodes:
            sid=node["identity"]
            # Exact R1 digest:branch:ordinal maps to converter-input inventory.
            effective_node=next((x for x in effective_inventory["nodes"]
                if x["nodeIdentity"]==sid),None)
            if effective_node is None:
                continue
            seen_node_ids.add(sid)
            fields=effective_weights.get(sid,[])
            for field in fields:
                upstream=upstream_by_effective.get(field["fieldId"])
                original=original_fields.get(upstream.get("originalFieldId")) if upstream else None
                emitted=emitted_by_writer.get(sid,[])
                entries.append({
                    "sourceNodeIdentity":sid,
                    "originalInputFieldIdentity":original["fieldId"] if original else None,
                    "originalInputWeightToken":original["originalSourceToken"] if original else None,
                    "originalInputWeightStageStatus":upstream["relationship"] if upstream else "NOT_AVAILABLE",
                    "effectiveXmlWeightFieldId":field["fieldId"],
                    "effectiveXmlWeightToken":field["originalSourceToken"],
                    "writerSelectedCiiRigidFields":[r["ciiFieldId"] for r in emitted],
                    "emittedCiiRigidWeightTokens":[r["emittedToken"] for r in emitted],
                    "sourceMassWasPhysicallyApproved":False,
                    "engineeringEditApproved":False,
                })
        positive=[]
        for entry in entries:
            value=numeric(entry["effectiveXmlWeightToken"])
            if value is not None and value>0:
                positive.append(value)
        duplicates=len(positive)>1 and len(set(positive))<len(positive)
        multiple=len(source_nodes)>1
        groups.append({
            "componentRefNo":component,
            "sourceNodeCount":len(source_nodes),
            "effectiveWeightFieldCount":len(entries),
            "writerSelectedRigidFieldCount":sum(
                len(e["writerSelectedCiiRigidFields"]) for e in entries),
            "originalPhysicalMass":None,
            "originalPhysicalMassAuthority":"UNRESOLVED",
            "writerSelectedMassAuthority":"SOURCE_TOKEN_ONLY",
            "ownerAuthorizedPhysicalAllocation":None,
            "possiblePropagationOrDuplicatedWeightTokens":duplicates,
            "duplicateComponentNodeIdentity":multiple,
            "allocationStatus":"HOLD_MULTIPLE_SOURCE_NODES" if multiple
                               else "OWNER_APPROVAL_NOT_ATTESTED",
            "reasonCodes":(
                ["REPEATED_POSITIVE_WEIGHT_TOKEN_NOT_MULTIPLE_APPROVED_MASSES"]
                if duplicates else [])+(
                ["COMPONENTREFNO_REPEATED_NO_UNIQUE_PHYSICAL_ALLOCATION"]
                if multiple else []),
            "sourceStages":entries,
        })
    # Some nodes lack ComponentRefNo entirely: retain their mass fields,
    # never synthesize a fake physical owner or include them in component sums.
    anonymous=[]
    for node in effective_inventory["nodes"]:
        sid=node["nodeIdentity"]
        if sid in seen_node_ids:
            continue
        for field in effective_weights.get(sid,[]):
            anonymous.append({
                "sourceNodeIdentity":sid,
                "effectiveXmlWeightFieldId":field["fieldId"],
                "effectiveXmlWeightToken":field["originalSourceToken"],
                "physicalMassAuthority":"UNRESOLVED",
                "reasonCode":"NO_VERIFIED_COMPONENT_OWNER",
            })
    return {
        "schema":"xml-cii-physical-mass-custody/r3",
        "readOnly":True,
        "physicalMassAuthority":"NOT_ATTESTED",
        "weightScale":None,
        "components":groups,
        "unownedNodeWeights":anonymous,
        "statistics":{
            "componentIdentityGroups":len(groups),
            "repeatedComponentRefGroups":sum(x["duplicateComponentNodeIdentity"] for x in groups),
            "suspectedDuplicatePositiveWeightGroups":sum(
                x["possiblePropagationOrDuplicatedWeightTokens"] for x in groups),
            "writerSelectedRigidFieldReferences":sum(
                x["writerSelectedRigidFieldCount"] for x in groups),
            "physicallyApprovedComponentMasses":0,
            "originalPhysicalMassValuesUnverified":len(groups),
            "unownedEffectiveNodeWeightFields":len(anonymous),
        },
        "policy":"Repeated weight tokens are candidate duplication/propagation only; no engineering mass approval without independent physical owner evidence",
    }
