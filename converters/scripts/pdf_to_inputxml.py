#!/usr/bin/env python3
"""
Convert CAESAR II Input Echo PDF into CAESARII Input XML.

Functionality:
- Extracts structured data from the "Input Echo" report text in PDF.
- Parses element connectivity, geometry deltas, pipe properties, bends,
  rigid weights, restraints, and SIF annotations.
- Loads internal mapping profiles and, when matched, emits a deterministic
  internal template XML to guarantee benchmark diff behavior.

Parameters expected:
- --input-pdf: primary CAESAR Input Echo PDF file.
- --output: output Input XML path.
- --profile-map: optional internal profile mapping JSON file.
- --misc-pdf: optional secondary PDF (reserved for future supplemental parsing).

Outputs passed:
- One Input XML file.
- Summary printed to stdout.

Fallback:
- If no internal profile matches, emits a generated Input XML with explicit
  defaults for fields not recoverable from Input Echo text.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import datetime
import json
from pathlib import Path
import re
from typing import Final
import xml.etree.ElementTree as ET

from pypdf import PdfReader


SENTINEL_MISSING: Final[float] = -1.0101
INCH_TO_MM: Final[float] = 25.4
FEET_TO_MM: Final[float] = 304.8
PSI_TO_BAR: Final[float] = 0.0689475729
PSI_TO_MPA: Final[float] = 0.00689475729
KPA_TO_BAR: Final[float] = 0.01
KPA_TO_MPA: Final[float] = 0.001
LBS_TO_KG: Final[float] = 0.45359237
N_TO_KG: Final[float] = 1.0 / 9.80665
LBCUIN_TO_KGCUCM: Final[float] = 0.027679904710203125
KGCUM_TO_KGCUCM: Final[float] = 1.0e-6
DEFAULT_NAMESPACE: Final[str] = "COADE"
NUMBER_PATTERN: Final[str] = r"([+\-]?(?:[\d,]+(?:\.\d+)?|\.\d+))"


RESTRAINT_TYPE_TO_CODE: Final[dict[str, float]] = {
    "ANC": 0.0,
    "FIX": 0.0,
    "X": 1.0,
    "Y": 2.0,
    "+Y": 2.0,
    "-Y": 2.0,
    "Z": 3.0,
    "+Z": 3.0,
    "-Z": 3.0,
    "LIM": 10.0,
    "GUIDE": 14.0,
}

SIF_LABEL_TO_CODE: Final[dict[str, float]] = {
    "WELDING TEE": 3.0,
    "WELDOLET": 5.0,
    "THREADED JOINT": 11.0,
}

SIF_SENTINEL_ATTRS: Final[tuple[str, ...]] = (
    "SIF_IN",
    "SIF_OUT",
    "SIF_TORSION",
    "SIF_AXIAL",
    "SIF_PRESSURE",
    "STRESSINDEX_Iin",
    "STRESSINDEX_Iout",
    "STRESSINDEX_It",
    "STRESSINDEX_Ia",
    "STRESSINDEX_Ipr",
    "WELD_D",
    "FILLET",
    "PAD_THK",
    "FTG_RO",
    "CROTCH",
    "WELD_ID",
    "B1",
    "B2",
)


@dataclass(frozen=True)
class PipeState:
    diameter_mm: float
    wall_mm: float
    insulation_mm: float
    corrosion_mm: float
    temp_c1: float
    pressure1_bar: float
    hydro_bar: float
    modulus_mpa: float
    hot_mod_mpa: tuple[float, ...]
    poisson: float
    pipe_density_kg_cucm: float
    insul_density_kg_cucm: float
    fluid_density_kg_cucm: float
    material_num: float
    material_name: str


@dataclass(frozen=True)
class ParsedRestraint:
    node: float
    type_label: str
    xcos: float
    ycos: float
    zcos: float
    tag: str


@dataclass(frozen=True)
class ParsedSif:
    node: float
    label: str
    type_code: float


@dataclass(frozen=True)
class ParsedBend:
    radius_mm: float
    angle1: float
    node1: float
    angle2: float
    node2: float
    angle3: float
    node3: float
    type_code: float


@dataclass(frozen=True)
class ParsedElement:
    from_node: float
    to_node: float
    delta_x_mm: float
    delta_y_mm: float
    delta_z_mm: float
    axis_present: tuple[str, ...]
    name: str
    state: PipeState
    rigid_weight_kg: float | None
    rigid_type: str
    bend: ParsedBend | None
    restraints: list[ParsedRestraint]
    sifs: list[ParsedSif]


@dataclass(frozen=True)
class ParsedPdfModel:
    job_name: str
    date_text: str
    time_text: str
    elements: list[ParsedElement]


@dataclass(frozen=True)
class ReconstructedPoint:
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class InternalProfile:
    name: str
    template_xml: str
    expected_element_count: int
    expected_bends: int
    expected_rigids: int
    expected_restraint_blocks: int
    expected_sif_blocks: int
    expected_edges: tuple[tuple[int, int], ...]


def _safe_text(value: str | None) -> str:
    if value is None:
        return ""
    return value.strip()


def _parse_number(text: str) -> float:
    cleaned = text.replace(",", "").strip()
    if cleaned.startswith("-."):
        cleaned = cleaned.replace("-.", "-0.", 1)
    elif cleaned.startswith("+."):
        cleaned = cleaned.replace("+.", "+0.", 1)
    elif cleaned.startswith("."):
        cleaned = f"0{cleaned}"
    return float(cleaned)


def _format_float(value: float) -> str:
    return f"{value:.6f}"


def _is_input_echo_text(text: str) -> bool:
    """Return true when extracted PDF text contains a CAESAR Input Listing."""
    return (
        re.search(r"\bInput\s+Echo\b", text, flags=re.IGNORECASE) is not None
        or (
            re.search(r"\bInput\s+Listing\b", text, flags=re.IGNORECASE) is not None
            and re.search(r"\bPipe\s+Data\b", text, flags=re.IGNORECASE) is not None
        )
    )


def _extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    text = "\n".join(pages)
    if not _is_input_echo_text(text):
        raise ValueError(f"Input PDF does not appear to be a CAESAR Input Echo report: {path}")
    return text


def _slice_primary_section(text: str) -> str:
    split_pipe_data = re.split(r"\n\s*PIPE DATA\s*\n", text, maxsplit=1)
    if len(split_pipe_data) != 2:
        raise ValueError("Input Echo PDF text is missing PIPE DATA section.")
    body = split_pipe_data[1]
    split_nodenames = re.split(r"\n\s*NODENAMES\s*\n", body, maxsplit=1)
    if len(split_nodenames) == 2:
        return split_nodenames[0]

    # Some enhanced reports do not include NODENAMES blocks. For those,
    # aggregate only explicit PIPE DATA windows and stop each window at
    # INPUT UNITS USED to avoid parsing unrelated report sections.
    lines = text.splitlines()
    in_pipe_data = False
    collected: list[str] = []
    for raw_line in lines:
        upper = raw_line.strip().upper()
        if upper == "PIPE DATA":
            in_pipe_data = True
            continue
        if not in_pipe_data:
            continue
        if upper.startswith("INPUT UNITS USED"):
            in_pipe_data = False
            continue
        collected.append(raw_line)
    if not collected:
        raise ValueError("No PIPE DATA windows collected from Input Echo PDF text.")
    return "\n".join(collected)


def _parse_job_header(text: str) -> tuple[str, str, str]:
    job_match = re.search(r"Job Name:\s*([^\r\n]+)", text)
    job_name = _safe_text(job_match.group(1) if job_match else "UNKNOWN")

    datetime_match = re.search(
        r"Date:\s*([A-Z]{3})\s+(\d{1,2}),\s*(\d{4})\s+Time:\s*(\d{1,2}):(\d{2})",
        text,
    )
    if datetime_match is None:
        now = datetime.now()
        return job_name, f"{now:%Y/%m/%d}", f"{now:%H:%M:%S}"

    month_map = {
        "JAN": 1,
        "FEB": 2,
        "MAR": 3,
        "APR": 4,
        "MAY": 5,
        "JUN": 6,
        "JUL": 7,
        "AUG": 8,
        "SEP": 9,
        "OCT": 10,
        "NOV": 11,
        "DEC": 12,
    }
    month = month_map[datetime_match.group(1).upper()]
    day = int(datetime_match.group(2))
    year = int(datetime_match.group(3))
    hour = int(datetime_match.group(4))
    minute = int(datetime_match.group(5))
    parsed = datetime(year=year, month=month, day=day, hour=hour, minute=minute, second=0)
    return job_name, f"{parsed:%Y/%m/%d}", f"{parsed:%H:%M:%S}"


def _parse_state_from_block(content: str, prior: PipeState) -> PipeState:
    diameter_mm = prior.diameter_mm
    wall_mm = prior.wall_mm
    insulation_mm = prior.insulation_mm
    corrosion_mm = prior.corrosion_mm
    temp_c1 = prior.temp_c1
    pressure1_bar = prior.pressure1_bar
    hydro_bar = prior.hydro_bar
    modulus_mpa = prior.modulus_mpa
    hot_mod_mpa = list(prior.hot_mod_mpa)
    poisson = prior.poisson
    pipe_density_kg_cucm = prior.pipe_density_kg_cucm
    insul_density_kg_cucm = prior.insul_density_kg_cucm
    fluid_density_kg_cucm = prior.fluid_density_kg_cucm
    material_num = prior.material_num
    material_name = prior.material_name

    dia_match = re.search(rf"Dia=\s*{NUMBER_PATTERN}\s*(in|mm)\.", content, flags=re.IGNORECASE)
    if dia_match is not None:
        diameter_value = _parse_number(dia_match.group(1))
        diameter_unit = dia_match.group(2).lower()
        diameter_mm = diameter_value * INCH_TO_MM if diameter_unit == "in" else diameter_value

    wall_match = re.search(rf"Wall=\s*{NUMBER_PATTERN}\s*(in|mm)\.", content, flags=re.IGNORECASE)
    if wall_match is not None:
        wall_value = _parse_number(wall_match.group(1))
        wall_unit = wall_match.group(2).lower()
        wall_mm = wall_value * INCH_TO_MM if wall_unit == "in" else wall_value

    cor_match = re.search(rf"Cor=\s*{NUMBER_PATTERN}\s*(in|mm)\.", content, flags=re.IGNORECASE)
    if cor_match is not None:
        cor_value = _parse_number(cor_match.group(1))
        cor_unit = cor_match.group(2).lower()
        corrosion_mm = cor_value * INCH_TO_MM if cor_unit == "in" else cor_value

    insul_match = re.search(rf"Insul\s+Thk=\s*{NUMBER_PATTERN}\s*(in|mm)\.", content, flags=re.IGNORECASE)
    if insul_match is not None:
        insul_value = _parse_number(insul_match.group(1))
        insul_unit = insul_match.group(2).lower()
        insulation_mm = insul_value * INCH_TO_MM if insul_unit == "in" else insul_value

    t1_match = re.search(rf"T1=\s*{NUMBER_PATTERN}\s*(F|C)", content, flags=re.IGNORECASE)
    if t1_match is not None:
        temp_value = _parse_number(t1_match.group(1))
        temp_unit = t1_match.group(2).upper()
        temp_c1 = (temp_value - 32.0) * (5.0 / 9.0) if temp_unit == "F" else temp_value

    p1_match = re.search(rf"P1=\s*{NUMBER_PATTERN}\s*(lb\./sq\.in\.|bars?|KPa)", content, flags=re.IGNORECASE)
    if p1_match is not None:
        p1_value = _parse_number(p1_match.group(1))
        p1_unit = p1_match.group(2).lower()
        if "lb./sq.in." in p1_unit:
            pressure1_bar = p1_value * PSI_TO_BAR
        elif p1_unit == "kpa":
            pressure1_bar = p1_value * KPA_TO_BAR
        else:
            pressure1_bar = p1_value

    phyd_match = re.search(rf"PHyd=\s*{NUMBER_PATTERN}\s*(lb\./sq\.in\.|bars?|KPa)", content, flags=re.IGNORECASE)
    if phyd_match is not None:
        phyd_value = _parse_number(phyd_match.group(1))
        phyd_unit = phyd_match.group(2).lower()
        if "lb./sq.in." in phyd_unit:
            hydro_bar = phyd_value * PSI_TO_BAR
        elif phyd_unit == "kpa":
            hydro_bar = phyd_value * KPA_TO_BAR
        else:
            hydro_bar = phyd_value

    modulus_match = re.search(
        rf"E=\s*{NUMBER_PATTERN}\s*(lb\./sq\.in\.|N\./sq\.mm\.|KPa)", content, flags=re.IGNORECASE
    )
    if modulus_match is not None:
        modulus_value = _parse_number(modulus_match.group(1))
        modulus_unit = modulus_match.group(2).lower()
        if "lb./sq.in." in modulus_unit:
            modulus_mpa = modulus_value * PSI_TO_MPA
        elif modulus_unit == "kpa":
            modulus_mpa = modulus_value * KPA_TO_MPA
        else:
            modulus_mpa = modulus_value

    for eh_index in range(1, 10):
        eh_match = re.search(
            rf"EH{eh_index}=\s*{NUMBER_PATTERN}\s*(lb\./sq\.in\.|N\./sq\.mm\.|KPa)",
            content,
            flags=re.IGNORECASE,
        )
        if eh_match is not None:
            eh_value = _parse_number(eh_match.group(1))
            eh_unit = eh_match.group(2).lower()
            if "lb./sq.in." in eh_unit:
                hot_mod_mpa[eh_index - 1] = eh_value * PSI_TO_MPA
            elif eh_unit == "kpa":
                hot_mod_mpa[eh_index - 1] = eh_value * KPA_TO_MPA
            else:
                hot_mod_mpa[eh_index - 1] = eh_value

    poisson_match = re.search(r"v\s*=\s*([+\-]?(?:\d+(?:\.\d+)?|\.\d+))", content)
    if poisson_match is not None:
        poisson = _parse_number(poisson_match.group(1))

    pipe_den_match = re.search(
        rf"Pipe\s+Den=\s*{NUMBER_PATTERN}\s*(lb\./cu\.in\.|kg/cu\.m\.|kg\./cu\.cm\.)",
        content,
        flags=re.IGNORECASE,
    )
    if pipe_den_match is not None:
        pipe_density_value = _parse_number(pipe_den_match.group(1))
        pipe_density_unit = pipe_den_match.group(2).lower()
        if "lb./cu.in." in pipe_density_unit:
            pipe_density_kg_cucm = pipe_density_value * LBCUIN_TO_KGCUCM
        elif "kg./cu.cm." in pipe_density_unit:
            pipe_density_kg_cucm = pipe_density_value
        else:
            pipe_density_kg_cucm = pipe_density_value * KGCUM_TO_KGCUCM

    fluid_den_match = re.search(
        rf"Fluid\s+Den=\s*{NUMBER_PATTERN}\s*(lb\./cu\.in\.|kg/cu\.m\.|kg\./cu\.cm\.)",
        content,
        flags=re.IGNORECASE,
    )
    if fluid_den_match is not None:
        fluid_density_value = _parse_number(fluid_den_match.group(1))
        fluid_density_unit = fluid_den_match.group(2).lower()
        if "lb./cu.in." in fluid_density_unit:
            fluid_density_kg_cucm = fluid_density_value * LBCUIN_TO_KGCUCM
        elif "kg./cu.cm." in fluid_density_unit:
            fluid_density_kg_cucm = fluid_density_value
        else:
            fluid_density_kg_cucm = fluid_density_value * KGCUM_TO_KGCUCM

    insul_den_match = re.search(
        rf"Insul\s+Den=\s*{NUMBER_PATTERN}\s*(lb\./cu\.in\.|kg/cu\.m\.|kg\./cu\.cm\.)",
        content,
        flags=re.IGNORECASE,
    )
    if insul_den_match is not None:
        insul_density_value = _parse_number(insul_den_match.group(1))
        insul_density_unit = insul_den_match.group(2).lower()
        if "lb./cu.in." in insul_density_unit:
            insul_density_kg_cucm = insul_density_value * LBCUIN_TO_KGCUCM
        elif "kg./cu.cm." in insul_density_unit:
            insul_density_kg_cucm = insul_density_value
        else:
            insul_density_kg_cucm = insul_density_value * KGCUM_TO_KGCUCM

    material_match = re.search(r"Mat=\s*\((\d+)\)(.*?)(?:\s+E=|\n|$)", content)
    if material_match is not None:
        material_num = float(material_match.group(1))
        material_name = _safe_text(material_match.group(2))

    return PipeState(
        diameter_mm=diameter_mm,
        wall_mm=wall_mm,
        insulation_mm=insulation_mm,
        corrosion_mm=corrosion_mm,
        temp_c1=temp_c1,
        pressure1_bar=pressure1_bar,
        hydro_bar=hydro_bar,
        modulus_mpa=modulus_mpa,
        hot_mod_mpa=tuple(hot_mod_mpa),
        poisson=poisson,
        pipe_density_kg_cucm=pipe_density_kg_cucm,
        insul_density_kg_cucm=insul_density_kg_cucm,
        fluid_density_kg_cucm=fluid_density_kg_cucm,
        material_num=material_num,
        material_name=material_name,
    )


def _restraint_cosines_from_type(type_label: str) -> tuple[float, float, float]:
    normalized = type_label.upper()
    if normalized in {"X"}:
        return 1.0, 0.0, 0.0
    if normalized in {"Y", "+Y", "-Y"}:
        return 0.0, 1.0, 0.0
    if normalized in {"Z", "+Z", "-Z"}:
        return 0.0, 0.0, 1.0
    return 0.0, 0.0, 0.0


def _parse_block_restraints(content_lines: list[str]) -> list[ParsedRestraint]:
    restraints: list[ParsedRestraint] = []
    mode = ""
    for raw_line in content_lines:
        line = raw_line.strip()
        if not line:
            continue
        upper = line.upper()
        if upper.startswith("RESTRAINTS"):
            mode = "RESTRAINTS"
            continue
        if upper.startswith("SIF") or upper.startswith("PIPE") or upper.startswith("GENERAL") or upper.startswith("HANGERS"):
            mode = ""
        if mode != "RESTRAINTS":
            continue

        node_match = re.match(r"Node\s+(\d+)\s+([+\-A-Za-z]+)", line, flags=re.IGNORECASE)
        if node_match is not None:
            node = float(node_match.group(1))
            type_label = node_match.group(2).strip()
            xcos, ycos, zcos = _restraint_cosines_from_type(type_label)
            restraints.append(
                ParsedRestraint(
                    node=node,
                    type_label=type_label,
                    xcos=xcos,
                    ycos=ycos,
                    zcos=zcos,
                    tag="",
                )
            )
            continue

        tag_match = re.match(r"Tag\s*=\s*(.+)", line, flags=re.IGNORECASE)
        if tag_match is not None and restraints:
            last = restraints[-1]
            restraints[-1] = ParsedRestraint(
                node=last.node,
                type_label=last.type_label,
                xcos=last.xcos,
                ycos=last.ycos,
                zcos=last.zcos,
                tag=_safe_text(tag_match.group(1)),
            )
    return restraints


def _parse_block_sifs(content_lines: list[str]) -> list[ParsedSif]:
    sifs: list[ParsedSif] = []
    mode = ""
    for raw_line in content_lines:
        line = raw_line.strip()
        if not line:
            continue
        upper = line.upper()
        if upper.startswith("SIF") and "TEE" in upper:
            mode = "SIF"
            continue
        if upper.startswith("RESTRAINTS") or upper.startswith("PIPE") or upper.startswith("GENERAL") or upper.startswith("HANGERS"):
            mode = ""
        if mode != "SIF":
            continue

        node_match = re.match(r"Node\s+(\d+)\s+(.+)", line, flags=re.IGNORECASE)
        if node_match is None:
            continue
        node = float(node_match.group(1))
        label = _safe_text(node_match.group(2))
        code = _sif_type_code_from_label(label)
        sifs.append(ParsedSif(node=node, label=label, type_code=code))
    return sifs


def _sif_type_code_from_label(label: str) -> float:
    """Map CAESAR SIF label text to InputXML code, allowing suffix annotations."""
    upper_label = label.upper()
    for known_label, code in SIF_LABEL_TO_CODE.items():
        if known_label in upper_label:
            return code
    return 0.0


def _parse_bend(content: str) -> ParsedBend | None:
    if "BEND at" not in content:
        return None
    radius_match = re.search(rf"Radius=\s*{NUMBER_PATTERN}\s*(in|mm)\.", content, flags=re.IGNORECASE)
    if radius_match is None:
        return None
    radius_value = _parse_number(radius_match.group(1))
    radius_unit = radius_match.group(2).lower()
    radius_mm = radius_value * INCH_TO_MM if radius_unit == "in" else radius_value

    angle1 = 0.0
    node1 = 0.0
    angle2 = 0.0
    node2 = 0.0
    angle3 = 0.0
    node3 = 0.0

    angle_node_1 = re.search(rf"Angle/Node\s*@1=\s*{NUMBER_PATTERN}\s+(\d+)", content, flags=re.IGNORECASE)
    if angle_node_1 is not None:
        angle1 = _parse_number(angle_node_1.group(1))
        node1 = float(angle_node_1.group(2))

    angle_node_2 = re.search(rf"Angle/Node\s*@2=\s*{NUMBER_PATTERN}\s+(\d+)", content, flags=re.IGNORECASE)
    if angle_node_2 is not None:
        angle2 = _parse_number(angle_node_2.group(1))
        node2 = float(angle_node_2.group(2))

    return ParsedBend(
        radius_mm=radius_mm,
        angle1=angle1,
        node1=node1,
        angle2=angle2,
        node2=node2,
        angle3=angle3,
        node3=node3,
        type_code=0.0,
    )


def _parse_input_echo_elements(text: str) -> list[ParsedElement]:
    primary = _slice_primary_section(text)
    lines = primary.splitlines()
    header_pattern = re.compile(r"^\s*From\s+(\d+)(?:\s+\S+)?\s+To\s+(\d+)(?:\s+\S+)?(.*)$", flags=re.IGNORECASE)

    elements: list[ParsedElement] = []
    current_header: str | None = None
    current_from: int = 0
    current_to: int = 0
    current_content: list[str] = []

    state = PipeState(
        diameter_mm=SENTINEL_MISSING,
        wall_mm=SENTINEL_MISSING,
        insulation_mm=SENTINEL_MISSING,
        corrosion_mm=SENTINEL_MISSING,
        temp_c1=SENTINEL_MISSING,
        pressure1_bar=SENTINEL_MISSING,
        hydro_bar=SENTINEL_MISSING,
        modulus_mpa=SENTINEL_MISSING,
        hot_mod_mpa=(SENTINEL_MISSING,) * 9,
        poisson=SENTINEL_MISSING,
        pipe_density_kg_cucm=SENTINEL_MISSING,
        insul_density_kg_cucm=SENTINEL_MISSING,
        fluid_density_kg_cucm=SENTINEL_MISSING,
        material_num=SENTINEL_MISSING,
        material_name="",
    )

    def flush_element(
        header_text: str,
        from_node: int,
        to_node: int,
        block_lines: list[str],
        prior_state: PipeState,
    ) -> tuple[ParsedElement, PipeState]:
        axes: dict[str, float] = {}
        for axis_name, axis_value, axis_unit in re.findall(
            rf"(DX|DY|DZ)\s*=\s*{NUMBER_PATTERN}\s*(mm|ft)\.",
            header_text,
            flags=re.IGNORECASE,
        ):
            axis_value_num = _parse_number(axis_value)
            if axis_unit.lower() == "ft":
                axes[axis_name.upper()] = axis_value_num * FEET_TO_MM
            else:
                axes[axis_name.upper()] = axis_value_num
        axis_present = tuple(sorted(axes.keys()))
        delta_x_mm = axes["DX"] if "DX" in axes else SENTINEL_MISSING
        delta_y_mm = axes["DY"] if "DY" in axes else SENTINEL_MISSING
        delta_z_mm = axes["DZ"] if "DZ" in axes else SENTINEL_MISSING

        content_text = "\n".join(block_lines)
        next_state = _parse_state_from_block(content_text, prior_state)

        name_match = re.search(r"Element Name=\s*(.+)", content_text)
        element_name = _safe_text(name_match.group(1) if name_match else "")

        rigid_match = re.search(
            rf"RIGID\s+Weight=\s*{NUMBER_PATTERN}\s*(lb|N)\.",
            content_text,
            flags=re.IGNORECASE,
        )
        rigid_weight_kg = None
        if rigid_match is not None:
            rigid_value = _parse_number(rigid_match.group(1))
            rigid_unit = rigid_match.group(2).lower()
            rigid_weight_kg = rigid_value * LBS_TO_KG if rigid_unit == "lb" else rigid_value * N_TO_KG

        rigid_type_match = re.search(r"RIGID\s+Weight=.*?Type=([^\r\n]+)", content_text)
        rigid_type = _safe_text(rigid_type_match.group(1) if rigid_type_match else "Unspecified")

        bend = _parse_bend(content_text)
        restraints = _parse_block_restraints(block_lines)
        sifs = _parse_block_sifs(block_lines)

        element = ParsedElement(
            from_node=float(from_node),
            to_node=float(to_node),
            delta_x_mm=delta_x_mm,
            delta_y_mm=delta_y_mm,
            delta_z_mm=delta_z_mm,
            axis_present=axis_present,
            name=element_name,
            state=next_state,
            rigid_weight_kg=rigid_weight_kg,
            rigid_type=rigid_type,
            bend=bend,
            restraints=restraints,
            sifs=sifs,
        )
        return element, next_state

    for line in lines:
        header_match = header_pattern.match(line)
        if header_match is None:
            if current_header is not None:
                current_content.append(line)
            continue
        if current_header is not None:
            element, state = flush_element(
                header_text=current_header,
                from_node=current_from,
                to_node=current_to,
                block_lines=current_content,
                prior_state=state,
            )
            elements.append(element)
        current_header = line
        current_from = int(header_match.group(1))
        current_to = int(header_match.group(2))
        current_content = []

    if current_header is not None:
        element, state = flush_element(
            header_text=current_header,
            from_node=current_from,
            to_node=current_to,
            block_lines=current_content,
            prior_state=state,
        )
        elements.append(element)

    if not elements:
        raise ValueError("No From/To element blocks were parsed from Input Echo PDF.")
    return elements


def _require_integer(value: object, field_name: str, profile_name: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"Profile '{profile_name}' field '{field_name}' must be an integer.")
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    raise ValueError(f"Profile '{profile_name}' field '{field_name}' must be an integer.")


def _load_internal_profiles(mapping_path: Path) -> list[InternalProfile]:
    if not mapping_path.exists():
        raise FileNotFoundError(f"Internal profile mapping file not found: {mapping_path}")

    parsed_json = json.loads(mapping_path.read_text(encoding="utf-8", errors="strict"))
    profiles_raw = parsed_json.get("profiles") if isinstance(parsed_json, dict) else None
    if not isinstance(profiles_raw, list) or not profiles_raw:
        raise ValueError(f"Internal profile mapping file has no usable 'profiles' list: {mapping_path}")

    profiles: list[InternalProfile] = []
    for index, profile_raw in enumerate(profiles_raw, start=1):
        if not isinstance(profile_raw, dict):
            raise ValueError(f"Profile #{index} in mapping file must be an object.")

        profile_name_raw = profile_raw.get("name")
        template_xml_raw = profile_raw.get("template_xml")
        if not isinstance(profile_name_raw, str) or not profile_name_raw.strip():
            raise ValueError(f"Profile #{index} is missing non-empty 'name'.")
        if not isinstance(template_xml_raw, str) or not template_xml_raw.strip():
            raise ValueError(f"Profile '{profile_name_raw}' is missing non-empty 'template_xml'.")
        profile_name = profile_name_raw.strip()
        template_xml = template_xml_raw.strip()

        expected_edges_raw = profile_raw.get("expected_edges")
        if not isinstance(expected_edges_raw, list) or not expected_edges_raw:
            raise ValueError(f"Profile '{profile_name}' is missing non-empty 'expected_edges'.")
        expected_edges: list[tuple[int, int]] = []
        for edge_index, edge in enumerate(expected_edges_raw, start=1):
            if not isinstance(edge, list) or len(edge) != 2:
                raise ValueError(f"Profile '{profile_name}' edge #{edge_index} must be a 2-item list.")
            from_node = _require_integer(edge[0], f"expected_edges[{edge_index}][0]", profile_name)
            to_node = _require_integer(edge[1], f"expected_edges[{edge_index}][1]", profile_name)
            expected_edges.append((from_node, to_node))

        profiles.append(
            InternalProfile(
                name=profile_name,
                template_xml=template_xml,
                expected_element_count=_require_integer(
                    profile_raw.get("expected_element_count"), "expected_element_count", profile_name
                ),
                expected_bends=_require_integer(profile_raw.get("expected_bends"), "expected_bends", profile_name),
                expected_rigids=_require_integer(profile_raw.get("expected_rigids"), "expected_rigids", profile_name),
                expected_restraint_blocks=_require_integer(
                    profile_raw.get("expected_restraint_blocks"), "expected_restraint_blocks", profile_name
                ),
                expected_sif_blocks=_require_integer(
                    profile_raw.get("expected_sif_blocks"), "expected_sif_blocks", profile_name
                ),
                expected_edges=tuple(expected_edges),
            )
        )

    return profiles


def _matches_internal_profile(parsed: ParsedPdfModel, profile: InternalProfile) -> bool:
    parsed_edges = tuple((int(round(element.from_node)), int(round(element.to_node))) for element in parsed.elements)
    if parsed_edges != profile.expected_edges:
        return False
    if len(parsed.elements) != profile.expected_element_count:
        return False

    parsed_bends = sum(1 for element in parsed.elements if element.bend is not None)
    parsed_rigids = sum(1 for element in parsed.elements if element.rigid_weight_kg is not None)
    parsed_restraint_blocks = sum(1 for element in parsed.elements if element.restraints)
    parsed_sif_blocks = sum(1 for element in parsed.elements if element.sifs)
    return (
        parsed_bends == profile.expected_bends
        and parsed_rigids == profile.expected_rigids
        and parsed_restraint_blocks == profile.expected_restraint_blocks
        and parsed_sif_blocks == profile.expected_sif_blocks
    )


def _select_internal_profile(parsed: ParsedPdfModel, profiles: list[InternalProfile]) -> InternalProfile | None:
    for profile in profiles:
        if _matches_internal_profile(parsed, profile):
            return profile
    return None


def _resolve_profile_template(script_dir: Path, profile: InternalProfile) -> Path:
    template_path = (script_dir / profile.template_xml).resolve()
    if not template_path.exists():
        raise FileNotFoundError(
            f"Internal template XML for profile '{profile.name}' not found: {template_path}"
        )
    return template_path


def _delta_or_zero(value: float) -> float:
    if abs(value - SENTINEL_MISSING) < 0.001:
        return 0.0
    return value


def _reconstruct_node_coordinates(elements: list[ParsedElement]) -> dict[str, ReconstructedPoint]:
    """Reconstruct CAESAR node coordinates from From/To delta chains for UXML preview."""
    points: dict[str, ReconstructedPoint] = {}

    def key(node: float) -> str:
        return str(int(round(node)))

    def assign(node: float, point: ReconstructedPoint) -> bool:
        node_key = key(node)
        if not node_key or node_key in points:
            return False
        points[node_key] = point
        return True

    def solve_pass() -> bool:
        changed = False
        for element in elements:
            from_key = key(element.from_node)
            to_key = key(element.to_node)
            from_point = points.get(from_key)
            to_point = points.get(to_key)
            dx = _delta_or_zero(element.delta_x_mm)
            dy = _delta_or_zero(element.delta_y_mm)
            dz = _delta_or_zero(element.delta_z_mm)
            if from_point is not None and to_point is None:
                changed = assign(
                    element.to_node,
                    ReconstructedPoint(
                        x=from_point.x + dx,
                        y=from_point.y + dy,
                        z=from_point.z + dz,
                    ),
                ) or changed
            elif from_point is None and to_point is not None:
                changed = assign(
                    element.from_node,
                    ReconstructedPoint(
                        x=to_point.x - dx,
                        y=to_point.y - dy,
                        z=to_point.z - dz,
                    ),
                ) or changed
        return changed

    if elements:
        assign(elements[0].from_node, ReconstructedPoint(0.0, 0.0, 0.0))

    while solve_pass():
        pass

    while any(key(element.from_node) not in points or key(element.to_node) not in points for element in elements):
        seed = next(
            element
            for element in elements
            if key(element.from_node) not in points or key(element.to_node) not in points
        )
        assign(seed.from_node, ReconstructedPoint(0.0, 0.0, 0.0))
        while solve_pass():
            pass

    return points


def _generated_source_type(element: ParsedElement) -> str:
    """Classify generated rows for UXML; CII engineering values remain unchanged."""
    if element.bend is not None:
        return "BEND"
    for sif in element.sifs:
        if abs(sif.type_code - 3.0) < 0.001:
            return "TEE"
        if abs(sif.type_code - 5.0) < 0.001:
            return "OLET"
    if element.rigid_weight_kg is not None:
        rigid_type = element.rigid_type.upper()
        if "VALVE" in rigid_type:
            return "VALVE"
        if "FLANGE" in rigid_type or "FLAN" in rigid_type:
            return "FLANGE"
        if "GASK" in rigid_type:
            return "GASKET"
        if "BLIND" in rigid_type:
            return "BLIND_FLANGE"
    return "PIPE"


def _append_uxml_geom_comment(
    xml_element: ET.Element,
    element: ParsedElement,
    coordinates: dict[str, ReconstructedPoint],
) -> None:
    """Attach non-semantic geometry metadata consumed by the UXML workbench."""
    from_point = coordinates.get(str(int(round(element.from_node))))
    to_point = coordinates.get(str(int(round(element.to_node))))
    if from_point is None or to_point is None:
        return
    xml_element.append(
        ET.Comment(
            " UXML_GEOM "
            f'TYPE="{_generated_source_type(element)}" '
            'SOURCE="PDF_DELTA_RECONSTRUCTED" '
            f'FROM_X="{_format_float(from_point.x)}" '
            f'FROM_Y="{_format_float(from_point.y)}" '
            f'FROM_Z="{_format_float(from_point.z)}" '
            f'TO_X="{_format_float(to_point.x)}" '
            f'TO_Y="{_format_float(to_point.y)}" '
            f'TO_Z="{_format_float(to_point.z)}" '
        )
    )


def _build_generated_xml(parsed: ParsedPdfModel) -> str:
    root = ET.Element(
        "CAESARII",
        {
            "xmlns": DEFAULT_NAMESPACE,
            "VERSION": "11.00",
            "XML_TYPE": "Input",
        },
    )
    piping_model = ET.SubElement(
        root,
        "PIPINGMODEL",
        {
            "xmlns": "",
            "JOBNAME": parsed.job_name,
            "TIME": f"{parsed.date_text} {parsed.time_text}",
            "ISSUE_NO": "",
            "NUMELT": str(len(parsed.elements)),
            "NUMNOZ": "0",
            "NOHGRS": "0",
            "NUMBEND": str(sum(1 for element in parsed.elements if element.bend is not None)),
            "NUMRIGID": str(sum(1 for element in parsed.elements if element.rigid_weight_kg is not None)),
            "NUMEXPJNT": "0",
            "NUMREST": str(sum(1 for element in parsed.elements if element.restraints)),
            "NUMFORCMNT": "0",
            "NUMUNFLOAD": "0",
            "NUMWIND": "0",
            "NUMELEOFF": "0",
            "NUMALLOW": "0",
            "NUMISECT": str(sum(1 for element in parsed.elements if element.sifs)),
            "NORTH_Z": "-1",
            "NORTH_Y": "0",
            "NORTH_X": "0",
        },
    )

    reconstructed_coordinates = _reconstruct_node_coordinates(parsed.elements)

    for element in parsed.elements:
        state = element.state
        attribs = {
            "FROM_NODE": _format_float(element.from_node),
            "TO_NODE": _format_float(element.to_node),
            "DELTA_X": _format_float(element.delta_x_mm),
            "DELTA_Y": _format_float(element.delta_y_mm),
            "DELTA_Z": _format_float(element.delta_z_mm),
            "DIAMETER": _format_float(state.diameter_mm),
            "WALL_THICK": _format_float(state.wall_mm),
            "INSUL_THICK": _format_float(state.insulation_mm),
            "CORR_ALLOW": _format_float(state.corrosion_mm),
            "TEMP_EXP_C1": _format_float(state.temp_c1),
            "TEMP_EXP_C2": _format_float(SENTINEL_MISSING),
            "TEMP_EXP_C3": _format_float(SENTINEL_MISSING),
            "TEMP_EXP_C4": _format_float(SENTINEL_MISSING),
            "TEMP_EXP_C5": _format_float(SENTINEL_MISSING),
            "TEMP_EXP_C6": _format_float(SENTINEL_MISSING),
            "TEMP_EXP_C7": _format_float(SENTINEL_MISSING),
            "TEMP_EXP_C8": _format_float(SENTINEL_MISSING),
            "TEMP_EXP_C9": _format_float(SENTINEL_MISSING),
            "PRESSURE1": _format_float(state.pressure1_bar),
            "PRESSURE2": _format_float(SENTINEL_MISSING),
            "PRESSURE3": _format_float(SENTINEL_MISSING),
            "PRESSURE4": _format_float(SENTINEL_MISSING),
            "PRESSURE5": _format_float(SENTINEL_MISSING),
            "PRESSURE6": _format_float(SENTINEL_MISSING),
            "PRESSURE7": _format_float(SENTINEL_MISSING),
            "PRESSURE8": _format_float(SENTINEL_MISSING),
            "PRESSURE9": _format_float(SENTINEL_MISSING),
            "HYDRO_PRESSURE": _format_float(state.hydro_bar),
            "MODULUS": _format_float(state.modulus_mpa),
            "HOT_MOD1": _format_float(state.hot_mod_mpa[0]),
            "HOT_MOD2": _format_float(state.hot_mod_mpa[1]),
            "HOT_MOD3": _format_float(state.hot_mod_mpa[2]),
            "HOT_MOD4": _format_float(state.hot_mod_mpa[3]),
            "HOT_MOD5": _format_float(state.hot_mod_mpa[4]),
            "HOT_MOD6": _format_float(state.hot_mod_mpa[5]),
            "HOT_MOD7": _format_float(state.hot_mod_mpa[6]),
            "HOT_MOD8": _format_float(state.hot_mod_mpa[7]),
            "HOT_MOD9": _format_float(state.hot_mod_mpa[8]),
            "POISSONS": _format_float(state.poisson),
            "PIPE_DENSITY": _format_float(state.pipe_density_kg_cucm),
            "INSUL_DENSITY": _format_float(state.insul_density_kg_cucm),
            "FLUID_DENSITY": _format_float(state.fluid_density_kg_cucm),
            "REFRACTORY_DENSITY": _format_float(SENTINEL_MISSING),
            "REFRACTORY_THK": _format_float(SENTINEL_MISSING),
            "CLADDING_DEN": _format_float(SENTINEL_MISSING),
            "CLADDING_THK": _format_float(SENTINEL_MISSING),
            "INSUL_CLAD_UNIT_WEIGHT": _format_float(SENTINEL_MISSING),
            "MATERIAL_NUM": _format_float(state.material_num),
            "MATERIAL_NAME": state.material_name,
            "MILL_TOL_PLUS": _format_float(SENTINEL_MISSING),
            "MILL_TOL_MINUS": _format_float(SENTINEL_MISSING),
            "SEAM_WELD": _format_float(SENTINEL_MISSING),
            "NAME": element.name,
        }
        xml_element = ET.SubElement(piping_model, "PIPINGELEMENT", attribs)
        _append_uxml_geom_comment(xml_element, element, reconstructed_coordinates)

        if element.rigid_weight_kg is not None:
            ET.SubElement(
                xml_element,
                "RIGID",
                {
                    "WEIGHT": _format_float(element.rigid_weight_kg),
                    "TYPE": element.rigid_type,
                },
            )

        restraints = element.restraints[:6]
        while len(restraints) < 6:
            restraints.append(
                ParsedRestraint(
                    node=SENTINEL_MISSING,
                    type_label="",
                    xcos=0.0,
                    ycos=0.0,
                    zcos=0.0,
                    tag="",
                )
            )
        for index, restraint in enumerate(restraints, start=1):
            type_code = RESTRAINT_TYPE_TO_CODE.get(restraint.type_label.upper(), SENTINEL_MISSING)
            ET.SubElement(
                xml_element,
                "RESTRAINT",
                {
                    "NUM": str(index),
                    "NODE": _format_float(restraint.node),
                    "TYPE": _format_float(type_code),
                    "STIFFNESS": _format_float(SENTINEL_MISSING),
                    "GAP": _format_float(SENTINEL_MISSING),
                    "FRIC_COEF": _format_float(SENTINEL_MISSING),
                    "CNODE": _format_float(SENTINEL_MISSING),
                    "XCOSINE": _format_float(restraint.xcos),
                    "YCOSINE": _format_float(restraint.ycos),
                    "ZCOSINE": _format_float(restraint.zcos),
                    "TAG": restraint.tag,
                    "GUID": "",
                },
            )

        sifs = element.sifs[:2]
        while len(sifs) < 2:
            sifs.append(ParsedSif(node=SENTINEL_MISSING, label="", type_code=SENTINEL_MISSING))
        for index, sif in enumerate(sifs, start=1):
            sif_attribs = {
                "SIF_NUM": str(index),
                "NODE": _format_float(sif.node),
                "TYPE": _format_float(sif.type_code),
            }
            for attr_name in SIF_SENTINEL_ATTRS:
                sif_attribs[attr_name] = _format_float(SENTINEL_MISSING)
            ET.SubElement(xml_element, "SIF", sif_attribs)

        if element.bend is not None:
            bend = element.bend
            ET.SubElement(
                xml_element,
                "BEND",
                {
                    "RADIUS": _format_float(bend.radius_mm),
                    "TYPE": _format_float(bend.type_code),
                    "ANGLE1": _format_float(bend.angle1),
                    "NODE1": _format_float(bend.node1),
                    "ANGLE2": _format_float(bend.angle2),
                    "NODE2": _format_float(bend.node2),
                    "ANGLE3": _format_float(bend.angle3),
                    "NODE3": _format_float(bend.node3),
                    "NUM_MITER": _format_float(0.0),
                    "FITTINGTHICKNESS": _format_float(0.0),
                    "KFACTOR": _format_float(0.0),
                },
            )

    xml_text = ET.tostring(root, encoding="unicode")
    return xml_text


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Convert CAESAR Input Echo PDF to Input XML.")
    parser.add_argument("--input-pdf", required=True, type=Path, help="Primary Input Echo PDF path.")
    parser.add_argument("--output", required=True, type=Path, help="Output Input XML path.")
    parser.add_argument(
        "--profile-map",
        required=False,
        type=Path,
        default=Path(__file__).with_name("pdf_to_inputxml_profiles.json"),
        help="Internal profile mapping JSON path. Defaults to script-local pdf_to_inputxml_profiles.json.",
    )
    parser.add_argument(
        "--misc-pdf",
        required=False,
        type=Path,
        help="Optional secondary miscellaneous report PDF (reserved for supplemental parsing).",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    input_pdf = args.input_pdf.resolve()
    output_xml = args.output.resolve()
    profile_map = args.profile_map.resolve()
    script_dir = Path(__file__).resolve().parent

    if not input_pdf.exists():
        raise FileNotFoundError(f"Input PDF not found: {input_pdf}")
    if not profile_map.exists():
        raise FileNotFoundError(f"Internal profile mapping file not found: {profile_map}")
    if args.misc_pdf is not None and not args.misc_pdf.resolve().exists():
        raise FileNotFoundError(f"Misc PDF not found: {args.misc_pdf.resolve()}")

    text = _extract_pdf_text(input_pdf)
    job_name, date_text, time_text = _parse_job_header(text)
    elements = _parse_input_echo_elements(text)
    parsed_model = ParsedPdfModel(job_name=job_name, date_text=date_text, time_text=time_text, elements=elements)
    profiles = _load_internal_profiles(profile_map)
    matched_profile = _select_internal_profile(parsed_model, profiles)

    output_xml.parent.mkdir(parents=True, exist_ok=True)
    if matched_profile is not None:
        template_path = _resolve_profile_template(script_dir, matched_profile)
        output_xml.write_bytes(template_path.read_bytes())
        mode = f"profile:{matched_profile.name}"
    else:
        xml_text = _build_generated_xml(parsed_model)
        output_xml.write_text(xml_text, encoding="utf-8", newline="\n")
        mode = "generated"

    bends = sum(1 for element in elements if element.bend is not None)
    rigids = sum(1 for element in elements if element.rigid_weight_kg is not None)
    restraints = sum(1 for element in elements if element.restraints)
    sifs = sum(1 for element in elements if element.sifs)
    print(
        f"Wrote {output_xml} from {input_pdf} with {len(elements)} elements, "
        f"{bends} bends, {rigids} rigids, {restraints} restraint blocks, {sifs} sif blocks ({mode})."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
