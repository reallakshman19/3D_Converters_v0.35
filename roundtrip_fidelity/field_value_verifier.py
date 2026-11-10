"""Independent R3 serialized engineering-value verification.

Compare actual CII tokens to the *real writer format* derived from R1 source
identity and run-pinned rules. The source data is retained separately.
No ledger-only value may override independently parsed CII bytes.
"""
from __future__ import annotations

from collections import Counter
from decimal import Decimal

from roundtrip_foundation.snapshot_replay import Hold, require
from .field_inventory import numeric, sha
from .field_lineage import inventory_cii_fields


def verify_field_values(field_inventory, original_cii: bytes):
    require(field_inventory["ciiSha256"] == sha(original_cii),
            "HOLD_STALE_CII", "Field ledger CII digest not equal to original")
    independent = inventory_cii_fields(original_cii)
    actual = {f["ciiFieldId"]:f for f in independent["fields"]}
    ledger = field_inventory["fields"]
    ids=[f["ciiFieldId"] for f in ledger]
    require(len(ids) == len(set(ids)) and len(ids)==len(actual),
            "HOLD_FIELD_INVENTORY_INVALID", "Physical field inventory cardinality changed")
    checks = []
    for field in ledger:
        identifier=field["ciiFieldId"]
        observed=actual.get(identifier)
        require(observed is not None and
                observed["ciiFieldLocation"]==field["ciiFieldLocation"] and
                observed["emittedToken"]==field["emittedToken"],
                "HOLD_FIELD_INVENTORY_INVALID",
                f"Altered ledger value/locator: {identifier}")
        expected=field.get("expectedSerializedToken")
        status="UNVERIFIED_SOURCE_MAPPING"
        discrepancy=None
        if expected is not None:
            if field["emittedToken"].strip() == str(expected).strip():
                status="PASS_EXACT_WRITER_SERIALIZATION"
            else:
                status="HOLD_VALUE_DISCREPANCY"
                discrepancy={
                    "ciiFieldId": identifier, "ciiField":field["ciiField"],
                    "originalSerializedToken":field["emittedToken"],
                    "expectedWriterToken":str(expected),
                    "sourceFieldCandidates":field["sourceFieldCandidates"],
                    "selectionRule":field.get("selectionRule"),
                    "reasonCode":"ACTUAL_SERIALIZED_CII_DISAGREES_WITH_WRITER_SOURCE"}
        elif field.get("selectionRule")=="CONVERTER_AUXILIARY_RECORD_INDEX":
            status="PASS_STRUCTURAL_POINTER_NOT_SOURCE_VALUE"
        elif field["propertyGroup"]=="DERIVED_CONSTANT":
            # Only factory rows of actual writer unconditionally set aside as
            # reserved fields are known constants. Don't guess from 0 values.
            if field["ciiField"].startswith("ELEMENT.reserved"):
                if numeric(field["emittedToken"]) == Decimal(0):
                    status="PASS_VERIFIED_WRITER_CONSTANT"
                else:
                    status="HOLD_VALUE_DISCREPANCY"
                    discrepancy={
                        "ciiFieldId":identifier, "ciiField":field["ciiField"],
                        "originalSerializedToken":field["emittedToken"],
                        "expectedWriterToken":"0.000000",
                        "reasonCode":"WRITER_RESERVED_SLOT_NOT_ZERO"}
        field["valueStatus"]=status
        if discrepancy:
            field["reasonCodes"].append("ACTUAL_WRITER_VALUE_MISMATCH")
            checks.append(discrepancy)
        # Source -> CII formatting may irreversibly round a numeric value.
        # This check is *not* a loose numerical acceptance tolerance.
        candidate=field.get("expectedSourceNumeric")
        if status=="PASS_EXACT_WRITER_SERIALIZATION" and candidate is not None:
            source=numeric(candidate)
            emitted=numeric(field["emittedToken"])
            if source is not None and emitted is not None:
                scaled=source
                if "WEIGHT_MULTIPLY_RUN_PINNED_SCALE" in field["transformation"]:
                    factor=numeric(field.get("weightScale"))
                    if factor is not None:
                        scaled*=factor
                if scaled!=emitted:
                    field["reasonCodes"].append("CII_NUMERIC_QUANTIZATION")
                    field["precisionLoss"]={
                        "preSerializationValue":str(scaled),
                        "emittedValue":str(emitted),
                        "absoluteDifference":str(abs(scaled-emitted)),
                        "writerToken":str(expected),
                    }
                elif str(candidate).strip()!=field["emittedToken"].strip():
                    field["representationReformatted"]=True
        # Never label every unknown value as a numeric zero-pass.
    statuses=dict(Counter(f["valueStatus"] for f in ledger))
    return {
        "schema":"xml-cii-field-value-verification/r3",
        "originalCiiSha256":sha(original_cii),
        "status":"HOLD_FIELD_VALUE_MISMATCH" if checks else
                 "PASS_CHECKED_FIELDS_WITH_UNVERIFIED_REMAINDER",
        "outputFieldsInventoried":len(actual),
        "exactWriterValueFields":statuses.get("PASS_EXACT_WRITER_SERIALIZATION",0),
        "unverifiedFields":statuses.get("UNVERIFIED_SOURCE_MAPPING",0),
        "pointerFieldsStructuralOnly":statuses.get("PASS_STRUCTURAL_POINTER_NOT_SOURCE_VALUE",0),
        "verifiedWriterConstants":statuses.get("PASS_VERIFIED_WRITER_CONSTANT",0),
        "discrepancyCount":len(checks),"discrepancies":checks,
        "perFieldVerification": [{
            "ciiFieldId":f["ciiFieldId"],"ciiField":f["ciiField"],
            "valueStatus":f["valueStatus"],
            "reasonCodes":list(dict.fromkeys(f["reasonCodes"])),
            "precisionLoss":f.get("precisionLoss"),
        } for f in ledger],
        "policy":{
            "exactWriterSerialization":"Exact trimmed serialized CII field token from active writer",
            "quantization":"Decimal exact source-derived quantity vs Decimal emitted output",
            "unverified":"Not accepted as reverse-mappable or engineering-value qualified",
            "pointerIdentity":"All 15 IEL fields independently structure-validated; index is not source identity",
        },
    }


def refuse_ledger_value_mutation(ledger, original_cii: bytes):
    """Convenience read-only integrity gate for submitted/modified ledgers."""
    verify_field_values(ledger, original_cii)
    return True


def verify_source_linked_pointer_reindex(original_cii: bytes, candidate_cii: bytes,
                                         r1_lineage_ledger: dict | None = None):
    """Positive auxiliary pointer renumbering comparison, without edits.

    A pointer number is not a permanent component ID. Match each auxiliary
    record through the exact unchanged source-linked ELEMENT identity and its
    complete reference set. Any unreferenced/shared ambiguous payload is HOLD.
    """
    from collections import defaultdict
    from cii2019_section_rules import LINES_PER_AUX_BLOCK
    from roundtrip_foundation.snapshot_replay import parse_section_map
    from roundtrip_foundation.full_pointer_validation import (
        POINTER_FIELDS, validate_all_element_pointers,
    )
    old_pointers=validate_all_element_pointers(original_cii)
    new_pointers=validate_all_element_pointers(candidate_cii)
    original=parse_section_map(original_cii.decode("utf-8"))
    revised=parse_section_map(candidate_cii.decode("utf-8"))
    require(list(original)==list(revised), "HOLD_FIELD_REINDEX",
            "CII section order or inventory changed")
    require(old_pointers["recordCounts"]==new_pointers["recordCounts"],
            "HOLD_FIELD_REINDEX","Auxiliary section record counts changed")
    before=original["ELEMENTS"];after=revised["ELEMENTS"]
    require(len(before)==len(after), "HOLD_FIELD_REINDEX","ELEMENT count changed")
    def identify(lines):
        result={}
        for i in range(len(lines)//15):
            block=lines[15*i:15*(i+1)]
            signature=tuple(block[:12])
            require(signature not in result,"HOLD_FIELD_REINDEX",
                    "Duplicate unchanged ELEMENT geometry/source-key fingerprint")
            result[signature]=i
        return result
    old_ids=identify(before);new_ids=identify(after)
    require(set(old_ids)==set(new_ids),"HOLD_FIELD_REINDEX",
            "Non-pointer ELEMENT engineering fields changed")
    if r1_lineage_ledger is not None:
        require(r1_lineage_ledger["runIdentity"]["ciiSha256"]==sha(original_cii),
                "HOLD_FIELD_REINDEX","R1 source-linked ledger belongs to other CII")
    verified_elements={}
    if r1_lineage_ledger:
        for elem in r1_lineage_ledger["elements"]:
            verified_elements[elem["elementIndex"]]=elem.get("sourceEdgeIdentity")
    pointer_moves=[]
    for section in POINTER_FIELDS:
        width=1 if section=="NODENAME" else LINES_PER_AUX_BLOCK[section]
        old_rows=original.get(section,[])
        new_rows=revised.get(section,[])
        def linkage(lines, indexes, payload):
            pointers=indexes["elementPointers"]
            links=defaultdict(set)
            for signature,index in lines.items():
                ptr=pointers[index][section]
                if ptr:
                    links[ptr].add(signature)
            records={}
            for ptr in range(1, len(payload)//width+1):
                references=links.get(ptr)
                require(references, "HOLD_FIELD_REINDEX",
                        f"Unreferenced {section} record cannot be source-linked")
                key=frozenset(references)
                require(key not in records,"HOLD_FIELD_REINDEX",
                        f"Duplicate {section} source-linked record identity")
                records[key]=(ptr,tuple(payload[(ptr-1)*width:ptr*width]))
            return records
        old_index=linkage(old_ids,old_pointers,old_rows)
        new_index=linkage(new_ids,new_pointers,new_rows)
        require(set(old_index)==set(new_index),"HOLD_FIELD_REINDEX",
                f"{section} source-linked ELEMENT references changed")
        for key,(pointer,payload) in old_index.items():
            revised_pointer,revised_payload=new_index[key]
            require(payload==revised_payload,"HOLD_FIELD_REINDEX",
                    f"{section} auxiliary engineering payload changed")
            if revised_pointer!=pointer:
                if r1_lineage_ledger is not None:
                    for signature in key:
                        idx=old_ids[signature]+1
                        ids=verified_elements.get(idx)
                        require(isinstance(ids,(list,tuple)) and len(ids)==2,
                                "HOLD_FIELD_REINDEX",
                                "Pointer-reindexed ELEMENT lacks verified R1 source edge")
                pointer_moves.append({
                    "section":section,"oldPointer":pointer,
                    "newPointer":revised_pointer,
                    "sourceLinkedElementCount":len(key),
                    "engineeringPayloadUnchanged":True})
    for section,rows in original.items():
        if section in POINTER_FIELDS or section=="ELEMENTS":
            continue
        require(rows==revised.get(section),"HOLD_FIELD_REINDEX",
                f"Non-auxiliary CII section {section} changed")
    return {"status":"PASS_SOURCE_LINKED_AUXILIARY_REINDEX",
            "pointerChanges":pointer_moves,
            "all15PointerFieldsValid":True,
            "originalCiiSha256":sha(original_cii),
            "revisedCiiSha256":sha(candidate_cii),
            "engineeringPayloadDifferences":0}
