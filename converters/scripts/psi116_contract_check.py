#!/usr/bin/env python3
"""Validate upstream PSI116 XML against the unchanged xml_to_cii.py contract.

This is intentionally a pipeline gate, not a replacement converter.
It checks both:
1. XSD/benchmark shape that matters to the repo PSI116 XML files.
2. The exact downstream predicates used by xml_to_cii.py for bends, SIF/tees,
   reducers, and restraints.

If source inventory shows fittings/supports but XML has zero downstream-detectable
candidates, this script exits non-zero so the app cannot produce the misleading:
"0 restraints, 0 bends, 0 SIF/tee entries, 0 reducers" success message.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
import xml.etree.ElementTree as ET

# Benchmarked AVEVA output in B7410250-BM uses pipeStress116.xsd.
# Some XSD copies in the repo use pipestress116.xsd. Accept both for the gate;
# upstream generation should prefer the benchmark spelling so file diffs are not
# polluted by namespace casing.
PREFERRED_PSI116_NS = "http://aveva.com/pipeStress116.xsd"
ACCEPTED_PSI116_NS = {
    "http://aveva.com/pipeStress116.xsd",
    "http://aveva.com/pipestress116.xsd",
}
SPECIAL_TYPES = {"ELBO", "TEE", "OLET", "REDU", "ATTA", "ANCI"}
NODE_ORDER = [
    "NodeNumber", "NodeName", "Endpoint", "Rigid", "ComponentType", "Weight",
    "ComponentRefNo", "ConnectionType", "OutsideDiameter", "WallThickness",
    "CorrosionAllowance", "AlphaAngle", "InsulationThickness", "Position",
    "BendRadius", "BendType", "SIF", "Restraint", "NewPosition", "Status", "Load",
]
TYPE_RULES = (
    (re.compile(r"WELDOLET|SOCKOLET|THREDOLET|SWEEPOLET|\bOLET\b", re.I), "OLET"),
    (re.compile(r"\b(ELBO(W)?|BEND)\b", re.I), "ELBO"),
    (re.compile(r"\bTEE\b", re.I), "TEE"),
    (re.compile(r"\bREDU(CER)?\b", re.I), "REDU"),
    (re.compile(r"\b(ATTA|ANCI|SUPP|SUPPORT|REST|GUIDE|LINE\s*STOP|LINESTOP|LIMIT|ANCHOR|FIXED|SHOE|BP|BASE\s*PLATE)\b", re.I), "ATTA"),
)
KEY_VALUE_RX = re.compile(r"^\s*:?(?P<key>[A-Za-z][A-Za-z0-9_\-]*)\s*(?::=|=|:)\s*(?P<value>.*?)\s*$")


def _local(tag: str) -> str:
    return tag.split("}", 1)[1] if tag.startswith("{") else tag


def _namespace(tag: str) -> str:
    return tag[1:].split("}", 1)[0] if tag.startswith("{") else ""


def _q(ns: str, name: str) -> str:
    return f"{{{ns}}}{name}" if ns else name


def _txt(parent: ET.Element, ns: str, name: str) -> str:
    el = parent.find(_q(ns, name))
    return "" if el is None or el.text is None else el.text.strip()


def _int(text: str):
    text = (text or "").strip()
    if not text:
        return None
    try:
        return int(text)
    except Exception:
        return None


def _float(text: str):
    text = (text or "").strip()
    if not text:
        return None
    try:
        return float(text)
    except Exception:
        return None


def _type_from_text(text: str) -> str:
    for rx, typ in TYPE_RULES:
        if rx.search(text or ""):
            return typ
    return ""


def _flatten_json(obj):
    if isinstance(obj, dict):
        yield obj
        for key in ("children", "items", "branches"):
            value = obj.get(key)
            if isinstance(value, list):
                for child in value:
                    yield from _flatten_json(child)
    elif isinstance(obj, list):
        for item in obj:
            yield from _flatten_json(item)


def source_inventory(path: Path, source_kind: str) -> Counter:
    counts: Counter[str] = Counter()
    if not path or not path.exists():
        return counts
    kind = (source_kind or "auto").lower()
    try:
        if kind == "stagedjson" or path.suffix.lower() == ".json":
            data = json.loads(path.read_text(encoding="utf-8-sig"))
            for item in _flatten_json(data):
                attrs = {}
                for k in ("attributes", "attrs", "attr", "rawAttributes", "raw_attributes", "normalized"):
                    if isinstance(item.get(k), dict):
                        attrs.update(item[k])
                blob = " ".join(str(v) for v in [item.get("type"), item.get("kind"), item.get("name"), item.get("path"), item.get("id"), *attrs.values()] if v is not None)
                typ = _type_from_text(blob)
                if typ:
                    counts[typ] += 1
            return counts

        raw = ""
        if path.suffix.lower() == ".zip":
            with zipfile.ZipFile(path, "r") as zf:
                members = [m for m in zf.namelist() if m.lower().endswith((".txt", ".att"))]
                if members:
                    raw = zf.read(sorted(members)[0]).decode("utf-8", errors="replace")
        else:
            raw = path.read_text(encoding="utf-8", errors="replace")
        current = []
        blocks = []
        for line in raw.splitlines():
            if re.match(r"^\s*NEW(\s|$)", line, re.I):
                if current:
                    blocks.append("\n".join(current))
                current = [line]
            elif re.match(r"^\s*END(\s|$)", line, re.I):
                current.append(line)
                blocks.append("\n".join(current))
                current = []
            else:
                current.append(line)
        if current:
            blocks.append("\n".join(current))
        for block in blocks:
            typ = _type_from_text(block)
            if typ:
                counts[typ] += 1
    except Exception as exc:
        counts["__SOURCE_PARSE_ERROR__"] += 1
        counts[f"__ERROR__:{type(exc).__name__}"] += 1
    return counts


def check_xml(path: Path) -> dict:
    failures: list[str] = []
    tree = ET.parse(path)
    root = tree.getroot()
    ns = _namespace(root.tag)
    if _local(root.tag) != "PipeStressExport":
        failures.append(f"root is {_local(root.tag)}, expected PipeStressExport")
    if ns not in ACCEPTED_PSI116_NS:
        failures.append(f"namespace is {ns!r}, expected one of {sorted(ACCEPTED_PSI116_NS)!r}")

    component_counts: Counter[str] = Counter()
    positive_nodes = 0
    edges = []
    branch_count = 0
    node_order_ok = True
    position_triplets_ok = True
    sif_integer_ok = True
    restraint_nodes = 0

    for branch in root.findall(f".//{_q(ns, 'Branch')}"):
        branch_count += 1
        branch_nodes = []
        for node_el in branch.findall(_q(ns, "Node")):
            seen = [_local(child.tag) for child in list(node_el)]
            last_index = -1
            for name in seen:
                if name not in NODE_ORDER:
                    continue
                idx = NODE_ORDER.index(name)
                if idx < last_index:
                    node_order_ok = False
                last_index = max(last_index, idx)
            pos = _txt(node_el, ns, "Position")
            if pos and len(pos.split()) != 3:
                position_triplets_ok = False
            sif = _txt(node_el, ns, "SIF")
            if sif and not re.fullmatch(r"[-+]?\d+", sif):
                sif_integer_ok = False
            number = _int(_txt(node_el, ns, "NodeNumber"))
            if number is None or number <= 0:
                continue
            endpoint = _int(_txt(node_el, ns, "Endpoint"))
            alpha = _float(_txt(node_el, ns, "AlphaAngle"))
            ctype = _txt(node_el, ns, "ComponentType").upper()
            component_counts[ctype or "UNKNOWN"] += 1
            positive_nodes += 1
            if node_el.findall(_q(ns, "Restraint")):
                restraint_nodes += 1
            branch_nodes.append({"number": number, "endpoint": endpoint, "ctype": ctype, "alpha": alpha})
        for i in range(len(branch_nodes) - 1):
            edges.append((branch_nodes[i], branch_nodes[i + 1]))

    bend_candidates = [edge for edge in edges if edge[1]["ctype"] == "ELBO" and edge[1]["endpoint"] == 0]
    sif_candidates = [edge for edge in edges if edge[1]["endpoint"] == 0 and edge[1]["ctype"] in {"TEE", "OLET"}]
    reducer_candidates = [edge for edge in edges if edge[1]["alpha"] is not None and abs(edge[1]["alpha"] or 0.0) > 1e-9]
    return {
        "xsdShape": {
            "namespaceOk": ns in ACCEPTED_PSI116_NS,
            "preferredNamespaceOk": ns == PREFERRED_PSI116_NS,
            "nodeOrderOk": node_order_ok,
            "positionTripletsOk": position_triplets_ok,
            "sifIntegerOk": sif_integer_ok,
        },
        "ciiDetectable": {
            "branches": branch_count,
            "positiveNodes": positive_nodes,
            "edges": len(edges),
            "bendCandidates": len(bend_candidates),
            "sifTeeCandidates": len(sif_candidates),
            "reducerCandidates": len(reducer_candidates),
            "restraintCandidates": restraint_nodes,
        },
        "componentCounts": dict(component_counts),
        "failures": failures,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Check PSI116 XML against xml_to_cii.py detection contract.")
    parser.add_argument("--xml", required=True, type=Path)
    parser.add_argument("--source-input", type=Path, default=None)
    parser.add_argument("--source-kind", default="auto")
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--strict", action="store_true")
    args = parser.parse_args()

    report = check_xml(args.xml)
    src_counts = source_inventory(args.source_input, args.source_kind) if args.source_input else Counter()
    report["sourceInventory"] = dict(src_counts)

    failures = list(report.get("failures") or [])
    xsd = report["xsdShape"]
    for key in ("namespaceOk", "nodeOrderOk", "positionTripletsOk", "sifIntegerOk"):
        if not xsd.get(key):
            failures.append(f"XSD shape check failed: {key}")

    detectable = report["ciiDetectable"]
    if args.strict:
        if src_counts.get("ELBO", 0) > 0 and detectable["bendCandidates"] == 0:
            failures.append("Source contains ELBO/BEND but XML has zero xml_to_cii-detectable bend candidates.")
        if (src_counts.get("TEE", 0) + src_counts.get("OLET", 0)) > 0 and detectable["sifTeeCandidates"] == 0:
            failures.append("Source contains TEE/OLET but XML has zero xml_to_cii-detectable SIF/tee candidates.")
        if src_counts.get("REDU", 0) > 0 and detectable["reducerCandidates"] == 0:
            failures.append("Source contains REDU but XML has zero xml_to_cii-detectable reducer candidates.")
        if (src_counts.get("ATTA", 0) + src_counts.get("ANCI", 0)) > 0 and detectable["restraintCandidates"] == 0:
            failures.append("Source contains supports but XML has zero restraint candidates.")
        if sum(src_counts.get(t, 0) for t in SPECIAL_TYPES) > 0:
            special_sum = detectable["bendCandidates"] + detectable["sifTeeCandidates"] + detectable["reducerCandidates"] + detectable["restraintCandidates"]
            if special_sum == 0:
                failures.append("Source contains special components but all downstream-detectable special XML counts are zero.")

    report["failures"] = failures
    report_text = json.dumps(report, indent=2, sort_keys=True)
    if args.report:
        args.report.write_text(report_text, encoding="utf-8")
    print(report_text)
    if failures:
        print("PSI116 contract check failed; refusing misleading XML->CII conversion.", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
