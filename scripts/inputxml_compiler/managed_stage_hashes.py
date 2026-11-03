#!/usr/bin/env python3
"""Managed-stage source identity and ECMAScript-canonical artifact hashes."""
from __future__ import annotations

import hashlib
import json
import math
from typing import Any

HASH_ALGORITHM = "fnv1a64-canonical-json-v1"
_SELF_HASH_KEYS = frozenset({
    "canonicalTopologyHash",
    "topologyTraceLedgerHash",
    "svgSceneHash",
    "parsedInputXmlTopologyHash",
    "topologyParityReportHash",
})


def reject_unpaired_surrogates(value: Any, *, path: str = "$") -> None:
    """Reject strings that cannot participate in strict cross-language UTF-8."""
    if isinstance(value, str):
        _reject_string_surrogates(value, path)
        return
    if isinstance(value, (list, tuple)):
        for index, item in enumerate(value):
            reject_unpaired_surrogates(item, path=f"{path}[{index}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError(f"Managed-stage JSON object key at {path} is not text.")
            _reject_string_surrogates(key, f"{path}.<key>")
            reject_unpaired_surrogates(item, path=f"{path}.{key}")


def normalize_source_text(value: str) -> str:
    text = str(value)
    if text.startswith("\ufeff"):
        text = text[1:]
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def source_content_hash(source_text: str) -> str:
    normalized = normalize_source_text(source_text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def source_file_id(source_text: str, source_kind: str = "stagedjson") -> str:
    normalized = normalize_source_text(source_text)
    raw = f"{source_kind}\0{normalized}".encode("utf-8")
    return f"source-{hashlib.sha256(raw).hexdigest()[:32]}"


def source_entity_id(
    file_id: str,
    source_path: str,
    *,
    source_kind: str = "stagedjson",
    entity_kind: str = "json-object",
) -> str:
    raw = f"{file_id}\0{source_kind}\0{source_path}\0{entity_kind}".encode("utf-8")
    return f"entity-{hashlib.sha256(raw).hexdigest()[:32]}"


def canonical_json(value: Any, *, extra_omit: tuple[str, ...] = ()) -> str:
    """Serialize exactly as sorted-key JavaScript JSON.stringify would."""
    reject_unpaired_surrogates(value)
    omit = _SELF_HASH_KEYS | set(extra_omit)
    return _canonical_text(value, omit)


def canonical_number(value: int | float) -> str:
    """Return ECMAScript NumberToString/JSON.stringify numeric lexical form."""
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"Cannot hash non-finite number: {value!r}.")
    if number == 0:
        return "0"
    sign = "-" if number < 0 else ""
    magnitude = abs(number)
    raw = repr(magnitude).lower()
    mantissa, exponent = _split_exponent(raw)
    digits, decimal_position = _significant_digits(mantissa, exponent)
    if 1e-6 <= magnitude < 1e21:
        body = _fixed_number(digits, decimal_position)
    else:
        body = _scientific_number(digits, decimal_position - 1)
    return sign + body


def deterministic_hash(value: Any, *, hash_field: str | None = None) -> str:
    omit = (hash_field,) if hash_field else ()
    data = canonical_json(value, extra_omit=omit).encode("utf-8")
    current = 0xCBF29CE484222325
    for byte in data:
        current ^= byte
        current = (current * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return f"fnv1a64:{current:016x}"


def _canonical_text(value: Any, omit: set[str]) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False, allow_nan=False)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return canonical_number(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_canonical_text(item, omit) for item in value) + "]"
    if isinstance(value, dict):
        keys = sorted(
            (key for key in value if key not in omit),
            key=_utf16_sort_key,
        )
        return "{" + ",".join(
            f"{json.dumps(key, ensure_ascii=False)}:{_canonical_text(value[key], omit)}"
            for key in keys
        ) + "}"
    raise TypeError(f"Unsupported topology hash value: {type(value).__name__}.")


def _reject_string_surrogates(value: str, path: str) -> None:
    for index, character in enumerate(value):
        code = ord(character)
        if 0xD800 <= code <= 0xDFFF:
            kind = "high" if code <= 0xDBFF else "low"
            raise ValueError(
                f"Managed-stage string at {path} contains an unpaired {kind} surrogate "
                f"at character {index}."
            )


def _split_exponent(raw: str) -> tuple[str, int]:
    if "e" not in raw:
        return raw, 0
    mantissa, exponent = raw.split("e", 1)
    return mantissa, int(exponent)


def _significant_digits(mantissa: str, exponent: int) -> tuple[str, int]:
    if "." in mantissa:
        before, after = mantissa.split(".", 1)
    else:
        before, after = mantissa, ""
    if before == "0":
        leading = len(after) - len(after.lstrip("0"))
        digits = after.lstrip("0") or "0"
        decimal_position = -leading + exponent
    else:
        digits = (before + after).lstrip("0") or "0"
        decimal_position = len(before) + exponent
    return digits.rstrip("0") or "0", decimal_position


def _fixed_number(digits: str, position: int) -> str:
    if position <= 0:
        return "0." + ("0" * -position) + digits
    if position >= len(digits):
        return digits + ("0" * (position - len(digits)))
    return digits[:position] + "." + digits[position:]


def _scientific_number(digits: str, exponent: int) -> str:
    mantissa = digits[0] + (("." + digits[1:]) if len(digits) > 1 else "")
    sign = "+" if exponent >= 0 else ""
    return f"{mantissa}e{sign}{exponent}"


def _utf16_sort_key(value: str) -> bytes:
    return str(value).encode("utf-16-be", errors="surrogatepass")


__all__ = [
    "HASH_ALGORITHM",
    "canonical_json",
    "canonical_number",
    "deterministic_hash",
    "normalize_source_text",
    "reject_unpaired_surrogates",
    "source_content_hash",
    "source_entity_id",
    "source_file_id",
]
