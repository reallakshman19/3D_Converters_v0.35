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
