#!/usr/bin/env python3
"""Convert a managed-stage hierarchy JSON to CAESAR II InputXML format.

Element mapping rules
---------------------
PIPE / REDU / TEE  -> 1 PIPINGELEMENT
FLAN               -> 1 PIPINGELEMENT with RIGID child
GASK between FLANs -> 1 PIPINGELEMENT with RIGID child (standalone joint)
GASK adj to PIPE   -> absorbed into that PIPE; PIPE becomes RIGID
ELBO / BEND        -> 2 PIPINGELEMENT records:
                        arm1 (apos->cpos)  carries the BEND child
                        arm2 (cpos->lpos)  plain element
OLET               -> dropped; adds SIF slot to the preceding element
SUPPORT            -> dropped (no RESTRAINT emitted)
BRANCH headers     -> skipped
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from dataclasses import dataclass, fields
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

from inputxml_bookmark import InputXmlDefaults, load_defaults, SENTINEL

# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------

def pt(v):
    if isinstance(v, dict):
        return (float(v.get('x', v.get('X', 0))),
                float(v.get('y', v.get('Y', 0))),
                float(v.get('z', v.get('Z', 0))))
    return None


def vsub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def vadd(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def vlen(a): return math.sqrt(a[0]**2 + a[1]**2 + a[2]**2)


def mm_val(s):
    import re
    if s is None:
        return None
    m = re.search(r'[-+]?\d+(?:\.\d+)?', str(s).replace('mm', '').replace('MM', ''))
    return float(m.group()) if m else None


OD_TABLE = {750: 762.0, 600: 610.0, 400: 406.4, 100: 114.3}


def od_from_bore(bore_mm):
    if bore_mm is None:
        return None
    for k, v in OD_TABLE.items():
        if abs(bore_mm - k) <= 25:
            return v
    return bore_mm


def encode_delta(dx, dy, dz, threshold=0.5):
    """Replace near-zero axis movements with SENTINEL."""
    return (
        dx if abs(dx) >= threshold else SENTINEL,
        dy if abs(dy) >= threshold else SENTINEL,
        dz if abs(dz) >= threshold else SENTINEL,
    )

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class Element:
    from_node: int
    to_node: int
    dx: float
    dy: float
    dz: float
    diameter: float        # explicit OD or SENTINEL
    wall: float            # explicit or SENTINEL
    temp1: float           # explicit or SENTINEL
    modulus: float
    hot_mod1: float
    rigid: bool = False
    bend_radius: float = SENTINEL
    bend_mid_node: int = -1
    sif_node: int = -1
    rest_node: int = -1

# ---------------------------------------------------------------------------
# Node allocator
# ---------------------------------------------------------------------------

class NodeAllocator:
    def __init__(self, start: int = 10, step: int = 10):
        self._map: dict[tuple, int] = {}
        self._cur = start
        self._step = step

    def alloc(self) -> int:
        n = self._cur
        self._cur += self._step
        return n

    def alloc_mid(self, to_node: int) -> int:
        return to_node - 1

    def get_or_alloc(self, xyz) -> int:
        key = tuple(round(c) for c in xyz)
        if key not in self._map:
            self._map[key] = self.alloc()
        return self._map[key]

# ---------------------------------------------------------------------------
# Branch processor
# ---------------------------------------------------------------------------

def _bore_od(attrs, branch_bore):
    raw = (attrs.get('ABORE') or attrs.get('HBOR') or
           attrs.get('LBORE') or attrs.get('BORE') or branch_bore)
    bore = mm_val(raw)
    return od_from_bore(bore)


def _cpos(attrs):
    for k in ('CPOS', 'POS', 'CENTRE', 'CENTER', 'CENTREPOINT', 'CENTERPOINT', 'CP'):
        v = attrs.get(k)
        if v is not None:
            p = pt(v)
            if p:
                return p
    return None


def process_branch(branch: dict, na: NodeAllocator, defaults: InputXmlDefaults,
                   first_element_index: int) -> list[Element]:
    """Convert one branch's children to Element records."""
    children = branch.get('children', [])
    branch_bore = branch.get('bore') or branch.get('attributes', {}).get('HBOR')
    elements: list[Element] = []
    pending_sif = False   # set when OLET follows; applies to NEXT emitted element

    # Look ahead: find GASK positions and their neighbours to decide absorption
    gask_fate: dict[int, str] = {}  # index -> 'absorb_prev', 'absorb_next', 'standalone'
    for i, child in enumerate(children):
        if child.get('type') != 'GASK':
            continue
        prev_t = children[i - 1].get('type') if i > 0 else None
        next_t = children[i + 1].get('type') if i + 1 < len(children) else None
        if prev_t == 'FLAN' and next_t == 'FLAN':
            gask_fate[i] = 'standalone'
        elif prev_t == 'PIPE' or next_t == 'PIPE':
            # Absorb into whichever PIPE is adjacent (prefer next PIPE)
            gask_fate[i] = 'absorb_next' if next_t == 'PIPE' else 'absorb_prev'
        elif prev_t == 'FLAN':
            gask_fate[i] = 'absorb_prev'
        else:
            gask_fate[i] = 'absorb_next'

    # Pre-calculate GASK lengths to add to absorbing elements
    gask_add_to: dict[int, float] = {}  # target child index -> mm to add to its length
    for gi, fate in gask_fate.items():
        ga = children[gi].get('attributes', {})
        gapos = pt(ga.get('APOS'))
        glpos = pt(ga.get('LPOS'))
        glen_vec = vsub(glpos, gapos) if gapos and glpos else (0, 0, 0)
        if fate == 'absorb_prev' and gi > 0:
            gask_add_to[gi - 1] = gask_add_to.get(gi - 1, 0)  # just mark (handled below)
        elif fate == 'absorb_next' and gi + 1 < len(children):
            gask_add_to[gi + 1] = gask_add_to.get(gi + 1, 0)

    # Build list of GASK offsets for absorbed GASKs
    absorbed_gask_lpos: dict[int, tuple] = {}  # absorbing child index -> adjusted lpos
    for gi, fate in gask_fate.items():
        ga = children[gi].get('attributes', {})
        glpos = pt(ga.get('LPOS')) or pt(ga.get('APOS'))
        gapos = pt(ga.get('APOS')) or glpos
        if fate == 'absorb_prev' and gi > 0:
            # The GASK lpos overrides the prev element's lpos (extends it)
            prev_a = children[gi - 1].get('attributes', {})
            prev_lpos = pt(prev_a.get('LPOS'))
            # absorbed_gask_lpos[gi-1] = glpos  # extend prev element to gask lpos
            pass  # length already combined via deltas below
        elif fate == 'absorb_next' and gi + 1 < len(children):
            # The GASK apos overrides the next element's apos (the pipe starts earlier)
            absorbed_gask_lpos[gi + 1] = gapos  # next element's effective apos = gask's apos

    prev_od: float | None = None
    is_first_of_model = (first_element_index == 0)

    i = 0
    while i < len(children):
        child = children[i]
        typ = child.get('type', 'UNKNOWN').upper()
        attrs = child.get('attributes', {})

        # --- GASK handling ---
        if typ == 'GASK':
            fate = gask_fate.get(i, 'standalone')
            if fate == 'standalone':
                apos_raw = pt(attrs.get('APOS'))
                lpos_raw = pt(attrs.get('LPOS'))
                od = _bore_od(attrs, branch_bore) or prev_od or SENTINEL
                _emit_gask(elements, apos_raw, lpos_raw, od, prev_od, na,
                           defaults, first_element_index + len(elements), pending_sif)
                pending_sif = False
                if od is not None and od != SENTINEL:
                    prev_od = od
            # absorbed GASKs skipped here (handled by the absorbing element)
            i += 1
            continue

        # --- OLET/SUPPORT: drop ---
        if typ in ('OLET', 'SUPPORT'):
            if typ == 'OLET':
                pending_sif = True
            i += 1
            continue

        # --- ELBO / BEND: arm1 (with BEND child) + arm2 (plain) ---
        if typ in ('ELBO', 'BEND'):
            apos_raw = pt(attrs.get('APOS'))
            lpos_raw = pt(attrs.get('LPOS'))
            cpos_raw = _cpos(attrs)
            if cpos_raw is None:
                cpos_raw = apos_raw
            od = _bore_od(attrs, branch_bore) or prev_od or SENTINEL

            arm1_delta = vsub(cpos_raw, apos_raw)
            arm2_delta = vsub(lpos_raw, cpos_raw)

            # Zero-delta BEND: apos==cpos==lpos (anchor/stub marker)
            # Emit ONE element (arm1 only) with radius=0 BEND child.
            # Update the position map so the next element starts at the new node.
            is_zero_delta = vlen(arm1_delta) < 1.0 and vlen(arm2_delta) < 1.0

            bend_radius_val = vlen(arm1_delta)
            if bend_radius_val < 0.1:
                bend_radius_val = vlen(arm2_delta)
            # For zero-delta BENDs keep radius as 0.0 (not SENTINEL) so BEND child is emitted.
            if bend_radius_val < 0.1 and not is_zero_delta:
                bend_radius_val = SENTINEL

            fn1 = na.get_or_alloc(apos_raw)
            tn1 = na.alloc()
            bend_mid = na.alloc_mid(tn1)

            dx1, dy1, dz1 = encode_delta(*arm1_delta)

            diam1 = od if (prev_od is None or (od is not None and abs(od - prev_od) > 0.5)) else SENTINEL
            elem_idx = first_element_index + len(elements)
            temp1_val = _temp_for(elem_idx, defaults)
            wall1 = defaults.wall_thickness if elem_idx == 0 else SENTINEL

            hot1 = defaults.hot_mod1 if temp1_val == defaults.temperature1 else defaults.modulus

            e1 = Element(
                from_node=fn1, to_node=tn1,
                dx=dx1, dy=dy1, dz=dz1,
                diameter=diam1, wall=wall1, temp1=temp1_val,
                modulus=defaults.modulus, hot_mod1=hot1,
                rigid=False,
                bend_radius=bend_radius_val,
                bend_mid_node=bend_mid,
                sif_node=tn1 if pending_sif else -1,
            )
            elements.append(e1)
            pending_sif = False
            if od is not None and od != SENTINEL:
                prev_od = od

            if is_zero_delta:
                # Update position map: next element at same position → gets tn1
                na._map[tuple(round(c) for c in apos_raw)] = tn1
                i += 1
                continue

            # arm2: plain element, no BEND child
            fn2 = tn1
            tn2 = na.get_or_alloc(lpos_raw)
            dx2, dy2, dz2 = encode_delta(*arm2_delta)
            e2 = Element(
                from_node=fn2, to_node=tn2,
                dx=dx2, dy=dy2, dz=dz2,
                diameter=SENTINEL, wall=SENTINEL, temp1=SENTINEL,
                modulus=defaults.modulus, hot_mod1=defaults.modulus,
                rigid=False,
            )
            elements.append(e2)
            i += 1
            continue

        # --- Regular element (PIPE / FLAN / REDU / TEE / ...) ---
        apos_raw = pt(attrs.get('APOS'))
        lpos_raw = pt(attrs.get('LPOS'))
        if apos_raw is None or lpos_raw is None:
            i += 1
            continue

        # Check if a GASK is absorbed INTO this element
        make_rigid = (typ == 'FLAN')
        effective_apos = apos_raw
        effective_lpos = lpos_raw

        # Absorb preceding GASK (fate=absorb_next for GASK at i-1)
        if i > 0 and children[i - 1].get('type') == 'GASK':
            gi = i - 1
            if gask_fate.get(gi) == 'absorb_next':
                ga = children[gi].get('attributes', {})
                effective_apos = pt(ga.get('APOS')) or apos_raw
                make_rigid = True

        # Absorb following GASK (fate=absorb_prev for GASK at i+1)
        if i + 1 < len(children) and children[i + 1].get('type') == 'GASK':
            gi = i + 1
            if gask_fate.get(gi) == 'absorb_prev':
                ga = children[gi].get('attributes', {})
                effective_lpos = pt(ga.get('LPOS')) or lpos_raw
                make_rigid = True

        # Also absorb a GASK further along if this PIPE is sandwiched
        # e.g. FLAN GASK PIPE GASK => PIPE absorbs both GASKs
        # handled by: look for GASKs at i-1 and i+1 simultaneously
        if (i > 0 and children[i - 1].get('type') == 'GASK' and
                i + 1 < len(children) and children[i + 1].get('type') == 'GASK'):
            gi_prev = i - 1
            gi_next = i + 1
            if (gask_fate.get(gi_prev) in ('absorb_next',) and
                    gask_fate.get(gi_next) in ('absorb_prev',)):
                ga_prev = children[gi_prev].get('attributes', {})
                ga_next = children[gi_next].get('attributes', {})
                effective_apos = pt(ga_prev.get('APOS')) or effective_apos
                effective_lpos = pt(ga_next.get('LPOS')) or effective_lpos
                make_rigid = True

        od = _bore_od(attrs, branch_bore) or prev_od or SENTINEL
        delta = vsub(effective_lpos, effective_apos)
        dx, dy, dz = encode_delta(*delta)

        diam = SENTINEL
        if od is not None and od != SENTINEL:
            if prev_od is None or abs(od - prev_od) > 0.5:
                diam = od

        elem_idx = first_element_index + len(elements)
        temp1_val = _temp_for(elem_idx, defaults)
        wall_val = defaults.wall_thickness if elem_idx == 0 else SENTINEL

        hot1 = defaults.hot_mod1 if temp1_val == defaults.temperature1 else defaults.modulus

        # SIF for TEE
        sif_node_val = -1
        if typ == 'TEE':
            # SIF at the TO_NODE (junction)
            sif_node_val = -2  # placeholder: resolved after node alloc

        fn = na.get_or_alloc(effective_apos)
        tn = na.get_or_alloc(effective_lpos)

        if sif_node_val == -2:
            sif_node_val = tn

        e = Element(
            from_node=fn, to_node=tn,
            dx=dx, dy=dy, dz=dz,
            diameter=diam, wall=wall_val, temp1=temp1_val,
            modulus=defaults.modulus, hot_mod1=hot1,
            rigid=make_rigid,
            sif_node=sif_node_val if (typ == 'TEE' or pending_sif) else -1,
        )
        if pending_sif and sif_node_val == -1:
            e.sif_node = tn
        elements.append(e)
        pending_sif = False

        if od is not None and od != SENTINEL:
            prev_od = od
        i += 1

    return elements


def _emit_gask(elements, apos_raw, lpos_raw, od, prev_od, na, defaults, elem_idx, pending_sif):
    if apos_raw is None or lpos_raw is None:
        return
    delta = vsub(lpos_raw, apos_raw)
    dx, dy, dz = encode_delta(*delta)
    diam = SENTINEL
    if od is not None and od != SENTINEL:
        if prev_od is None or abs(od - prev_od) > 0.5:
            diam = od
    temp1_val = _temp_for(elem_idx, defaults)
    hot1 = defaults.hot_mod1 if temp1_val == defaults.temperature1 else defaults.modulus
    fn = na.get_or_alloc(apos_raw)
    tn = na.get_or_alloc(lpos_raw)
    e = Element(
        from_node=fn, to_node=tn,
        dx=dx, dy=dy, dz=dz,
        diameter=diam, wall=SENTINEL, temp1=SENTINEL,
        modulus=defaults.modulus, hot_mod1=defaults.modulus,
        rigid=True,
        sif_node=tn if pending_sif else -1,
    )
    elements.append(e)


def _temp_for(elem_idx: int, defaults: InputXmlDefaults) -> float:
    if elem_idx == 0:
        return defaults.temperature1
    return SENTINEL

# ---------------------------------------------------------------------------
# Anchor/restraint decoration
# ---------------------------------------------------------------------------

def add_anchors(all_elements: list[Element], branch_anchor_indices: list[int]):
    """Mark specific element FROM or TO nodes as anchors."""
    for info in branch_anchor_indices:
        idx, node_type = info  # node_type: 'from' or 'to'
        if 0 <= idx < len(all_elements):
            node = all_elements[idx].from_node if node_type == 'from' else all_elements[idx].to_node
            all_elements[idx].rest_node = node

# ---------------------------------------------------------------------------
# XML emission
# ---------------------------------------------------------------------------

S = SENTINEL
FMT = '{:.6f}'


def f(v: float) -> str:
    return FMT.format(v)


def emit_restraint_slots(el: Element, num_slots: int = 6) -> list[str]:
    parts = []
    for slot in range(1, num_slots + 1):
        if slot == 1 and el.rest_node > 0:
            parts.append(
                f'<RESTRAINT NUM="{slot}" NODE="{f(el.rest_node)}" TYPE="{f(0.0)}"'
                f' STIFFNESS="{f(9.41952e+19)}" GAP="{f(S)}" FRIC_COEF="{f(S)}"'
                f' CNODE="{f(S)}" XCOSINE="{f(S)}" YCOSINE="{f(S)}" ZCOSINE="{f(S)}"'
                f' TAG="" GUID=""/>'
            )
        else:
            parts.append(
                f'<RESTRAINT NUM="{slot}" NODE="{f(S)}" TYPE="{f(S)}"'
                f' STIFFNESS="{f(S)}" GAP="{f(S)}" FRIC_COEF="{f(S)}"'
                f' CNODE="{f(S)}" XCOSINE="{f(S)}" YCOSINE="{f(S)}" ZCOSINE="{f(S)}"'
                f' TAG="" GUID=""/>'
            )
    return parts


def emit_sif_slots(el: Element, num_slots: int = 2) -> list[str]:
    parts = []
    for slot in range(1, num_slots + 1):
        if slot == 1 and el.sif_node > 0:
            parts.append(
                f'<SIF NODE="{f(el.sif_node)}" TYPE="{f(S)}" SIF1="{f(S)}" SIF2="{f(S)}"/>'
            )
        else:
            parts.append(
                f'<SIF NODE="{f(S)}" TYPE="{f(S)}" SIF1="{f(S)}" SIF2="{f(S)}"/>'
            )
    return parts


def element_to_xml(el: Element) -> str:
    lines = []
    lines.append(
        f'<PIPINGELEMENT FROM_NODE="{f(el.from_node)}" TO_NODE="{f(el.to_node)}"'
        f' DELTA_X="{f(el.dx)}" DELTA_Y="{f(el.dy)}" DELTA_Z="{f(el.dz)}"'
        f' DIAMETER="{f(el.diameter)}" WALL_THICK="{f(el.wall)}"'
        f' INSUL_THICK="{f(S)}" CORR_ALLOW="{f(S)}"'
        f' TEMP_EXP_C1="{f(el.temp1)}"'
        f' TEMP_EXP_C2="{f(S)}" TEMP_EXP_C3="{f(S)}" TEMP_EXP_C4="{f(S)}"'
        f' TEMP_EXP_C5="{f(S)}" TEMP_EXP_C6="{f(S)}" TEMP_EXP_C7="{f(S)}"'
        f' TEMP_EXP_C8="{f(S)}" TEMP_EXP_C9="{f(S)}"'
        f' PRESSURE1="{f(S)}" PRESSURE2="{f(S)}" PRESSURE3="{f(S)}"'
        f' PRESSURE4="{f(S)}" PRESSURE5="{f(S)}" PRESSURE6="{f(S)}"'
        f' PRESSURE7="{f(S)}" PRESSURE8="{f(S)}" PRESSURE9="{f(S)}"'
        f' HYDRO_PRESSURE="{f(S)}"'
        f' MODULUS="{f(el.modulus)}"'
        f' HOT_MOD1="{f(el.hot_mod1)}"'
        f' HOT_MOD2="{f(el.modulus)}" HOT_MOD3="{f(el.modulus)}"'
        f' HOT_MOD4="{f(el.modulus)}" HOT_MOD5="{f(el.modulus)}"'
        f' HOT_MOD6="{f(el.modulus)}" HOT_MOD7="{f(el.modulus)}"'
        f' HOT_MOD8="{f(el.modulus)}" HOT_MOD9="{f(el.modulus)}"'
        f' POISSONS="{f(el.modulus != el.modulus and 0.0 or 0.292)}"'
        f' PIPE_DENSITY="0.007833"'
        f' INSUL_DENSITY="{f(S)}" FLUID_DENSITY="{f(S)}"'
        f' REFRACTORY_DENSITY="{f(S)}" REFRACTORY_THK="{f(S)}"'
        f' CLADDING_DEN="{f(S)}" CLADDING_THK="{f(S)}"'
        f' INSUL_CLAD_UNIT_WEIGHT="{f(S)}"'
        f' MATERIAL_NUM="1.000000" MATERIAL_NAME="LOW CARBON"'
        f' MILL_TOL_PLUS="{f(S)}" MILL_TOL_MINUS="{f(S)}"'
        f' SEAM_WELD="{f(S)}" NAME="">'
    )

    if el.bend_radius != SENTINEL and el.bend_mid_node > 0:
        lines.append(
            f'<BEND RADIUS="{f(el.bend_radius)}" TYPE="{f(S)}"'
            f' ANGLE1="-2.020200" NODE1="{f(el.bend_mid_node)}"'
            f' ANGLE2="{f(S)}" NODE2="{f(S)}"'
            f' ANGLE3="{f(S)}" NODE3="{f(S)}"'
            f' NUM_MITER="{f(S)}" FITTINGTHICKNESS="{f(S)}" KFACTOR="{f(S)}"/>'
        )

    if el.rigid:
        lines.append(f'<RIGID WEIGHT="{f(S)}" TYPE="Unspecified"/>')

    lines.extend(emit_sif_slots(el))
    lines.extend(emit_restraint_slots(el))
    lines.append('</PIPINGELEMENT>')
    return '\n'.join(lines)


def build_xml(job_name: str, elements: list[Element], defaults: InputXmlDefaults) -> str:
    num_bend = sum(1 for e in elements if e.bend_radius != SENTINEL and e.bend_mid_node > 0)
    num_rigid = sum(1 for e in elements if e.rigid)
    num_rest = sum(1 for e in elements if e.rest_node > 0)
    num_sif = sum(1 for e in elements if e.sif_node > 0)

    header = (
        f'<CAESARII xmlns="COADE" VERSION="{defaults.version}" XML_TYPE="Input">'
        f'<PIPINGMODEL xmlns="" JOBNAME="{job_name}"'
        f' TIME="" ISSUE_NO=""'
        f' NUMELT="{len(elements)}" NUMNOZ="0" NOHGRS="0"'
        f' NUMBEND="{num_bend}" NUMRIGID="{num_rigid}"'
        f' NUMEXPJNT="0" NUMREST="{num_rest}" NUMFORCMNT="0"'
        f' NUMUNFLOAD="0" NUMWIND="0" NUMELEOFF="0"'
        f' NUMALLOW="0" NUMISECT="{num_sif}"'
        f' NORTH_Z="{defaults.north_z}" NORTH_Y="{defaults.north_y}"'
        f' NORTH_X="{defaults.north_x}">'
    )
    body = '\n'.join(element_to_xml(e) for e in elements)
    return header + '\n' + body + '\n</PIPINGMODEL></CAESARII>'

# ---------------------------------------------------------------------------
# Branch ordering / anchor detection
# ---------------------------------------------------------------------------

def order_branches(data: list[dict]) -> list[dict]:
    """Return branches in processing order.

    Heuristic: branches with the most PIPE children first (main run),
    then sub-branches.  The JSON order is preserved as fallback.
    """
    def pipe_count(b):
        return sum(1 for c in b.get('children', []) if c.get('type') == 'PIPE')
    return sorted(data, key=pipe_count, reverse=True)


def detect_anchors(branches: list[dict], all_elements: list[Element],
                   branch_start_indices: list[int]) -> list[tuple[int, str]]:
    """Return list of (element_index, 'from'|'to') for anchor restraints.

    Rules:
    - First element of the first (main) branch: anchor at FROM_NODE.
    - Last element of any terminal branch (has TREF attribute): anchor at TO_NODE.
    - First element of each branch that starts with BEND at apos==lpos: anchor at FROM_NODE.
    """
    anchors = []

    # Rule 1: very first element
    if all_elements:
        anchors.append((0, 'from'))

    # Collect branch names to distinguish equipment refs from branch-to-branch refs
    branch_names = set()
    for b in branches:
        name = b.get('attributes', {}).get('NAME', '')
        if name:
            branch_names.add(name)

    for bi, branch in enumerate(branches):
        start_idx = branch_start_indices[bi]
        children = branch.get('children', [])
        b_attrs = branch.get('attributes', {})

        # Rule 2: terminal branch connecting to equipment (not another branch, not PSI '=' ref)
        tref = b_attrs.get('TREF', '')
        if tref and tref.strip() and not tref.startswith('='):
            if tref not in branch_names:
                # Find last element of this branch
                if bi + 1 < len(branch_start_indices):
                    end_idx = branch_start_indices[bi + 1] - 1
                else:
                    end_idx = len(all_elements) - 1
                if 0 <= end_idx < len(all_elements) and end_idx != 0:
                    anchors.append((end_idx, 'to'))

        # Rule 3: branch starting with zero-delta BEND
        if children and children[0].get('type') == 'BEND':
            a = children[0].get('attributes', {})
            apos = pt(a.get('APOS'))
            lpos = pt(a.get('LPOS'))
            if apos and lpos and vlen(vsub(lpos, apos)) < 1.0:
                # Zero-delta bend at branch start = anchor connection point
                if start_idx > 0 and start_idx < len(all_elements):
                    anchors.append((start_idx, 'from'))

    # Deduplicate
    seen: set[tuple] = set()
    result = []
    for a in anchors:
        if a not in seen:
            seen.add(a)
            result.append(a)
    return result

# ---------------------------------------------------------------------------
# Main converter
# ---------------------------------------------------------------------------

def convert(input_path: Path, output_path: Path, defaults: InputXmlDefaults,
            job_name: str | None = None, node_start: int = 10, node_step: int = 10):
    data = json.loads(input_path.read_text(encoding='utf-8-sig'))
    if not isinstance(data, list):
        data = [data]

    branches = order_branches(data)
    na = NodeAllocator(node_start, node_step)

    all_elements: list[Element] = []
    branch_start_indices: list[int] = []

    for branch in branches:
        branch_start_indices.append(len(all_elements))
        elems = process_branch(branch, na, defaults, len(all_elements))
        all_elements.extend(elems)

    # Apply anchors
    anchor_specs = detect_anchors(branches, all_elements, branch_start_indices)
    add_anchors(all_elements, anchor_specs)

    # Fix POISSONS (was accidentally broken in format string above)
    # Handled in element_to_xml via direct literal

    jn = job_name or input_path.stem
    xml = build_xml(jn, all_elements, defaults)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(xml, encoding='utf-8')

    print(f'Wrote {len(all_elements)} elements to {output_path}')
    bend_c = sum(1 for e in all_elements if e.bend_radius != SENTINEL and e.bend_mid_node > 0)
    rigid_c = sum(1 for e in all_elements if e.rigid)
    rest_c = sum(1 for e in all_elements if e.rest_node > 0)
    sif_c = sum(1 for e in all_elements if e.sif_node > 0)
    print(f'  NUMELT={len(all_elements)} NUMBEND={bend_c} NUMRIGID={rigid_c} '
          f'NUMREST={rest_c} NUMISECT={sif_c}')

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description='Convert staged JSON to CAESAR II InputXML')
    p.add_argument('--input', required=True, type=Path)
    p.add_argument('--output', required=True, type=Path)
    p.add_argument('--bookmark', type=Path)
    p.add_argument('--node-start', type=int, default=10)
    p.add_argument('--node-step', type=int, default=10)
    p.add_argument('--job-name', type=str)
    p.add_argument('--temperature1', type=float)
    p.add_argument('--wall-thickness', type=float)
    p.add_argument('--modulus', type=float)
    p.add_argument('--material-num', type=float)
    p.add_argument('--material-name', type=str)
    p.add_argument('--version', type=str)
    return p


def main():
    args = build_parser().parse_args()
    cli_overrides = {
        'temperature1': args.temperature1,
        'wall_thickness': args.wall_thickness,
        'modulus': args.modulus,
        'material_num': args.material_num,
        'material_name': args.material_name,
        'version': args.version,
    }
    defaults = load_defaults(args.bookmark, cli_overrides)
    convert(
        args.input, args.output, defaults,
        job_name=args.job_name,
        node_start=args.node_start,
        node_step=args.node_step,
    )


if __name__ == '__main__':
    main()
