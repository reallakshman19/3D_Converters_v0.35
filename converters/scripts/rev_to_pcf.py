#!/usr/bin/env python3
"""
Convert REV text exported by rvmparser into a first-pass PCF text file.

Functionality:
- Parses `HEAD`, `MODL`, `CNTB/CNTE`, and `PRIM/OBST/INSU` chunks from REV.
- Converts common piping-like REV primitives into PCF components.
- Reorders non-support components using coordinate-merged topology so connected runs
  are emitted in a stable adjacency-aware sequence.

Parameters expected:
- `--input`: path to REV file exported by rvmparser.
- `--output`: path to PCF file to write.
- `--coord-factor`: scaling factor applied to coordinates and diameters before writing.
- Optional `--pipeline-reference` and `--project-identifier`.
- Optional `--topology-merge-tolerance` for endpoint node merge distance in world units.
- Optional `--exclude-group-tokens` for comma-separated group-path exclusion filters.

Outputs passed:
- A `.pcf` text file with pipeline header and component records.
- Summary printed to stdout with component counts.

Fallback:
- Unsupported primitive kinds are emitted as placeholders (`MISC-COMPONENT`),
  and name-based placeholders for `TEE` / `VALVE` are used when detectable.
"""

from __future__ import annotations

import argparse
from collections import Counter
from datetime import datetime
import math
from pathlib import Path
from typing import Final, NotRequired, TypedDict


Vec3 = tuple[float, float, float]
Vec4 = tuple[float, float, float, float]
Matrix3x4 = tuple[
    float,
    float,
    float,
    float,
    float,
    float,
    float,
    float,
    float,
    float,
    float,
    float,
]


class RevHeader(TypedDict):
    info: str
    note: str
    date: str
    user: str
    project: str
    model_name: str


class RevPrimitive(TypedDict):
    chunk: str
    kind: int
    matrix: Matrix3x4
    bbox_min: Vec3
    bbox_max: Vec3
    payload: tuple[float, ...]
    group_path: str


class PcfComponent(TypedDict):
    component_type: str
    end_points: list[tuple[float, float, float, float]]
    s_key: str
    item_code: str
    description: str
    center_point: NotRequired[Vec3]
    angle_hundredths: NotRequired[int]
    support_coords: NotRequired[tuple[float, float, float, float]]


PRIM_KIND_PYRAMID: Final[int] = 1
PRIM_KIND_BOX: Final[int] = 2
PRIM_KIND_RECTANGULAR_TORUS: Final[int] = 3
PRIM_KIND_CIRCULAR_TORUS: Final[int] = 4
PRIM_KIND_ELLIPTICAL_DISH: Final[int] = 5
PRIM_KIND_SPHERICAL_DISH: Final[int] = 6
PRIM_KIND_SNOUT: Final[int] = 7
PRIM_KIND_CYLINDER: Final[int] = 8
PRIM_KIND_SPHERE: Final[int] = 9
PRIM_KIND_LINE: Final[int] = 10
PRIM_KIND_FACET_GROUP: Final[int] = 11


def _require_line(lines: list[str], index: int, context: str) -> str:
    if index >= len(lines):
        raise ValueError(f"Unexpected end of file while reading {context} at line index {index}.")
    return lines[index]


def _parse_header_pair(line: str, context: str) -> None:
    tokens = line.split()
    if len(tokens) != 2:
        raise ValueError(f"Expected two integers in chunk header for {context}, got: '{line}'")
    int(tokens[0])
    int(tokens[1])


def _parse_int_line(line: str, context: str) -> int:
    text = line.strip()
    if not text:
        raise ValueError(f"Expected integer for {context}, got empty line.")
    return int(text)


def _parse_float_line(line: str, expected_count: int, context: str) -> tuple[float, ...]:
    tokens = line.split()
    if len(tokens) != expected_count:
        raise ValueError(
            f"Expected {expected_count} float values for {context}, got {len(tokens)} in line: '{line}'"
        )
    return tuple(float(token) for token in tokens)


def _to_vec3(values: tuple[float, ...], context: str) -> Vec3:
    if len(values) != 3:
        raise ValueError(f"Expected Vec3 for {context}, got {len(values)} values.")
    return values[0], values[1], values[2]


def _to_vec4(values: tuple[float, ...], context: str) -> Vec4:
    if len(values) != 4:
        raise ValueError(f"Expected Vec4 for {context}, got {len(values)} values.")
    return values[0], values[1], values[2], values[3]


def _rows_to_matrix(row0: Vec4, row1: Vec4, row2: Vec4) -> Matrix3x4:
    return (
        row0[0],
        row1[0],
        row2[0],
        row0[1],
        row1[1],
        row2[1],
        row0[2],
        row1[2],
        row2[2],
        row0[3],
        row1[3],
        row2[3],
    )


def _parse_primitive_payload(kind: int, lines: list[str], index: int) -> tuple[tuple[float, ...], int]:
    if kind == PRIM_KIND_PYRAMID:
        v0 = _parse_float_line(_require_line(lines, index, "pyramid payload line 1"), 4, "pyramid line 1")
        v1 = _parse_float_line(_require_line(lines, index + 1, "pyramid payload line 2"), 3, "pyramid line 2")
        return v0 + v1, index + 2
    if kind == PRIM_KIND_BOX:
        v = _parse_float_line(_require_line(lines, index, "box payload"), 3, "box line")
        return v, index + 1
    if kind == PRIM_KIND_RECTANGULAR_TORUS:
        v = _parse_float_line(_require_line(lines, index, "rectangular torus payload"), 4, "rectangular torus line")
        return v, index + 1
    if kind == PRIM_KIND_CIRCULAR_TORUS:
        v = _parse_float_line(_require_line(lines, index, "circular torus payload"), 3, "circular torus line")
        return v, index + 1
    if kind == PRIM_KIND_ELLIPTICAL_DISH:
        v = _parse_float_line(_require_line(lines, index, "elliptical dish payload"), 2, "elliptical dish line")
        return v, index + 1
    if kind == PRIM_KIND_SPHERICAL_DISH:
        v = _parse_float_line(_require_line(lines, index, "spherical dish payload"), 2, "spherical dish line")
        return v, index + 1
    if kind == PRIM_KIND_SNOUT:
        v0 = _parse_float_line(_require_line(lines, index, "snout payload line 1"), 5, "snout line 1")
        v1 = _parse_float_line(_require_line(lines, index + 1, "snout payload line 2"), 4, "snout line 2")
        return v0 + v1, index + 2
    if kind == PRIM_KIND_CYLINDER:
        v = _parse_float_line(_require_line(lines, index, "cylinder payload"), 2, "cylinder line")
        return v, index + 1
    if kind == PRIM_KIND_SPHERE:
        v = _parse_float_line(_require_line(lines, index, "sphere payload"), 1, "sphere line")
        return v, index + 1
    if kind == PRIM_KIND_LINE:
        v = _parse_float_line(_require_line(lines, index, "line payload"), 2, "line line")
        return v, index + 1
    if kind == PRIM_KIND_FACET_GROUP:
        idx = index
        polygons_n = _parse_int_line(_require_line(lines, idx, "facet-group polygon count"), "facet-group polygons_n")
        idx += 1
        for polygon_index in range(polygons_n):
            contours_n = _parse_int_line(
                _require_line(lines, idx, f"facet-group contours_n for polygon {polygon_index}"),
                "facet-group contours_n",
            )
            idx += 1
            for contour_index in range(contours_n):
                vertices_n = _parse_int_line(
                    _require_line(
                        lines,
                        idx,
                        f"facet-group vertices_n for polygon {polygon_index}, contour {contour_index}",
                    ),
                    "facet-group vertices_n",
                )
                idx += 1
                idx += 2 * vertices_n
                if idx > len(lines):
                    raise ValueError("Unexpected end of file while reading facet-group vertices/normals.")
        return tuple(), idx
    raise ValueError(f"Unsupported primitive kind in REV payload parser: {kind}")


def parse_rev(path: Path) -> tuple[RevHeader, list[RevPrimitive]]:
    lines = path.read_text(encoding="utf-8", errors="strict").splitlines()

    header: RevHeader = {
        "info": "",
        "note": "",
        "date": "",
        "user": "",
        "project": "",
        "model_name": "",
    }
    primitives: list[RevPrimitive] = []
    group_stack: list[str] = []

    idx = 0
    while idx < len(lines):
        chunk = lines[idx].strip()
        idx += 1
        if not chunk:
            continue

        if chunk == "HEAD":
            _parse_header_pair(_require_line(lines, idx, "HEAD header pair"), "HEAD")
            idx += 1
            header["info"] = _require_line(lines, idx, "HEAD info")
            header["note"] = _require_line(lines, idx + 1, "HEAD note")
            header["date"] = _require_line(lines, idx + 2, "HEAD date")
            header["user"] = _require_line(lines, idx + 3, "HEAD user")
            idx += 4
            continue

        if chunk == "MODL":
            _parse_header_pair(_require_line(lines, idx, "MODL header pair"), "MODL")
            idx += 1
            header["project"] = _require_line(lines, idx, "MODL project").strip()
            header["model_name"] = _require_line(lines, idx + 1, "MODL model name").strip()
            idx += 2
            continue

        if chunk == "CNTB":
            _parse_header_pair(_require_line(lines, idx, "CNTB header pair"), "CNTB")
            idx += 1
            group_name = _require_line(lines, idx, "CNTB name").strip()
            idx += 1
            _ = _parse_float_line(_require_line(lines, idx, "CNTB translation"), 3, "CNTB translation")
            idx += 1
            _ = _parse_int_line(_require_line(lines, idx, "CNTB material"), "CNTB material")
            idx += 1
            group_stack.append(group_name)
            continue

        if chunk == "CNTE":
            _parse_header_pair(_require_line(lines, idx, "CNTE header pair"), "CNTE")
            idx += 1
            if not group_stack:
                raise ValueError("Encountered CNTE with empty group stack.")
            group_stack.pop()
            continue

        if chunk in {"PRIM", "OBST", "INSU"}:
            _parse_header_pair(_require_line(lines, idx, f"{chunk} header pair"), chunk)
            idx += 1

            kind = _parse_int_line(_require_line(lines, idx, f"{chunk} kind"), f"{chunk} kind")
            idx += 1

            row0 = _to_vec4(
                _parse_float_line(_require_line(lines, idx, f"{chunk} matrix row0"), 4, f"{chunk} matrix row0"),
                f"{chunk} matrix row0",
            )
            row1 = _to_vec4(
                _parse_float_line(
                    _require_line(lines, idx + 1, f"{chunk} matrix row1"), 4, f"{chunk} matrix row1"
                ),
                f"{chunk} matrix row1",
            )
            row2 = _to_vec4(
                _parse_float_line(
                    _require_line(lines, idx + 2, f"{chunk} matrix row2"), 4, f"{chunk} matrix row2"
                ),
                f"{chunk} matrix row2",
            )
            idx += 3
            matrix = _rows_to_matrix(row0, row1, row2)

            bbox_min = _to_vec3(
                _parse_float_line(_require_line(lines, idx, f"{chunk} bbox min"), 3, f"{chunk} bbox min"),
                f"{chunk} bbox min",
            )
            bbox_max = _to_vec3(
                _parse_float_line(_require_line(lines, idx + 1, f"{chunk} bbox max"), 3, f"{chunk} bbox max"),
                f"{chunk} bbox max",
            )
            idx += 2

            payload, idx = _parse_primitive_payload(kind, lines, idx)
            group_path = " > ".join(group_stack)
            primitives.append(
                {
                    "chunk": chunk,
                    "kind": kind,
                    "matrix": matrix,
                    "bbox_min": bbox_min,
                    "bbox_max": bbox_max,
                    "payload": payload,
                    "group_path": group_path,
                }
            )
            continue

        if chunk == "END:":
            _parse_header_pair(_require_line(lines, idx, "END header pair"), "END:")
            idx += 1
            break

        raise ValueError(f"Unrecognized REV chunk id '{chunk}' at line index {idx - 1}.")

    if not header["model_name"]:
        raise ValueError("Missing MODL chunk in REV input; failed to infer pipeline reference.")

    return header, primitives


def _matrix_column(matrix: Matrix3x4, column: int) -> Vec3:
    offset = column * 3
    return matrix[offset], matrix[offset + 1], matrix[offset + 2]


def _transform_point(matrix: Matrix3x4, point: Vec3) -> Vec3:
    x, y, z = point
    return (
        matrix[0] * x + matrix[3] * y + matrix[6] * z + matrix[9],
        matrix[1] * x + matrix[4] * y + matrix[7] * z + matrix[10],
        matrix[2] * x + matrix[5] * y + matrix[8] * z + matrix[11],
    )


def _norm(v: Vec3) -> float:
    return (v[0] ** 2 + v[1] ** 2 + v[2] ** 2) ** 0.5


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _mean_scale_xy(matrix: Matrix3x4) -> float:
    sx = _norm(_matrix_column(matrix, 0))
    sy = _norm(_matrix_column(matrix, 1))
    return 0.5 * (sx + sy)


def _safe_tail(path_text: str) -> str:
    if not path_text:
        return "UNNAMED"
    segments = [segment for segment in path_text.replace(">", "/").split("/") if segment.strip()]
    if not segments:
        return "UNNAMED"
    return segments[-1].strip()


def _infer_component_type_by_name(path_upper: str) -> str:
    if "VALV" in path_upper:
        return "VALVE"
    if "TEE" in path_upper:
        return "TEE"
    return "MISC-COMPONENT"


def _is_support_group(path_upper: str) -> bool:
    return "PIPESUPP" in path_upper or "PIPE-SUPP" in path_upper or "SUPPORT" in path_upper


def _parse_exclude_group_tokens(raw_tokens: str | None) -> list[str]:
    if raw_tokens is None:
        return []
    return [token.strip().upper() for token in raw_tokens.split(",") if token.strip()]


def _should_exclude_group_path(group_path: str, tokens_upper: list[str]) -> bool:
    if not tokens_upper:
        return False
    path_upper = group_path.upper()
    return any(token in path_upper for token in tokens_upper)


def _dims_from_bbox(bbox_min: Vec3, bbox_max: Vec3) -> Vec3:
    return (
        max(0.0, bbox_max[0] - bbox_min[0]),
        max(0.0, bbox_max[1] - bbox_min[1]),
        max(0.0, bbox_max[2] - bbox_min[2]),
    )


def _angle_to_hundredths(angle_radians: float) -> int:
    return int(round(abs(angle_radians) * 18000.0 / math.pi))


def _fit_center_from_endpoints_and_angle(p0: Vec3, p1: Vec3, plane_normal: Vec3, angle_radians: float) -> Vec3 | None:
    theta = abs(angle_radians)
    if theta < 1e-9:
        return None

    chord = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
    chord_len = _norm(chord)
    if chord_len < 1e-9:
        return None

    n_len = _norm(plane_normal)
    if n_len < 1e-9:
        return None
    n = (plane_normal[0] / n_len, plane_normal[1] / n_len, plane_normal[2] / n_len)

    half_theta = 0.5 * theta
    tan_half = math.tan(half_theta)
    if abs(tan_half) < 1e-9:
        return None

    midpoint = ((p0[0] + p1[0]) * 0.5, (p0[1] + p1[1]) * 0.5, (p0[2] + p1[2]) * 0.5)

    perp = _cross(n, chord)
    perp_len = _norm(perp)
    if perp_len < 1e-9:
        return None
    u = (perp[0] / perp_len, perp[1] / perp_len, perp[2] / perp_len)

    signed_side = 1.0 if angle_radians >= 0.0 else -1.0
    h = chord_len / (2.0 * tan_half)
    return (
        midpoint[0] + signed_side * u[0] * h,
        midpoint[1] + signed_side * u[1] * h,
        midpoint[2] + signed_side * u[2] * h,
    )


def _mirror_point_across_line(point: Vec3, line_a: Vec3, line_b: Vec3) -> Vec3:
    direction = (line_b[0] - line_a[0], line_b[1] - line_a[1], line_b[2] - line_a[2])
    length = _norm(direction)
    if length < 1e-9:
        return point
    u = (direction[0] / length, direction[1] / length, direction[2] / length)
    ap = (point[0] - line_a[0], point[1] - line_a[1], point[2] - line_a[2])
    t = _dot(ap, u)
    projection = (line_a[0] + u[0] * t, line_a[1] + u[1] * t, line_a[2] + u[2] * t)
    return (
        2.0 * projection[0] - point[0],
        2.0 * projection[1] - point[1],
        2.0 * projection[2] - point[2],
    )


def _placeholder_component(primitive: RevPrimitive) -> PcfComponent:
    matrix = primitive["matrix"]
    bbox_min = primitive["bbox_min"]
    bbox_max = primitive["bbox_max"]
    dims = _dims_from_bbox(bbox_min, bbox_max)
    center = (
        0.5 * (bbox_min[0] + bbox_max[0]),
        0.5 * (bbox_min[1] + bbox_max[1]),
        0.5 * (bbox_min[2] + bbox_max[2]),
    )

    axes = sorted(range(3), key=lambda axis: dims[axis], reverse=True)
    major_axis = axes[0]
    secondary_axis = axes[1]

    run_start_local = [center[0], center[1], center[2]]
    run_end_local = [center[0], center[1], center[2]]
    run_start_local[major_axis] = bbox_min[major_axis]
    run_end_local[major_axis] = bbox_max[major_axis]

    if run_start_local == run_end_local:
        run_start_local[major_axis] -= 1.0
        run_end_local[major_axis] += 1.0

    scale = max(_mean_scale_xy(matrix), 1e-9)
    positive_dims = [value for value in dims if value > 1e-9]
    nominal_local = min(positive_dims) if positive_dims else 1.0
    nominal_diameter = nominal_local * scale

    p0 = _transform_point(matrix, (run_start_local[0], run_start_local[1], run_start_local[2]))
    p1 = _transform_point(matrix, (run_end_local[0], run_end_local[1], run_end_local[2]))

    component_type = _infer_component_type_by_name(primitive["group_path"].upper())
    item_code = _safe_tail(primitive["group_path"])

    component: PcfComponent = {
        "component_type": component_type,
        "end_points": [
            (p0[0], p0[1], p0[2], nominal_diameter),
            (p1[0], p1[1], p1[2], nominal_diameter),
        ],
        "s_key": "MISC",
        "item_code": item_code,
        "description": primitive["group_path"] or "No group path",
    }

    if component_type == "VALVE":
        component["s_key"] = "VALV"
        return component

    if component_type == "TEE":
        branch_local = [center[0], center[1], center[2]]
        branch_local[secondary_axis] = bbox_max[secondary_axis]
        branch_world = _transform_point(matrix, (branch_local[0], branch_local[1], branch_local[2]))
        component["s_key"] = "TEEW"
        component["end_points"].append((branch_world[0], branch_world[1], branch_world[2], nominal_diameter))
        return component

    return component


def _support_from_primitive(primitive: RevPrimitive) -> PcfComponent:
    matrix = primitive["matrix"]
    bbox_min = primitive["bbox_min"]
    bbox_max = primitive["bbox_max"]
    center_local = (
        0.5 * (bbox_min[0] + bbox_max[0]),
        0.5 * (bbox_min[1] + bbox_max[1]),
        0.5 * (bbox_min[2] + bbox_max[2]),
    )
    center_world = _transform_point(matrix, center_local)
    item_code = _safe_tail(primitive["group_path"])
    return {
        "component_type": "SUPPORT",
        "end_points": [],
        "support_coords": (center_world[0], center_world[1], center_world[2], 0.0),
        "s_key": "01HG",
        "item_code": item_code,
        "description": primitive["group_path"] or "No group path",
    }


def _primitive_to_component(primitive: RevPrimitive) -> PcfComponent:
    kind = primitive["kind"]
    matrix = primitive["matrix"]
    payload = primitive["payload"]
    path_text = primitive["group_path"]
    path_upper = path_text.upper()
    item_code = _safe_tail(path_text)
    description = path_text or "No group path"

    if kind == PRIM_KIND_BOX and _is_support_group(path_upper):
        return _support_from_primitive(primitive)

    if kind == PRIM_KIND_CYLINDER:
        radius = abs(payload[0])
        height = payload[1]
        p0 = _transform_point(matrix, (0.0, 0.0, -0.5 * height))
        p1 = _transform_point(matrix, (0.0, 0.0, 0.5 * height))
        diameter = 2.0 * radius * max(_mean_scale_xy(matrix), 1e-9)
        return {
            "component_type": "PIPE",
            "end_points": [
                (p0[0], p0[1], p0[2], diameter),
                (p1[0], p1[1], p1[2], diameter),
            ],
            "s_key": "PIPW",
            "item_code": item_code,
            "description": description,
        }

    if kind == PRIM_KIND_LINE:
        a = payload[0]
        b = payload[1]
        p0 = _transform_point(matrix, (a, 0.0, 0.0))
        p1 = _transform_point(matrix, (b, 0.0, 0.0))
        dims = _dims_from_bbox(primitive["bbox_min"], primitive["bbox_max"])
        positive_dims = [value for value in dims if value > 1e-9]
        nominal_local = min(positive_dims) if positive_dims else 1.0
        diameter = nominal_local * max(_mean_scale_xy(matrix), 1e-9)
        return {
            "component_type": "PIPE",
            "end_points": [
                (p0[0], p0[1], p0[2], diameter),
                (p1[0], p1[1], p1[2], diameter),
            ],
            "s_key": "PIPW",
            "item_code": item_code,
            "description": description,
        }

    if kind == PRIM_KIND_CIRCULAR_TORUS:
        offset = payload[0]
        radius = abs(payload[1])
        angle = payload[2]
        p0 = _transform_point(matrix, (offset, 0.0, 0.0))
        p1 = _transform_point(matrix, (offset * math.cos(angle), offset * math.sin(angle), 0.0))
        center = _fit_center_from_endpoints_and_angle(p0, p1, _matrix_column(matrix, 2), angle)
        if center is None:
            center = _transform_point(matrix, (0.0, 0.0, 0.0))
        # Mirror CP across the EP chord to correct global bend-side inversion observed in imports.
        center = _mirror_point_across_line(center, p0, p1)
        diameter = 2.0 * radius * max(_mean_scale_xy(matrix), 1e-9)
        angle_hundredths = _angle_to_hundredths(angle)
        is_nominal_elbow = abs(angle_hundredths - 9000) <= 50
        return {
            "component_type": "ELBOW" if is_nominal_elbow else "BEND",
            "end_points": [
                (p0[0], p0[1], p0[2], diameter),
                (p1[0], p1[1], p1[2], diameter),
            ],
            "center_point": center,
            "s_key": "ELBW" if is_nominal_elbow else "BEBW",
            "item_code": item_code,
            "description": description,
            "angle_hundredths": angle_hundredths,
        }

    if kind == PRIM_KIND_SNOUT:
        radius_b = abs(payload[0])
        radius_t = abs(payload[1])
        height = payload[2]
        offset_x = payload[3]
        offset_y = payload[4]
        p0 = _transform_point(matrix, (-0.5 * offset_x, -0.5 * offset_y, -0.5 * height))
        p1 = _transform_point(matrix, (0.5 * offset_x, 0.5 * offset_y, 0.5 * height))
        scale = max(_mean_scale_xy(matrix), 1e-9)
        d0 = 2.0 * radius_b * scale
        d1 = 2.0 * radius_t * scale
        reducer_type = "REDUCER-ECCENTRIC" if abs(offset_x) > 1e-9 or abs(offset_y) > 1e-9 else "REDUCER-CONCENTRIC"
        return {
            "component_type": reducer_type,
            "end_points": [
                (p0[0], p0[1], p0[2], d0),
                (p1[0], p1[1], p1[2], d1),
            ],
            "s_key": "REDU",
            "item_code": item_code,
            "description": description,
        }

    return _placeholder_component(primitive)


def _assign_support_bore_from_neighbors(components: list[PcfComponent]) -> None:
    candidates: list[tuple[float, float, float, float]] = []
    for component in components:
        if component["component_type"] == "SUPPORT":
            continue
        for x, y, z, diameter in component["end_points"]:
            candidates.append((x, y, z, diameter))

    if not candidates:
        return

    for component in components:
        if component["component_type"] != "SUPPORT" or "support_coords" not in component:
            continue
        sx, sy, sz, sd = component["support_coords"]
        if sd > 0.0:
            continue
        best_distance = float("inf")
        best_diameter = 0.0
        for x, y, z, diameter in candidates:
            dx = sx - x
            dy = sy - y
            dz = sz - z
            distance2 = dx * dx + dy * dy + dz * dz
            if distance2 < best_distance:
                best_distance = distance2
                best_diameter = diameter
        fallback_diameter = 100.0
        component["support_coords"] = (sx, sy, sz, best_diameter if best_diameter > 0.0 else fallback_diameter)


def _distance_vec3(a: Vec3, b: Vec3) -> float:
    dx = a[0] - b[0]
    dy = a[1] - b[1]
    dz = a[2] - b[2]
    return math.sqrt(dx * dx + dy * dy + dz * dz)


def _bucket_index(position: Vec3, tolerance: float) -> tuple[int, int, int]:
    return (
        int(math.floor(position[0] / tolerance)),
        int(math.floor(position[1] / tolerance)),
        int(math.floor(position[2] / tolerance)),
    )


def _endpoint_position(endpoint: tuple[float, float, float, float]) -> Vec3:
    return endpoint[0], endpoint[1], endpoint[2]


def _resolve_junction_id(
    position: Vec3,
    tolerance: float,
    junction_positions: list[Vec3],
    bucket_to_junction_ids: dict[tuple[int, int, int], list[int]],
) -> int:
    base_bucket = _bucket_index(position, tolerance)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                bucket = (base_bucket[0] + dx, base_bucket[1] + dy, base_bucket[2] + dz)
                candidate_ids = bucket_to_junction_ids.get(bucket)
                if not candidate_ids:
                    continue
                for candidate_id in candidate_ids:
                    existing = junction_positions[candidate_id]
                    if _distance_vec3(position, existing) <= tolerance:
                        return candidate_id
    new_id = len(junction_positions)
    junction_positions.append(position)
    bucket_to_junction_ids.setdefault(base_bucket, []).append(new_id)
    return new_id


def _collect_connected_component_members(
    start_local_index: int,
    neighbors_by_local: list[set[int]],
    visited: set[int],
) -> list[int]:
    stack: list[int] = [start_local_index]
    members: list[int] = []
    while stack:
        local_index = stack.pop()
        if local_index in visited:
            continue
        visited.add(local_index)
        members.append(local_index)
        neighbor_indices = sorted(neighbors_by_local[local_index], reverse=True)
        for neighbor_index in neighbor_indices:
            if neighbor_index not in visited:
                stack.append(neighbor_index)
    return members


def _select_component_start_index(
    member_local_indices: list[int],
    local_to_global: list[int],
    local_to_junctions: list[tuple[int, ...]],
    junction_to_local: dict[int, list[int]],
    components: list[PcfComponent],
) -> int:
    sorted_members = sorted(member_local_indices, key=lambda index: local_to_global[index])
    best_local_index = sorted_members[0]
    best_priority = (0, 2, local_to_global[best_local_index])
    for local_index in sorted_members:
        junction_ids = local_to_junctions[local_index]
        leaf_junction_count = sum(1 for junction_id in set(junction_ids) if len(junction_to_local[junction_id]) == 1)
        component_type = components[local_to_global[local_index]]["component_type"]
        type_priority = 0 if component_type == "PIPE" else 1
        current_priority = (-leaf_junction_count, type_priority, local_to_global[local_index])
        if current_priority < best_priority:
            best_priority = current_priority
            best_local_index = local_index
    return best_local_index


def _walk_order_for_component_group(
    member_local_indices: list[int],
    start_local_index: int,
    neighbors_by_local: list[set[int]],
    local_to_global: list[int],
) -> list[int]:
    member_set = set(member_local_indices)
    ordered_local_indices: list[int] = []
    visited_local: set[int] = set()

    frontier: list[int] = [start_local_index]
    while frontier:
        local_index = frontier.pop()
        if local_index in visited_local:
            continue
        visited_local.add(local_index)
        ordered_local_indices.append(local_index)

        next_neighbors = [
            neighbor_index
            for neighbor_index in neighbors_by_local[local_index]
            if neighbor_index in member_set and neighbor_index not in visited_local
        ]
        next_neighbors.sort(key=lambda index: local_to_global[index], reverse=True)
        frontier.extend(next_neighbors)

    if len(ordered_local_indices) < len(member_local_indices):
        remaining = sorted(
            [index for index in member_local_indices if index not in visited_local],
            key=lambda index: local_to_global[index],
        )
        ordered_local_indices.extend(remaining)
    return ordered_local_indices


def _topology_order_components(components: list[PcfComponent], merge_tolerance: float) -> list[PcfComponent]:
    if merge_tolerance <= 0.0:
        raise ValueError(f"--topology-merge-tolerance must be > 0, got {merge_tolerance}.")

    network_global_indices: list[int] = []
    for global_index, component in enumerate(components):
        if component["component_type"] == "SUPPORT":
            continue
        end_points = component.get("end_points", [])
        if not end_points:
            continue
        network_global_indices.append(global_index)

    if len(network_global_indices) <= 1:
        return components.copy()

    local_to_global: list[int] = network_global_indices
    local_to_junctions: list[tuple[int, ...]] = []
    bucket_to_junction_ids: dict[tuple[int, int, int], list[int]] = {}
    junction_positions: list[Vec3] = []
    junction_to_local: dict[int, list[int]] = {}

    for local_index, global_index in enumerate(local_to_global):
        component = components[global_index]
        junction_ids: list[int] = []
        for endpoint in component["end_points"]:
            position = _endpoint_position(endpoint)
            junction_id = _resolve_junction_id(
                position=position,
                tolerance=merge_tolerance,
                junction_positions=junction_positions,
                bucket_to_junction_ids=bucket_to_junction_ids,
            )
            junction_ids.append(junction_id)
        local_to_junctions.append(tuple(junction_ids))
        for junction_id in set(junction_ids):
            junction_to_local.setdefault(junction_id, []).append(local_index)

    neighbors_by_local: list[set[int]] = [set() for _ in local_to_global]
    for local_indices in junction_to_local.values():
        if len(local_indices) <= 1:
            continue
        for local_index in local_indices:
            neighbors_by_local[local_index].update(
                other_local for other_local in local_indices if other_local != local_index
            )

    ordered_global_indices: list[int] = []
    visited_members: set[int] = set()
    for local_index in sorted(range(len(local_to_global)), key=lambda index: local_to_global[index]):
        if local_index in visited_members:
            continue
        member_local_indices = _collect_connected_component_members(
            start_local_index=local_index,
            neighbors_by_local=neighbors_by_local,
            visited=visited_members,
        )
        start_local_index = _select_component_start_index(
            member_local_indices=member_local_indices,
            local_to_global=local_to_global,
            local_to_junctions=local_to_junctions,
            junction_to_local=junction_to_local,
            components=components,
        )
        ordered_locals = _walk_order_for_component_group(
            member_local_indices=member_local_indices,
            start_local_index=start_local_index,
            neighbors_by_local=neighbors_by_local,
            local_to_global=local_to_global,
        )
        ordered_global_indices.extend(local_to_global[index] for index in ordered_locals)

    ordered_network_components = [components[index] for index in ordered_global_indices]
    ordered_network_iter = iter(ordered_network_components)
    network_index_set = set(network_global_indices)
    reordered_components: list[PcfComponent] = []
    for global_index, component in enumerate(components):
        if global_index in network_index_set:
            reordered_components.append(next(ordered_network_iter))
            continue
        reordered_components.append(component)

    return reordered_components


def _format_date_mdy(date_text: str) -> str:
    if not date_text.strip():
        return datetime.now().strftime("%m/%d/%Y")
    try:
        parsed = datetime.strptime(date_text.strip(), "%a %b %d %H:%M:%S %Y")
        return parsed.strftime("%m/%d/%Y")
    except ValueError:
        return datetime.now().strftime("%m/%d/%Y")


def _write_pcf(
    output_path: Path,
    components: list[PcfComponent],
    header: RevHeader,
    pipeline_reference: str,
    project_identifier: str,
    coord_factor: float,
) -> None:
    date_mdy = _format_date_mdy(header["date"])
    out_lines: list[str] = [
        "ISOGEN-FILES            ISOGEN.FLS",
        "UNITS-BORE              MM",
        "UNITS-CO-ORDS           MM",
        f"PIPELINE-REFERENCE      {pipeline_reference}",
        f"PROJECT-IDENTIFIER      {project_identifier}",
        f"DATE-MDY                {date_mdy}",
        "",
    ]

    for component in components:
        out_lines.append(component["component_type"])
        if component["component_type"] == "SUPPORT" and "support_coords" in component:
            sx, sy, sz, sd = component["support_coords"]
            out_lines.append(
                "    CO-ORDS             "
                f"{sx * coord_factor: .6f} {sy * coord_factor: .6f} {sz * coord_factor: .6f} {sd * coord_factor: .6f}"
            )
        else:
            for x, y, z, diameter in component["end_points"]:
                out_lines.append(
                    "    END-POINT           "
                    f"{x * coord_factor: .6f} {y * coord_factor: .6f} {z * coord_factor: .6f} {diameter * coord_factor: .6f}"
                )
        if "center_point" in component:
            cx, cy, cz = component["center_point"]
            out_lines.append(
                "    CENTRE-POINT        "
                f"{cx * coord_factor: .6f} {cy * coord_factor: .6f} {cz * coord_factor: .6f}"
            )
        if "angle_hundredths" in component:
            out_lines.append(f"    ANGLE               {component['angle_hundredths']}")
        out_lines.append(f"    SKEY                {component['s_key']}")
        out_lines.append(f"    ITEM-CODE           {component['item_code']}")
        out_lines.append(f"    DESCRIPTION         {component['description']}")
        out_lines.append("")

    output_path.write_text("\n".join(out_lines), encoding="utf-8")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert REV text exported by rvmparser to first-pass PCF.")
    parser.add_argument("--input", required=True, type=Path, help="Input REV file path.")
    parser.add_argument("--output", required=True, type=Path, help="Output PCF file path.")
    parser.add_argument(
        "--coord-factor",
        required=True,
        type=float,
        help="Multiplier applied to world coordinates/diameters before writing PCF (e.g., 1000 for m->mm).",
    )
    parser.add_argument(
        "--pipeline-reference",
        required=False,
        type=str,
        help="PCF pipeline reference. If omitted, model name from REV is used.",
    )
    parser.add_argument(
        "--project-identifier",
        required=False,
        type=str,
        help="PCF project identifier. If omitted, REV MODL project is used.",
    )
    parser.add_argument(
        "--topology-merge-tolerance",
        required=False,
        type=float,
        help="Endpoint merge tolerance (world units) used for topology-aware ordering. Default: 0.5.",
    )
    parser.add_argument(
        "--exclude-group-tokens",
        required=False,
        type=str,
        help=(
            "Comma-separated case-insensitive group-path tokens to exclude from REV->PCF conversion. "
            "Example: -PIPESUPP,RRIMS-PIPESUPP"
        ),
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    header, primitives = parse_rev(args.input)
    total_primitive_count = len(primitives)
    exclude_tokens = _parse_exclude_group_tokens(args.exclude_group_tokens)
    if exclude_tokens:
        primitives = [
            primitive
            for primitive in primitives
            if not _should_exclude_group_path(primitive["group_path"], exclude_tokens)
        ]
    components = [_primitive_to_component(primitive) for primitive in primitives]
    _assign_support_bore_from_neighbors(components)
    topology_merge_tolerance = (
        args.topology_merge_tolerance if args.topology_merge_tolerance is not None else 0.5
    )
    components = _topology_order_components(components=components, merge_tolerance=topology_merge_tolerance)

    pipeline_reference = args.pipeline_reference if args.pipeline_reference is not None else header["model_name"]
    project_identifier = args.project_identifier if args.project_identifier is not None else header["project"]

    _write_pcf(
        output_path=args.output,
        components=components,
        header=header,
        pipeline_reference=pipeline_reference,
        project_identifier=project_identifier,
        coord_factor=args.coord_factor,
    )

    counts = Counter(component["component_type"] for component in components)
    excluded_primitives = total_primitive_count - len(primitives)
    print(f"Wrote {args.output} with {len(components)} components from {len(primitives)} REV primitives.")
    if exclude_tokens:
        print(f"  Excluded primitives: {excluded_primitives}")
        print(f"  Excluded group tokens: {', '.join(exclude_tokens)}")
    for component_type, count in sorted(counts.items()):
        print(f"  {component_type}: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
