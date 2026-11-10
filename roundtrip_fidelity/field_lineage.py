"""Read-only field-level CII location, writer-selection and source lineage.

R3 deliberately reuses the R1 source-edge ledger, complete 15-slot pointer
validator and the original serialized CII. It does not generate CII records.
"""
from __future__ import annotations

from collections import Counter, defaultdict
from decimal import Decimal
import math

from roundtrip_foundation.snapshot_replay import Hold, require, parse_section_map
from roundtrip_foundation.full_pointer_validation import (
    POINTER_FIELDS, validate_all_element_pointers,
)
from roundtrip_foundation.lineage import core
from .field_inventory import numeric

# Actual patched writer: xml_to_cii2019_patched._patched_elements_payload_factory.
# A row comprises 15 columns for field zero, then 13 columns per additional slot.
ELEMENT_REAL_ROWS = (
    ("fromNode", "toNode", "dx", "dy", "dz", "outsideDiameterMm"),
    ("wallThicknessMm", "insulationThicknessMm", "corrosionAllowanceMm",
     "temperature1", "temperature2", "temperature3"),
    ("temperature4", "temperature5", "temperature6",
     "temperature7", "temperature8", "temperature9"),
    ("pressure1", "pressure2", "pressure3", "pressure4", "pressure5", "pressure6"),
    ("pressure7", "pressure8", "pressure9",
     "reservedPressure4", "reservedPressure5", "reservedPressure6"),
    ("insulationDensity", "fluidDensity", "reservedDensity3",
     "reservedDensity4", "reservedDensity5", "hydroPressure"),
)
GROUP = {
    "fromNode": "GEOMETRY", "toNode": "GEOMETRY",
    "dx": "GEOMETRY", "dy": "GEOMETRY", "dz": "GEOMETRY",
    "outsideDiameterMm": "PIPE_DIMENSIONS",
    "wallThicknessMm": "PIPE_DIMENSIONS",
    "insulationThicknessMm": "PIPE_DIMENSIONS",
    "corrosionAllowanceMm": "PIPE_DIMENSIONS",
    "insulationDensity": "OPERATING", "fluidDensity": "OPERATING",
    "hydroPressure": "OPERATING",
}
for i in range(1, 10):
    GROUP[f"temperature{i}"] = GROUP[f"pressure{i}"] = "OPERATING"


def _slice(line, slot, count=6):
    start = 0 if slot == 0 else 15 + (slot-1) * 13
    end = 15 if slot == 0 else start + 13
    require(type(line) is str and len(line) >= end, "HOLD_CII_FIELD_TRUNCATED",
            f"Field slot {slot} outside actual serialized line width")
    return line[start:end], start, end


def _unit(name):
    if any(p in name for p in ("Diameter", "Thickness", "Allowance", "dx", "dy", "dz")):
        return "mm"
    if name in ("fromNode", "toNode"):
        return "NODE_ID"
    if name.startswith("temperature"):
        return "CII_TEMPERATURE_UNIT_UNVERIFIED"
    if name.startswith("pressure") or name == "hydroPressure":
        return "CII_PRESSURE_UNIT_UNVERIFIED"
    if "Density" in name or "density" in name:
        return "CII_DENSITY_UNIT_UNVERIFIED"
    return None


def _field_entry(*, cii_digest, field_id, field, group, element_index,
                 location, token, unit=None, aux_section=None, aux_pointer=None):
    value = numeric(token)
    return {
        "ciiFieldId": field_id, "ciiSha256": cii_digest, "ciiField": field,
        "propertyGroup": group, "ciiElementIdentity": (
            f"ELEMENT:{element_index}" if element_index else None),
        "ciiAuxiliarySection": aux_section, "ciiAuxiliaryPointer": aux_pointer,
        "ciiFieldLocation": location, "emittedToken": token,
        "emittedValue": str(value) if value is not None else None,
        "emittedUnit": unit, "sourceFieldCandidates": [],
        "sourceIdentityEvidence": None, "expectedSerializedToken": None,
        "selectionRule": None, "transformation": [],
        "reasonCodes": [], "valueStatus": "NOT_VERIFIED",
        "writerFunction": None, "physicalAuthority": "NOT_APPLICABLE",
        "technicalEditImplementation": "NOT_IMPLEMENTED",
    }


def inventory_cii_fields(original_cii: bytes):
    """Enumerate fields by *physical* CII location, not property names.

    Pointer records are stable field locations but their numeric indices are
    ephemeral. Original CII bytes stay immutable.
    """
    from .field_inventory import sha
    from cii2019_section_rules import LINES_PER_AUX_BLOCK
    data = original_cii.decode("utf-8")
    sections = parse_section_map(data)
    validated = validate_all_element_pointers(original_cii)
    cii_digest = sha(original_cii)
    element_lines = sections["ELEMENTS"]
    records = []
    for index, start in enumerate(range(0, len(element_lines), 15), 1):
        block = element_lines[start:start+15]
        require(len(block) == 15, "HOLD_CII_FIELD_TRUNCATED",
                f"Invalid 15-row element {index}")
        for row, names in enumerate(ELEMENT_REAL_ROWS):
            for slot, name in enumerate(names):
                raw, begin, end = _slice(block[row], slot)
                records.append(_field_entry(
                    cii_digest=cii_digest,
                    field_id=f"ELEMENT:{index}:ROW:{row+1}:COL:{slot+1}",
                    field=f"ELEMENT.{name}", group=GROUP.get(name, "DERIVED_CONSTANT"),
                    element_index=index,
                    location={"section": "ELEMENTS", "recordIndex": index,
                              "blockRow": row+1, "column": slot+1,
                              "startColumn": begin, "endColumn": end},
                    token=raw, unit=_unit(name)))
        for section, (row, slot, _) in POINTER_FIELDS.items():
            raw, begin, end = _slice(block[row], slot, 6 if row != 14 else 3)
            field = _field_entry(
                cii_digest=cii_digest,
                field_id=f"ELEMENT:{index}:POINTER:{section}",
                field=f"ELEMENT.auxPointer.{section}", group="AUXILIARY_IDENTITY",
                element_index=index,
                location={"section":"ELEMENTS", "recordIndex":index,
                          "blockRow":row+1,"column":slot+1,
                          "startColumn":begin,"endColumn":end},
                token=raw, unit="INDEX_NOT_STABLE")
            field["ciiAuxiliarySection"] = section
            field["ciiAuxiliaryPointer"] = validated["elementPointers"][index-1][section]
            records.append(field)
    for section in POINTER_FIELDS:
        count = validated["recordCounts"][section]
        width = 1 if section == "NODENAME" else LINES_PER_AUX_BLOCK[section]
        rows = sections.get(section, [])
        require(len(rows) == count*width, "HOLD_CII_FIELD_TRUNCATED",
                f"{section} record rows not aligned")
        for pointer in range(1,count+1):
            part=rows[(pointer-1)*width:pointer*width]
            for i, line in enumerate(part):
                # For RIGID record 1, the weight and type have independently
                # reversible field locations. Other aux sections are retained
                # as opaque row payloads pending verified field semantics.
                if section == "RIGID":
                    for slot, name in enumerate(("weight", "type")):
                        raw, begin, end = _slice(line, slot, 2)
                        field=_field_entry(
                            cii_digest=cii_digest,
                            field_id=f"RIGID:{pointer}:{name}",
                            field=f"RIGID.{name}", group="RIGID",
                            element_index=None,
                            location={"section":"RIGID","recordIndex":pointer,
                                      "blockRow":i+1,"column":slot+1,
                                      "startColumn":begin,"endColumn":end},
                            token=raw, unit=("CII_OUTPUT_WEIGHT" if slot==0 else "RIGID_TYPE"),
                            aux_section="RIGID", aux_pointer=pointer)
                        records.append(field)
                else:
                    records.append(_field_entry(
                        cii_digest=cii_digest, field_id=f"AUX:{section}:{pointer}:ROW:{i+1}",
                        field=f"{section}.recordRow{i+1}",
                        group=("SUPPORTS" if section in ("RESTRANT", "DISPLMNT",
                                "FORCMNT", "UNIFORM", "OFFSETS") else
                               "SPECIAL_COMPONENTS"),
                        element_index=None,
                        location={"section":section,"recordIndex":pointer,
                                  "blockRow":i+1,"column":None},
                        token=line, aux_section=section, aux_pointer=pointer))
    # Retain additional emitted engineering sections instead of silently
    # claiming material/coordinate data is absent. No guessed writer lineage.
    for section, rows in sections.items():
        if section in ("ELEMENTS",) or section in POINTER_FIELDS:
            continue
        if section in ("VERSION", "CONTROL", "UNITS"):
            continue
        for i, line in enumerate(rows,1):
            records.append(_field_entry(
                cii_digest=cii_digest, field_id=f"SECTION:{section}:ROW:{i}",
                field=f"{section}.row{i}", group=("MATERIAL" if section == "MISCEL" else "OTHER"),
                element_index=None,
                location={"section":section,"recordIndex":i,"blockRow":None,"column":None},
                token=line))
    ids = [x["ciiFieldId"] for x in records]
    require(len(ids) == len(set(ids)), "HOLD_CII_FIELD_DUPLICATE",
            "CII field physical locations duplicate")
    return {"schema":"xml-cii-field-output-inventory/r3",
            "ciiSha256":cii_digest,"fields":records,"outputFieldsCount":len(records),
            "ciiElementsCount":len(element_lines)//15,
            "ciiAuxiliaryCounts":validated["recordCounts"],
            "pointerFieldsValidated":validated["pointerFieldsValidated"]}


def _index_source(inventory):
    indexed = defaultdict(list)
    for f in inventory["fields"]:
        indexed[(f["branchOrdinal"], f["nodeOrdinal"], f["sourceFieldPath"])].append(f)
    return indexed


def _lookup(index, bi, ni, path):
    return index.get((bi,ni,path),[])


def _formatter(value):
    return core._format_auto_float(float(value))


def _select(fields, source_fields, reason, value=None, selection=None,
            rules=(), expected=None, authority="NOT_APPLICABLE",
            technical="NOT_IMPLEMENTED"):
    fields["sourceFieldCandidates"] = [f["fieldId"] for f in source_fields]
    fields["sourceIdentityEvidence"] = reason
    fields["selectionRule"] = selection
    fields["transformation"] = list(rules)
    fields["expectedSerializedToken"] = expected
    fields["physicalAuthority"] = authority
    fields["technicalEditImplementation"] = technical
    if value is not None:
        fields["expectedSourceNumeric"] = str(value)


def _set_expected(field, source_records, expected, rule, transformations=(),
                  source_value=None, technical="NOT_IMPLEMENTED", authority="NOT_APPLICABLE"):
    _select(field, source_records, "R1_VERIFIED_SOURCE_EDGE",
            source_value, rule, transformations, expected,
            authority=authority, technical=technical)


def build_field_relations(*, effective_inventory, processed_inventory,
                          r1_ledger: dict, cii_inventory: dict,
                          configuration: dict):
    """Every emitted field gets an explicit source candidate or reason.

    For a source-to-output many-to-many link we retain ALL candidates. A
    unique writer source is not an approved physical mass owner.
    """
    require(r1_ledger["runIdentity"]["engineInputSha256"] ==
            effective_inventory["sourceXmlSha256"],
            "HOLD_FIELD_SOURCE_MISMATCH", "R1 source stage does not match R3 source")
    require(r1_ledger["runIdentity"]["pythonPreprocessedXmlSha256"] ==
            processed_inventory["sourceXmlSha256"],
            "HOLD_FIELD_TRANSFORM_MISMATCH", "Observed Python stage differs from R1")
    require(r1_ledger["runIdentity"]["ciiSha256"] ==
            cii_inventory["ciiSha256"], "HOLD_FIELD_CII_MISMATCH",
            "CII field inventory differs from frozen R1 replay")
    source_nodes = {n["identity"]: n for n in r1_ledger["sourceNodes"]}
    source_fields = _index_source(effective_inventory)
    processed_fields = _index_source(processed_inventory)
    processed_inverse = defaultdict(list)
    for processed_id, original_id in r1_ledger["index"]["pythonNodeToOriginalSourceNode"].items():
        processed_inverse[original_id].append(processed_id)
    post_nodes = {n["identity"]: n for n in r1_ledger["pythonPreprocessedNodes"]}
    elements = {e["elementIndex"]:e for e in r1_ledger["elements"]}
    aux = {(x["section"],x["recordPointer"]):x for x in r1_ledger["auxiliaryRecords"]}
    by_output = {x["ciiFieldId"]: x for x in cii_inventory["fields"]}
    scale = float(configuration["weightScale"])
    require(scale in (1,10), "HOLD_CONFIGURATION_MISMATCH", "Unpinned weight scale")
    event_by_node=defaultdict(list)
    for event in r1_ledger["transformations"]:
        if event.get("sourceIdentity"):
            event_by_node[event["sourceIdentity"]].append(event)

    def source_node_field(source_id, path):
        src=source_nodes.get(source_id)
        if src is None:
            return []
        return _lookup(source_fields,src["branchOrdinal"],src["nodeOrdinal"],path)

    def post_node_fields(source_id,path):
        found=[]
        for sid in processed_inverse.get(source_id,[]):
            pn=post_nodes.get(sid)
            if pn:
                found.extend(_lookup(processed_fields,pn["branchOrdinal"],pn["nodeOrdinal"],path))
        return found

    def chosen_value(source_id,path):
        src=source_node_field(source_id,path)
        post=post_node_fields(source_id,path)
        if len(post)==1:
            return src,post[0]["parsedValue"],post
        if len(src)==1 and len(post)==0:
            return src,src[0]["parsedValue"],[]
        return src,None,post

    def resolve_node(field,sid,path,selection, fallback=None, default=False):
        source,token,post=chosen_value(sid,path)
        changed=bool(source and post and source[0]["parsedValue"]!=post[0]["parsedValue"])
        stages=["PYTHON_PREPROCESSING_CHANGED_FIELD"] if changed else []
        if not source or token is None or numeric(token) is None:
            if fallback is not None:
                _set_expected(field,source,_formatter(fallback),selection,
                              [*stages,"DEFAULT_VALUE_SUBSTITUTION"],
                              technical="HOLD")
                field["reasonCodes"].append("SOURCE_ABSENT_OR_INVALID_DEFAULTED")
            else:
                field["reasonCodes"].append("SELECTED_FIELD_MISSING_OR_NON_NUMERIC")
            return
        value=numeric(token)
        if default and value <= 0:
            _set_expected(field,source,_formatter(fallback),selection,
                          [*stages,"WALL_NONPOSITIVE_TO_0.01"],
                          source_value=value,technical="HOLD")
            field["reasonCodes"].append("SOURCE_WALL_DEFAULTED")
            return
        _set_expected(field,source,_formatter(value),selection,stages,
                      source_value=value)
        if len(source)!=1 or len(post)>1:
            field["reasonCodes"].append("SOURCE_FIELD_NOT_UNIQUELY_IDENTIFIED")

    for idx,e in elements.items():
        prefix=f"ELEMENT:{idx}:"
        exact=e.get("lineageStatus") in ("EXACT_UNIQUE","TRANSFORMED_WITH_LINEAGE")
        identities=e.get("sourceEdgeIdentity") or []
        if not exact or len(identities)!=2 or any(x not in source_nodes for x in identities):
            for x in cii_inventory["fields"]:
                if x["ciiElementIdentity"]==f"ELEMENT:{idx}":
                    x["reasonCodes"].append("R1_EDGE_IDENTITY_UNRESOLVED")
                    x["sourceIdentityEvidence"]=e.get("lineageStatus","UNMATCHED")
            continue
        fr,to=identities
        fr_node,to_node=source_nodes[fr],source_nodes[to]
        source_transformed=any(event_by_node[n] for n in identities)
        for name, sid in (("fromNode",fr),("toNode",to)):
            x=by_output[f"{prefix}ROW:1:COL:{1 if name=='fromNode' else 2}"]
            source=source_node_field(sid,"Node/NodeNumber")
            if source:
                # The writer selects the post-Python node identity, not the
                # negative original identifier retained in the source XML.
                chosen=fr_node if name=="fromNode" else to_node
                expected=_formatter(float(e[name]))
                rules=["PYTHON_NODE_RENUMBER"] if any(
                    v.get("stage")=="PYTHON_NODE_RENUMBER" for v in event_by_node[sid]) else []
                _set_expected(x,source,expected,
                              "FROM_NODE_NUMBER" if name=="fromNode" else "TO_NODE_NUMBER",
                              rules,source_value=numeric(source[0]["parsedValue"]))
        position_sources=source_node_field(fr,"Node/Position")+source_node_field(to,"Node/Position")
        a=fr_node.get("position")
        b=to_node.get("position")
        if a is not None and b is not None and len(position_sources)==2:
            try:
                left=core._map_position_to_cii(tuple(a))
                right=core._map_position_to_cii(tuple(b))
                for slot, axis in enumerate(("dx","dy","dz"),3):
                    x=by_output[f"{prefix}ROW:1:COL:{slot}"]
                    val=right[slot-3]-left[slot-3]
                    _set_expected(x,position_sources,_formatter(val),
                                  "FROM_TO_POSITION_DIFFERENCE",
                                  ["AXIS_XZY_NEGATE_Y","MULTIPLE_SOURCE_FIELDS_ONE_OUTPUT"],
                                  source_value=val,technical="HOLD")
                    x["reasonCodes"].append("DIFFERENCE_NOT_INVERSE_UNIQUE")
            except (ValueError,OverflowError):
                pass
        od_to=(to_node.get("componentType")=="BRAN" and
               to_node.get("fields",{}).get("Endpoint")=="2")
        od_id = to if od_to else fr
        resolve_node(by_output[f"{prefix}ROW:1:COL:6"],od_id,
                     "Node/OutsideDiameter","TO_BRAN_ENDPOINT2" if od_to else "FROM")
        resolve_node(by_output[f"{prefix}ROW:2:COL:1"],fr,
                     "Node/WallThickness","FROM_WALL_WITH_0.01_FALLBACK",
                     fallback=0.01,default=True)
        for col,field_name,path in (
            (2,"insulationThicknessMm","Node/InsulationThickness"),
            (3,"corrosionAllowanceMm","Node/CorrosionAllowance")):
            resolve_node(by_output[f"{prefix}ROW:2:COL:{col}"],to,path,
                         "TO_"+field_name, fallback=0.0)
        bi=fr_node["branchOrdinal"]
        # Patched writer takes branch case arrays from post-Python processed
        # XML. Original ENGINE_INPUT fields may have been overwritten by the
        # run-pinned support config / line-list.
        for kind in ("temperature","pressure"):
            for number in range(1,10):
                row,col = ((1,number+3) if number<=3 else
                           (2,number-3)) if kind=="temperature" else (
                           (3,number) if number<=6 else (4,number-6))
                x=by_output[f"{prefix}ROW:{row+1}:COL:{col}"]
                path=f"Branch/{kind.title()}/{kind.title()}{number}"
                src=_lookup(source_fields,bi,None,path)
                post=_lookup(processed_fields,bi,None,path)
                token=post[0]["parsedValue"] if len(post)==1 else (
                    src[0]["parsedValue"] if len(src)==1 else "")
                val=numeric(token)
                sentinel=kind=="temperature" and val==Decimal("-100000")
                val=Decimal(0) if val is None or sentinel else val
                changed=(len(src)==1 and len(post)==1 and
                         src[0]["parsedValue"]!=post[0]["parsedValue"])
                transformations=["PROCESS_CONFIG_OR_STAGED_FIELD_SELECTION"] if changed else []
                if len(src)!=1:
                    transformations.append("BRANCH_CASE_ABSENT_OR_UNPROVEN_DEFAULT")
                    x["reasonCodes"].append("SOURCE_ABSENT_OR_ENRICHED")
                if kind=="temperature" and sentinel:
                    transformations.append("SENTINEL_TEMPERATURE_TO_ZERO")
                _set_expected(x,src,_formatter(val),
                              "PYTHON_PATCHED_BRANCH_"+kind.upper()+"_CASE_"+str(number),
                              transformations,source_value=val)
        for col,path,rule in (
            (1,"Branch/InsulationDensity","BRANCH_POST_PROCESS_INSULATION_DENSITY"),
            (2,"Branch/FluidDensity","BRANCH_POST_PROCESS_FLUID_DENSITY")):
            x=by_output[f"{prefix}ROW:6:COL:{col}"]
            src=_lookup(source_fields,bi,None,path)
            post=_lookup(processed_fields,bi,None,path)
            token=post[0]["parsedValue"] if len(post)==1 else (
                src[0]["parsedValue"] if len(src)==1 else "")
            val=numeric(token) or Decimal(0)
            # _density_for_output uses pinned default convertDensityKgM3ToKgCm3=true.
            if configuration.get("convertDensityKgM3ToKgCm3",True):
                val=val / Decimal(1000000)
            _set_expected(x,src,_formatter(val),rule,
                          ["CONFIG_DENSITY_CONVERSION"] if
                          configuration.get("convertDensityKgM3ToKgCm3",True) else [],
                          source_value=val)
            if not src:x["reasonCodes"].append("BRANCH_DENSITY_DERIVED_OR_DEFAULTED")
        hydro=by_output[f"{prefix}ROW:6:COL:6"]
        src=_lookup(source_fields,bi,None,"Branch/Pressure/HydroPressure")
        post=_lookup(processed_fields,bi,None,"Branch/Pressure/HydroPressure")
        token=post[0]["parsedValue"] if len(post)==1 else (
            src[0]["parsedValue"] if len(src)==1 else "")
        val=numeric(token) or Decimal(0)
        _set_expected(hydro,src,_formatter(val),"BRANCH_HYDRO_PRESSURE",
                      ["PROCESS_CONFIG_MAY_OVERRIDE"] if post else [],source_value=val)
        if not src:hydro["reasonCodes"].append("SOURCE_ABSENT_OR_ENRICHED")
        # RIGID and other aux pointers are index identities, not engineering
        # source fields. Preserve source-edge identity but never reverse-infer.
        for x in cii_inventory["fields"]:
            if x["ciiElementIdentity"]==f"ELEMENT:{idx}" and x["propertyGroup"]=="AUXILIARY_IDENTITY":
                x["sourceIdentityEvidence"]=e["sourceEdgeIdentity"]
                x["selectionRule"]="CONVERTER_AUXILIARY_RECORD_INDEX"
                x["reasonCodes"].append("AUX_POINTER_NOT_PERMANENT_SOURCE_IDENTITY")

    for (section,pointer),a in aux.items():
        if section!="RIGID":
            continue
        weight=by_output.get(f"RIGID:{pointer}:weight")
        type_record=by_output.get(f"RIGID:{pointer}:type")
        if type_record:
            type_record["expectedSerializedToken"]=core._format_fixed_float(0.0,6)
            type_record["selectionRule"]="WRITER_FIXED_RIGID_TYPE_ZERO"
            type_record["reasonCodes"].append("DERIVED_CONSTANT_NOT_SOURCE_PROPERTY")
        if not weight:
            continue
        weight["writerFunction"]="xml_to_cii2019._rigid_weight_for_edge"
        sid=a.get("writerWeightSourceNode")
        if not sid:
            weight["reasonCodes"].append("R1_RIGID_WRITER_SOURCE_UNRESOLVED")
            weight["sourceIdentityEvidence"]=a.get("ownershipStatus","UNMATCHED")
            continue
        src, token, post=chosen_value(sid,"Node/Weight")
        if len(src)!=1 or token is None or numeric(token) is None:
            weight["reasonCodes"].append("WRITER_WEIGHT_SOURCE_NOT_UNIQUE")
            continue
        expected = _formatter(float(numeric(token))*scale)
        authority=("OWNER_APPROVAL_REQUIRED" if
                   a.get("ownershipStatus") in ("EXACT_UNIQUE","TRANSFORMED_WITH_LINEAGE")
                   and len(a.get("sourceOwners",[]))==1
                   else "UNRESOLVED")
        _set_expected(weight,src,expected,"TO_RIGID_2_OR_RIGID_TO_FLAN_WEIGHT",
                      ["WEIGHT_MULTIPLY_RUN_PINNED_SCALE"],
                      source_value=numeric(token),authority=authority,
                      technical=("ELIGIBLE" if authority=="OWNER_APPROVAL_REQUIRED"
                                 and a.get("ownershipStatus")=="EXACT_UNIQUE"
                                 else "HOLD"))
        weight["weightScale"]=scale
        weight["sourceComponentRefNo"]=(
            source_nodes[sid].get("componentRefNo") if sid in source_nodes else None)
        weight["sourceNodeIdentity"]=sid
        weight["expectedMassAuthority"]="WRITER_SELECTED_ONLY_NOT_PHYSICALLY_APPROVED"
        if a.get("ownershipStatus") not in ("EXACT_UNIQUE","TRANSFORMED_WITH_LINEAGE"):
            weight["reasonCodes"].append("PHYSICAL_OWNER_UNRESOLVED")
        if len(a.get("sourceOwners",[]))!=1:
            weight["reasonCodes"].append("MASS_ALLOCATION_NOT_VERIFIED")
    return cii_inventory
