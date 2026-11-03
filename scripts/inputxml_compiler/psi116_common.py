#!/usr/bin/env python3
"""Pure helpers shared by the registered strict PSI116 compiler profile."""
from __future__ import annotations

import hashlib
import json
import math
import re
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any, Iterable

from lxml import etree as ET

from .base import CompileBlocked

PSI116_NS = "http://aveva.com/pipeStress116.xsd"
PROFILE_ID = "pipesstressexport-psi116-xml"
POLICY_PATH = (
    Path(__file__).resolve().parents[2]
    / "contracts"
    / "topo-enriched-xml"
    / "cii2019-proof"
    / "psi116-canonical-projection-policy.json"
)
POSITION_RE = re.compile(
    r"^\s*([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s*$"
)
SOURCE_TIME_RE = re.compile(
    r"^(\d{2})/(\d{2})/(\d{4}),\s*(\d{2}):(\d{2}):(\d{2})$"
)


def stable_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def prefixed_sha256(data: bytes) -> str:
    return f"sha256:{sha256_hex(data)}"


def json_hash(value: Any, *, prefixed: bool = False) -> str:
    digest = sha256_hex(stable_json_bytes(value))
    return f"sha256:{digest}" if prefixed else digest


def load_projection_policy(path: Path = POLICY_PATH) -> tuple[dict[str, Any], str]:
    try:
        raw = path.read_bytes()
        value = json.loads(raw.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise CompileBlocked(f"PSI116 projection policy is unreadable: {path}: {exc}") from exc
    if not isinstance(value, dict) or value.get("schema") != "Psi116CanonicalProjectionPolicy.v1":
        raise CompileBlocked("PSI116 projection policy must be Psi116CanonicalProjectionPolicy.v1.")
    if value.get("profileId") != PROFILE_ID or value.get("sourceNamespace") != PSI116_NS:
        raise CompileBlocked("PSI116 projection policy identity does not match the registered profile.")
    return value, sha256_hex(stable_json_bytes(value))


def q(name: str) -> str:
    return f"{{{PSI116_NS}}}{name}"


def local_name(tag: str) -> str:
    return ET.QName(tag).localname if tag.startswith("{") else tag


def namespace(tag: str) -> str:
    return ET.QName(tag).namespace or "" if tag.startswith("{") else ""


def child_elements(parent: ET._Element) -> list[ET._Element]:
    return [child for child in parent if isinstance(child.tag, str)]


def child_map(parent: ET._Element) -> dict[str, list[ET._Element]]:
    result: dict[str, list[ET._Element]] = {}
    for child in child_elements(parent):
        if namespace(child.tag) != PSI116_NS:
            raise CompileBlocked(
                f"PSI116 child {local_name(child.tag)!r} has namespace {namespace(child.tag)!r}."
            )
        result.setdefault(local_name(child.tag), []).append(child)
    return result


def require_single(mapping: dict[str, list[ET._Element]], name: str, path: str) -> ET._Element:
    rows = mapping.get(name) or []
    if len(rows) != 1:
        raise CompileBlocked(f"{path} requires exactly one {name}; found {len(rows)}.")
    return rows[0]


def optional_single(mapping: dict[str, list[ET._Element]], name: str, path: str) -> ET._Element | None:
    rows = mapping.get(name) or []
    if len(rows) > 1:
        raise CompileBlocked(f"{path} permits at most one {name}; found {len(rows)}.")
    return rows[0] if rows else None


def require_no_attributes(element: ET._Element, path: str) -> None:
    if element.attrib:
        raise CompileBlocked(f"{path} has undeclared attributes: {sorted(element.attrib)}.")


def text_value(element: ET._Element | None, field: str, *, allow_blank: bool = False) -> str:
    if element is not None:
        require_no_attributes(element, field)
        if child_elements(element):
            raise CompileBlocked(f"PSI116 leaf field {field} contains undeclared child elements.")
    value = "" if element is None or element.text is None else element.text.strip()
    if not value and not allow_blank:
        raise CompileBlocked(f"PSI116 field {field} is required and cannot be blank.")
    return value


def finite_decimal(value: Any, field: str, *, positive: bool = False, nonnegative: bool = False) -> Decimal:
    raw = str(value).strip()
    if not raw:
        raise CompileBlocked(f"PSI116 field {field} is required.")
    try:
        result = Decimal(raw)
    except InvalidOperation as exc:
        raise CompileBlocked(f"PSI116 field {field} is not decimal: {raw!r}.") from exc
    if not result.is_finite():
        raise CompileBlocked(f"PSI116 field {field} must be finite.")
    if positive and result <= 0:
        raise CompileBlocked(f"PSI116 field {field} must be positive.")
    if nonnegative and result < 0:
        raise CompileBlocked(f"PSI116 field {field} must be non-negative.")
    return result


def decimal_text(value: Any, field: str, *, positive: bool = False, nonnegative: bool = False) -> str:
    number = finite_decimal(value, field, positive=positive, nonnegative=nonnegative)
    if number == 0:
        return "0"
    result = format(number, "f")
    return result.rstrip("0").rstrip(".") if "." in result else result


def positive_integer(value: Any, field: str) -> int:
    number = finite_decimal(value, field, positive=True)
    if number != number.to_integral_value():
        raise CompileBlocked(f"PSI116 field {field} must be integer-like.")
    return int(number)


def integer_value(value: Any, field: str, *, allowed: Iterable[int] | None = None) -> int:
    number = finite_decimal(value, field)
    if number != number.to_integral_value():
        raise CompileBlocked(f"PSI116 field {field} must be integer-like.")
    result = int(number)
    if allowed is not None and result not in set(allowed):
        raise CompileBlocked(f"PSI116 field {field} has unsupported value {result}.")
    return result


def parse_position(value: str, field: str) -> tuple[Decimal, Decimal, Decimal]:
    match = POSITION_RE.fullmatch(value)
    if not match:
        raise CompileBlocked(f"PSI116 field {field} must contain exactly three whitespace-delimited decimal coordinates.")
    return tuple(finite_decimal(part, field) for part in match.groups())  # type: ignore[return-value]


def canonical_time(value: str) -> str:
    match = SOURCE_TIME_RE.fullmatch(value.strip())
    if not match:
        raise CompileBlocked("PSI116 DateTime must use DD/MM/YYYY, HH:MM:SS.")
    day, month, year, hour, minute, second = map(int, match.groups())
    days = (31, 29 if _leap_year(year) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
    if not 1 <= month <= 12 or not 1 <= day <= days[month - 1] or hour > 23 or minute > 59 or second > 59:
        raise CompileBlocked("PSI116 DateTime contains an invalid civil date/time.")
    return f"{year:04d}/{month:02d}/{day:02d} {hour:02d}:{minute:02d}:{second:02d}"



def _leap_year(year: int) -> bool:
    return year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)

def exact_dict_equal(left: Any, right: Any) -> bool:
    return stable_json_bytes(left) == stable_json_bytes(right)


def finite_float(value: Any, field: str) -> float:
    number = float(finite_decimal(value, field))
    if not math.isfinite(number):
        raise CompileBlocked(f"PSI116 field {field} must be finite.")
    return number


__all__ = [name for name in globals() if not name.startswith("_")]
