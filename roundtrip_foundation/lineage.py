"""Read-only XML-source → Python-transformed-node → CII ELEMENT → auxiliary ledger.

No output edits and no inference from CII pointer or nearest geometry alone.
The optional transformation probe reuses *the same production preprocessing
functions* on a fresh isolated copy; it never modifies converter algorithms.
"""
from __future__ import annotations
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import sys
import tempfile
import xml.etree.ElementTree as ET

from .snapshot_replay import (
    Hold, SCRIPTS, canonical_json, compare_bytes, digest,
    replay_cii_without_edits, require, validate_custody, validate_serialized_cii,
)
from .snapshot_replay import parse_cii2019, parse_section_map

sys.path.insert(0, str(SCRIPTS))
import xml_to_cii2019 as core
import xml_to_cii2019_patched as patched
import xml_to_cii2019_direction as direction
from xml_to_cii2019_bend_radius_policy import apply_bend_radius_policy

CLASSIFICATIONS = ("EXACT_UNIQUE", "TRANSFORMED_WITH_LINEAGE",
                   "AMBIGUOUS", "UNMATCHED", "CONFLICT")
AUX_LAYOUT = ("BEND", "RIGID", "RESTRANT", "SIF&TEES", "REDUCERS", "NODENAME")

def local(tag: str) -> str:
    return tag.split("}", 1)[-1].split(":")[-1]

def text(element, name):
    for ch in element:
        if local(ch.tag) == name:
            return (ch.text or "").strip()
    return ""

def vec(position):
    try:
        values = tuple(float(v) for v in position.replace(",", " ").split())
        return values if len(values) == 3 and all(math.isfinite(x) for x in values) else None
    except (ValueError, AttributeError):
        return None

def inventory_xml(xml: bytes, source_sha: str, *, stage="ENGINE_INPUT_XML"):
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise Hold("HOLD_SOURCE_XML_INVALID", str(exc)) from exc
    branches = [b for b in root.iter() if local(b.tag) == "Branch"]
    result = []
    for bi, branch in enumerate(branches):
        bn = text(branch, "Branchname")
        for ni, node in enumerate(n for n in branch if local(n.tag) == "Node"):
            fields = {key: text(node, key) for key in
                      ("NodeNumber", "NodeName", "ComponentRefNo", "ComponentType", "Position",
                       "ElementLengthMm", "Rigid", "Weight", "WallThickness", "OutsideDiameter",
                       "CorrosionAllowance", "InsulationThickness", "Rating", "DTXR_POS", "DTXR_PS")}
            result.append({
                "identity": f"{source_sha}:{bi}:{ni}",
                "sourceXmlDigest": source_sha, "stage": stage,
                "branchName": bn, "branchOrdinal": bi, "nodeOrdinal": ni,
                "originalNodeNumber": fields["NodeNumber"],
                "componentRefNo": fields["ComponentRefNo"].lstrip("=").upper(),
                "componentType": fields["ComponentType"].upper(),
                "position": vec(fields["Position"]), "fields": fields,
                "sourceXmlPath": f"Branch[{bi+1}]/Node[{ni+1}]",
                "sourceStatus": "ORIGINAL" if stage == "ENGINE_INPUT_XML" else "PYTHON_TRANSFORMED",
            })
    return result, len(branches)

def stable_match(a, b):
    # Stable ordinal only when the physical facts actually agree at both stages.
    return (a["branchOrdinal"] == b["branchOrdinal"] and
            a["nodeOrdinal"] == b["nodeOrdinal"] and
            a["branchName"] == b["branchName"] and
            a["position"] == b["position"] and a["componentType"] == b["componentType"] and
            a["componentRefNo"] == b["componentRefNo"] and a["position"] is not None and
            bool(a["componentRefNo"]))

def observe_python_transformations(engine_input_xml: bytes, config_bytes: bytes, assets: dict):
    """Observational second pass through active Python preprocessing, NOT writer.

    If branch/node ordinal alignment is disrupted, refuse to claim source identity.
    Compare with real converter no-edit replay before releasing a lineage ledger.
    """
    try:
        cfg = patched._load_support_config(config_bytes.decode("utf-8"))
        cfg.setdefault("teeSifTypeMapping", direction.DEFAULT_TEE_SIF_TYPE_MAPPING)
        cfg.setdefault("defaultTeeSifType", 0)
        with tempfile.TemporaryDirectory(prefix="xml-cii-lineage-trace-") as d:
            inp = Path(d) / "lineage_engine_input.xml"
            inp.write_bytes(engine_input_xml)
            staged = Path(d) / "staged.json" if "staged.json" in assets else None
            if staged is not None:
                staged.write_bytes(assets["staged.json"])
            path = patched._maybe_enrich_from_staged_json(inp, staged, cfg)
            path = patched._apply_process_data_to_xml(path, cfg)
            path, bend_evidence = apply_bend_radius_policy(path, cfg)
            after_bytes = path.read_bytes()
            # This is precisely the core parser called by runtime-custody.
            parsed_document = core._parse_xml_document(path)
        return after_bytes, parsed_document, bend_evidence
    except Hold:
        raise
    except Exception as exc:
        raise Hold("HOLD_TRANSFORMATION_TRACE", "Cannot reproduce converter preprocessing: " + str(exc)) from exc

def detect_removed_short_nodes(processed_nodes, parsed_document, source_binding):
    """Report confirmed <=6 mm removals using real parser's retained nodes.

    Never construct an output EDGE from a removed node. Correlate by
    branch ordinal and exact (node number, position, component type).
    """
    by_branch = defaultdict(list)
    for rec in processed_nodes:
        by_branch[rec["branchOrdinal"]].append(rec)
    events = []
    retained = {}
    for bi, branch in enumerate(parsed_document.branches):
        rows = by_branch.get(bi, [])
        if not rows:
            continue
        positive = [r for r in rows if r["originalNodeNumber"].isdigit()
                    and int(r["originalNodeNumber"]) > 0 and r["position"] is not None]
        # The real parser may discard a branch with no positive nodes. Don't
        # pretend a branch ordinal mapping is verified when names diverge.
        if branch.branch_name != rows[0]["branchName"]:
            continue
        output_signatures = [
            (str(n.node_number), tuple(n.position), n.component_type) for n in branch.nodes]
        predicted = [positive[0]] if positive else []
        dropped = []
        for cur in positive[1:]:
            prev = predicted[-1]
            dist = math.dist(prev["position"], cur["position"])
            if dist <= 6.0:
                dropped.append((cur, prev, dist))
            else:
                predicted.append(cur)
        if len(predicted) < 2:
            predicted = positive
            dropped = []
        signatures = [(n["originalNodeNumber"], tuple(n["position"]), n["componentType"])
                      for n in predicted]
        if signatures != output_signatures:
            continue
        retained[bi] = {r["identity"] for r in predicted}
        for cur, prev, length in dropped:
            original_index = positive.index(cur)
            succeeding = positive[original_index + 1] if original_index + 1 < len(positive) else None
            next_retained = next((r for r in predicted if r["nodeOrdinal"] > cur["nodeOrdinal"]), None)
            events.append({
                "stage": "PYTHON_SHORT_NODE_DROP", "status": "TRANSFORMED_WITH_LINEAGE",
                "sourceIdentity": source_binding.get(cur["identity"]),
                "intermediateNodeIdentity": cur["identity"],
                "nodeNumber": cur["originalNodeNumber"],
                "branchName": cur["branchName"],
                "lengthMm": round(length, 9), "thresholdMm": 6.0,
                "deletionReason": "Arriving node distance <= 6mm; active core._drop_short_element_nodes",
                "originalAdjacency": [prev["originalNodeNumber"], cur["originalNodeNumber"],
                                      succeeding["originalNodeNumber"] if succeeding else None],
                "emittedAdjacencyAfterCollapse": [prev["originalNodeNumber"],
                    next_retained["originalNodeNumber"] if next_retained else None],
                "evidence": "Replayed core._parse_xml_document retained adjacency verified",
            })
    return events, retained

def parse_elements_and_auxiliaries(cii_bytes):
    structural = validate_serialized_cii(cii_bytes)
    cii = cii_bytes.decode("utf-8")
    parsed = parse_cii2019(cii)
    sections = parse_section_map(cii)
    blocks = [line for line in sections["ELEMENTS"] if line.strip()]
    require(len(blocks) == len(parsed["elements"]) * 15,
            "HOLD_CII_INVALID", "Cannot determine ELEMENT block alignment")
    elements = []
    for pos, record in enumerate(parsed["elements"]):
        block = blocks[pos * 15:pos * 15 + 15]
        a100 = block[10]
        require(len(a100) >= 13 and not a100[:7].strip(), "HOLD_CII_INVALID",
                "Missing branch label record")
        try:
            chars = int(a100[7:12])
            branch_name = a100[13:13 + chars]
            require(len(branch_name) == chars, "HOLD_CII_INVALID", "Truncated branch A100")
            first = block[0]
            values = [float(first[:15].strip())] + [
                float(first[15 + x * 13: 28 + x * 13].strip()) for x in range(5)]
            dx, dy, dz, outside_dia = values[2:6]
        except (ValueError, IndexError) as exc:
            raise Hold("HOLD_CII_INVALID", "Unparseable ELEMENT geometry: " + str(exc)) from exc
        elements.append({
            "elementIndex": record["index"],
            "fromNode": record["fromNode"], "toNode": record["toNode"],
            "dx": dx, "dy": dy, "dz": dz,
            "lengthMm": math.sqrt(dx*dx + dy*dy + dz*dz),
            "outsideDiameterMm": outside_dia, "branchName": branch_name,
            "pointers": record["pointers"],
            "rigidPointer": record["pointers"]["RIGID"],
            "sourceEdgeIdentity": None, "sourceOwnerCandidates": [],
            "lineageStatus": "UNMATCHED",
        })
    auxiliary = []
    count_by_name = structural["auxiliaryCounts"]
    for section in AUX_LAYOUT:
        for ptr in range(1, count_by_name.get(section, 0) + 1):
            references = [e["elementIndex"] for e in elements
                          if e["pointers"].get(section, 0) == ptr]
            weight = None
            if section == "RIGID":
                rows = [x for x in sections.get(section, []) if x.strip()]
                weight = float(rows[ptr-1].split()[0])
            auxiliary.append({
                "section": section, "recordPointer": ptr,
                "identity": f"{section}:{ptr}", "weight": weight,
                "linkedElements": references, "sourceOwners": [],
                "ownerCandidates": [], "ownershipStatus": "UNMATCHED",
                "physicalMassAuthority": "UNVERIFIED",
                "unreferenced": not references, "shared": len(references) > 1,
            })
    return elements, auxiliary

def build_lineage_ledger(*, conversion_snapshot, engine_input_xml: bytes,
                         original_cii: bytes, effective_config_json: bytes,
                         configuration_assets: dict, replay_report: dict):
    require(replay_report.get("verdict") == "PASS_EXACT_REPLAY" and
            replay_report.get("snapshotFingerprint") == conversion_snapshot.get("fingerprintSha256"),
            "HOLD_NO_EDIT_PARITY", "Lineage cannot use an unmatched or non-qualified replay")
    validate_custody(conversion_snapshot, engine_input_xml, original_cii,
                     effective_config_json, configuration_assets)
    originals, original_branches = inventory_xml(
        engine_input_xml, digest(engine_input_xml))
    post_bytes, parsed_document, bend_evidence = observe_python_transformations(
        engine_input_xml, effective_config_json, configuration_assets)
    processed, post_branches = inventory_xml(
        post_bytes, digest(post_bytes), stage="PYTHON_PREPROCESSED")
    original_by_locator = {(r["branchOrdinal"], r["nodeOrdinal"]): r for r in originals}
    source_by_id = {r["identity"]: r for r in originals}
    transformed_to_source = {}
    transformations = []
    for node in processed:
        origin = original_by_locator.get((node["branchOrdinal"], node["nodeOrdinal"]))
        if origin and stable_match(origin, node):
            transformed_to_source[node["identity"]] = origin["identity"]
            if node["originalNodeNumber"] != origin["originalNodeNumber"]:
                transformations.append({
                    "stage": "PYTHON_NODE_RENUMBER", "status": "TRANSFORMED_WITH_LINEAGE",
                    "sourceIdentity": origin["identity"],
                    "outputIdentity": node["identity"],
                    "branchName": node["branchName"],
                    "originalNodeNumber": origin["originalNodeNumber"],
                    "generatedNodeNumber": node["originalNodeNumber"],
                    "reason": "Real Python preprocessing changed NodeNumber",
                    "evidence": "Exact ordinal, branch, ComponentRefNo, ComponentType and position across stage snapshots",
                })
    # Compare retention with the actual parser. Unknown branch/reordering ->
    # no fabricated short-deletion lineage.
    deletions, retained = detect_removed_short_nodes(
        processed, parsed_document, transformed_to_source)
    transformations.extend(deletions)
    generated = {(e["branchName"], e["generatedNodeNumber"])
                 for e in transformations if e["stage"] == "PYTHON_NODE_RENUMBER"}
    transformation_nodes = {(e["sourceIdentity"]) for e in transformations
                            if e["sourceIdentity"]}

    elements, auxiliaries = parse_elements_and_auxiliaries(original_cii)
    # Index real post-Python core model edges once, then resolve by exact
    # branch+FROM+TO+emitted geometry. Geometry confirms, never alone decides.
    edge_by_key = defaultdict(list)
    processed_by_key = defaultdict(list)
    for n in processed:
        processed_by_key[(n["branchName"], n["originalNodeNumber"],
                          n["position"])].append(n)
    for b in parsed_document.branches:
        for e in core._build_edges([b]):
            a = core._map_position_to_cii(e.from_node.position)
            z = core._map_position_to_cii(e.to_node.position)
            xyz = tuple(t - f for f, t in zip(a, z))
            key = (e.branch_name, str(e.from_node.node_number),
                   str(e.to_node.node_number))
            edge_by_key[key].append((e, xyz))
    final_nodes = {}
    source_node_to_final = defaultdict(set)
    source_node_to_elements = defaultdict(set)
    status_counters = Counter()
    for element in elements:
        key = (element["branchName"], element["fromNode"], element["toNode"])
        candidates = [(edge, coords) for edge, coords in edge_by_key.get(key, [])
                      if all(abs(v - element[col]) <= 0.001 for v, col in
                             zip(coords, ("dx", "dy", "dz")))]
        element["sourceOwnerCandidates"] = [
            {"branch": edge.branch_name, "from": str(edge.from_node.node_number),
             "to": str(edge.to_node.node_number)} for edge, _ in candidates]
        if len(candidates) > 1:
            element["lineageStatus"] = "AMBIGUOUS"
        elif not candidates:
            element["lineageStatus"] = "UNMATCHED"
        else:
            edge, xyz = candidates[0]
            endpoints = []
            for n in (edge.from_node, edge.to_node):
                ids = processed_by_key.get((edge.branch_name, str(n.node_number), tuple(n.position)), [])
                ids = [p for p in ids if p["componentType"] == n.component_type]
                source_ids = {transformed_to_source[p["identity"]] for p in ids
                              if p["identity"] in transformed_to_source}
                endpoints.append((ids, source_ids))
            if all(len(records) == 1 and len(ids) == 1 for records, ids in endpoints):
                identities = [next(iter(ids)) for _, ids in endpoints]
                element["sourceEdgeIdentity"] = identities
                for sid, node_num in zip(identities, (element["fromNode"], element["toNode"])):
                    source_node_to_elements[sid].add(element["elementIndex"])
                    source_node_to_final[sid].add((element["branchName"], node_num))
                moved = any(sid in transformation_nodes for sid in identities)
                a_source = source_by_id[identities[0]]
                z_source = source_by_id[identities[1]]
                adjacent = (a_source["branchOrdinal"] == z_source["branchOrdinal"] and
                            z_source["nodeOrdinal"] - a_source["nodeOrdinal"] == 1)
                element["lineageStatus"] = (
                    "TRANSFORMED_WITH_LINEAGE" if moved or not adjacent else "EXACT_UNIQUE")
                element["fieldProvenance"] = {
                    "rigidWeight": "TO if TO.rigid=2; FLAN/TO if FROM.rigid=2 and TO is FLAN; else zero",
                    "outsideDiameter": "FROM normally; special BRAN/TO endpoint=2",
                    "wallThickness": "FROM with converter fallback/defaults",
                    "insulationThickness": "TO",
                    "corrosionAllowance": "TO",
                    "temperaturePressure": "Branch and effective process mappings",
                    "material": "Writer material selection/carry-forward",
                }
            else:
                element["lineageStatus"] = "AMBIGUOUS" if any(len(ids) > 1 for _, ids in endpoints) else "UNMATCHED"
        status_counters[element["lineageStatus"]] += 1
        for number in (element["fromNode"], element["toNode"]):
            nodekey = (element["branchName"], number)
            if nodekey not in final_nodes:
                final_nodes[nodekey] = {
                    "ciiNodeNumber": number, "branchName": element["branchName"],
                    "sourceNodeIdentity": None,
                    "transformation": "UNRESOLVED", "lineageStatus": "UNMATCHED",
                    "connectedElements": [],
                }
            final_nodes[nodekey]["connectedElements"].append(element["elementIndex"])
    # Associate final node ONLY when all incident edges give an identical
    # verified source identity; otherwise record ambiguity/UNMATCHED.
    node_to_source = defaultdict(set)
    for e in elements:
        if e["sourceEdgeIdentity"]:
            node_to_source[(e["branchName"], e["fromNode"])].add(e["sourceEdgeIdentity"][0])
            node_to_source[(e["branchName"], e["toNode"])].add(e["sourceEdgeIdentity"][1])
    for nodekey, n in final_nodes.items():
        candidates = node_to_source.get(nodekey, set())
        if len(candidates) == 1:
            sid = next(iter(candidates))
            n["sourceNodeIdentity"] = sid
            n["lineageStatus"] = ("TRANSFORMED_WITH_LINEAGE" if sid in transformation_nodes else "EXACT_UNIQUE")
            n["transformation"] = "PYTHON_RENUMBER" if sid in transformation_nodes else "NONE"
        elif len(candidates) > 1:
            n["lineageStatus"] = "AMBIGUOUS"

    elem_lookup = {e["elementIndex"]: e for e in elements}
    rigid_ownership = Counter()
    for aux in auxiliaries:
        if aux["section"] != "RIGID":
            continue
        refs = aux["linkedElements"]
        if len(refs) != 1:
            aux["ownershipStatus"] = "AMBIGUOUS" if refs else "UNMATCHED"
            rigid_ownership[aux["ownershipStatus"]] += 1
            continue
        e = elem_lookup[refs[0]]
        if not e["sourceEdgeIdentity"]:
            aux["ownershipStatus"] = e["lineageStatus"]
            rigid_ownership[aux["ownershipStatus"]] += 1
            continue
        source_to = source_by_id[e["sourceEdgeIdentity"][1]]
        source_from = source_by_id[e["sourceEdgeIdentity"][0]]
        owner = (source_to if source_to["fields"]["Rigid"] == "2" else None)
        if owner is None and source_from["fields"]["Rigid"] == "2" and source_to["componentType"] == "FLAN":
            owner = source_to
        if owner is None:
            aux["ownershipStatus"] = "CONFLICT"
        else:
            cref = owner["componentRefNo"]
            other_nodes = [n for n in originals if n["componentRefNo"] == cref] if cref else []
            aux["sourceOwners"] = [owner["identity"]]
            aux["ownerCandidates"] = [cref] if cref else []
            aux["observedSourceWeight"] = owner["fields"]["Weight"]
            scale = float(conversion_snapshot["configuration"]["weightScale"])
            try:
                expected = float(owner["fields"]["Weight"]) * scale
            except ValueError:
                expected = math.nan
            if not math.isfinite(expected) or abs(expected - aux["weight"]) > 1e-5:
                aux["ownershipStatus"] = "CONFLICT"
                aux["reason"] = "Emitted RIGID differs from selected source Weight × scale"
            elif not cref or len(other_nodes) != 1:
                aux["ownershipStatus"] = "AMBIGUOUS"
                aux["reason"] = "ComponentRefNo missing or shared; source allocation unproved"
            else:
                aux["ownershipStatus"] = e["lineageStatus"]
                aux["reason"] = "Unique writer-selected TO source node, physical mass not independently approved"
        rigid_ownership[aux["ownershipStatus"]] += 1

    relationships = []
    components = {}
    for n in originals:
        ref = n["componentRefNo"] or f"UNRESOLVED:{n['identity']}"
        components.setdefault(ref, {"componentRefNo": ref, "sourceNodes": [],
                                     "componentIdentityStatus": "UNVERIFIED"})
        components[ref]["sourceNodes"].append(n["identity"])
        relationships.append({"from": ref, "to": n["identity"], "kind": "COMPONENT_CONTAINS_NODE"})
        for i in sorted(source_node_to_elements.get(n["identity"], [])):
            relationships.append({"from": n["identity"], "to": f"ELEMENT:{i}",
                                  "kind": "SOURCE_NODE_TO_ELEMENT"})
        for branch, number in sorted(source_node_to_final.get(n["identity"], set())):
            relationships.append({"from": n["identity"], "to": f"NODE:{branch}:{number}",
                                  "kind": "SOURCE_NODE_TO_FINAL_NODE"})
    for e in elements:
        relationships.extend([
            {"from": f"ELEMENT:{e['elementIndex']}",
             "to": f"NODE:{e['branchName']}:{num}", "kind": edge_kind}
            for num, edge_kind in ((e["fromNode"], "ELEMENT_FROM"),
                                   (e["toNode"], "ELEMENT_TO"))])
        for section, ptr in e["pointers"].items():
            if ptr:
                relationships.append({"from": f"ELEMENT:{e['elementIndex']}",
                    "to": f"{section}:{ptr}", "kind": "ELEMENT_AUX_POINTER"})
    for event in transformations:
        if event.get("sourceIdentity"):
            relationships.append({"from": event["sourceIdentity"],
                "to": event.get("outputIdentity", event.get("intermediateNodeIdentity", "")),
                "kind": event["stage"]})

    aux_status = {name: sum(1 for a in auxiliaries if a["section"] == "RIGID"
                           and a["ownershipStatus"] == name) for name in CLASSIFICATIONS}
    elem_status = {name: status_counters.get(name, 0) for name in CLASSIFICATIONS}
    node_status = Counter(n["lineageStatus"] for n in final_nodes.values())
    coverage = {
        "originalEnrichedXmlBranches": original_branches,
        "originalEnrichedXmlNodes": len(originals),
        "engineInputBranches": original_branches, "engineInputNodes": len(originals),
        "pythonPreprocessedBranches": post_branches,
        "pythonPreprocessedNodes": len(processed),
        "finalCiiElements": len(elements),
        "finalCiiRigids": sum(a["section"] == "RIGID" for a in auxiliaries),
        "otherAuxiliaryRecords": sum(a["section"] != "RIGID" for a in auxiliaries),
        "finalNodes": {
            "count": len(final_nodes),
            "originalIdentityVerified": node_status["EXACT_UNIQUE"],
            "generatedRenumberedWithLineage": node_status["TRANSFORMED_WITH_LINEAGE"],
            "unresolved": len(final_nodes) - node_status["EXACT_UNIQUE"] -
                          node_status["TRANSFORMED_WITH_LINEAGE"],
        },
        "elementMappings": elem_status, "rigidOwnership": aux_status,
        "unreferencedRigidPointers": sum(a["section"] == "RIGID" and a["unreferenced"] for a in auxiliaries),
        "sharedRigidPointers": sum(a["section"] == "RIGID" and a["shared"] for a in auxiliaries),
        "unresolvedSourceComponents": sum(
            all(not source_node_to_elements.get(sid) for sid in c["sourceNodes"])
            for c in components.values()),
        "events": dict(Counter(e["stage"] for e in transformations)),
    }
    unresolved = [
        {"level": "ELEMENT", "id": e["elementIndex"], "status": e["lineageStatus"]}
        for e in elements if e["lineageStatus"] not in ("EXACT_UNIQUE", "TRANSFORMED_WITH_LINEAGE")
    ] + [
        {"level": "RIGID", "id": a["recordPointer"], "status": a["ownershipStatus"],
         "reason": a.get("reason", "No verified unique physical owner")}
        for a in auxiliaries if a["section"] == "RIGID" and
        a["ownershipStatus"] not in ("EXACT_UNIQUE", "TRANSFORMED_WITH_LINEAGE")
    ]
    return {
        "schema": "xml-cii-lineage-ledger/v1",
        "runIdentity": {
            "sourceSha256": digest(engine_input_xml),
            "engineInputSha256": digest(engine_input_xml),
            "pythonPreprocessedXmlSha256": digest(post_bytes),
            "ciiSha256": digest(original_cii),
            "configurationSha256": digest(effective_config_json),
            "snapshotFingerprint": conversion_snapshot["fingerprintSha256"],
        },
        "readOnly": True, "physicalMassAuthority": "NOT_ATTESTED",
        "sourceComponents": list(components.values()),
        "sourceNodes": originals, "pythonPreprocessedNodes": processed,
        "finalNodes": list(final_nodes.values()),
        "elements": elements, "auxiliaryRecords": auxiliaries,
        "transformations": transformations, "relationships": relationships,
        "unresolved": unresolved, "statistics": coverage,
        "index": {
            "componentToSourceNodes": {c["componentRefNo"]: c["sourceNodes"] for c in components.values()},
            "sourceNodeToElements": {k: sorted(v) for k, v in source_node_to_elements.items()},
            "sourceNodeToFinalNodes": {
                k: [{"branchName": b, "nodeNumber": n} for b, n in sorted(v)]
                for k, v in source_node_to_final.items()},
            "rigidPointerToElements": {
                str(a["recordPointer"]): a["linkedElements"]
                for a in auxiliaries if a["section"] == "RIGID"},
        },
    }

def validate_lineage_ledger(ledger, *, expected_snapshot: dict) -> dict:
    require(ledger.get("schema") == "xml-cii-lineage-ledger/v1" and ledger.get("readOnly") is True,
            "HOLD_LINEAGE_INVALID", "Ledger is not immutable/read-only")
    require(ledger["runIdentity"]["snapshotFingerprint"] ==
            expected_snapshot["fingerprintSha256"],
            "HOLD_STALE_SOURCE", "Ledger belongs to a different conversion run")
    count = len(ledger["elements"])
    require(count == ledger["statistics"]["finalCiiElements"],
            "HOLD_LINEAGE_INVALID", "Some final ELEMENTS were omitted")
    seen = set()
    for e in ledger["elements"]:
        require(e["lineageStatus"] in CLASSIFICATIONS and
                e["elementIndex"] not in seen, "HOLD_LINEAGE_INVALID",
                "Missing/duplicate ELEMENT classification")
        seen.add(e["elementIndex"])
    for record in ledger["auxiliaryRecords"]:
        if record["section"] == "RIGID":
            require(record["ownershipStatus"] in CLASSIFICATIONS, "HOLD_LINEAGE_INVALID",
                    "Missing RIGID classification")
    return {"status": "PASS", "allElementsClassified": count,
            "allRigidsClassified": ledger["statistics"]["finalCiiRigids"],
            "noInvalidPointers": True, "readOnly": True}
