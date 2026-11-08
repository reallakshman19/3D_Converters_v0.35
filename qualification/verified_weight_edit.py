"""Bounded REAL-converter EnrichedXML -> RIGID weight -> CII qualification.

No production UI, direct-CII patch, approximate physical owner, or broad inverse.
Only plain, unnamespaced CleanXML with a uniquely identified retained TO RIGID
node, pinned empty config, no staged sources and no split is qualified.
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "converters" / "scripts"
sys.path.insert(0, str(SCRIPTS))
import xml_to_cii2019 as base  # noqa: E402
from cii2019_section_rules import (  # noqa: E402
    assert_cii2019_sections_valid, parse_control_counts, parse_section_map,
)

CONVERTER_FILES = (
    "xml_to_cii2019.py", "xml_to_cii2019_patched.py",
    "xml_to_cii2019_runtime_custody.py", "xml_to_cii2019_direction.py",
    "xml_to_cii2019_bend_radius_policy.py", "xml_to_cii2019_master_addon.py",
    "master_customization.py", "cii2019_section_rules.py",
    "cii_syntax_check_2019.py", "cii2019_hanger_miscel_control.py",
)
FLAGS = (
    "--coords-mode", "first", "--weight-scale", "10",
    "--support-config-json", "{}", "--no-split-condensed-valve-flange",
    "--use-restraint-type-based-on-json",
)
BRANCH_RE = re.compile(rb"<Branch>(.*?)</Branch>", re.DOTALL)
NODE_RE = re.compile(rb"<Node>(.*?)</Node>", re.DOTALL)
WEIGHT_RE = re.compile(rb"<Weight>([^<]*)</Weight>")
REQUIRED_ID = ("branchOrdinal", "branchName", "nodeOrdinal", "nodeNumber", "componentRefNo")


class Hold(Exception):
    def __init__(self, code, detail=""):
        self.code, self.detail = code, detail
        super().__init__(code + (": " + detail if detail else ""))


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def converter_fingerprints():
    return {name: sha((SCRIPTS / name).read_bytes()) for name in CONVERTER_FILES}


def make_snapshot(original_xml: bytes, original_cii: bytes) -> dict:
    """Frozen *effective* state for this intentionally restricted run profile."""
    return {
        "schema": "xml-cii-weight-qualification/v1",
        "sourceXmlSha256": sha(original_xml),
        "originalCiiSha256": sha(original_cii),
        "conversionFlags": list(FLAGS),
        "converterFileSha256": converter_fingerprints(),
        "sourceStage": "ENGINE_INPUT_XML",
        "weightScale": "10",
        "configuration": {},
        "stagedJson": None,
        "topofix": False,
        "massPolicy": "TO_NODE_RIGID_ONLY",
    }


def real_converter(xml: bytes) -> bytes:
    """Invoke the original runtime-custody CLI. Never synthesize CII text."""
    with tempfile.TemporaryDirectory(prefix="cii-qual-real-") as tmp:
        inp, out = Path(tmp) / "input.xml", Path(tmp) / "output.cii"
        inp.write_bytes(xml)
        cmd = [sys.executable, str(SCRIPTS / "xml_to_cii2019_runtime_custody.py"),
               "--input", str(inp), "--output", str(out), *FLAGS]
        result = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, timeout=60)
        if result.returncode or not out.is_file():
            raise Hold("HOLD_CONVERTER_FAILED", (result.stderr or result.stdout)[-800:])
        return out.read_bytes()


def assert_snapshot(original_xml, original_cii, snapshot):
    if not isinstance(snapshot, dict) or snapshot.get("schema") != "xml-cii-weight-qualification/v1":
        raise Hold("HOLD_SNAPSHOT_INVALID")
    if sha(original_xml) != snapshot.get("sourceXmlSha256"):
        raise Hold("HOLD_STALE_SOURCE")
    if sha(original_cii) != snapshot.get("originalCiiSha256"):
        raise Hold("HOLD_STALE_CII")
    if snapshot.get("sourceStage") != "ENGINE_INPUT_XML" or \
       snapshot.get("conversionFlags") != list(FLAGS) or \
       snapshot.get("weightScale") != "10" or \
       snapshot.get("configuration") != {} or \
       snapshot.get("stagedJson") is not None or \
       snapshot.get("topofix") is not False or \
       snapshot.get("massPolicy") != "TO_NODE_RIGID_ONLY":
        raise Hold("HOLD_CONFIGURATION_MISMATCH")
    if snapshot.get("converterFileSha256") != converter_fingerprints():
        raise Hold("HOLD_CONVERTER_IDENTITY_CHANGED")


def inspect_source(xml: bytes, identity: dict):
    """Resolve an exact lexical Weight span AND verify the same parsed source."""
    if not isinstance(identity, dict) or any(k not in identity for k in REQUIRED_ID):
        raise Hold("HOLD_SOURCE_OWNER", "Complete branch/node ordinal and component identity required.")
    if not isinstance(identity["branchOrdinal"], int) or not isinstance(identity["nodeOrdinal"], int):
        raise Hold("HOLD_SOURCE_OWNER", "Non-integral source ordinal.")
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        raise Hold("HOLD_INVALID_XML", str(exc)) from exc
    if root.tag != "CleanXML" or root.attrib:
        raise Hold("HOLD_UNSUPPORTED_XML_LAYOUT", "Sample supports unnamespaced CleanXML.")
    branches = list(root.findall("Branch"))
    spans = list(BRANCH_RE.finditer(xml))
    if len(branches) != len(spans) or not branches:
        raise Hold("HOLD_UNSUPPORTED_XML_LAYOUT", "Branch byte-span/index disagreement.")
    bi, ni = identity["branchOrdinal"], identity["nodeOrdinal"]
    if bi < 0 or bi >= len(branches):
        raise Hold("HOLD_SOURCE_OWNER", "Branch ordinal outside source.")
    branch = branches[bi]
    if (branch.findtext("Branchname") or "").strip() != str(identity["branchName"]):
        raise Hold("HOLD_SOURCE_OWNER", "Branch identity disagrees.")
    # A branch name is not sufficient when duplicated; deliberately refuse.
    if sum((b.findtext("Branchname") or "").strip() == identity["branchName"] for b in branches) != 1:
        raise Hold("HOLD_SOURCE_OWNER", "Branch name not unique.")
    nodes = list(branch.findall("Node"))
    matches = list(NODE_RE.finditer(spans[bi].group(1)))
    if len(nodes) != len(matches) or ni <= 0 or ni >= len(nodes):
        raise Hold("HOLD_SOURCE_OWNER", "Node ordinal missing, first node or XML span disagreement.")
    node = nodes[ni]
    number = (node.findtext("NodeNumber") or "").strip()
    ref = (node.findtext("ComponentRefNo") or "").strip()
    if number != str(identity["nodeNumber"]) or ref != str(identity["componentRefNo"]) or not ref:
        raise Hold("HOLD_SOURCE_OWNER", "NodeNumber/ComponentRefNo mismatch.")
    if sum((n.findtext("ComponentRefNo") or "").strip() == ref
           for b in branches for n in b.findall("Node")) != 1:
        raise Hold("HOLD_SOURCE_OWNER", "Physical component has multiple source owners.")
    if (node.findtext("ComponentType") or "").strip().upper() != "RIGID" or \
       (node.findtext("Rigid") or "").strip() != "2":
        raise Hold("HOLD_SOURCE_OWNER", "Not a TO-node RIGID weight owner.")
    weight_match = list(WEIGHT_RE.finditer(matches[ni].group(1)))
    if len(weight_match) != 1 or list(node.findall("Weight")) == []:
        raise Hold("HOLD_UNSUPPORTED_XML_LAYOUT", "Exactly one plain Weight token required.")
    span = matches[ni].start(1) + weight_match[0].start(1) + spans[bi].start(1)
    end = span + len(weight_match[0].group(1))
    original_token = xml[span:end]
    if original_token.strip() != (node.findtext("Weight") or "").strip().encode():
        raise Hold("HOLD_UNSUPPORTED_XML_LAYOUT", "Parsed and lexical Weight token differ.")

    # Prove no node was removed / renumbered by the actual base parser.
    # This excludes the >6mm cleanup and synthetic-identity cases.
    with tempfile.TemporaryDirectory(prefix="cii-qual-model-") as tmp:
        path = Path(tmp) / "input.xml"
        path.write_bytes(xml)
        document = base._parse_xml_document(path)
    if len(document.branches) != len(branches):
        raise Hold("HOLD_SOURCE_OWNER", "Conversion changed branch count.")
    for b, parsed in zip(branches, document.branches):
        source_nodes = list(b.findall("Node"))
        if len(source_nodes) != len(parsed.nodes):
            raise Hold("HOLD_SOURCE_OWNER", "Node removed by conversion cleanup.")
        for n, p in zip(source_nodes, parsed.nodes):
            if (n.findtext("NodeNumber") or "").strip() != str(p.node_number) or p.node_number <= 0:
                raise Hold("HOLD_SOURCE_OWNER", "Generated/renumbered node or ordering change.")
    expected = document.branches[bi].nodes[ni]
    if expected.weight != float(Decimal(original_token.decode("ascii").strip())):
        raise Hold("HOLD_SOURCE_OWNER", "Parser weight not equal to source token.")
    edges = base._build_edges(document.branches)
    owning = [j for j, edge in enumerate(edges)
              if edge.to_node is expected and edge.from_node is document.branches[bi].nodes[ni - 1]
              and edge.branch_name == identity["branchName"]]
    if len(owning) != 1 or expected.rigid != 2:
        raise Hold("HOLD_SOURCE_OWNER", "No unique retained TO-node RIGID edge.")
    edge_index = owning[0]
    rigid_edges, edge_to_rigid = base._build_rigid_indices(edges)
    if edge_index not in edge_to_rigid or rigid_edges[edge_to_rigid[edge_index] - 1] is not edges[edge_index] or \
       base._rigid_weight_for_edge(edges[edge_index]) != expected.weight:
        raise Hold("HOLD_SOURCE_OWNER", "Converter does not select requested source weight.")
    return {"span": (span, end), "edgeIndex": edge_index,
            "fromNode": edges[edge_index].from_node.node_number,
            "toNode": expected.node_number, "branch": identity["branchName"],
            "value": Decimal(original_token.decode().strip())}


def read_rigid_on_edge(cii: bytes, proof: dict):
    text = cii.decode("utf-8")
    assert_cii2019_sections_valid(text)
    sections = parse_section_map(text)
    control = parse_control_counts(sections["CONTROL"])
    elements, rigids = sections["ELEMENTS"], sections["RIGID"]
    if len(elements) % 15 or len(elements) // 15 != control.numelt:
        raise Hold("HOLD_CII_INVALID", "ELEMENT count disagreement.")
    if len(rigids) != control.rigids:
        raise Hold("HOLD_CII_INVALID", "RIGID count disagreement.")
    edge_index = proof["edgeIndex"]
    if edge_index >= control.numelt:
        raise Hold("HOLD_CII_LINEAGE", "Source edge absent from regenerated CII.")
    row = elements[edge_index * 15: (edge_index + 1) * 15]
    nums = row[0].split()
    if len(nums) < 5 or Decimal(nums[0]) != proof["fromNode"] or Decimal(nums[1]) != proof["toNode"]:
        raise Hold("HOLD_CII_LINEAGE", "Emitted edge node pair not equal to source edge.")
    pointers = row[12].split()
    if len(pointers) < 2:
        raise Hold("HOLD_CII_INVALID", "Missing ELEMENT auxiliary pointer row.")
    ptr = int(pointers[1])
    if not 1 <= ptr <= len(rigids):
        raise Hold("HOLD_CII_INVALID", "Dangling RIGID reference.")
    value = Decimal(rigids[ptr - 1].split()[0].replace("D", "E"))
    return {"weight": value, "pointer": ptr, "edgeIndex": edge_index + 1,
            "sections": sections, "controlElements": control.numelt, "controlRigids": control.rigids}


def mask_only_rigid_line(cii: bytes, pointer: int) -> bytes:
    """Replace only selected RIGID physical line; compare all other CII bytes."""
    lines = cii.splitlines(keepends=True)
    section, number = "", 0
    hits = 0
    for idx, line in enumerate(lines):
        if line.lstrip().startswith(b"#$ "):
            section = line.strip()[3:].decode("ascii")
            number = 0
        elif section == "RIGID" and line.strip():
            number += 1
            if number == pointer:
                lines[idx] = b"<MASKED-RIGID-LINE>" + (b"\n" if line.endswith(b"\n") else b"")
                hits += 1
    if hits != 1:
        raise Hold("HOLD_CII_LINEAGE", "Cannot isolate target RIGID record.")
    return b"".join(lines)


def apply_verified_xml_weight_edit(*, originalXml: bytes, originalCii: bytes,
                                   conversionSnapshot: dict, sourceIdentity: dict,
                                   proposedWeightKg, approved: bool) -> dict:
    """Return verified outputs in-memory only, or explicit HOLD with no outputs."""
    try:
        if approved is not True:
            raise Hold("HOLD_NOT_APPROVED")
        assert_snapshot(originalXml, originalCii, conversionSnapshot)
        try:
            proposed = Decimal(str(proposedWeightKg))
        except (InvalidOperation, ValueError):
            raise Hold("HOLD_INVALID_WEIGHT") from None
        if not proposed.is_finite() or proposed <= 0:
            raise Hold("HOLD_INVALID_WEIGHT", "Positive finite source mass required in sample.")
        owner = inspect_source(originalXml, sourceIdentity)
        no_edit = real_converter(originalXml)
        if no_edit != originalCii:
            raise Hold("HOLD_NO_EDIT_PARITY", "Original CII not byte identical to converter replay.")
        baseline = read_rigid_on_edge(originalCii, owner)
        expected_original = owner["value"] * Decimal(conversionSnapshot["weightScale"])
        if baseline["weight"] != expected_original:
            raise Hold("HOLD_SOURCE_OWNER", "Original emitted weight differs from source-selected weight.")
        if owner["value"] == proposed:
            raise Hold("HOLD_NO_CHANGE")
        token = format(proposed, "f").encode("ascii")
        start, end = owner["span"]
        revised_xml = originalXml[:start] + token + originalXml[end:]
        if revised_xml == originalXml or \
           revised_xml[:start] != originalXml[:start] or \
           revised_xml[start + len(token):] != originalXml[end:]:
            raise Hold("HOLD_XML_NON_TARGET_CHANGED")
        revised_owner = inspect_source(revised_xml, sourceIdentity)
        if revised_owner["value"] != proposed:
            raise Hold("HOLD_XML_READBACK")
        regenerated = real_converter(revised_xml)
        output = read_rigid_on_edge(regenerated, revised_owner)
        expected_weight = proposed * Decimal(conversionSnapshot["weightScale"])
        if output["weight"] != expected_weight:
            raise Hold("HOLD_CII_READBACK", f"Expected {expected_weight}; got {output['weight']}.")
        if mask_only_rigid_line(originalCii, baseline["pointer"]) != \
           mask_only_rigid_line(regenerated, output["pointer"]):
            raise Hold("HOLD_UNEXPECTED_CII_DIFFERENCES")
        audit = {
            "schema": "xml-cii-weight-qualification-audit/v1",
            "verdict": "VERIFIED", "sourceIdentity": sourceIdentity,
            "sourceByteSpan": [start, end],
            "originalSourceValueKg": str(owner["value"]), "newSourceValueKg": str(proposed),
            "originalCiiWeight": str(baseline["weight"]),
            "regeneratedCiiWeight": str(output["weight"]),
            "weightScale": conversionSnapshot["weightScale"],
            "originalCiiElementIndex": baseline["edgeIndex"],
            "regeneratedCiiElementIndex": output["edgeIndex"],
            "originalRigidPointer": baseline["pointer"],
            "regeneratedRigidPointer": output["pointer"],
            "sourceSha256": sha(originalXml), "revisedSourceSha256": sha(revised_xml),
            "originalCiiSha256": sha(originalCii), "regeneratedCiiSha256": sha(regenerated),
            "sourceOtherBytesChanged": False, "unexplainedCiiDifferences": 0,
            "converter": "xml_to_cii2019_runtime_custody.py",
        }
        return {"status": "VERIFIED", "revisedXml": revised_xml,
                "regeneratedCii": regenerated, "audit": audit}
    except Hold as exc:
        return {"status": "HOLD", "code": exc.code, "detail": exc.detail,
                "revisedXml": None, "regeneratedCii": None, "audit": None}
