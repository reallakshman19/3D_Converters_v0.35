#!/usr/bin/env python3
"""
Convert REV text exported by rvmparser into a first-pass STEP (.stp) file
focused on support members.

Functionality:
- Reuses the REV parser from `rev_to_pcf.py`.
- Filters support-group primitives (default token: `RRIMS-PIPESUPP`).
- Converts each support `BOX` primitive to one linear member using the
  dominant bbox axis.
- Writes ISO-10303-21 STEP text with `CARTESIAN_POINT` + `POLYLINE`.

Parameters expected:
- `--input`: path to `.rev` input file.
- `--output`: path to `.stp` output file.
- `--coord-factor`: scale factor from REV units to STEP output units.
- `--support-path-contains`: path token used to identify support groups.
- `--include-generic-support-groups`: include generic support paths
  (`PIPESUPP`, `PIPE-SUPP`, `SUPPORT`) in addition to the explicit token.
- `--schema-name`: STEP schema name string (default `CIS2`).

Outputs passed:
- STEP text file containing line members and a support-members layer.
- Summary printed to stdout.

Fallback:
- Primitives with zero-length dominant bbox axis are skipped.
- If no qualifying support members are found, the script raises an error.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Final, TypedDict

from rev_to_pcf import Matrix3x4, PRIM_KIND_BOX, RevPrimitive, parse_rev


Vec3 = tuple[float, float, float]

DEFAULT_COORD_FACTOR: Final[float] = 1000.0
DEFAULT_SUPPORT_PATH_TOKEN: Final[str] = "RRIMS-PIPESUPP"
DEFAULT_STEP_SCHEMA: Final[str] = "CIS2"


class StepMember(TypedDict):
    label: str
    start: Vec3
    end: Vec3
    source_path: str
    section_mm: float


def _format_number(value: float) -> str:
    fixed = f"{value:.6f}"
    trimmed = fixed.rstrip("0").rstrip(".")
    return trimmed if trimmed else "0"


def _step_escape(value: str) -> str:
    return value.replace("'", "''")


def _dims_from_bbox(bbox_min: Vec3, bbox_max: Vec3) -> Vec3:
    return (
        max(0.0, bbox_max[0] - bbox_min[0]),
        max(0.0, bbox_max[1] - bbox_min[1]),
        max(0.0, bbox_max[2] - bbox_min[2]),
    )


def _transform_point(matrix: Matrix3x4, point: Vec3) -> Vec3:
    x, y, z = point
    return (
        matrix[0] * x + matrix[3] * y + matrix[6] * z + matrix[9],
        matrix[1] * x + matrix[4] * y + matrix[7] * z + matrix[10],
        matrix[2] * x + matrix[5] * y + matrix[8] * z + matrix[11],
    )


def _safe_tail(path_text: str) -> str:
    normalized = path_text.replace(">", "/")
    segments = [segment.strip() for segment in normalized.split("/") if segment.strip()]
    if not segments:
        return "UNNAMED"
    return segments[-1]


def _safe_parent(path_text: str) -> str:
    normalized = path_text.replace(">", "/")
    segments = [segment.strip() for segment in normalized.split("/") if segment.strip()]
    if len(segments) < 2:
        return "SUPPORT"
    return segments[-2]


def _is_support_path(path_upper: str, support_path_token_upper: str, include_generic_support_groups: bool) -> bool:
    if support_path_token_upper and support_path_token_upper in path_upper:
        return True
    if not include_generic_support_groups:
        return False
    return "PIPESUPP" in path_upper or "PIPE-SUPP" in path_upper or "SUPPORT" in path_upper


def _member_from_box_primitive(primitive: RevPrimitive, member_index: int, coord_factor: float) -> StepMember | None:
    matrix = primitive["matrix"]
    bbox_min = primitive["bbox_min"]
    bbox_max = primitive["bbox_max"]
    dims = _dims_from_bbox(bbox_min, bbox_max)
    axes = sorted(range(3), key=lambda axis: dims[axis], reverse=True)
    major_axis = axes[0]
    major_length = dims[major_axis]
    if major_length <= 1e-9:
        return None

    center_local = (
        0.5 * (bbox_min[0] + bbox_max[0]),
        0.5 * (bbox_min[1] + bbox_max[1]),
        0.5 * (bbox_min[2] + bbox_max[2]),
    )
    start_local = [center_local[0], center_local[1], center_local[2]]
    end_local = [center_local[0], center_local[1], center_local[2]]
    start_local[major_axis] = bbox_min[major_axis]
    end_local[major_axis] = bbox_max[major_axis]

    start_world = _transform_point(matrix, (start_local[0], start_local[1], start_local[2]))
    end_world = _transform_point(matrix, (end_local[0], end_local[1], end_local[2]))
    start_mm = (start_world[0] * coord_factor, start_world[1] * coord_factor, start_world[2] * coord_factor)
    end_mm = (end_world[0] * coord_factor, end_world[1] * coord_factor, end_world[2] * coord_factor)

    positive_dims = [dim for dim in dims if dim > 1e-9]
    section_local = min(positive_dims) if positive_dims else major_length
    section_mm = section_local * coord_factor

    parent = _safe_parent(primitive["group_path"])
    tail = _safe_tail(primitive["group_path"])
    label = f"{parent}:{tail}:{member_index + 1}"

    return {
        "label": label,
        "start": start_mm,
        "end": end_mm,
        "source_path": primitive["group_path"],
        "section_mm": section_mm,
    }


def _collect_support_members(
    primitives: list[RevPrimitive],
    coord_factor: float,
    support_path_token: str,
    include_generic_support_groups: bool,
) -> tuple[list[StepMember], int]:
    support_path_token_upper = support_path_token.upper().strip()
    members: list[StepMember] = []
    skipped_zero_length = 0

    for primitive in primitives:
        if primitive["kind"] != PRIM_KIND_BOX:
            continue
        path_upper = primitive["group_path"].upper()
        if not _is_support_path(path_upper, support_path_token_upper, include_generic_support_groups):
            continue

        member = _member_from_box_primitive(primitive, len(members), coord_factor)
        if member is None:
            skipped_zero_length += 1
            continue
        members.append(member)

    return members, skipped_zero_length


def _build_step_text(
    members: list[StepMember],
    output_name: str,
    schema_name: str,
    timestamp_utc: datetime,
) -> str:
    timestamp = timestamp_utc.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")

    data_lines: list[str] = []
    next_id = 1
    polyline_ids: list[int] = []

    def push(entity: str) -> int:
        nonlocal next_id
        current_id = next_id
        data_lines.append(f"#{current_id}={entity};")
        next_id += 1
        return current_id

    for member in members:
        start = member["start"]
        end = member["end"]
        start_id = push(
            "CARTESIAN_POINT('',"
            f"({_format_number(start[0])},{_format_number(start[1])},{_format_number(start[2])})"
            ")"
        )
        end_id = push(
            "CARTESIAN_POINT('',"
            f"({_format_number(end[0])},{_format_number(end[1])},{_format_number(end[2])})"
            ")"
        )
        polyline_name = _step_escape(member["label"])
        polyline_id = push(f"POLYLINE('{polyline_name}',(#{start_id},#{end_id}))")
        polyline_ids.append(polyline_id)

    if polyline_ids:
        refs = ",".join(f"#{polyline_id}" for polyline_id in polyline_ids)
        push(f"PRESENTATION_LAYER_ASSIGNMENT('SUPPORT_MEMBERS','',({refs}))")

    header_lines = [
        "ISO-10303-21;",
        "HEADER;",
        "FILE_DESCRIPTION(('REV support members exported as STEP polylines'),'2;1');",
        (
            "FILE_NAME("
            f"'{_step_escape(output_name)}',"
            f"'{_step_escape(timestamp)}',"
            "('rvmparser'),('rvmparser'),'rvmparser','rvmparser',''"
            ");"
        ),
        f"FILE_SCHEMA(('{_step_escape(schema_name)}'));",
        "ENDSEC;",
        "DATA;",
    ]
    footer_lines = [
        "ENDSEC;",
        "END-ISO-10303-21;",
    ]

    return "\n".join(header_lines + data_lines + footer_lines) + "\n"


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Convert REV support blocks to STEP member polylines.")
    parser.add_argument("--input", required=True, type=Path, help="Input REV file path.")
    parser.add_argument("--output", required=True, type=Path, help="Output STEP (.stp) file path.")
    parser.add_argument(
        "--coord-factor",
        type=float,
        default=DEFAULT_COORD_FACTOR,
        help="Multiplier applied to REV world coordinates before writing STEP (default: 1000.0).",
    )
    parser.add_argument(
        "--support-path-contains",
        type=str,
        default=DEFAULT_SUPPORT_PATH_TOKEN,
        help="Case-insensitive token required in group path for support export (default: RRIMS-PIPESUPP).",
    )
    parser.add_argument(
        "--include-generic-support-groups",
        action="store_true",
        help="Include generic support-like group paths (PIPESUPP/PIPE-SUPP/SUPPORT).",
    )
    parser.add_argument(
        "--schema-name",
        type=str,
        default=DEFAULT_STEP_SCHEMA,
        help="STEP FILE_SCHEMA token to write (default: CIS2).",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    if args.coord_factor <= 0.0:
        raise ValueError("--coord-factor must be greater than zero.")

    _, primitives = parse_rev(args.input)
    members, skipped_zero_length = _collect_support_members(
        primitives,
        args.coord_factor,
        args.support_path_contains,
        args.include_generic_support_groups,
    )

    if not members:
        raise ValueError(
            "No support BOX primitives matched the selected support-path filter. "
            "Try --include-generic-support-groups or change --support-path-contains."
        )

    step_text = _build_step_text(
        members,
        args.output.name,
        args.schema_name,
        datetime.now(timezone.utc),
    )
    args.output.write_text(step_text, encoding="utf-8")

    print(
        f"Wrote {args.output} with {len(members)} STEP member polylines "
        f"(skipped {skipped_zero_length} zero-length support primitives)."
    )


if __name__ == "__main__":
    main()

