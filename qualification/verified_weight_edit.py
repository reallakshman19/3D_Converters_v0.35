"""Bounded qualification: uniquely TO-owned EnrichedXML Weight -> REAL CII re-extraction.

This is a Python service (equivalent to the requested async JS interface), not a
general EnrichedXML<->CII inverse. It never edits the CII directly and publishes
nothing on refusal. The separate CLI/test harness owns writing verified outputs.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from xml.parsers import expat

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "converters" / "scripts"
sys.path.insert(0, str(SCRIPTS))
import xml_to_cii2019 as core
from cii2019_reparse_proof import parse_cii2019
from cii2019_section_rules import assert_cii2019_sections_valid, parse_section_map

# Real converter and every in-tree module on its active runtime-custody path.
PINNED_FILES = (
    "xml_to_cii2019_runtime_custody.py",
    "xml_to_cii2019_direction.py",
    "xml_to_cii2019_patched.py",
    "xml_to_cii2019.py",
    "xml_to_cii2019_bend_radius_policy.py",
    "xml_to_cii2019_master_addon.py",
    "cii2019_section_rules.py",
    "cii2019_reparse_proof.py",
)

class Refusal(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code

def demand(test, code, message):
    if not test:
        raise Refusal(code, message)

def sha(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()

def decimal(value) -> Decimal:
    try:
        # Do not silently accept binary float NaN/inf or comma-separated values.
        if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
            raise InvalidOperation
        text = str(value)
        demand(bool(re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?", text)),
               "REFUSE_WEIGHT_FORMAT", "Weight must be an unambiguous decimal number")
        d = Decimal(text)
        demand(d.is_finite(), "REFUSE_WEIGHT_FORMAT", "Non-finite proposed weight")
        return d
    except (InvalidOperation, ValueError):
        raise Refusal("REFUSE_WEIGHT_FORMAT", "Invalid proposed weight") from None

def local(tag):
    return tag.split("}", 1)[-1].split(":")[-1]

def child_text(element, field):
    for child in element:
        if local(child.tag) == field:
            return (child.text or "").strip()
    return ""

def normalized_ref(raw):
    return raw.strip().lstrip("=").upper()

def code_digests():
    return {name: sha((SCRIPTS / name).read_bytes()) for name in PINNED_FILES}

def pinned_options():
    # Bounded exercise: no staged JSON, no TopoFix, no ambiguous override lane.
    return {
        "coordsMode": "first",
        "weightScale": "10",
        "splitCondensedValveFlange": False,
        "useRestraintTypeBasedOnJson": True,
        "stagedJson": "",
        "effectiveSupportConfigJson": "{}",
    }

def converter_command(input_path: Path, output_path: Path, snapshot: dict) -> list[str]:
    opt = snapshot["options"]
    demand(opt == pinned_options(), "HOLD_UNQUALIFIED_SETTINGS",
           "Converter options are outside this qualification's pinned settings")
    return [
        sys.executable, str(SCRIPTS / "xml_to_cii2019_runtime_custody.py"),
        "--input", str(input_path), "--output", str(output_path),
        "--coords-mode", opt["coordsMode"],
        "--weight-scale", opt["weightScale"],
        "--support-config-json", opt["effectiveSupportConfigJson"],
        "--no-split-condensed-valve-flange",
        "--use-restraint-type-based-on-json",
    ]

def run_converter(xml_bytes: bytes, snapshot: dict):
    with tempfile.TemporaryDirectory(prefix="cii-qualification-") as tmp:
        source = Path(tmp) / "enriched.xml"
        output = Path(tmp) / "regenerated.cii"
        source.write_bytes(xml_bytes)
        command = converter_command(source, output, snapshot)
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        demand(completed.returncode == 0 and output.is_file(),
               "HOLD_CONVERTER_ERROR", "Existing converter failed: " + completed.stderr[-800:])
        return output.read_bytes(), {
            "commandTemplate": [part.replace(str(source), "<INPUT_XML>").replace(str(output), "<OUTPUT_CII>")
                                for part in command],
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr[-1600:].strip(),
        }

def create_snapshot(original_xml: bytes, original_cii: bytes):
    opt = pinned_options()
    return {
        "schema": "XmlCii2019CoderQualificationSnapshot.v1",
        "originalXmlSha256": sha(original_xml),
        "originalCiiSha256": sha(original_cii),
        "originalXmlBytes": len(original_xml),
        "originalCiiBytes": len(original_cii),
        "options": opt,
        "converterFilesSha256": code_digests(),
        "pythonVersion": sys.version.split()[0],
        "sourceStage": "ENRICHED_XML_INPUT_TO_RUNTIME_CUSTODY",
        "engine": "xml_to_cii2019_runtime_custody.py",
        "note": "Native Python bounded sample, not complete JS Preview/Pyodide custody",
    }

def validate_snapshot(xml_bytes, cii_bytes, snapshot):
    demand(isinstance(snapshot, dict) and snapshot.get("schema") ==
           "XmlCii2019CoderQualificationSnapshot.v1",
           "HOLD_SNAPSHOT", "Missing or invalid conversion snapshot")
    demand(sha(xml_bytes) == snapshot.get("originalXmlSha256") and
           len(xml_bytes) == snapshot.get("originalXmlBytes"),
           "HOLD_STALE_SOURCE", "Original XML does not match frozen source fingerprint")
    demand(sha(cii_bytes) == snapshot.get("originalCiiSha256") and
           len(cii_bytes) == snapshot.get("originalCiiBytes"),
           "HOLD_STALE_CII", "Original CII does not match frozen baseline")
    demand(snapshot.get("sourceStage") == "ENRICHED_XML_INPUT_TO_RUNTIME_CUSTODY",
           "HOLD_SNAPSHOT_STAGE", "Snapshot has an unsupported edit stage")
    demand(snapshot.get("engine") == "xml_to_cii2019_runtime_custody.py" and
           snapshot.get("options") == pinned_options(),
           "HOLD_UNQUALIFIED_SETTINGS", "Converter effective settings are not pinned")
    demand(snapshot.get("converterFilesSha256") == code_digests() and
           snapshot.get("pythonVersion") == sys.version.split()[0],
           "HOLD_CONVERTER_IDENTITY", "Converter sources or interpreter changed")

def source_nodes(xml_bytes: bytes):
    """XML parser for physical owner facts, plus an Expat byte-span index."""
    demand(not re.search(rb"<!\s*(DOCTYPE|ENTITY)\b", xml_bytes, re.I),
           "HOLD_UNSUPPORTED_XML", "DOCTYPE/ENTITY declarations are not permitted")
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise Refusal("HOLD_MALFORMED_XML", str(exc)) from exc
    demand(local(root.tag) == "PipeStressExport", "HOLD_SOURCE_OWNER",
           "Only PSI116 PipeStressExport is covered by the sample")
    records = []
    branches = [e for e in root.iter() if local(e.tag) == "Branch"]
    for branch_ordinal, branch in enumerate(branches):
        branch_name = child_text(branch, "Branchname")
        demand(bool(branch_name), "HOLD_SOURCE_OWNER", "Missing Branchname")
        for node_ordinal, node in enumerate(n for n in branch if local(n.tag) == "Node"):
            fields = {key: child_text(node, key) for key in (
                "NodeNumber", "ComponentRefNo", "ComponentType", "Rigid", "Weight", "Position")}
            records.append({
                "branchOrdinal": branch_ordinal, "nodeOrdinal": node_ordinal,
                "branchName": branch_name, "nodeNumber": fields["NodeNumber"],
                "componentRefNo": normalized_ref(fields["ComponentRefNo"]),
                "componentType": fields["ComponentType"].upper(),
                "rigid": fields["Rigid"], "weight": fields["Weight"],
                "position": fields["Position"],
            })
    # Byte-aware lexical locator. Expat reports byte offsets in original UTF-8.
    stack = []
    spans = {}
    branch_index = -1
    node_ordinals = {}
    parser = expat.ParserCreate()
    def start_tag(raw_name, attrs):
        nonlocal branch_index
        name = local(raw_name)
        parent = stack[-1] if stack else None
        frame = {"tag": name, "branch": parent["branch"] if parent else None,
                 "node": parent["node"] if parent else None, "textStart": None}
        if name == "Branch":
            branch_index += 1
            node_ordinals[branch_index] = 0
            frame["branch"] = branch_index
        elif name == "Node" and parent and parent["tag"] == "Branch":
            frame["node"] = node_ordinals[frame["branch"]]
            node_ordinals[frame["branch"]] += 1
        elif name == "Weight" and parent and parent["tag"] == "Node":
            pos = parser.CurrentByteIndex
            # Opening tag syntax may contain quoted '>', hence quote-aware scan.
            quote = None
            j = pos + 1
            while j < len(xml_bytes):
                ch = xml_bytes[j]
                if quote is not None:
                    if ch == quote:
                        quote = None
                elif ch in (ord("'"), ord('"')):
                    quote = ch
                elif ch == ord(">"):
                    break
                j += 1
            demand(j < len(xml_bytes), "HOLD_MALFORMED_XML", "Weight start tag not closed")
            frame["textStart"] = j + 1
        stack.append(frame)
    def end_tag(raw_name):
        frame = stack.pop()
        demand(frame["tag"] == local(raw_name), "HOLD_MALFORMED_XML", "Unbalanced tag")
        if frame["tag"] == "Weight" and frame["textStart"] is not None:
            stop = parser.CurrentByteIndex
            value = xml_bytes[frame["textStart"]:stop]
            demand(b"<" not in value and b"&" not in value,
                   "HOLD_UNSUPPORTED_XML", "Weight must be direct plain decimal text")
            key = (frame["branch"], frame["node"])
            demand(key not in spans, "HOLD_SOURCE_OWNER", "Duplicate direct Weight fields")
            spans[key] = (frame["textStart"], stop, value)
    parser.StartElementHandler = start_tag
    parser.EndElementHandler = end_tag
    try:
        parser.Parse(xml_bytes, True)
    except expat.ExpatError as exc:
        raise Refusal("HOLD_MALFORMED_XML", str(exc)) from exc
    return records, spans

def source_identity(snapshot, node):
    return {
        "xmlSha256": snapshot["originalXmlSha256"],
        "branchOrdinal": node["branchOrdinal"],
        "nodeOrdinal": node["nodeOrdinal"],
        "branchName": node["branchName"],
        "nodeNumber": node["nodeNumber"],
        "componentRefNo": node["componentRefNo"],
    }

def resolve_unique_source(original_xml, snapshot, identity):
    nodes, spans = source_nodes(original_xml)
    mandatory = {"xmlSha256", "branchOrdinal", "nodeOrdinal", "branchName",
                 "nodeNumber", "componentRefNo"}
    demand(isinstance(identity, dict) and mandatory.issubset(identity),
           "HOLD_SOURCE_OWNER", "Full run-pinned source identity is required")
    demand(identity["xmlSha256"] == snapshot["originalXmlSha256"],
           "HOLD_STALE_SOURCE", "Source identity references another XML fingerprint")
    candidates = [n for n in nodes if source_identity(snapshot, n) == identity]
    demand(len(candidates) == 1, "HOLD_SOURCE_OWNER", "Source identity not unique")
    owner = candidates[0]
    demand(owner["nodeNumber"].isdigit() and int(owner["nodeNumber"]) > 0,
           "HOLD_SOURCE_OWNER", "Generated, negative or unresolved NodeNumber cannot be used")
    demand(bool(owner["componentRefNo"]) and owner["componentType"] in {"RIGID", "FLAN"} and
           owner["rigid"] == "2",
           "HOLD_SOURCE_OWNER", "Source is not an explicit TO-owned RIGID node")
    # This exercise refuses shared physical component refs rather than apportion mass.
    demand(sum(n["componentRefNo"] == owner["componentRefNo"] for n in nodes) == 1,
           "HOLD_SOURCE_OWNER", "Physical component ref is shared by source nodes")
    demand((owner["branchOrdinal"], owner["nodeOrdinal"]) in spans,
           "HOLD_SOURCE_OWNER", "Selected Weight byte span missing")
    start, end, token = spans[(owner["branchOrdinal"], owner["nodeOrdinal"])]
    demand(token.decode("utf-8").strip() == owner["weight"],
           "HOLD_SOURCE_OWNER", "Parsed and lexical Weight disagree")
    old = decimal(owner["weight"])
    demand(old >= 0, "HOLD_SOURCE_OWNER", "Original source mass is negative")
    return owner, nodes, (start, end, token), old

def cii_inventory(cii_bytes):
    try:
        text = cii_bytes.decode("utf-8")
        assert_cii2019_sections_valid(text)
        proof = parse_cii2019(text)
        sections = parse_section_map(text)
        elem_lines = [l for l in sections["ELEMENTS"] if l.strip()]
        rigid_lines = [l for l in sections["RIGID"] if l.strip()]
        demand(len(elem_lines) == 15 * len(proof["elements"]),
               "HOLD_CII_STRUCTURE", "ELEMENTS record count is inconsistent")
        rows = []
        for index, item in enumerate(proof["elements"]):
            block = elem_lines[index * 15:(index + 1) * 15]
            metadata = block[10]
            demand(metadata[:7].strip() == "" and len(metadata) >= 13,
                   "HOLD_CII_STRUCTURE", "Missing fixed-format branch metadata")
            n = int(metadata[7:12])
            branch = metadata[13:13 + n]
            demand(len(branch) == n, "HOLD_CII_STRUCTURE", "Truncated branch metadata")
            geom = block[0]
            demand(len(geom) >= 80, "HOLD_CII_STRUCTURE", "Truncated geometry")
            nums = [geom[:15], *[geom[15 + 13 * j:28 + 13 * j] for j in range(5)]]
            numbers = [float(x.strip().replace("D", "E")) for x in nums]
            row = {**item, "branchName": branch,
                   "dxDyDz": numbers[2:5],
                   "rigidPointer": item["pointers"]["RIGID"]}
            rows.append(row)
        for row in rows:
            p = row["rigidPointer"]
            demand(p == 0 or 1 <= p <= len(rigid_lines),
                   "HOLD_CII_STRUCTURE", "ELEMENT references absent RIGID")
        return {"elements": rows, "rigidWeights": [
            decimal(line.split()[0]) for line in rigid_lines],
            "sectionNames": proof["sectionOrder"],
            "control": next(x for x in proof["sections"] if x["name"] == "CONTROL"),
            "modelHash": proof["reparsedModelHashSha256"]}
    except Refusal:
        raise
    except Exception as exc:
        raise Refusal("HOLD_CII_STRUCTURE", f"Independent CII validation failed: {exc}") from exc

def owner_edge(original_xml, owner, inventory):
    # Directly inspect actual converter parser and writer weight selection rule.
    with tempfile.TemporaryDirectory(prefix="cii-owner-") as tmp:
        path = Path(tmp) / "input.xml"
        path.write_bytes(original_xml)
        parsed = core._parse_xml_document(path)
    edges = core._build_edges(parsed.branches)
    qualified = []
    for edge in edges:
        if edge.branch_name != owner["branchName"]:
            continue
        if str(edge.to_node.node_number) != owner["nodeNumber"] or edge.to_node.rigid != 2:
            continue
        if decimal(edge.to_node.weight) != decimal(owner["weight"]):
            continue
        if core._rigid_weight_for_edge(edge) != edge.to_node.weight:
            continue
        mapped_a = core._map_position_to_cii(edge.from_node.position)
        mapped_b = core._map_position_to_cii(edge.to_node.position)
        vector = [b - a for a, b in zip(mapped_a, mapped_b)]
        candidates = [r for r in inventory["elements"] if
                      r["branchName"] == edge.branch_name and
                      r["toNode"] == str(edge.to_node.node_number) and
                      r["fromNode"] == str(edge.from_node.node_number) and
                      r["rigidPointer"] > 0 and
                      all(abs(a - b) <= 0.05 for a, b in zip(vector, r["dxDyDz"]))]
        if len(candidates) == 1:
            qualified.append((edge, candidates[0]))
    demand(len(qualified) == 1, "HOLD_SOURCE_OWNER",
           "No unique source→writer-selected edge→CII RIGID lineage")
    edge, element = qualified[0]
    other = [e for e in inventory["elements"] if
             e["rigidPointer"] == element["rigidPointer"] and e["index"] != element["index"]]
    demand(not other, "HOLD_SOURCE_OWNER", "RIGID auxiliary record is shared by ELEMENTS")
    return edge, element

def patch_only_weight(xml_bytes, span, new_mass: Decimal):
    start, end, raw = span
    match = re.fullmatch(rb"(\s*)([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)(\s*)", raw)
    demand(bool(match), "HOLD_UNSUPPORTED_XML", "Weight is not a single lexical decimal")
    numeric = format(new_mass, "f").encode("ascii")
    replacement = match.group(1) + numeric + match.group(3)
    revised = xml_bytes[:start] + replacement + xml_bytes[end:]
    demand(revised[:start] == xml_bytes[:start] and
           revised[start + len(replacement):] == xml_bytes[end:],
           "HOLD_XML_PARITY", "Unrelated XML bytes changed")
    return revised, {"startByte": start + len(match.group(1)),
                      "endByteExclusive": end - len(match.group(3)),
                      "before": match.group(2).decode("ascii"),
                      "after": numeric.decode("ascii")}

def cii_weight_span(cii_bytes, pointer):
    # RIGID is one physical line per pointer, with 15-column first numeric field.
    cursor = 0
    in_rigid = False
    found = 0
    for full in cii_bytes.splitlines(keepends=True):
        line = full.rstrip(b"\r\n")
        if line.lstrip().startswith(b"#$ "):
            in_rigid = line.strip() == b"#$ RIGID"
        elif in_rigid and line.strip():
            found += 1
            if found == pointer:
                demand(len(line) >= 28, "HOLD_CII_STRUCTURE", "Truncated RIGID record")
                return cursor, cursor + 15
        cursor += len(full)
    raise Refusal("HOLD_CII_STRUCTURE", "RIGID record pointer not found")

def verify_cii_diff(before, after, pointer):
    a, b = cii_weight_span(before, pointer), cii_weight_span(after, pointer)
    demand(len(before) == len(after) and a == b and
           before[:a[0]] == after[:b[0]] and before[a[1]:] == after[b[1]:],
           "HOLD_ENGINEERING_DIFF", "Unexplained engineering bytes outside one RIGID weight field")
    return {"authorizedCiiSpan": {"startByte": a[0], "endByteExclusive": a[1]},
            "unexplainedEngineeringByteDifferences": 0}

def apply_verified_xml_weight_edit(*, original_xml: bytes, original_cii: bytes,
                                   conversion_snapshot: dict, source_identity: dict,
                                   proposed_weight_kg=None, proposed_cii_weight=None,
                                   approved=False):
    """Return {'ok': True, 'revisedXml': bytes, 'regeneratedCii': bytes, ...}
    or {'ok': False, 'code': ..., 'revisedXml': None, 'regeneratedCii': None}.
    """
    try:
        demand(approved is True, "HOLD_UNAPPROVED", "Catalog proposal has no explicit approval")
        validate_snapshot(original_xml, original_cii, conversion_snapshot)
        scale = decimal(conversion_snapshot["options"]["weightScale"])
        demand(scale > 0, "HOLD_UNQUALIFIED_SETTINGS", "Invalid mass-to-CII scale")
        demand((proposed_weight_kg is None) != (proposed_cii_weight is None),
               "REFUSE_WEIGHT_FORMAT", "Pass exactly one of kg or CII output weight")
        desired_kg = decimal(proposed_weight_kg) if proposed_cii_weight is None else decimal(proposed_cii_weight) / scale
        demand(desired_kg >= 0, "REFUSE_WEIGHT_FORMAT", "Negative weights are not permitted")
        desired_cii = desired_kg * scale
        owner, source, span, original_kg = resolve_unique_source(original_xml, conversion_snapshot, source_identity)
        original_inv = cii_inventory(original_cii)
        edge, record = owner_edge(original_xml, owner, original_inv)
        pointer = record["rigidPointer"]
        demand(original_inv["rigidWeights"][pointer - 1] == original_kg * scale,
               "HOLD_SOURCE_OWNER", "Emitted RIGID mass does not equal verified physical source mass × scale")
        # Authentic baseline replay: do not accept an unrelated supplied CII.
        baseline_replay, baseline_run = run_converter(original_xml, conversion_snapshot)
        demand(baseline_replay == original_cii,
               "HOLD_NO_EDIT_PARITY", "Real converter no-edit baseline differs byte-for-byte")
        revised, xml_span = patch_only_weight(original_xml, span, desired_kg)
        re_records, _ = source_nodes(revised)
        matching = [n for n in re_records if n["branchOrdinal"] == owner["branchOrdinal"] and
                    n["nodeOrdinal"] == owner["nodeOrdinal"]]
        demand(len(matching) == 1 and
               matching[0]["weight"] == format(desired_kg, "f") and
               matching[0]["componentRefNo"] == owner["componentRefNo"] and
               matching[0]["nodeNumber"] == owner["nodeNumber"],
               "HOLD_XML_PARITY", "Revised XML source owner read-back failed")
        regenerated, revised_run = run_converter(revised, conversion_snapshot)
        new_inv = cii_inventory(regenerated)
        # Resolve fresh CII record by verified source and writer edge, not old pointer alone.
        new_edge, updated_record = owner_edge(revised, matching[0], new_inv)
        new_pointer = updated_record["rigidPointer"]
        demand(new_inv["rigidWeights"][new_pointer - 1] == desired_cii,
               "HOLD_CII_READBACK", "Re-extracted RIGID weight differs from source × pinned scale")
        demand(record["branchName"] == updated_record["branchName"] and
               record["fromNode"] == updated_record["fromNode"] and
               record["toNode"] == updated_record["toNode"] and
               record["dxDyDz"] == updated_record["dxDyDz"],
               "HOLD_SOURCE_OWNER", "Regenerated physical element lineage changed")
        demand(original_inv["sectionNames"] == new_inv["sectionNames"] and
               len(original_inv["elements"]) == len(new_inv["elements"]) and
               len(original_inv["rigidWeights"]) == len(new_inv["rigidWeights"]),
               "HOLD_ENGINEERING_DIFF", "CII section topology/counts changed")
        # Expect exactly the verified RIGID field to change; other bytes stay fixed.
        diff = verify_cii_diff(original_cii, regenerated, new_pointer)
        audit = {
            "schema": "XmlCii2019QualifiedWeightEditAudit.v1",
            "status": "VERIFIED_SYNTHETIC_SAMPLE",
            "originalXmlSha256": sha(original_xml),
            "revisedXmlSha256": sha(revised),
            "originalCiiSha256": sha(original_cii),
            "regeneratedCiiSha256": sha(regenerated),
            "sourceIdentity": source_identity,
            "componentRefNo": owner["componentRefNo"],
            "sourceWeightKgBefore": str(original_kg),
            "sourceWeightKgAfter": str(desired_kg),
            "weightScale": str(scale),
            "ciiWeightBefore": str(original_inv["rigidWeights"][pointer - 1]),
            "ciiWeightAfter": str(new_inv["rigidWeights"][new_pointer - 1]),
            "originalElementIndex": record["index"],
            "regeneratedElementIndex": updated_record["index"],
            "originalRigidPointer": pointer,
            "regeneratedRigidPointer": new_pointer,
            "pointerIsNotSourceIdentity": True,
            "sourcePatch": xml_span,
            "xmlUnrelatedByteDifferences": 0,
            "ciiIntegrity": {"sectionOrder": new_inv["sectionNames"],
                             "elementCount": len(new_inv["elements"]),
                             "rigidCount": len(new_inv["rigidWeights"]),
                             "allElementPointersValidated": True,
                             **diff},
            "noEdit": {
                "originalCiiSha256": sha(original_cii),
                "regeneratedCiiSha256": sha(baseline_replay),
                "originalBytes": len(original_cii),
                "regeneratedBytes": len(baseline_replay),
                "differingBytes": 0,
            },
            "converterCommandTemplate": baseline_run["commandTemplate"],
            "converterIdentity": conversion_snapshot["converterFilesSha256"],
        }
        return {"ok": True, "code": "PASS_QUALIFICATION_SAMPLE",
                "revisedXml": revised, "regeneratedCii": regenerated, "audit": audit}
    except Refusal as exc:
        return {"ok": False, "code": exc.code, "reason": str(exc),
                "revisedXml": None, "regeneratedCii": None, "audit": None}
    except Exception as exc:
        return {"ok": False, "code": "HOLD_INTERNAL_ERROR", "reason": str(exc),
                "revisedXml": None, "regeneratedCii": None, "audit": None}
