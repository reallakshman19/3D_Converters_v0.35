#!/usr/bin/env python3
"""Configurable support -> CAESAR II restraint classification.

Pure, dependency-free helpers shared by the StagedJSON -> InputXML converter.

Design goals (per project requirement):
- No hard-coded model values.  Every rule/threshold lives in a config dict that
  defaults to ``DEFAULT_SUPPORT_RESTRAINT_CONFIG`` and is fully overridable from a
  JSON file (``--support-config``) or programmatically.
- No mock data.  The support *kind* is derived from the real attributes emitted
  by PDMS (``CMPSUPTYPE`` / ``MDSSUPPTYPE`` / ``SPRE`` ...); only the kind ->
  DOF/stiffness mapping is a (configurable) convention.

A support is resolved to a canonical kind (ANCHOR / REST / GUIDE / LINESTOP /
LIMIT / SPRING) which then maps to one or more CAESAR II restraint DOF rows.
Reinforcement attachments that are not restraints (e.g. welded pads) are
excluded via ``exclude_patterns``.

CAESAR II restraint TYPE codes used below follow the converter's CII config
``type_direction_cosines`` table: 1 = anchor (all DOF), 2 = +X, 3 = +Y,
4 = +Z.  The vertical/axial/lateral *defaults* are configurable so a project
using a different vertical axis convention can override them without code
changes (this is the seam G3 later tightens).
"""
from __future__ import annotations

import copy
import re
from typing import Any, Optional


# Canonical kinds.
ANCHOR = "ANCHOR"
REST = "REST"
GUIDE = "GUIDE"
LINESTOP = "LINESTOP"
LIMIT = "LIMIT"
SPRING = "SPRING"


DEFAULT_SUPPORT_RESTRAINT_CONFIG: dict[str, Any] = {
    # Whether the support pass runs at all (kept here so a single config file can
    # disable it).  The converter also exposes this as a flag.
    "enabled": True,
    # Maximum perpendicular distance (mm) for a support to be considered "on" a
    # pipe element and thus eligible to insert a restraint node.
    "snap_tolerance_mm": 25.0,
    # If a support coincides with an existing node within this distance (mm),
    # the restraint attaches to that node instead of splitting an element.
    "node_coincidence_mm": 1.0,
    # Attributes scanned (in order) for a raw support code.
    "code_attributes": ["SUPPORT_KIND", "SUPPORT_TYPE", "CMPSUPTYPE", "MDSSUPPTYPE", "SPRE"],
    # Regex (case-insensitive, matched against the joined code text) -> canonical
    # kind.  First match wins; order matters.
    "kind_patterns": [
        ["anch", ANCHOR],
        ["(^|[^a-z])ls[-0-9]", LINESTOP],
        ["line\\s*stop|linestop|axial|stopper", LINESTOP],
        ["(^|[^a-z])pg[-0-9]|guide|lateral", GUIDE],
        ["(^|[^a-z])sh[-0-9]|shoe|saddle|trunnion", REST],
        ["spring|hanger|variable|constant", SPRING],
        ["limit", LIMIT],
        ["rest|support", REST],
    ],
    # Codes that are NOT restraints (reinforcement, documentation markers ...).
    "exclude_patterns": ["w\\.?pad", "pad\\b", "wear\\s*plate", "/datum$", "/sref$"],
    # Kind applied when a support has a recognised support intent but no mappable
    # code.  Set to null to skip such supports instead.
    "default_kind": REST,
    # Canonical kind -> list of restraint DOF rows.  Each row:
    #   type      : CAESAR restraint TYPE code (see module docstring)
    #   stiffness : "rigid" -> defaults.anchor_stiffness; "from:ATTR" -> read a
    #               numeric attribute; or a literal number.
    "kind_dofs": {
        ANCHOR:   [{"type": 1, "stiffness": "rigid"}],
        REST:     [{"type": 4, "stiffness": "rigid"}],
        GUIDE:    [{"type": 2, "stiffness": "rigid"}, {"type": 3, "stiffness": "rigid"}],
        LINESTOP: [{"type": 2, "stiffness": "rigid"}],
        LIMIT:    [{"type": 4, "stiffness": "rigid"}],
        SPRING:   [{"type": 4, "stiffness": "from:NODESTIFF"}],
    },
    # Optional per-row gap / friction sourced from attributes.
    "gap_attribute": "NODEGAP",
    "friction_attribute": "NODEFRICTION",
    # Attribute that carries the analysis node name (used for NODENAME, G5).
    "node_name_attribute": "CMPSTRESSN",
}


def merge_config(overrides: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Deep-merge user overrides onto the default config (non-destructive)."""
    cfg = copy.deepcopy(DEFAULT_SUPPORT_RESTRAINT_CONFIG)
    if not overrides:
        return cfg
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(cfg.get(key), dict):
            merged = copy.deepcopy(cfg[key])
            merged.update(value)
            cfg[key] = merged
        else:
            cfg[key] = value
    return cfg


def _code_text(attrs: dict[str, Any], cfg: dict[str, Any]) -> str:
    parts = []
    for key in cfg.get("code_attributes", []):
        val = attrs.get(key)
        if val not in (None, ""):
            parts.append(str(val))
    return " ".join(parts)


def is_excluded(attrs: dict[str, Any], cfg: dict[str, Any]) -> bool:
    text = (_code_text(attrs, cfg) + " " + str(attrs.get("NAME", ""))).lower()
    for pat in cfg.get("exclude_patterns", []):
        if re.search(pat, text, re.IGNORECASE):
            return True
    return False


def resolve_support_kind(attrs: dict[str, Any], cfg: dict[str, Any]) -> Optional[str]:
    """Return a canonical kind, or None if the entry is not a restraint."""
    if is_excluded(attrs, cfg):
        return None
    text = _code_text(attrs, cfg)
    if not text.strip():
        return None
    for pattern, kind in cfg.get("kind_patterns", []):
        if re.search(pattern, text, re.IGNORECASE):
            return kind
    return cfg.get("default_kind")


def _stiffness_value(spec_stiffness: Any, attrs: dict[str, Any], anchor_stiffness: float) -> float:
    if isinstance(spec_stiffness, (int, float)):
        return float(spec_stiffness)
    token = str(spec_stiffness)
    if token == "rigid":
        return float(anchor_stiffness)
    if token.startswith("from:"):
        attr = token[len("from:"):]
        raw = attrs.get(attr)
        try:
            val = float(re.search(r"[-+]?\d+(?:\.\d+)?", str(raw)).group())
            if val > 0:
                return val
        except (AttributeError, TypeError, ValueError):
            pass
        return float(anchor_stiffness)
    try:
        return float(token)
    except ValueError:
        return float(anchor_stiffness)


def _num_attr(attrs: dict[str, Any], key: Optional[str]) -> Optional[float]:
    if not key:
        return None
    raw = attrs.get(key)
    if raw in (None, ""):
        return None
    m = re.search(r"[-+]?\d+(?:\.\d+)?", str(raw))
    return float(m.group()) if m else None


def restraint_rows_for(attrs: dict[str, Any], cfg: dict[str, Any], anchor_stiffness: float):
    """Return a list of restraint DOF rows for one support, or [] if not a support.

    Each row is a dict: {type, stiffness, gap, friction}.
    """
    kind = resolve_support_kind(attrs, cfg)
    if not kind:
        return [], None
    dofs = cfg.get("kind_dofs", {}).get(kind)
    if not dofs:
        return [], kind
    gap = _num_attr(attrs, cfg.get("gap_attribute"))
    friction = _num_attr(attrs, cfg.get("friction_attribute"))
    rows = []
    for spec in dofs:
        rows.append({
            "type": float(spec.get("type", 1)),
            "stiffness": _stiffness_value(spec.get("stiffness", "rigid"), attrs, anchor_stiffness),
            "gap": gap,
            "friction": friction,
        })
    return rows, kind


def support_node_name(attrs: dict[str, Any], cfg: dict[str, Any]) -> Optional[str]:
    key = cfg.get("node_name_attribute")
    val = attrs.get(key) if key else None
    if val in (None, ""):
        val = attrs.get("NAME")
    return str(val).strip() if val not in (None, "") else None
