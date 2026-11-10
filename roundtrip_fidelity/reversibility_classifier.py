"""R3 per-relationship reversibility classification and future eligibility manifest.

Lossless source lineage != engineering approval. No new editable property is
enabled by this read-only module.
"""
from __future__ import annotations
from collections import Counter, defaultdict

CLASSES = {"LOSSLESS", "LOSSLESS_WITH_PROVENANCE", "LOSSY", "UNRESOLVED"}
ANNOTATIONS = {
    "Node/ComponentRefNo", "Node/Rating", "Node/Bore", "Node/DTXR",
    "Node/DTXR_POS", "Node/DTXR_PS", "Node/NodeName",
}
NON_INVERTIBLE = {
    "DIFFERENCE_NOT_INVERSE_UNIQUE", "CII_NUMERIC_QUANTIZATION",
    "SOURCE_WALL_DEFAULTED", "SOURCE_ABSENT_OR_INVALID_DEFAULTED",
    "SOURCE_ABSENT_OR_ENRICHED", "DERIVED_CONSTANT_NOT_SOURCE_PROPERTY",
    "AUX_POINTER_NOT_PERMANENT_SOURCE_IDENTITY",
}


def classify(field, source_candidates, deleted_source_ids):
    reasons=list(dict.fromkeys(field.get("reasonCodes",[])))
    stage=field.get("sourceNodeIdentity")
    candidates=list(source_candidates)
    if field.get("valueStatus")=="HOLD_VALUE_DISCREPANCY":
        return "UNRESOLVED", ["SERIALIZED_ENGINEERING_VALUE_DISCREPANCY",*reasons]
    if field["propertyGroup"]=="AUXILIARY_IDENTITY":
        return "LOSSY", ["POINTER_INDEX_RENUMBERABLE_SOURCE_LINK_RETAINED",*reasons]
    if field["ciiField"]=="RIGID.type" or field["propertyGroup"]=="DERIVED_CONSTANT":
        return "LOSSY", ["DERIVED_CONSTANT_HAS_NO_ORIGINAL_SOURCE_FIELD",*reasons]
    if "R1_EDGE_IDENTITY_UNRESOLVED" in reasons:
        return "UNRESOLVED", reasons
    if field.get("valueStatus") not in (
        "PASS_EXACT_WRITER_SERIALIZATION", "PASS_VERIFIED_WRITER_CONSTANT"):
        return "UNRESOLVED", ["NO_VERIFIED_WRITER_SOURCE_VALUE",*reasons]
    if any(r in NON_INVERTIBLE for r in reasons):
        return "LOSSY", reasons
    if len(candidates)==0:
        return "LOSSY", ["EMITTED_DEFAULT_OR_DERIVED_WITHOUT_SOURCE",*reasons]
    if len(candidates)>1:
        return "LOSSY", ["MANY_TO_ONE_SOURCE_INVERSE_NOT_UNIQUE",*reasons]
    source=candidates[0]
    if source.get("sourceNodeIdentity") in deleted_source_ids:
        return "LOSSY", ["ORIGINAL_SOURCE_NODE_REMOVED_BY_ACTIVE_PARSER",*reasons]
    if any(x in field.get("transformation",[]) for x in
           ("DEFAULT_VALUE_SUBSTITUTION","WALL_NONPOSITIVE_TO_0.01",
            "MULTIPLE_SOURCE_FIELDS_ONE_OUTPUT")):
        return "LOSSY", reasons
    if (field.get("transformation") or
        source.get("originalSourceToken","").strip() != field.get("emittedToken","").strip() or
        source.get("sourceUnit") != field.get("emittedUnit") or
        not source.get("lexicalMatchesParsed")):
        return "LOSSLESS_WITH_PROVENANCE", ["SOURCE_TOKEN_REQUIRED_FOR_ROUND_TRIP",*reasons]
    return "LOSSLESS", reasons


def build_reversibility(*, field_inventory, original_inventory,
                        effective_inventory, source_stage_match, r1_ledger,
                        value_verification, evidence_class):
    fields=field_inventory["fields"]
    source_index={f["fieldId"]:f for f in effective_inventory["fields"]}
    original_links={r["effectiveFieldId"]:r for r in source_stage_match["relationships"]}
    sources_used=defaultdict(list)
    deleted_events={
        event["sourceIdentity"]:event for event in r1_ledger["transformations"]
        if event.get("sourceIdentity") and event["stage"] in (
            "PYTHON_SHORT_NODE_DROP","PYTHON_NONPOSITIVE_NODE_OMISSION")
        and event.get("status")=="TRANSFORMED_WITH_LINEAGE"
    }
    component_nodes=defaultdict(list)
    for node in r1_ledger["sourceNodes"]:
        if node.get("componentRefNo"):
            component_nodes[node["componentRefNo"]].append(node)
    source_node_by_id={n["identity"]:n for n in r1_ledger["sourceNodes"]}
    relationships=[]
    for output in fields:
        candidates=[source_index[k] for k in output["sourceFieldCandidates"] if k in source_index]
        if len(candidates)!=len(output["sourceFieldCandidates"]):
            classification,reason_codes="UNRESOLVED",["UNBOUND_SOURCE_FIELD_ID"]
        else:
            classification,reason_codes=classify(output,candidates,set(deleted_events))
        original_relations=[original_links.get(s["fieldId"]) for s in candidates]
        inverse_unique=len(candidates)==1 and classification in (
            "LOSSLESS","LOSSLESS_WITH_PROVENANCE")
        physical=output.get("physicalAuthority","NOT_APPLICABLE")
        if physical not in ("VERIFIED","OWNER_APPROVAL_REQUIRED",
                            "UNRESOLVED","NOT_APPLICABLE"):
            physical="UNRESOLVED"
        technical=output.get("technicalEditImplementation","NOT_IMPLEMENTED")
        if classification in ("UNRESOLVED","LOSSY"):
            technical="HOLD"
        elif technical not in ("ELIGIBLE","HOLD","NOT_IMPLEMENTED"):
            technical="NOT_IMPLEMENTED"
        if technical=="ELIGIBLE" and physical=="UNRESOLVED":
            technical="HOLD"
        for candidate in candidates:
            sources_used[candidate["fieldId"]].append(output["ciiFieldId"])
        relationships.append({
            "fieldRelationshipId":"R3:"+output["ciiFieldId"],
            "relationshipDirection":"SOURCE_TO_EMITTED_FIELD",
            "sourceStage":"ENGINE_INPUT_XML", "sourceXmlSha256":effective_inventory["sourceXmlSha256"],
            "sourceFieldIds":[c["fieldId"] for c in candidates],
            "sourceFieldPath":(candidates[0]["sourceFieldPath"] if len(candidates)==1 else None),
            "sourceFieldOccurrence":(candidates[0]["sourceFieldOccurrence"] if len(candidates)==1 else None),
            "sourceComponentRefNo":(output.get("sourceComponentRefNo") or (
                source_node_by_id.get(candidates[0]["sourceNodeIdentity"],{}).get(
                    "componentRefNo") if len(candidates)==1 and
                    candidates[0]["sourceNodeIdentity"] else None)),
            "sourceBranchIdentity":(candidates[0]["sourceBranchIdentity"] if len(candidates)==1 else None),
            "sourceNodeIdentity":(candidates[0]["sourceNodeIdentity"] if len(candidates)==1 else None),
            "originalSourceToken":(candidates[0]["originalSourceToken"] if len(candidates)==1 else None),
            "sourceUnit":(candidates[0]["sourceUnit"] if len(candidates)==1 else None),
            "originalInputFieldRelationships":original_relations,
            "sourceFieldCandidates":[{"fieldId":c["fieldId"],
                                      "sourceFieldPath":c["sourceFieldPath"],
                                      "token":c["originalSourceToken"]}
                                     for c in candidates],
            "transformation":output["transformation"],
            "ciiElementIdentity":output["ciiElementIdentity"],
            "ciiField":output["ciiField"],
            "ciiFieldId":output["ciiFieldId"],
            "ciiFieldLocation":output["ciiFieldLocation"],
            "ciiAuxiliarySection":output["ciiAuxiliarySection"],
            "ciiAuxiliaryPointer":output["ciiAuxiliaryPointer"],
            "emittedValue":output["emittedValue"],
            "emittedToken":output["emittedToken"],
            "emittedUnit":output["emittedUnit"],
            "expectedWriterToken":output.get("expectedSerializedToken"),
            "writerFunction":output.get("writerFunction") or
                ("xml_to_cii2019_patched._patched_elements_payload_factory" if
                 output["ciiElementIdentity"] else None),
            "fromToSelection":output.get("selectionRule"),
            "valueStatus":output["valueStatus"],
            "precisionLoss":output.get("precisionLoss"),
            "inverseMappingUnique":inverse_unique,
            "reversibility":classification,
            "reasonCodes":list(dict.fromkeys(reason_codes)),
            "editTechnicalEligibility":technical,
            "physicalAuthority":physical,
            "engineeringEditApproved":False,
            "evidenceClass":evidence_class,
        })

    for field in effective_inventory["fields"]:
        if sources_used.get(field["fieldId"]):
            continue
        event=deleted_events.get(field["sourceNodeIdentity"])
        if event:
            cl, reasons="LOSSY",["SOURCE_NODE_REMOVED_NO_FICTIONAL_OUTPUT",event["stage"]]
        elif field["sourceFieldPath"] in ANNOTATIONS:
            cl,reasons="LOSSY",["SOURCE_ONLY_ANNOTATION_NOT_INDEPENDENTLY_IN_CII"]
        else:
            cl,reasons="UNRESOLVED",["NO_VERIFIED_FIELD_EMISSION"]
        component=source_node_by_id.get(field["sourceNodeIdentity"],{})
        if field["sourceFieldPath"]=="Node/Weight" and component.get("componentRefNo") and (
                len(component_nodes[component["componentRefNo"]])>1):
            reasons.append("DUPLICATE_COMPONENTREF_MASS_ALLOCATION_UNPROVEN")
        relationships.append({
            "fieldRelationshipId":"R3:UNEMITTED:"+field["fieldId"],
            "relationshipDirection":"SOURCE_WITHOUT_VERIFIED_EMISSION",
            "sourceStage":"ENGINE_INPUT_XML",
            "sourceXmlSha256":effective_inventory["sourceXmlSha256"],
            "sourceFieldIds":[field["fieldId"]],
            "sourceFieldPath":field["sourceFieldPath"],
            "sourceFieldOccurrence":field["sourceFieldOccurrence"],
            "sourceComponentRefNo":component.get("componentRefNo"),
            "sourceBranchIdentity":field["sourceBranchIdentity"],
            "sourceNodeIdentity":field["sourceNodeIdentity"],
            "originalSourceToken":field["originalSourceToken"],
            "sourceUnit":field["sourceUnit"],
            "originalInputFieldRelationships":[original_links.get(field["fieldId"])],
            "sourceFieldCandidates":[{"fieldId":field["fieldId"],
                                      "sourceFieldPath":field["sourceFieldPath"],
                                      "token":field["originalSourceToken"]}],
            "transformation":[event] if event else [],
            "ciiElementIdentity":None,"ciiField":None,"ciiFieldId":None,
            "ciiFieldLocation":None,"ciiAuxiliarySection":None,"ciiAuxiliaryPointer":None,
            "emittedValue":None,"emittedToken":None,"emittedUnit":None,
            "expectedWriterToken":None,"writerFunction":None,
            "fromToSelection":None,"valueStatus":"NOT_EMITTED_OR_UNRESOLVED",
            "precisionLoss":None,"inverseMappingUnique":False,
            "reversibility":cl,"reasonCodes":reasons,
            "editTechnicalEligibility":"HOLD","physicalAuthority":(
                "UNRESOLVED" if field["sourceFieldPath"]=="Node/Weight"
                else "NOT_APPLICABLE"),
            "engineeringEditApproved":False,"evidenceClass":evidence_class,
        })
    for relation in relationships:
        assert relation["reversibility"] in CLASSES
    classifications=dict(Counter(r["reversibility"] for r in relationships))
    by_class={name:classifications.get(name,0) for name in
              ("LOSSLESS","LOSSLESS_WITH_PROVENANCE","LOSSY","UNRESOLVED")}
    by_direction=dict(Counter(r["relationshipDirection"] for r in relationships))
    by_group=defaultdict(lambda:Counter())
    field_groups={f["fieldId"]:f["propertyGroup"] for f in effective_inventory["fields"]}
    output_groups={f["ciiFieldId"]:f["propertyGroup"] for f in fields}
    for relation in relationships:
        group=(output_groups.get(relation["ciiFieldId"]) if relation["ciiFieldId"]
               else field_groups.get(relation["sourceFieldIds"][0],"OTHER"))
        by_group[group][relation["reversibility"]]+=1
    sources_mapped=sum(1 for f in effective_inventory["fields"]
                       if sources_used.get(f["fieldId"]))
    assert sources_mapped + by_direction.get("SOURCE_WITHOUT_VERIFIED_EMISSION",0)==len(
        effective_inventory["fields"])
    assert by_direction.get("SOURCE_TO_EMITTED_FIELD",0)==len(fields)
    manifest=[]
    for relation in relationships:
        if relation["ciiFieldId"] is None:
            continue
        manifest.append({
            "ciiFieldId":relation["ciiFieldId"],
            "ciiField":relation["ciiField"],
            "sourceFieldIds":relation["sourceFieldIds"],
            "sourceStage":relation["sourceStage"],
            "reversibility":relation["reversibility"],
            "inverseMappingUnique":relation["inverseMappingUnique"],
            "editTechnicalEligibility":relation["editTechnicalEligibility"],
            "physicalAuthority":relation["physicalAuthority"],
            "engineeringEditApproved":False,
            "reasonCodes":relation["reasonCodes"],
        })
    return {
        "schema":"xml-cii-field-reversibility/r3","evidenceClass":evidence_class,
        "readOnly":True,"engineeringEditAuthority":"NOT_GRANTED",
        "originalInputStageStatus":source_stage_match["status"],
        "originalInputSha256":original_inventory["sourceXmlSha256"] if original_inventory else None,
        "engineInputSha256":effective_inventory["sourceXmlSha256"],
        "ciiSha256":field_inventory["ciiSha256"],
        "relationships":relationships,
        "editabilityManifest":{"schema":"xml-cii-technical-editability-manifest/r3",
                               "readOnly":True,
                               "policy":"Fidelity qualification alone never authorizes engineering edits",
                               "properties":manifest},
        "counts":{
            "sourceFieldsInventoried":len(effective_inventory["fields"]),
            "outputFieldsInventoried":len(fields),
            "originalInputFieldsInventoried":len(original_inventory["fields"])
                                             if original_inventory else None,
            "sourceFieldsWithEmittedRelationships":sources_mapped,
            "unemittedOrUnresolvedSourceFields":by_direction.get(
                "SOURCE_WITHOUT_VERIFIED_EMISSION",0),
            "outputFieldRelationships":by_direction.get("SOURCE_TO_EMITTED_FIELD",0),
            "allRelationshipRecords":len(relationships),
            "classifications":by_class,
            "propertyGroups":{k:dict(v) for k,v in sorted(by_group.items())},
            "outputFieldsWithDefaultsOrDerived":sum(
                not x["sourceFieldCandidates"] and x["valueStatus"] not in
                ("UNVERIFIED_SOURCE_MAPPING","HOLD_VALUE_DISCREPANCY") for x in fields),
            "discrepantOutputFields":value_verification["discrepancyCount"],
        },
        "lossEvents":[
            {"sourceNodeIdentity":s,"stage":e["stage"],
             "reason":e.get("deletionReason",e.get("reason")),
             "originalNodeNumber":e.get("nodeNumber"),
             "originalAdjacency":e.get("originalAdjacency"),
             "emittedAdjacencyAfterCollapse":e.get("emittedAdjacencyAfterCollapse")}
            for s,e in deleted_events.items()],
    }
