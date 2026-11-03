#!/usr/bin/env python3
"""PSI116 upstream XML profile catalog.

P1 purpose:
- Define profile names and metadata in one place before changing mapper logic.
- Keep the existing generic route-materialized output as the safe default.
- Introduce the AVEVA benchmark target profile without touching xml_to_cii.py.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Psi116Profile:
    name: str
    namespace: str
    source: str
    version: str
    user_name: str
    purpose: str
    project_name: str
    mdb_name: str
    title_line: str
    include_units: bool
    restrain_open_ends: str
    ambient_temperature: str
    bend_type_default: int


PROFILES: dict[str, Psi116Profile] = {
    'generic_guard': Psi116Profile(
        name='generic_guard',
        namespace='http://aveva.com/pipestress116.xsd',
        source='AVEVA PSI',
        version='0.0.0.0',
        user_name='browser-runtime',
        purpose='RMSS conversion',
        project_name='',
        mdb_name='',
        title_line='RMSS Output',
        include_units=False,
        restrain_open_ends='No',
        ambient_temperature='0',
        bend_type_default=1,
    ),
    'aveva_benchmark': Psi116Profile(
        name='aveva_benchmark',
        namespace='http://aveva.com/pipeStress116.xsd',
        source='AVEVA PSI',
        version='3.1.7.0',
        user_name='MUCE828',
        purpose='Preliminary stress run',
        project_name='ZAU',
        mdb_name='/ZAU1',
        title_line='PSI stress Output',
        include_units=True,
        restrain_open_ends='Yes',
        ambient_temperature='',
        bend_type_default=0,
    ),
}

PROFILE_NAMES = tuple(PROFILES.keys())


def get_profile(name: str | None) -> Psi116Profile:
    key = name or 'generic_guard'
    if key not in PROFILES:
        raise KeyError(f"Unsupported PSI116 profile '{key}'. Supported profiles: {', '.join(PROFILE_NAMES)}")
    return PROFILES[key]
