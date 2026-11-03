#!/usr/bin/env python3
"""BM1 regression: RMSS_ATTRIBUTE.zip -> staged JSON -> PSI116 XML -> CII.

This is the non-ad-hoc gate for the repeated failure signature:
"0 restraints, 0 bends, 0 SIF/tee entries, 0 reducers".

Primary repo fixture:
Benchmarks/Managejson to Input XML/RMSS/RMSS_ATTRIBUTE.zip

The older BM1/Sample path is accepted only as a fallback if it exists.
The workflow must remain tied to the primary benchmark fixture.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

from psi116_upstream_common import parse_attribute_blocks, read_attribute_text

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]

PRIMARY_ATTR_ZIP = (
    REPO_ROOT
    / "Benchmarks"
    / "Managejson to Input XML"
    / "RMSS"
    / "RMSS_ATTRIBUTE.zip"
)

LEGACY_ATTR_ZIP = (
    REPO_ROOT
    / "BM1"
    / "Sample 4_ RVM TO REV TO XML TO CII"
    / "RMSS_ATTRIBUTE.zip"
)

SPECIAL_RULES = (
    (re.compile(r"WELDOLET|SOCKOLET|THREDOLET|SWEEPOLET|\bOLET\b", re.I), "OLET"),
    (re.compile(r"\b(ELBO(W)?|BEND)\b", re.I), "ELBO"),
    (re.compile(r"\bTEE\b", re.I), "TEE"),
    (re.compile(r"\bREDU(CER)?\b", re.I), "REDU"),
    (
        re.compile(
            r"\b(ATTA|ANCI|SUPP|SUPPORT|REST|GUIDE|LINE\s*STOP|LINESTOP|LIMIT|ANCHOR|FIXED|SHOE|BP|BASE\s*PLATE)\b",
            re.I,
        ),
        "ATTA",
    ),
)

SUMMARY_RX = re.compile(
    r"with\s+(?P<elements>\d+)\s+elements,\s+"
    r"(?P<restraints>\d+)\s+restraints,\s+"
    r"(?P<bends>\d+)\s+bends,\s+"
    r"(?P<siftee>\d+)\s+SIF/tee entries,\s+"
    r"(?P<reducers>\d+)\s+reducers",
    re.I,
)


def repo_relative(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(REPO_ROOT.resolve()))
    except ValueError:
        return str(path)


def resolve_attribute_zip(explicit: Path | None) -> Path:
    """Return the fixture path.

    Precedence:
    1. explicit CLI path
    2. primary benchmark fixture
    3. legacy BM1 path, only if actually present
    """
    if explicit:
        path = explicit if explicit.is_absolute() else (REPO_ROOT / explicit)
        if path.exists():
            return path
        raise SystemExit(
            "Missing fixture supplied by --attribute-zip:\n"
            f"  {path}\n"
            "Provide a valid zip or omit the argument to use the default benchmark fixture."
        )

    candidates = [PRIMARY_ATTR_ZIP, LEGACY_ATTR_ZIP]

    for candidate in candidates:
        if candidate.exists():
            return candidate

    lines = "\n".join(f"  - {candidate}" for candidate in candidates)
    raise SystemExit(
        "Missing BM1 attribute fixture. Checked:\n"
        f"{lines}\n\n"
        "The required committed fixture is:\n"
        "  Benchmarks/Managejson to Input XML/RMSS/RMSS_ATTRIBUTE.zip"
    )


def classify_block(block: dict) -> str:
    blob = " ".join(str(value) for value in block.values() if value is not None)

    for rx, typ in SPECIAL_RULES:
        if rx.search(blob):
            return typ

    return ""


def build_staged_json(attribute_zip: Path, staged_json: Path) -> dict:
    raw = read_attribute_text(attribute_zip)
    blocks = parse_attribute_blocks(raw)

    source_counts: Counter[str] = Counter()
    children = []

    for index, block in enumerate(blocks, start=1):
        typ = classify_block(block)

        if typ:
            source_counts[typ] += 1

        children.append(
            {
                "id": block.get("ID")
                or block.get("NAME")
                or block.get("__NEW__")
                or f"ATTR-{index}",
                "name": block.get("NAME")
                or block.get("TAG")
                or block.get("__NEW__")
                or f"ATTR-{index}",
                "type": typ or block.get("TYPE") or block.get("__NEW__") or "UNKNOWN",
                "attributes": block,
                "rawAttributes": block,
            }
        )

    data = {
        "id": "BM1_RMSS_ATTRIBUTE",
        "name": "BM1_RMSS_ATTRIBUTE",
        "type": "ROOT",
        "children": children,
    }

    staged_json.parent.mkdir(parents=True, exist_ok=True)
    staged_json.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")

    return {
        "blockCount": len(blocks),
        "sourceCounts": dict(source_counts),
    }


def run_cmd(args: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(args, cwd=str(cwd), text=True, capture_output=True)

    print("$ " + " ".join(args))

    if completed.stdout:
        print(completed.stdout)

    if completed.stderr:
        print(completed.stderr, file=sys.stderr)

    if completed.returncode != 0:
        raise SystemExit(completed.returncode)

    return completed


def parse_summary(stdout: str) -> dict:
    match = SUMMARY_RX.search(stdout or "")

    if not match:
        raise SystemExit("Could not parse xml_to_cii2019.py summary line.")

    return {key: int(value) for key, value in match.groupdict().items()}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--attribute-zip",
        type=Path,
        default=None,
        help=(
            "Optional attribute zip. Defaults to "
            "Benchmarks/Managejson to Input XML/RMSS/RMSS_ATTRIBUTE.zip"
        ),
    )
    parser.add_argument(
        "--work-dir",
        type=Path,
        default=Path("reports/psi116_bm1_regression"),
    )
    args = parser.parse_args()

    attribute_zip = resolve_attribute_zip(args.attribute_zip)

    work = args.work_dir
    if not work.is_absolute():
        work = REPO_ROOT / work

    work.mkdir(parents=True, exist_ok=True)

    staged_json = work / "BM1_RMSS_ATTRIBUTE.staged.json"
    xml_path = work / "BM1_RMSS_ATTRIBUTE.staged.xml"
    cii_path = work / "BM1_RMSS_ATTRIBUTE.staged.cii"
    contract_report = work / "BM1_RMSS_ATTRIBUTE.psi116_contract_report.json"
    summary_path = work / "BM1_RMSS_ATTRIBUTE.xml_to_cii_summary.json"

    inventory = build_staged_json(attribute_zip, staged_json)

    run_cmd(
        [
            sys.executable,
            str(SCRIPT_DIR / "stagedjson_to_xml.py"),
            "--input",
            str(staged_json),
            "--output",
            str(xml_path),
        ],
        REPO_ROOT,
    )

    run_cmd(
        [
            sys.executable,
            str(SCRIPT_DIR / "psi116_contract_check.py"),
            "--xml",
            str(xml_path),
            "--source-input",
            str(staged_json),
            "--source-kind",
            "stagedjson",
            "--report",
            str(contract_report),
            "--strict",
        ],
        REPO_ROOT,
    )

    cii_run = run_cmd(
        [
            sys.executable,
            str(SCRIPT_DIR / "xml_to_cii2019.py"),
            "--input",
            str(xml_path),
            "--output",
            str(cii_path),
        ],
        REPO_ROOT,
    )

    cii_summary = parse_summary(cii_run.stdout)

    source_counts = Counter(inventory.get("sourceCounts") or {})
    source_special_total = sum(source_counts.values())

    cii_special_total = (
        cii_summary["restraints"]
        + cii_summary["bends"]
        + cii_summary["siftee"]
        + cii_summary["reducers"]
    )

    final = {
        "fixture": repo_relative(attribute_zip),
        "inventory": inventory,
        "xml": repo_relative(xml_path),
        "cii": repo_relative(cii_path),
        "contractReport": repo_relative(contract_report),
        "ciiSummary": cii_summary,
        "sourceSpecialTotal": source_special_total,
        "ciiSpecialTotal": cii_special_total,
        "pass": bool(source_special_total == 0 or cii_special_total > 0),
    }

    summary_path.write_text(json.dumps(final, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(final, indent=2, sort_keys=True))

    if source_special_total > 0 and cii_special_total == 0:
        raise SystemExit(
            "REGRESSION FAIL: source has special components but CII summary has all special counts zero."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
