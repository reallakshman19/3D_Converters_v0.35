"""Exact-writer process master selection custody for R3; never edits engineering data.

This reuses the production writer's field-map normalization, line-key extraction,
row value lookup, numeric selection and precedence. The winning master row is
configuration evidence, not a fabricated source-XML field or edit permission.
"""
from __future__ import annotations

import hashlib
import json
from decimal import Decimal
from typing import Any

from roundtrip_foundation.lineage import patched
from .field_inventory import numeric


# Only these fields are written by the active Python process-master preprocessor.
PROCESS_TARGETS = {
    "pressure1": (("p1", ("P1", "Design Pressure", "Operating Pressure")),),
    "temperature1": (("t1", ("T1", "Temp Max", "Temperature Max")),),
    "temperature2": (("t2", ("T2", "Temp", "Temperature")),),
    "temperature3": (("t3", ("T3", "Temp Min", "Temperature Min")),),
    "hydroPressure": (("hydroPressure", ("HydroPressure", "Hydro Pressure",
                                        "Hydro Test Pressure", "Test Pressure")),),
    "fluidDensity": (
        ("densityMixed", ("Mixed kg/m3", "Mixed kg/m³", "Density Mixed")),
        ("densityGas", ("Gas kg/m3", "Gas kg/m³", "Density Gas")),
        ("densityLiquid", ("Liquid kg/m3", "Liquid kg/m³", "Density Liquid")),
    ),
}


def _hash_json(value: Any) -> str:
    data = json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, default=str).encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def _selected_from_rows(line_key: str, cfg: dict, target: str,
                        fallbacks: tuple[str, ...], raw_rows: list) -> dict:
    """Mirror _mapped_process_value, preserving row/header selected by it."""
    linelist = cfg.get("linelist", {})
    fmap = linelist.get("fieldMap", {}) if isinstance(linelist, dict) else {}
    keys = [patched._safe_text(fmap.get(target)), target, target.upper(), *fallbacks]
    entries = []
    matched = []
    for ordinal, row in enumerate(raw_rows):
        if not isinstance(row, dict) or patched._line_key_from_row(row, cfg) != line_key:
            continue
        matched.append(ordinal)
        for key in keys:
            value = patched._row_value(row, key)
            if value:
                normalized = patched._numeric_token(value)
                entries.append({
                    "rowOrdinal": ordinal,
                    "header": key,
                    "value": value,
                    "numericToken": normalized,
                    "valueContainer": ("row" if patched._safe_text(row.get(key)) else "_raw"),
                })
                break
    numeric_entries = [e for e in entries if e["numericToken"]]
    ordering = "LAST_VALID_NUMERIC" if target in ("t3", "densityMixed") else "FIRST_VALID_NUMERIC"
    if numeric_entries:
        winner = numeric_entries[-1] if ordering == "LAST_VALID_NUMERIC" else numeric_entries[0]
        selected = winner["numericToken"]
    else:
        winner = entries[0] if entries else None
        selected = winner["value"] if winner else ""
        ordering = "FIRST_NONEMPTY_NONNUMERIC" if winner else "NO_NONEMPTY_VALUE"
    # Fail closed on divergence from the active production selection helper.
    actual = patched._mapped_process_value(line_key, cfg, target, list(fallbacks))
    return {
        "target": target, "matchingRowOrdinals": matched,
        "candidateRowOrdinals": [e["rowOrdinal"] for e in entries],
        "selectionRule": ordering, "winner": winner, "selectedValue": selected,
        "matchesActiveWriterSelection": selected == actual,
    }


def resolve_process_authority(*, configuration: dict, configuration_sha256: str,
                              branch_name: str, field_name: str,
                              effective_xml_token: str | None,
                              postprocessed_xml_token: str | None) -> dict:
    """Resolve configured master authority without inverse-inference from CII."""
    cfg = patched._load_support_config(json.dumps(configuration, ensure_ascii=False,
                                                 default=str))
    patched._normalize_process_field_map(cfg)
    linelist = cfg.get("linelist", {})
    raw_rows = linelist.get("masterRows", []) if isinstance(linelist, dict) else []
    rows = raw_rows if isinstance(raw_rows, list) else []
    line_key = patched._line_key_from_branch(branch_name, cfg)
    matches = [
        i for i, row in enumerate(rows)
        if isinstance(row, dict) and patched._line_key_from_row(row, cfg) == line_key
    ]
    result = {
        "writerConsumedStage": "PYTHON_PREPROCESSED_XML",
        "authority": "EFFECTIVE_XML",
        "fieldName": field_name,
        "branchName": branch_name,
        "matchedLineKey": line_key,
        "matchedMasterRowOrdinals": matches,
        "configurationSha256": configuration_sha256,
        "masterRowsSha256": _hash_json(rows),
        "effectiveFieldMapSha256": _hash_json(
            linelist.get("fieldMap", {}) if isinstance(linelist, dict) else {}),
        "effectiveXmlToken": effective_xml_token,
        "postprocessedXmlToken": postprocessed_xml_token,
        "winningMaster": None,
        "precedenceRule": "XML_FALLBACK_IF_NO_SELECTED_MASTER_VALUE",
        "sourceInverseUniqueFromCii": False,
        "reasonCode": None,
    }
    attempted = []
    selected = None
    for target, fallbacks in PROCESS_TARGETS.get(field_name, ()):
        trial = _selected_from_rows(line_key, cfg, target, fallbacks, rows)
        attempted.append({
            "target": target, "selectionRule": trial["selectionRule"],
            "candidateRowOrdinals": trial["candidateRowOrdinals"],
            "matchesActiveWriterSelection": trial["matchesActiveWriterSelection"],
        })
        if trial["selectedValue"]:
            selected = trial
            break
    result["attemptedFields"] = attempted
    effective = numeric(effective_xml_token)
    processed = numeric(postprocessed_xml_token)
    if selected is not None:
        winner = selected["winner"]
        # Writer assigns selected master text to the Python XML field.
        # There is no basis for asserting authority unless actual observed
        # postprocessed bytes agree with the selected numeric master value.
        selected_numeric = numeric(selected["selectedValue"])
        if winner is not None:
            result["winningMaster"] = {
                "rowOrdinal": winner["rowOrdinal"],
                "rowIdentity": (
                    f"CONFIG:{configuration_sha256}:linelist.masterRows[{winner['rowOrdinal']}]"
                ),
                "selectedHeader": winner["header"],
                "field": selected["target"],
                "selectedRawValue": winner["value"],
                "writerSelectedValue": selected["selectedValue"],
                "valueContainer": winner["valueContainer"],
                "selectionRule": selected["selectionRule"],
                "matchesActiveWriterSelection": selected["matchesActiveWriterSelection"],
            }
        result["precedenceRule"] = "MASTER_SELECTED_VALUE_TAKES_PRECEDENCE_OVER_XML"
        if (selected["matchesActiveWriterSelection"] and selected_numeric is not None
                and processed is not None and selected_numeric == processed):
            result["authority"] = "CONFIGURATION_MASTER"
            result["reasonCode"] = "MASTER_OVERRIDES_XML_SOURCE_AUTHORITY"
        else:
            result["authority"] = "UNRESOLVED"
            result["reasonCode"] = "MASTER_SELECTED_VALUE_POSTPROCESS_MISMATCH"
    elif effective is not None and processed is not None and effective != processed:
        result["authority"] = "UNRESOLVED"
        result["reasonCode"] = "POSTPROCESS_FIELD_CHANGED_WITHOUT_PROVEN_MASTER"
    elif field_name in PROCESS_TARGETS and matches:
        result["reasonCode"] = "MASTER_ROW_MATCHED_BUT_TARGET_VALUE_BLANK_XML_FALLBACK"
    return result
