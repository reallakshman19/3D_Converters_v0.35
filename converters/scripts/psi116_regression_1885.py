#!/usr/bin/env python3
"""1885-GH-TYP-04-STEAM-02 regression: staged JSON -> InputXML -> CII.

Gates the geometry/support-continuity fixes (G1-G5) against the committed
fixture ``CII error/ATTRIBUTE_managed_stage_1885_Steam.json`` (real PDMS data).

Asserts, for the default (AVEVA) configuration:
  * supports are classified and placed with none unsnapped (G4),
  * the CII carries a populated RESTRANT section (G4),
  * the CII carries a NODENAME section with real PS- stress names (G5),
  * the vertical axis is Y, i.e. Sum|dy| is the smallest element-delta axis (G3).
And that the legacy ``vertical_axis=Z`` setting reverts the orientation.

Run:  python3 psi116_regression_1885.py
Exit code 0 on pass, 1 on failure. Prints a JSON summary line.
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parents[2]
FIXTURE = REPO_ROOT / "CII error" / "ATTRIBUTE_managed_stage_1885_Steam.json"

# Expected counts for the committed fixture (its specific branch selection).
EXPECT = {
    "NUMELT": 270,
    "NUMBEND": 21,
    "NUMREST": 76,
    "supports_classified": 111,
    "supports_unsnapped": 0,
}


def _run(cmd):
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise SystemExit(f"command failed: {' '.join(map(str, cmd))}\n{proc.stderr}")
    return proc.stdout


def _stagedjson_to_inputxml(staged, out_xml, bookmark=None):
    cmd = [sys.executable, str(SCRIPT_DIR / "stagedjson_to_inputxml.py"),
           "--input", str(staged), "--output", str(out_xml)]
    if bookmark:
        cmd += ["--bookmark", str(bookmark)]
    return _run(cmd)


def _inputxml_to_cii(in_xml, out_cii):
    return _run([sys.executable, str(SCRIPT_DIR / "inputxml_to_cii2019.py"),
                 "--input", str(in_xml), "--output", str(out_cii)])


def _parse_header(xml_text):
    out = {}
    for key in ("NUMELT", "NUMBEND", "NUMREST"):
        m = re.search(rf'{key}="(\d+)"', xml_text)
        out[key] = int(m.group(1)) if m else None
    m = re.search(r'NORTH_Z="(\d)" NORTH_Y="(\d)" NORTH_X="(\d)"', xml_text)
    out["NORTH"] = m.groups() if m else None
    return out


def _parse_support_stats(stdout):
    m = re.search(r"classified=(\d+) attached=(\d+) split=(\d+) unsnapped=(\d+)", stdout)
    if not m:
        return {}
    return {"supports_classified": int(m.group(1)),
            "supports_attached": int(m.group(2)),
            "supports_split": int(m.group(3)),
            "supports_unsnapped": int(m.group(4))}


def _cii_section_lines(cii_text, name):
    m = re.search(r"#\$ " + re.escape(name) + r"\n(.*?)(?=\n#\$ |\Z)", cii_text, re.S)
    return m.group(1).split("\n") if m else None


def _element_delta_sums(cii_text):
    lines = _cii_section_lines(cii_text, "ELEMENTS") or []
    n = len(lines) // 15
    dx = dy = dz = 0.0
    for k in range(n):
        nums = re.findall(r"-?\d+\.?\d*(?:[eE][+-]?\d+)?", lines[k * 15])
        f = [float(x) for x in nums]
        if len(f) >= 6:
            dx += abs(f[2]); dy += abs(f[3]); dz += abs(f[4])
    return round(dx), round(dy), round(dz)


def main():
    if not FIXTURE.is_file():
        raise SystemExit(f"fixture not found: {FIXTURE}")

    failures = []
    summary = {"fixture": str(FIXTURE.relative_to(REPO_ROOT))}

    with tempfile.TemporaryDirectory() as d:
        d = Path(d)
        xml = d / "out.xml"
        cii = d / "out.cii"

        # --- Default (AVEVA) configuration ---
        stdout = _stagedjson_to_inputxml(FIXTURE, xml)
        xml_text = xml.read_text(encoding="utf-8")
        _inputxml_to_cii(xml, cii)
        cii_text = cii.read_text(encoding="utf-8")

        header = _parse_header(xml_text)
        stats = _parse_support_stats(stdout)
        summary.update(header)
        summary.update(stats)

        for key in ("NUMELT", "NUMBEND", "NUMREST"):
            if header.get(key) != EXPECT[key]:
                failures.append(f"{key}={header.get(key)} expected {EXPECT[key]}")
        for key in ("supports_classified", "supports_unsnapped"):
            if stats.get(key) != EXPECT[key]:
                failures.append(f"{key}={stats.get(key)} expected {EXPECT[key]}")

        # G4: populated RESTRANT
        rest_lines = _cii_section_lines(cii_text, "RESTRANT") or []
        rest_rows = sum(1 for l in rest_lines if re.match(r"\s*\d+\.\d", l))
        summary["restrant_rows"] = rest_rows
        if rest_rows < 50:
            failures.append(f"RESTRANT rows={rest_rows} (expected many)")

        # G5: NODENAME present with real PS- names
        nodename_lines = _cii_section_lines(cii_text, "NODENAME")
        if nodename_lines is None:
            failures.append("NODENAME section absent")
        else:
            ps_names = len(set(re.findall(r"PS-[0-9][0-9.A-Z/]*", "\n".join(nodename_lines))))
            summary["nodename_rows"] = len([l for l in nodename_lines if l.strip()])
            summary["nodename_ps_names"] = ps_names
            if ps_names < 10:
                failures.append(f"NODENAME real PS- names={ps_names} (expected >=10)")

        # G3: vertical axis Y -> Sum|dy| is the smallest delta axis
        sx, sy, sz = _element_delta_sums(cii_text)
        summary["delta_sums_xyz"] = [sx, sy, sz]
        if not (sy < sx and sy < sz):
            failures.append(f"vertical axis not Y: dsums={sx, sy, sz}")
        if header.get("NORTH") != ("1", "0", "0"):
            failures.append(f"NORTH={header.get('NORTH')} expected ('1','0','0') for Up=Y")

        # --- Legacy vertical_axis=Z reverts orientation ---
        zbook = d / "z.json"
        zbook.write_text('{"vertical_axis":"Z"}', encoding="utf-8")
        _stagedjson_to_inputxml(FIXTURE, xml, bookmark=zbook)
        _inputxml_to_cii(xml, cii)
        zx, zy, zz = _element_delta_sums(cii.read_text(encoding="utf-8"))
        summary["legacy_z_delta_sums_xyz"] = [zx, zy, zz]
        if not (zz < zy):  # Z-up -> Sum|dz| smallest
            failures.append(f"legacy Z did not revert orientation: {zx, zy, zz}")

    summary["pass"] = not failures
    summary["failures"] = failures
    print(json.dumps(summary, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
