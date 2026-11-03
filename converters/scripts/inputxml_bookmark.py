#!/usr/bin/env python3
"""Configurable defaults for CAESAR II InputXML generation.

The built-in values retain the historical B7410250 compatibility profile. They
are defaults only, not source authority. Callers can override them through a CII
or JSON bookmark file, inline JSON, or explicit CLI arguments. Resolution
provenance is returned so downstream diagnostics can distinguish source values
from compatibility defaults.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Any

SENTINEL = -1.0101


@dataclass
class InputXmlDefaults:
    temperature1: float = 50.0
    temperature2: float = 0.0
    temperature3: float = 0.0
    wall_thickness: float = 0.01
    modulus: float = 203_395_424.0
    hot_mod1: float = 201_464_896.0
    poissons: float = 0.292
    pipe_density: float = 0.007833
    material_num: float = 1.0
    material_name: str = 'LOW CARBON'
    anchor_stiffness: float = 9.41952e+19
    bend_type: float = 0.0
    default_bend_angle: float = 90.0
    version: str = '11.00'
    north_z: str = '0'
    north_y: str = '1'
    north_x: str = '0'
    vertical_axis: str = 'Y'
    datum_e: float = 0.0
    datum_n: float = 0.0
    datum_u: float = 0.0
    derive_north_from_axis: bool = True
    infer_od_from_nominal_bore: bool = False
    auto_anchors: bool = True


def _object_payload(value: Any, label: str) -> dict[str, Any]:
    if value is None or value == '':
        return {}
    if isinstance(value, dict):
        return dict(value)
    try:
        parsed = json.loads(str(value))
    except json.JSONDecodeError as error:
        raise ValueError(f'{label} is not valid JSON: {error.msg}') from error
    if not isinstance(parsed, dict):
        raise ValueError(f'{label} must be a JSON object.')
    return parsed


def parse_bookmark_json(path: Path) -> dict[str, Any]:
    return _object_payload(path.read_text(encoding='utf-8'), f'Bookmark {path.name}')


def parse_bookmark_json_text(value: str | dict[str, Any] | None) -> dict[str, Any]:
    return _object_payload(value, 'Inline bookmark JSON')


def parse_bookmark_cii(path: Path) -> dict[str, Any]:
    """Extract wall thickness and T1..T3 from the first CII ELEMENTS row."""
    text = path.read_text(encoding='utf-8', errors='replace')
    in_elements = False
    first_line1 = None
    first_line2 = None
    number_rx = re.compile(r'[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?')
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if line.startswith('#$'):
            in_elements = line.startswith('#$ ELEMENTS')
            continue
        if not in_elements or not line:
            continue
        nums = [float(token) for token in number_rx.findall(line)]
        if not nums:
            continue
        if first_line1 is None:
            first_line1 = nums
        elif first_line2 is None:
            first_line2 = nums
            break
    out: dict[str, Any] = {}
    if first_line2 and len(first_line2) >= 4:
        out['wall_thickness'] = first_line2[0]
        out['temperature1'] = first_line2[3]
        if len(first_line2) >= 5:
            out['temperature2'] = first_line2[4]
        if len(first_line2) >= 6:
            out['temperature3'] = first_line2[5]
    return out


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    token = str(value).strip().lower()
    if token in {'1', 'true', 'yes', 'on'}:
        return True
    if token in {'0', 'false', 'no', 'off'}:
        return False
    raise ValueError(f'Expected boolean, got {value!r}.')


def _coerce(field_type: Any, value: Any) -> Any:
    if field_type in ('float', float):
        return float(value)
    if field_type in ('str', str):
        return str(value)
    if field_type in ('bool', bool):
        return _coerce_bool(value)
    return value


def resolve_defaults(
    bookmark_path: Path | None = None,
    inline_json: str | dict[str, Any] | None = None,
    cli_overrides: dict[str, Any] | None = None,
) -> tuple[InputXmlDefaults, dict[str, str], list[dict[str, Any]]]:
    """Resolve defaults and return `(values, origins, issues)`.

    Precedence: CLI > inline JSON > bookmark file > compatibility defaults.
    Unknown or invalid fields are reported in `issues`; they are never silently
    converted into source values.
    """
    definitions = {field.name: field for field in fields(InputXmlDefaults)}
    merged: dict[str, Any] = {}
    origins = {name: 'compatibility-default' for name in definitions}
    issues: list[dict[str, Any]] = []

    def apply(payload: dict[str, Any], origin: str) -> None:
        for key, value in payload.items():
            if key not in definitions:
                issues.append({'code': 'STAGED_BOOKMARK_FIELD_IGNORED', 'field': key, 'origin': origin, 'value': value})
                continue
            try:
                merged[key] = _coerce(definitions[key].type, value)
                origins[key] = origin
            except (TypeError, ValueError) as error:
                issues.append({
                    'code': 'STAGED_BOOKMARK_VALUE_INVALID',
                    'field': key,
                    'origin': origin,
                    'value': value,
                    'message': str(error),
                })

    if bookmark_path is not None:
        suffix = bookmark_path.suffix.lower()
        if suffix == '.cii':
            apply(parse_bookmark_cii(bookmark_path), 'bookmark-file-cii')
        elif suffix in ('.json', ''):
            apply(parse_bookmark_json(bookmark_path), 'bookmark-file-json')
        else:
            issues.append({
                'code': 'STAGED_BOOKMARK_TYPE_UNSUPPORTED',
                'field': '',
                'origin': 'bookmark-file',
                'value': str(bookmark_path),
            })

    apply(parse_bookmark_json_text(inline_json), 'bookmark-inline-json')
    apply({key: value for key, value in (cli_overrides or {}).items() if value is not None}, 'cli')
    return InputXmlDefaults(**merged), origins, issues


def load_defaults(bookmark_path: Path | None, cli_overrides: dict | None = None) -> InputXmlDefaults:
    """Compatibility wrapper retained for existing callers."""
    defaults, _, _ = resolve_defaults(bookmark_path, None, cli_overrides)
    return defaults
