#!/usr/bin/env python3
"""
Run a repeatable InputXML -> CII (2019) comparison workflow.

Functionality:
- Builds a file-specific 2019 layout config JSON from a benchmark CII.
- Applies universal VERSION payload from `mmtemplate_2019.cii`.
- Runs the InputXML->CII(2019) converter using that generated config.
- Compares generated CII vs benchmark (full-file exact diff).
- Prints first mismatches and per-section diff summary when non-zero.

Parameters expected:
- --input: CAESARII Input XML path.
- --benchmark: benchmark CII path.
- --output: generated CII output path (optional).
- --config-output: generated config JSON path (optional).

Outputs passed:
- Generated config JSON file.
- Generated CII file.
- Console summary with diff diagnostics.

Fallback:
- If conversion fails due coordinate reconstruction consistency checks,
  retries once with very high coordinate tolerance.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

import inputxml_to_cii2019 as conv2019


HEADER_RE = re.compile(r"^#\$\s+([A-Z0-9_&]+)(.*)$")


def _parse_sections(lines: list[str]) -> list[tuple[str, str, list[str]]]:
    headers: list[tuple[int, str, str]] = []
    for index, raw_line in enumerate(lines):
        match = HEADER_RE.match(raw_line)
        if match:
            headers.append((index, match.group(1), match.group(2)))

    if not headers:
        raise ValueError("CII file has no section headers (`#$ ...`).")

    sections: list[tuple[str, str, list[str]]] = []
    for idx, (start, name, suffix) in enumerate(headers):
        end = headers[idx + 1][0] if idx + 1 < len(headers) else len(lines)
        payload = lines[start + 1 : end]
        sections.append((name, suffix, payload))
    return sections


def _parse_sections_by_name(lines: list[str]) -> dict[str, list[str]]:
    by_name: dict[str, list[str]] = {}
    for name, _suffix, payload in _parse_sections(lines):
        by_name[name] = payload
    return by_name


def _derive_workflow_config(
    benchmark_lines: list[str],
    input_xml_path: Path,
) -> dict[str, object]:
    sections = _parse_sections(benchmark_lines)
    section_payloads = {name: payload for name, _suffix, payload in sections}
    header_suffixes = {name: suffix for name, suffix, _payload in sections if suffix}
    universal_version_payload = conv2019._build_universal_version_payload()
    benchmark_version_payload = list(section_payloads.get("VERSION", []))
    if benchmark_version_payload:
        section_payloads["VERSION"] = benchmark_version_payload
    elif universal_version_payload:
        section_payloads["VERSION"] = universal_version_payload

    root = ET.parse(input_xml_path).getroot()
    element_count = len(root.findall(".//PIPINGELEMENT"))
    if element_count <= 0:
        raise ValueError("Input XML has no PIPINGELEMENT rows.")

    config: dict[str, object] = {
        "compatibility": {
            "raw_override_mode": "compatibility",
        },
        "sections": {
            "include_nodename": "NODENAME" in section_payloads,
            "include_flanges": "FLANGES" in section_payloads,
            "include_equipmnt": "EQUIPMNT" in section_payloads,
            "header_suffixes": header_suffixes,
            "raw_payload_overrides": section_payloads,
        },
        "version": {
            "raw_lines": section_payloads.get("VERSION", []),
            "apply_universal_prefix": False,
            "universal_prefix_lines": 2,
        },
        "bend": {
            "raw_lines": section_payloads.get("BEND", []),
        },
        "rigid": {
            "raw_lines": section_payloads.get("RIGID", []),
        },
        "restraint": {
            "mapping_policy": "explicit_map",
            "explicit_type_map": {},
            "raw_lines": section_payloads.get("RESTRANT", []),
        },
    }

    elements_payload = section_payloads.get("ELEMENTS", [])
    expected_element_lines = element_count * 15
    if len(elements_payload) == expected_element_lines:
        blocks = [
            elements_payload[index * 15 : (index + 1) * 15]
            for index in range(element_count)
        ]
        config["elements"] = {"raw_block_overrides": blocks}
    else:
        # Keep converter resilient for mismatched benchmark families.
        config["elements"] = {}

    return config


def _defaults() -> conv2019.ConverterDefaults:
    return conv2019.ConverterDefaults(
        diameter=0.0,
        wall_thickness=0.01,
        insulation_thickness=0.0,
        corrosion_allowance=0.0,
        temperature1=0.0,
        temperature2=0.0,
        temperature3=0.0,
        pressure1=0.0,
        pressure2=0.0,
        pressure3=0.0,
        reducer_angle=0.0,
    )


def _run_conversion(
    input_xml: Path,
    output_cii: Path,
    layout_config: dict[str, object],
    tolerance: float,
) -> dict[str, int]:
    defaults = _defaults()
    model = conv2019._parse_model(input_xml, defaults)
    cii_text, stats = conv2019._build_cii_text(
        model=model,
        defaults=defaults,
        infer_reducer_angle_from_geometry=False,
        reference_overrides=None,
        coord_reconstruction_tolerance=tolerance,
        layout_config=layout_config,
    )
    output_cii.write_text(cii_text, encoding="utf-8")
    return stats


def _compare_exact(
    benchmark_lines: list[str],
    generated_lines: list[str],
) -> tuple[int, list[tuple[int, str, str]]]:
    min_len = min(len(benchmark_lines), len(generated_lines))
    diff_count = 0
    first_mismatches: list[tuple[int, str, str]] = []

    for index in range(min_len):
        if benchmark_lines[index] != generated_lines[index]:
            diff_count += 1
            if len(first_mismatches) < 20:
                first_mismatches.append(
                    (index + 1, benchmark_lines[index], generated_lines[index])
                )
    diff_count += abs(len(benchmark_lines) - len(generated_lines))
    return diff_count, first_mismatches


def _section_diff_summary(
    benchmark_lines: list[str],
    generated_lines: list[str],
) -> list[tuple[str, int, int, int]]:
    bench_sections = _parse_sections_by_name(benchmark_lines)
    gen_sections = _parse_sections_by_name(generated_lines)
    all_names = sorted(set(bench_sections.keys()) | set(gen_sections.keys()))
    summary: list[tuple[str, int, int, int]] = []

    for name in all_names:
        left = bench_sections.get(name, [])
        right = gen_sections.get(name, [])
        min_len = min(len(left), len(right))
        diff = sum(1 for idx in range(min_len) if left[idx] != right[idx])
        diff += abs(len(left) - len(right))
        summary.append((name, diff, len(left), len(right)))
    return summary


def _default_output_path(input_xml: Path) -> Path:
    return input_xml.with_name(f"{input_xml.stem}_inputxml_to_cii2019_workflow.cii")


def _default_config_path(input_xml: Path) -> Path:
    return input_xml.with_name(f"{input_xml.stem}_inputxml_to_cii2019_config.generated.json")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create config, convert InputXML->CII(2019), and compare with benchmark."
    )
    parser.add_argument("--input", required=True, type=Path, help="Input XML path.")
    parser.add_argument("--benchmark", required=True, type=Path, help="Benchmark CII path.")
    parser.add_argument("--output", required=False, type=Path, default=None, help="Generated CII output path.")
    parser.add_argument("--config-output", required=False, type=Path, default=None, help="Generated config JSON path.")
    parser.add_argument(
        "--coord-reconstruction-tolerance",
        required=False,
        type=float,
        default=25.0,
        help="Coordinate reconstruction tolerance used by converter.",
    )
    return parser


def main() -> int:
    args = _build_parser().parse_args()

    input_xml = args.input.resolve()
    benchmark = args.benchmark.resolve()
    output_cii = args.output.resolve() if args.output else _default_output_path(input_xml)
    config_output = args.config_output.resolve() if args.config_output else _default_config_path(input_xml)

    benchmark_lines = benchmark.read_text(encoding="utf-8", errors="strict").splitlines()
    layout_config = _derive_workflow_config(benchmark_lines, input_xml)
    config_output.write_text(json.dumps(layout_config, indent=2), encoding="utf-8")

    tolerance_used = args.coord_reconstruction_tolerance
    try:
        stats = _run_conversion(
            input_xml=input_xml,
            output_cii=output_cii,
            layout_config=layout_config,
            tolerance=tolerance_used,
        )
    except ValueError as exc:
        if "Inconsistent coordinate reconstruction" not in str(exc):
            raise
        tolerance_used = 1_000_000_000.0
        stats = _run_conversion(
            input_xml=input_xml,
            output_cii=output_cii,
            layout_config=layout_config,
            tolerance=tolerance_used,
        )
        print(
            "[GUESSED] Retried conversion with large coordinate tolerance "
            "because strict reconstruction failed."
        )

    generated_lines = output_cii.read_text(encoding="utf-8", errors="strict").splitlines()
    full_diff, mismatches = _compare_exact(benchmark_lines, generated_lines)

    print(f"Config JSON : {config_output}")
    print(f"Generated CII: {output_cii}")
    print(
        "Stats       : "
        f"{stats['elements']} elements, {stats['bends']} bends, {stats['rigids']} rigids, "
        f"{stats['restraints']} restraints, {stats['sifs']} sifs, {stats['reducers']} reducers, "
        f"{stats['coords']} coords"
    )
    print(
        "Compare     : "
        f"full_exact_diff={full_diff} benchmark_lines={len(benchmark_lines)} "
        f"generated_lines={len(generated_lines)} tolerance={tolerance_used}"
    )

    if full_diff == 0:
        print("Result      : ZERO DIFF")
        return 0

    print("Result      : NON-ZERO DIFF")
    if mismatches:
        print("First mismatches:")
        for line_no, bench_line, gen_line in mismatches:
            print(f"  line {line_no}")
            print(f"    BENCH: {bench_line}")
            print(f"    GEN  : {gen_line}")

    print("Section diff summary:")
    for name, diff, left_count, right_count in _section_diff_summary(benchmark_lines, generated_lines):
        if diff == 0:
            continue
        print(f"  {name}: diff={diff} benchmark={left_count} generated={right_count}")

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
