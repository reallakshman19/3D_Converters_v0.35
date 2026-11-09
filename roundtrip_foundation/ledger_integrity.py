"""Independent fail-closed structural audit of the R1 source/CII ledger.

No converter writer, code mutation, or physical mass authority. Reconstruct
relationships/indexes directly from ledger entities, not stored review claims.
"""
from __future__ import annotations

from collections import Counter, defaultdict
import json

from .snapshot_replay import require
from .full_pointer_validation import POINTER_FIELDS

STATUSES = {"EXACT_UNIQUE", "TRANSFORMED_WITH_LINEAGE", "AMBIGUOUS", "UNMATCHED", "CONFLICT"}
VERIFIED = {"EXACT_UNIQUE", "TRANSFORMED_WITH_LINEAGE"}
AUX_SECTIONS = tuple(POINTER_FIELDS)


def _check(ok, reason):
    require(bool(ok), "HOLD_LINEAGE_INVALID", reason)


def _relation_key(row):
    return json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def validate_integrity(ledger, expected_snapshot):
    _check(isinstance(ledger, dict) and ledger.get("schema") == "xml-cii-lineage-ledger/v1"
           and ledger.get("readOnly") is True, "Ledger schema/read-only mismatch")
    _check(ledger.get("physicalMassAuthority") == "NOT_ATTESTED",
           "Physical mass authority cannot be inferred from structural source lineage")
    snap = expected_snapshot
    identity = ledger.get("runIdentity", {})
    _check(identity.get("snapshotFingerprint") == snap.get("fingerprintSha256"),
           "Source snapshot fingerprint mismatch")
    _check(identity.get("engineInputSha256") == snap["inputs"]["engineInputXmlSha256"] and
           identity.get("sourceSha256") == snap["inputs"]["engineInputXmlSha256"] and
           identity.get("ciiSha256") == snap["inputs"]["originalCiiSha256"] and
           identity.get("configurationSha256") == snap["configuration"]["effectiveConfigSha256"],
           "Run source/CII/config digests differ from frozen snapshot")

    source_nodes = ledger.get("sourceNodes", [])
    processed = ledger.get("pythonPreprocessedNodes", [])
    elements = ledger.get("elements", [])
    auxiliaries = ledger.get("auxiliaryRecords", [])
    final_nodes = ledger.get("finalNodes", [])
    components = ledger.get("sourceComponents", [])
    transformations = ledger.get("transformations", [])
    relationships = ledger.get("relationships", [])
    counts = ledger.get("statistics", {})
    index = ledger.get("index", {})
    _check(all(isinstance(value, list) for value in (
        source_nodes, processed, elements, auxiliaries, final_nodes, components,
        transformations, relationships)), "Some ledger collections are not arrays")

    src = {x["identity"]: x for x in source_nodes}
    python = {x["identity"]: x for x in processed}
    _check(len(src) == len(source_nodes) and len(python) == len(processed),
           "Duplicate source/Python node identities")
    _check(all(x["sourceXmlDigest"] == identity["sourceSha256"] and
               x["identity"] == f"{identity['sourceSha256']}:{x['branchOrdinal']}:{x['nodeOrdinal']}"
               for x in source_nodes), "Source-node identity/digest is not from this run")
    _check(all(x["sourceXmlDigest"] == identity.get("pythonPreprocessedXmlSha256") and
               x["identity"] == f"{identity['pythonPreprocessedXmlSha256']}:{x['branchOrdinal']}:{x['nodeOrdinal']}"
               for x in processed), "Python node identity/digest is not from this run")
    _check(len({(x["branchOrdinal"], x["nodeOrdinal"]) for x in source_nodes}) == len(src),
           "Duplicate branch-qualified source ordinals")
    _check(len({(x["branchOrdinal"], x["nodeOrdinal"]) for x in processed}) == len(python),
           "Duplicate Python preprocessed ordinals")
    _check(counts.get("originalEnrichedXmlNodes") == len(src) and
           counts.get("engineInputNodes") == len(src) and
           counts.get("pythonPreprocessedNodes") == len(python) and
           counts.get("originalEnrichedXmlBranches") == counts.get("engineInputBranches") and
           counts.get("originalEnrichedXmlBranches", -1) >= len({x["branchOrdinal"] for x in source_nodes}) and
           counts.get("pythonPreprocessedBranches", -1) >= len({x["branchOrdinal"] for x in processed}),
           "Source/Python node or branch count inconsistent")

    component_lookup = {}
    source_to_component = {}
    for c in components:
        name = c["componentRefNo"]
        _check(name not in component_lookup and c.get("componentIdentityStatus") == "UNVERIFIED",
               "Duplicate/approved source component")
        component_lookup[name] = c
        _check(len(c["sourceNodes"]) == len(set(c["sourceNodes"])) and c["sourceNodes"],
               "Component membership is empty or duplicated")
        for sid in c["sourceNodes"]:
            _check(sid in src and sid not in source_to_component,
                   "Component node missing or assigned twice")
            expected_name = src[sid]["componentRefNo"] or "UNRESOLVED:" + sid
            _check(name == expected_name, "Source node belongs to different ComponentRefNo")
            source_to_component[sid] = name
    _check(set(src) == set(source_to_component),
           "Source nodes missing component membership")
    _check(index.get("componentToSourceNodes") ==
           {k: c["sourceNodes"] for k,c in component_lookup.items()},
           "Component reverse index does not match components")

    python_binding = index.get("pythonNodeToOriginalSourceNode", {})
    _check(isinstance(python_binding, dict), "Missing Python→source identity index")
    for pid, sid in python_binding.items():
        _check(pid in python and sid in src, "Python source binding has fabricated endpoint")
        a,b = python[pid],src[sid]
        _check(all(a[field] == b[field] for field in
                   ("branchOrdinal", "nodeOrdinal", "branchName", "position",
                    "componentType", "componentRefNo")),
               "Python source binding does not match original identity facts")

    elems = {e["elementIndex"]: e for e in elements}
    _check(len(elems) == len(elements) and set(elems) == set(range(1,len(elements)+1)),
           "Duplicate/missing/reordered ELEMENT indexes")
    _check(counts.get("finalCiiElements") == len(elements), "ELEMENT count mismatch")
    aux = {(r["section"],r["recordPointer"]):r for r in auxiliaries}
    _check(len(aux) == len(auxiliaries) and
           all(section in AUX_SECTIONS for section,pointer in aux),
           "Duplicate/unknown auxiliary record")
    aux_count = Counter(r["section"] for r in auxiliaries)
    for section in AUX_SECTIONS:
        _check({ptr for (name,ptr) in aux if name == section} ==
               set(range(1,aux_count[section]+1)),
               f"{section}: auxiliary record pointer gap or duplication")
    _check(counts.get("finalCiiRigids") == aux_count["RIGID"] and
           counts.get("otherAuxiliaryRecords") == len(auxiliaries)-aux_count["RIGID"],
           "Auxiliary counts incomplete")

    source_elements = defaultdict(set)
    source_final_nodes = defaultdict(set)
    full_links = defaultdict(list)
    final_incident = defaultdict(list)
    final_incident_sides = defaultdict(list)
    for e in elements:
        i=e["elementIndex"]
        _check(e.get("lineageStatus") in STATUSES and
               isinstance(e.get("pointers"),dict) and
               set(e["pointers"]) == set(POINTER_FIELDS),
               f"ELEMENT {i}: missing classification or one of 15 pointers")
        _check(e["rigidPointer"] == e["pointers"]["RIGID"],
               f"ELEMENT {i}: RIGID pointer alias mismatch")
        pair=e.get("sourceEdgeIdentity")
        _check(pair is None or (isinstance(pair,list) and len(pair)==2 and
                               all(sid in src for sid in pair)),
               f"ELEMENT {i}: fabricated sourceEdgeIdentity")
        _check((e["lineageStatus"] in VERIFIED)==(pair is not None),
               f"ELEMENT {i}: status/source pair proof inconsistent")
        for side, nodeidx in (("fromNode",0),("toNode",1)):
            key=(e["branchName"],e[side])
            final_incident[key].append(i)
            final_incident_sides[key].append((i,nodeidx))
            if pair:
                sid=pair[nodeidx]
                _check(src[sid]["branchName"] == e["branchName"],
                       f"ELEMENT {i}: cross-branch source identity")
                # An archived source may have been renumbered by real Python
                # preprocessing, but the qualified source must be linked to a
                # matching *emitted* branch + node number.
                eligible={python_binding[p["identity"]] for p in processed
                          if p["identity"] in python_binding and
                          p["branchName"] == e["branchName"] and
                          p["originalNodeNumber"] == e[side] and
                          p["componentType"] == src[sid]["componentType"]}
                _check(sid in eligible,
                       f"ELEMENT {i}: source ID cannot emit asserted final node")
                source_elements[sid].add(i)
                source_final_nodes[sid].add(key)
        for section,ptr in e["pointers"].items():
            _check(type(ptr) is int and 0 <= ptr <= aux_count[section],
                   f"ELEMENT {i}: out-of-range {section} pointer {ptr}")
            if ptr:
                full_links[(section,ptr)].append(i)

    finals = {(n["branchName"],n["ciiNodeNumber"]):n for n in final_nodes}
    _check(len(finals)==len(final_nodes) and set(finals)==set(final_incident),
           "Final-node count/branch-number membership disagrees with ELEMENT endpoints")
    verified_nodes=Counter()
    for key,n in finals.items():
        incident=final_incident[key]
        _check(n["connectedElements"] == incident,
               f"Final node {key}: missing or duplicated incident ELEMENT")
        known=set()
        unresolved=[]
        for i,side in final_incident_sides[key]:
            e=elems[i]
            pair=e.get("sourceEdgeIdentity")
            if pair is None:
                unresolved.append(i)
            else:
                known.add(pair[side])
        _check(n.get("sourceNodeCandidates")==sorted(known) and
               n.get("unverifiedIncidentElements")==sorted(set(unresolved)),
               f"Final node {key}: candidate/incident completeness mismatch")
        transformed_sources={event["sourceIdentity"] for event in transformations
                             if event.get("sourceIdentity")}
        qualified_id=(next(iter(known)) if len(known)==1 and not unresolved else None)
        expected_status=("AMBIGUOUS" if len(known)>1 else
                         "UNMATCHED" if qualified_id is None else
                         "TRANSFORMED_WITH_LINEAGE" if qualified_id in transformed_sources
                         else "EXACT_UNIQUE")
        expected_transform=("PYTHON_RENUMBER" if qualified_id in transformed_sources
                            else "NONE") if qualified_id else "UNRESOLVED"
        _check(n.get("lineageStatus")==expected_status and
               n.get("sourceNodeIdentity")==qualified_id and
               n.get("transformation")==expected_transform,
               f"Final node {key}: overclassified or conflicting identity")
        _check(expected_status in STATUSES, "Invalid final-node classification")
        verified_nodes[expected_status]+=1

    for a in auxiliaries:
        section,ptr=a["section"],a["recordPointer"]
        linked=full_links.get((section,ptr),[])
        _check(a.get("identity")==f"{section}:{ptr}" and
               a["linkedElements"]==linked and
               a["shared"]==(len(linked)>1) and
               a["unreferenced"]==(len(linked)==0) and
               a.get("physicalMassAuthority")=="UNVERIFIED",
               f"{section}:{ptr} auxiliary record association inconsistent")
        _check(set(a.get("sourceOwners",[])).issubset(src) and
               (a.get("writerWeightSourceNode") is None or
                a["writerWeightSourceNode"] in src),
               f"{section}:{ptr} references fabricated source owner")
        if section=="RIGID":
            _check(a.get("ownershipStatus") in STATUSES,
                   "Missing RIGID ownership classification")
            writer=a.get("writerWeightSourceNode")
            candidate_ref=src[writer]["componentRefNo"] if writer else None
            _check(a.get("ownerCandidates") == ([candidate_ref] if candidate_ref else []),
                   "RIGID ComponentRefNo candidate inconsistent with writer-selected source")
            _check(a.get("sourceOwners") in ([],[writer]) and
                   (a["ownershipStatus"] not in VERIFIED or a["sourceOwners"]==[writer]),
                   "RIGID physical owner/source candidate improperly promoted")

    _check(counts.get("elementMappings")==
           {k:sum(e["lineageStatus"]==k for e in elements) for k in sorted(STATUSES)},
           "ELEMENT lineage status counts manipulated")
    _check(counts.get("rigidOwnership")==
           {k:sum(a["ownershipStatus"]==k for a in auxiliaries
                  if a["section"]=="RIGID") for k in sorted(STATUSES)},
           "RIGID ownership status counts manipulated")
    fnc=counts.get("finalNodes",{})
    _check(fnc.get("count")==len(finals) and
           fnc.get("originalIdentityVerified")==verified_nodes["EXACT_UNIQUE"] and
           fnc.get("generatedRenumberedWithLineage")==verified_nodes["TRANSFORMED_WITH_LINEAGE"] and
           fnc.get("unresolved")==len(finals)-verified_nodes["EXACT_UNIQUE"]-
           verified_nodes["TRANSFORMED_WITH_LINEAGE"],
           "Final-node counts manipulated")
    _check(counts.get("unreferencedRigidPointers")==sum(
           a["section"]=="RIGID" and a["unreferenced"] for a in auxiliaries) and
           counts.get("sharedRigidPointers")==sum(
           a["section"]=="RIGID" and a["shared"] for a in auxiliaries),
           "RIGID pointer usage count manipulated")
    _check(counts.get("unresolvedSourceComponents")==sum(
           all(not source_elements.get(sid) for sid in c["sourceNodes"])
           for c in components), "Unresolved source-component count manipulated")
    _check(counts.get("events")==dict(Counter(t["stage"] for t in transformations)),
           "Python transformation counts manipulated")

    expected_relationships=[]
    for pid,sid in sorted(python_binding.items()):
        expected_relationships.append({
            "from":sid,"to":pid,"kind":"SOURCE_NODE_TO_PYTHON_PREPROCESSED_NODE",
            "evidence":"Exact branch/ordinal/component/position stage identity"})
    for c in components:
        for sid in c["sourceNodes"]:
            expected_relationships.append({
                "from":c["componentRefNo"],"to":sid,"kind":"COMPONENT_CONTAINS_NODE"})
    for sid in src:
        for i in sorted(source_elements.get(sid,set())):
            expected_relationships.append({
                "from":sid,"to":f"ELEMENT:{i}","kind":"SOURCE_NODE_TO_ELEMENT"})
        for branch,num in sorted(source_final_nodes.get(sid,set())):
            expected_relationships.append({
                "from":sid,"to":f"NODE:{branch}:{num}","kind":"SOURCE_NODE_TO_FINAL_NODE"})
    for e in elements:
        i=e["elementIndex"]
        for side,kind in (("fromNode","ELEMENT_FROM"),("toNode","ELEMENT_TO")):
            expected_relationships.append({
                "from":f"ELEMENT:{i}","to":f"NODE:{e['branchName']}:{e[side]}",
                "kind":kind})
        for section,ptr in e["pointers"].items():
            if ptr:
                expected_relationships.append({
                    "from":f"ELEMENT:{i}","to":f"{section}:{ptr}",
                    "kind":"ELEMENT_AUX_POINTER"})
    for event in transformations:
        sid=event.get("sourceIdentity")
        _check(not sid or sid in src,"Transformation references fabricated original source")
        intermediate=event.get("outputIdentity",event.get("intermediateNodeIdentity",""))
        _check(not sid or intermediate in python,
               "Transformation references fabricated Python output")
        if sid:
            expected_relationships.append({
                "from":sid,"to":intermediate,"kind":event["stage"]})
    _check(Counter(map(_relation_key,relationships)) ==
           Counter(map(_relation_key,expected_relationships)),
           "Relationship references missing, fabricated, duplicated or inconsistent")

    _check(index.get("sourceNodeToElements")=={
        sid:sorted(v) for sid,v in source_elements.items()},
        "Source→ELEMENT reverse index inconsistent")
    _check(index.get("sourceNodeToFinalNodes")=={
        sid:[{"branchName":b,"nodeNumber":n} for b,n in sorted(v)]
        for sid,v in source_final_nodes.items()},
        "Source→final-node reverse index inconsistent")
    _check(index.get("rigidPointerToElements")=={
        str(a["recordPointer"]):a["linkedElements"]
        for a in auxiliaries if a["section"]=="RIGID"},
        "RIGID→ELEMENT reverse index inconsistent")
    _check(index.get("rigidPointerToOwnerCandidates")=={
        str(a["recordPointer"]):{
            "sourceNodes":a["sourceOwners"],"componentRefs":a["ownerCandidates"],
            "writerWeightSourceNode":a.get("writerWeightSourceNode"),
            "ownershipStatus":a["ownershipStatus"]}
        for a in auxiliaries if a["section"]=="RIGID"},
        "RIGID ownership reverse index inconsistent")

    return {"status":"PASS","allElementsClassified":len(elements),
            "allRigidsClassified":aux_count["RIGID"],"allAuxiliaryPointerFieldsValidated":15,
            "relationshipsValidated":len(relationships),"noInvalidPointers":True,
            "readOnly":True}
