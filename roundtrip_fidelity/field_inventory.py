"""R3 read-only exact-stage XML field inventory.

Original uploaded BM2 XML and effective converter-input EnrichedXML are separate
inventories. A retained XML token is evidence, never permission to edit it.
"""
from __future__ import annotations
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from xml.etree import ElementTree as ET
from xml.parsers import expat

from roundtrip_foundation.snapshot_replay import Hold, require


def local(tag):
    return str(tag).split("}", 1)[-1].split(":")[-1]


def sha(data: bytes) -> str:
    return sha256(data).hexdigest()


def numeric(raw):
    try:
        value = Decimal(str(raw).strip().replace("D", "E").replace("d", "e"))
        return value if value.is_finite() else None
    except (InvalidOperation, TypeError, ValueError):
        return None


def _units(path):
    p = path.lower()
    if any(x in p for x in ("position", "length", "diameter", "thickness", "radius", "gap")):
        return "mm"
    if "weight" in p:
        return "kg_SOURCE_WEIGHT"
    if "pressure" in p:
        return "CII_CONVERTER_PRESSURE_UNITS_UNVERIFIED"
    if "temperature" in p:
        return "CII_CONVERTER_TEMPERATURE_UNITS_UNVERIFIED"
    if "density" in p:
        return "CII_CONVERTER_DENSITY_UNITS_UNVERIFIED"
    return None


def _group(path):
    p = path.lower()
    if any(n in p for n in ("nodeno", "position", "elementlength")):
        return "GEOMETRY"
    if any(n in p for n in ("diameter", "thickness", "corrosion", "bore")):
        return "PIPE_DIMENSIONS"
    if any(n in p for n in ("temperature", "pressure", "density")):
        return "OPERATING"
    if "material" in p:
        return "MATERIAL"
    if any(n in p for n in ("rigid", "weight", "endpoint")):
        return "RIGID"
    if any(n in p for n in ("componentref", "rating", "dtxr", "nodename")):
        return "SOURCE_ANNOTATIONS"
    if any(n in p for n in ("restraint", "support", "stiffness", "direction", "friction", "cmpsup")):
        return "SUPPORTS"
    if any(n in p for n in ("bend", "sif", "reducer", "flange", "flan")):
        return "SPECIAL_COMPONENTS"
    return "OTHER"


def _tag_end(payload, start):
    quote = None
    for index in range(start, len(payload)):
        b = payload[index]
        if quote is not None:
            if b == quote:
                quote = None
        elif b in (34, 39):
            quote = b
        elif b == 62:
            return index + 1
    raise Hold("HOLD_XML_LEXICAL_PARSE", "Unterminated XML start tag")


def _raw_tokens(xml: bytes):
    """Use Expat byte offsets to retain exact UTF-8 lexical field tokens.

    Node/field IDs use the same branch and child-node ordinals as R1 inventory.
    XML entity bytes are retained as raw evidence; their decoded text differs.
    """
    parser = expat.ParserCreate()
    stack = []
    result = {}
    occurrence = Counter()
    branch_count = -1
    node_counts = defaultdict(int)

    def start(name, attrs):
        nonlocal branch_count
        parent = stack[-1] if stack else None
        if parent:
            parent["children"] += 1
        tag = local(name)
        if tag == "Branch":
            branch_count += 1
        bi = branch_count if parent is None else parent["branch"]
        ni = parent["node"] if parent else None
        if tag == "Node" and parent and parent["tag"] == "Branch":
            ni = node_counts[bi]
            node_counts[bi] += 1
        if tag == "Branch":
            bi = branch_count
            ni = None
        base = []
        if parent:
            base = list(parent["path"])
        if tag in ("Branch", "Node"):
            path = [tag]
        else:
            path = base + [tag]
        start_byte = parser.CurrentByteIndex
        tag_end = _tag_end(xml, start_byte)
        stack.append({"tag": tag, "branch": bi, "node": ni,
                      "path": path, "start": tag_end,
                      "openOffset": start_byte, "children": 0})

    def end(name):
        item = stack.pop()
        if item["children"]:
            return
        if not item["path"] or item["path"][0] not in ("Node", "Branch"):
            return
        end_byte = parser.CurrentByteIndex
        # A self-closing element has no independent literal token.
        if end_byte < item["start"]:
            raw = b""
        else:
            raw = xml[item["start"]:end_byte]
        path = "/".join(item["path"])
        keybase = (item["branch"], item["node"], path)
        occurrence[keybase] += 1
        result[(*keybase, occurrence[keybase])] = {
            "tokenBytes": raw, "startByte": item["start"],
            "endByte": end_byte, "selfClosing": end_byte < item["start"],
        }

    parser.StartElementHandler = start
    parser.EndElementHandler = end
    try:
        parser.Parse(xml, True)
    except expat.ExpatError as exc:
        raise Hold("HOLD_XML_LEXICAL_PARSE", str(exc)) from exc
    return result


def _leaves(element, path):
    """ElementTree is authoritative for XML hierarchy; Expat provides bytes."""
    children = list(element)
    if not children:
        yield ("/".join(path), element.text or "")
        return
    for child in children:
        yield from _leaves(child, path + [local(child.tag)])


def inventory_source_fields(xml: bytes, stage: str):
    require(type(xml) is bytes and bool(xml), "HOLD_MISSING_INPUT", "No XML bytes")
    require(stage in ("ORIGINAL_INPUT_XML", "ENGINE_INPUT_XML", "PYTHON_PREPROCESSED"),
            "HOLD_SOURCE_STAGE", "Unknown XML source stage")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise Hold("HOLD_SOURCE_XML_INVALID", str(exc)) from exc
    lex = _raw_tokens(xml)
    digest = sha(xml)
    branches = [x for x in root.iter() if local(x.tag) == "Branch"]
    fields = []
    nodes = []
    for bi, branch in enumerate(branches):
        branch_name = next((str(x.text or "").strip() for x in branch
                            if local(x.tag) == "Branchname"), "")
        branch_ordinal = sum(local(x.tag) == "Branch" for x in branches[:bi])
        # branch_ordinal == bi intentionally; do not key by potentially duplicate name.
        local_nodes = [x for x in branch if local(x.tag) == "Node"]
        def append_fields(scope, ni, element):
            counts = Counter()
            for pth, parsed_text in _leaves(element, [scope]):
                if pth == scope or pth in ():
                    continue
                counts[pth] += 1
                occurrence = counts[pth]
                lexical = lex.get((bi, ni, pth, occurrence))
                raw_bytes = lexical["tokenBytes"] if lexical else None
                try:
                    raw_token = raw_bytes.decode("utf-8") if raw_bytes is not None else None
                except UnicodeError:
                    raw_token = None
                parsed = str(parsed_text).strip()
                exact = raw_token is not None and raw_token.strip() == parsed
                identifier = f"{stage}:{digest}:{bi}:{ni if ni is not None else 'BRANCH'}:{pth}:{occurrence}"
                fields.append({
                    "fieldId": identifier,
                    "stage": stage,
                    "sourceXmlSha256": digest,
                    "sourceBranchIdentity": f"{stage}:{digest}:BRANCH:{bi}",
                    "branchName": branch_name, "branchOrdinal": bi,
                    "nodeOrdinal": ni,
                    "sourceNodeIdentity": f"{digest}:{bi}:{ni}" if ni is not None else None,
                    "sourceFieldPath": pth, "sourceFieldOccurrence": occurrence,
                    "originalSourceToken": raw_token if raw_token is not None else parsed,
                    "parsedValue": parsed,
                    "rawTokenEvidence": ("EXACT_XML_BYTES" if raw_token is not None else
                                         "PARSED_XML_TEXT_ONLY"),
                    "lexicalMatchesParsed": exact,
                    "sourceFieldLocation": {
                        "path": f"Branch[{bi+1}]" + (f"/Node[{ni+1}]" if ni is not None else "") +
                                f"/{pth.split('/',1)[-1]}[{occurrence}]",
                        "startByte": lexical["startByte"] if lexical else None,
                        "endByte": lexical["endByte"] if lexical else None,
                    },
                    "sourceUnit": _units(pth), "propertyGroup": _group(pth),
                })
        # Only branch-level fields (not child Node) inherit BRANCH identity.
        counts = Counter()
        for child in branch:
            if local(child.tag) == "Node":
                continue
            for pth, value in _leaves(child, ["Branch", local(child.tag)]):
                counts[pth] += 1
                occurrence = counts[pth]
                lx = lex.get((bi, None, pth, occurrence))
                raw = None
                if lx is not None:
                    try:
                        raw = lx["tokenBytes"].decode("utf-8")
                    except UnicodeError:
                        raw = None
                parsed = str(value).strip()
                fields.append({
                    "fieldId": f"{stage}:{digest}:{bi}:BRANCH:{pth}:{occurrence}",
                    "stage": stage, "sourceXmlSha256": digest,
                    "sourceBranchIdentity": f"{stage}:{digest}:BRANCH:{bi}",
                    "branchName": branch_name, "branchOrdinal": bi,
                    "nodeOrdinal": None, "sourceNodeIdentity": None,
                    "sourceFieldPath": pth, "sourceFieldOccurrence": occurrence,
                    "originalSourceToken": raw if raw is not None else parsed,
                    "parsedValue": parsed,
                    "rawTokenEvidence": "EXACT_XML_BYTES" if raw is not None else "PARSED_XML_TEXT_ONLY",
                    "lexicalMatchesParsed": raw is not None and raw.strip() == parsed,
                    "sourceFieldLocation": {
                        "path": f"Branch[{bi+1}]/{pth.split('/',1)[-1]}[{occurrence}]",
                        "startByte": lx["startByte"] if lx else None,
                        "endByte": lx["endByte"] if lx else None},
                    "sourceUnit": _units(pth), "propertyGroup": _group(pth)})
        for ni, node in enumerate(local_nodes):
            f = {local(x.tag): (x.text or "").strip() for x in node}
            nodes.append({
                "sourceXmlSha256": digest, "sourceStage": stage,
                "nodeIdentity": f"{digest}:{bi}:{ni}",
                "branchOrdinal": bi, "nodeOrdinal": ni, "branchName": branch_name,
                "nodeNumber": f.get("NodeNumber", ""),
                "componentRefNo": f.get("ComponentRefNo", "").lstrip("=").upper(),
                "componentType": f.get("ComponentType", "").upper(),
                "position": f.get("Position", ""),
            })
            append_fields("Node", ni, node)
    return {"schema": "xml-cii-source-field-inventory/r3", "stage": stage,
            "sourceXmlSha256": digest, "sourceXmlBytes": len(xml),
            "branches": len(branches), "nodes": nodes, "fields": fields,
            "sourceFieldsCount": len(fields)}


def match_original_to_effective(original_inventory, effective_inventory):
    """Never equate BM2 source and converter-input fields just by ordinal.

    Exact identical XML bytes qualify all identical field IDs by hierarchy.
    Otherwise require unique same-branch, ComponentRefNo, node number and
    position. A changed value is recorded but NOT claimed unchanged.
    """
    if original_inventory is None:
        return {"status": "NOT_AVAILABLE", "relationships": [], "unmatchedEffectiveFields":
                len(effective_inventory["fields"])}
    same = original_inventory["sourceXmlSha256"] == effective_inventory["sourceXmlSha256"]
    original_nodes = defaultdict(list)
    for n in original_inventory["nodes"]:
        key = (n["branchName"], n["componentRefNo"], n["nodeNumber"], n["position"])
        if n["componentRefNo"]:
            original_nodes[key].append(n)
    effective_nodes = defaultdict(list)
    for n in effective_inventory["nodes"]:
        key = (n["branchName"], n["componentRefNo"], n["nodeNumber"], n["position"])
        if n["componentRefNo"]:
            effective_nodes[key].append(n)
    indexed = defaultdict(list)
    for f in original_inventory["fields"]:
        indexed[(f["branchOrdinal"], f["nodeOrdinal"], f["sourceFieldPath"],
                 f["sourceFieldOccurrence"])].append(f)
    relations = []
    for f in effective_inventory["fields"]:
        match = None
        relation = "UNRESOLVED"
        if same:
            got = indexed[(f["branchOrdinal"], f["nodeOrdinal"], f["sourceFieldPath"],
                           f["sourceFieldOccurrence"])]
            if len(got) == 1:
                match = got[0]
                relation = "BYTE_IDENTICAL_SOURCE_STAGE"
        elif f["nodeOrdinal"] is not None:
            node = effective_inventory["nodes"][
                next((i for i, n in enumerate(effective_inventory["nodes"])
                      if n["branchOrdinal"] == f["branchOrdinal"] and
                      n["nodeOrdinal"] == f["nodeOrdinal"]), -1)]
            key = (node["branchName"], node["componentRefNo"], node["nodeNumber"], node["position"])
            old = original_nodes.get(key, [])
            new = effective_nodes.get(key, [])
            if len(old) == 1 and len(new) == 1:
                got = indexed[(old[0]["branchOrdinal"], old[0]["nodeOrdinal"],
                               f["sourceFieldPath"], f["sourceFieldOccurrence"])]
                if len(got) == 1:
                    match = got[0]
                    relation = ("ORIGINAL_TOKEN_PRESERVED" if
                                match["originalSourceToken"] == f["originalSourceToken"]
                                else "ENRICHED_FIELD_VALUE_CHANGED")
        relations.append({
            "originalFieldId": match["fieldId"] if match else None,
            "effectiveFieldId": f["fieldId"], "relationship": relation,
            "originalToken": match["originalSourceToken"] if match else None,
            "effectiveToken": f["originalSourceToken"],
            "provesUnchangedBm2Origin": relation in ("BYTE_IDENTICAL_SOURCE_STAGE",
                                                       "ORIGINAL_TOKEN_PRESERVED")})
    return {"status": "COMPARED", "relationships": relations,
            "unmatchedEffectiveFields": sum(r["originalFieldId"] is None for r in relations)}
