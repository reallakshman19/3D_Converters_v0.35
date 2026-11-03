from __future__ import annotations

from decimal import Decimal
import re
from typing import Any

from .base import CompileBlocked
from .xml import _decimal_text, _is_sentinel

_BAR_TO_KPA = Decimal("100")
LINE_STATE_POLICY_ID = "PdfInputEchoLineStartPolicy.v1"
REQUIRED_STATE_FIELDS = (
    "DIAMETER",
    "WALL_THICK",
    "INSUL_THICK",
    "CORR_ALLOW",
    "TEMP_EXP_C1",
    "PRESSURE_C1",
    "HYDRO_PRESSURE",
    "INSUL_DENSITY",
    "FLUID_DENSITY",
    "MATERIAL_NUM",
)
OPTIONAL_STATE_FIELDS = (
    "MATERIAL_NAME",
    "MODULUS_MPA",
    "POISSONS",
    "PIPE_DENSITY_KG_CUCM",
    *(f"HOT_MOD{index}_MPA" for index in range(1, 10)),
)
ALL_STATE_FIELDS = (*REQUIRED_STATE_FIELDS, *OPTIONAL_STATE_FIELDS)
FIELD_MARKERS = {
    "DIAMETER": re.compile(r"\bDia\s*=", re.I),
    "WALL_THICK": re.compile(r"\bWall\s*=", re.I),
    "INSUL_THICK": re.compile(r"\bInsul\s+Thk\s*=", re.I),
    "CORR_ALLOW": re.compile(r"\bCor\s*=", re.I),
    "TEMP_EXP_C1": re.compile(r"\bT1\s*=", re.I),
    "PRESSURE_C1": re.compile(r"\bP1\s*=", re.I),
    "HYDRO_PRESSURE": re.compile(r"\bPHyd\s*=", re.I),
    "INSUL_DENSITY": re.compile(r"\bInsul\s+Den\s*=", re.I),
    "FLUID_DENSITY": re.compile(r"\bFluid\s+Den\s*=", re.I),
    "MATERIAL_NUM": re.compile(r"\bMat\s*=", re.I),
    "MATERIAL_NAME": re.compile(r"\bMat\s*=", re.I),
    "MODULUS_MPA": re.compile(r"\bE\s*=", re.I),
    "POISSONS": re.compile(r"\bv\s*=", re.I),
    "PIPE_DENSITY_KG_CUCM": re.compile(r"\bPipe\s+Den\s*=", re.I),
    **{
        f"HOT_MOD{index}_MPA": re.compile(rf"\bEH{index}\s*=", re.I)
        for index in range(1, 10)
    },
}
_AXIS_MARKER = re.compile(r"\b(DX|DY|DZ)\s*=", re.I)


def explicit_fields(block: dict[str, Any], element: Any) -> set[str]:
    content = "\n".join(str(line) for line in block.get("lines") or [])
    explicit: set[str] = set()
    for field, pattern in FIELD_MARKERS.items():
        count = sum(1 for _ in pattern.finditer(content))
        if count > 1:
            raise CompileBlocked(
                f"PDF source block {block['blockId']} contains duplicate {field} markers."
            )
        if count == 1:
            explicit.add(field)
    axes = [match.group(1).upper() for match in _AXIS_MARKER.finditer(str(block["header"]))]
    duplicates = sorted({axis for axis in axes if axes.count(axis) > 1})
    if duplicates:
        raise CompileBlocked(
            f"PDF source block {block['blockId']} contains duplicate delta axes {duplicates}."
        )
    for axis in element.axis_present:
        explicit.add(f"DELTA_{axis[-1]}")
    if element.rigid_weight_kg is not None:
        explicit.add("RIGID")
    if element.bend is not None:
        explicit.add("BEND")
    if element.restraints:
        explicit.add("RESTRAINT")
    if element.sifs:
        explicit.add("SIF")
    return explicit


def field_value(field: str, element: Any) -> Any:
    state = element.state
    values = {
        "DIAMETER": state.diameter_mm,
        "WALL_THICK": state.wall_mm,
        "INSUL_THICK": state.insulation_mm,
        "CORR_ALLOW": state.corrosion_mm,
        "TEMP_EXP_C1": state.temp_c1,
        "PRESSURE_C1": _pressure_kpa(state.pressure1_bar),
        "HYDRO_PRESSURE": _pressure_kpa(state.hydro_bar),
        "INSUL_DENSITY": state.insul_density_kg_cucm,
        "FLUID_DENSITY": state.fluid_density_kg_cucm,
        "MATERIAL_NUM": state.material_num,
        "MATERIAL_NAME": state.material_name,
        "MODULUS_MPA": state.modulus_mpa,
        "POISSONS": state.poisson,
        "PIPE_DENSITY_KG_CUCM": state.pipe_density_kg_cucm,
        **{
            f"HOT_MOD{index}_MPA": value
            for index, value in enumerate(state.hot_mod_mpa, 1)
        },
    }
    return values[field]


def canonical_state_value(field: str, value: Any) -> str:
    if field == "MATERIAL_NAME":
        return str(value).strip()
    return _decimal_text(value, f"PDF Input Echo {field}")


def state_value_missing(field: str, value: Any) -> bool:
    if field == "MATERIAL_NAME":
        return not str(value or "").strip()
    return _is_sentinel(value)


def line_state_policy() -> dict[str, Any]:
    return {
        "policyId": LINE_STATE_POLICY_ID,
        "requiredFirstElementFields": list(REQUIRED_STATE_FIELDS),
        "optionalLineStateFields": list(OPTIONAL_STATE_FIELDS),
        "optionalAbsencePolicy": "EXPLICIT_OR_INHERITED_ABSENCE_EVIDENCE",
        "inheritanceAuthority": "EXACT_SAME_LINE_SCOPE_PREDECESSOR",
        "crossLineInheritance": "FORBIDDEN",
        "duplicateFieldPolicy": "BLOCK",
    }


def _pressure_kpa(value: Any) -> Any:
    if _is_sentinel(value):
        return value
    return Decimal(str(value)) * _BAR_TO_KPA


__all__ = [
    "ALL_STATE_FIELDS",
    "LINE_STATE_POLICY_ID",
    "OPTIONAL_STATE_FIELDS",
    "REQUIRED_STATE_FIELDS",
    "canonical_state_value",
    "explicit_fields",
    "field_value",
    "line_state_policy",
    "state_value_missing",
]
