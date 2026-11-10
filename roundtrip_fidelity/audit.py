"""R3 programmatic read-only fidelity entry point atop actual R1 frozen replay."""
from __future__ import annotations
from collections import Counter
import json
from pathlib import Path

from roundtrip_foundation.snapshot_replay import (
    Hold, capture_snapshot, digest, replay_cii_without_edits,
    run_existing_converter, validate_custody,
)
from roundtrip_foundation.lineage import (
    build_lineage_ledger, validate_lineage_ledger, observe_python_transformations,
)
from .field_inventory import inventory_source_fields, match_original_to_effective
from .field_lineage import inventory_cii_fields, build_field_relations
from .field_value_verifier import verify_field_values
from .reversibility_classifier import build_reversibility
from .report_builder import write_artifacts


CURRENT_WRITER_OPTIONS = {
    "coordsMode":"first", "weightScale":"10",
    "splitCondensedValveFlange":True,
    "useRestraintTypeBasedOnJson":True,
    "stagedJsonPresent":False, "templateCiiPresent":False,
}
HISTORICAL_MISSING = (
    "Frozen original Owner 433-ELEMENT/144-RIGID CII",
    "Exact historical engine-input EnrichedXML",
    "Fully hydrated effective configuration/master and override custody",
    "Historical converter runtime and dependency identity",
)


def audit_frozen_run(*, conversion_snapshot, engine_input_xml:bytes,
                     original_cii:bytes, effective_config_json:bytes,
                     configuration_assets:dict, original_input_xml:bytes|None=None,
                     r1_lineage_ledger:dict|None=None,
                     evidence_class="QUALIFIED_FROZEN_RUN",
                     authenticated_owner_archive=False,
                     artifact_dir=None,
                     test_receipt=None):
    """No edits. Original CII must be retained independently by caller.

    A generated CII can be used only with a clearly marked current-writer
    synthetic/repo-native test class, never to replace a historical archive.
    """
    if evidence_class in ("SYNTHETIC_CURRENT_WRITER","REPOSITORY_NATIVE_CURRENT_WRITER"):
        authenticated_owner_archive=False
    validate_custody(conversion_snapshot,engine_input_xml,original_cii,
                     effective_config_json,configuration_assets)
    if original_input_xml is not None:
        expected=conversion_snapshot["inputs"].get("uploadedXmlSha256")
        if not expected or digest(original_input_xml)!=expected:
            raise Hold("HOLD_ORIGINAL_SOURCE_MISMATCH",
                       "Original input XML is not separately frozen in R1 manifest")
    replay=replay_cii_without_edits(
        conversion_snapshot=conversion_snapshot, engine_input_xml=engine_input_xml,
        original_cii=original_cii, effective_config_json=effective_config_json,
        configuration_assets=configuration_assets)
    if replay.get("verdict")!="PASS_EXACT_REPLAY":
        raise Hold(replay.get("verdict","HOLD_NO_EDIT_PARITY"),
                   "R3 refuses field-lineage release without byte-exact frozen CII replay")
    original=inventory_source_fields(original_input_xml,"ORIGINAL_INPUT_XML") if (
        original_input_xml is not None) else None
    effective=inventory_source_fields(engine_input_xml,"ENGINE_INPUT_XML")
    stage_match=match_original_to_effective(original,effective)
    r1=(r1_lineage_ledger if r1_lineage_ledger is not None else build_lineage_ledger(
        conversion_snapshot=conversion_snapshot,
        engine_input_xml=engine_input_xml,original_cii=original_cii,
        effective_config_json=effective_config_json,
        configuration_assets=configuration_assets,replay_report=replay))
    integrity=validate_lineage_ledger(r1,expected_snapshot=conversion_snapshot)
    if integrity.get("status")!="PASS":
        raise Hold("HOLD_R1_LINEAGE_INVALID", "R1 independent structural ledger rejected")
    post_bytes, _, _=observe_python_transformations(
        engine_input_xml,effective_config_json,configuration_assets,
        conversion_snapshot["configuration"]["options"])
    if digest(post_bytes)!=r1["runIdentity"]["pythonPreprocessedXmlSha256"]:
        raise Hold("HOLD_TRANSFORMATION_STAGE_MISMATCH",
                   "R3 observed Python preprocessor bytes differ from R1")
    post=inventory_source_fields(post_bytes,"PYTHON_PREPROCESSED")
    cii_fields=inventory_cii_fields(original_cii)
    try:
        configuration=json.loads(effective_config_json)
    except (UnicodeError,ValueError) as exc:
        raise Hold("HOLD_CONFIGURATION_MISMATCH",str(exc)) from exc
    configuration={**configuration,
                   "weightScale":conversion_snapshot["configuration"]["weightScale"]}
    records=build_field_relations(
        effective_inventory=effective,processed_inventory=post,
        r1_ledger=r1,cii_inventory=cii_fields,configuration=configuration)
    verification=verify_field_values(records,original_cii)
    reversibility=build_reversibility(
        field_inventory=records,original_inventory=original,
        effective_inventory=effective,source_stage_match=stage_match,
        r1_ledger=r1,value_verification=verification,
        evidence_class=evidence_class)
    # Every source field is counted once in source inventory; relationship
    # multiplicity is counted in the output ledger, never deduplicated by name.
    counts=reversibility["counts"]
    if counts["outputFieldRelationships"]!=len(records["fields"]):
        raise Hold("HOLD_R3_COVERAGE","Not all physical CII field identities classified")
    status=("PARTIAL_HOLD_FIELD_VALUE_DISCREPANCIES" if
            verification["discrepancyCount"] else
            "READ_ONLY_FIELD_FIDELITY_AUDITED_WITH_UNRESOLVED")
    historical_status=("CLAIMED_ARCHIVED_BUNDLE_EXACT_REPLAY_REQUIRES_OWNER_ATTESTATION"
                       if authenticated_owner_archive else "NOT_RUN")
    evidence={
        "sourceClass":evidence_class,
        "originalInputSha256":digest(original_input_xml) if original_input_xml else None,
        "engineInputSha256":digest(engine_input_xml),
        "pythonPreprocessedXmlSha256":digest(post_bytes),
        "originalCiiSha256":digest(original_cii),
        "effectiveConfigSha256":digest(effective_config_json),
        "r1SnapshotFingerprint":conversion_snapshot["fingerprintSha256"],
        "noEditReplayStatus":"PASS_EXACT_REPLAY",
        "originalCiiBytes":len(original_cii),
        "replayedCiiBytes":replay["comparison"]["replayBytes"],
        "differingBytes":replay["comparison"]["differingBytes"],
        "authenticReplay":historical_status,
        "historicalOwner433_144":"NOT_RUN" if not authenticated_owner_archive else
                                 "ARCHIVE_BUNDLE_PRESENT_OWNER_VALIDATION_REQUIRED",
        "missingDependencies":list(HISTORICAL_MISSING) if not authenticated_owner_archive else [],
        "originalToEffectiveStage":stage_match["status"],
        "configurationAssetsSha256":conversion_snapshot["configuration"]["assetsSha256"],
    }
    fidelity_ledger={
        "schema":"xml-cii-field-lineage-ledger/r3",
        "readOnly":True,"engineeringEditApproved":False,
        "status":status,"evidenceClass":evidence_class,
        "sourceStages":{
            "originalInput":original,
            "effectiveEnriched":effective,
            "pythonPreprocessed":post},
        "sourceStageRelationships":stage_match,
        "r1SnapshotFingerprint":conversion_snapshot["fingerprintSha256"],
        "r1NodeElementAuxiliaryCoverage":r1["statistics"],
        "r1Transformations":r1["transformations"],
        "r1NodeIdentityLinks":r1["index"]["pythonNodeToOriginalSourceNode"],
        "r1ElementSourceIdentity":[{
            "elementIndex":e["elementIndex"],
            "sourceEdgeIdentity":e.get("sourceEdgeIdentity"),
            "lineageStatus":e["lineageStatus"],
            "branchName":e["branchName"],"fromNode":e["fromNode"],"toNode":e["toNode"]}
            for e in r1["elements"]],
        "r1AuxiliaryOwnership":[{
            "section":a["section"],"recordPointer":a["recordPointer"],
            "linkedElements":a["linkedElements"],
            "writerWeightSourceNode":a.get("writerWeightSourceNode"),
            "ownerCandidates":a["ownerCandidates"],
            "ownershipStatus":a["ownershipStatus"],
            "physicalMassAuthority":a["physicalMassAuthority"]}
            for a in r1["auxiliaryRecords"]],
        "ciiFieldInventory":{
            "ciiSha256":records["ciiSha256"],
            "fields":records["fields"],
            "outputFieldsCount":records["outputFieldsCount"],
            "ciiElementsCount":records["ciiElementsCount"],
            "ciiAuxiliaryCounts":records["ciiAuxiliaryCounts"]},
        "fieldRelationships":reversibility["relationships"],
        "evidence":evidence,
    }
    coverage={
        "schema":"xml-cii-field-coverage-summary/r3",
        "status":status,"evidenceClass":evidence_class,
        "evidence":evidence,
        "counts":counts,
        "valueVerification":{k:v for k,v in verification.items()
                             if k not in ("perFieldVerification","discrepancies")},
        "ciiPointerValidation":{
            "allPointersValid":True,
            "pointerFieldsValidated":records["pointerFieldsValidated"]},
        "r1StructuralValidation":integrity.get("status"),
        "sourceOnlyAnnotations":dict(Counter(
            r["sourceFieldPath"] for r in reversibility["relationships"]
            if r["relationshipDirection"]=="SOURCE_WITHOUT_VERIFIED_EMISSION"
            and r["sourceFieldPath"] in (
                "Node/ComponentRefNo","Node/Bore","Node/Rating","Node/DTXR",
                "Node/DTXR_POS","Node/DTXR_PS"))),
        "qualifiedEditablePropertiesAreNotApproved":True,
    }
    if artifact_dir is not None:
        write_artifacts(artifact_dir,fidelity_ledger=fidelity_ledger,
                        classifier=reversibility,verification=verification,
                        coverage=coverage,test_receipt=test_receipt)
    return {"status":status,"lineage":fidelity_ledger,
            "reversibility":reversibility,
            "verification":verification,"coverage":coverage,
            "noEditReplay":replay}


def create_current_writer_case(xml:bytes, *,
                               evidence_class:str,
                               original_input_xml:bytes|None=None):
    """Explicitly bootstrap a current-writer scenario, never an Owner archive."""
    if evidence_class not in ("SYNTHETIC_CURRENT_WRITER",
                              "REPOSITORY_NATIVE_CURRENT_WRITER"):
        raise Hold("HOLD_EVIDENCE_CLASS",
                   "Cannot bootstrap an independently archived historical original")
    config=b"{}"
    bootstrap=capture_snapshot(
        engine_input_xml=xml,original_cii=b"CURRENT_WRITER_GENERATION_NOT_ARCHIVED",
        effective_config_json=config, options=CURRENT_WRITER_OPTIONS,
        assets={},run_id=evidence_class,
        original_uploaded_xml=original_input_xml if original_input_xml is not None else xml,
        completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS")
    cii,_=run_existing_converter(bootstrap,xml,config,{})
    snapshot=capture_snapshot(
        engine_input_xml=xml,original_cii=cii,
        effective_config_json=config,options=CURRENT_WRITER_OPTIONS,
        assets={},run_id=evidence_class,
        original_uploaded_xml=original_input_xml if original_input_xml is not None else xml,
        completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS")
    return {
        "conversion_snapshot":snapshot,"engine_input_xml":xml,
        "original_cii":cii,"effective_config_json":config,
        "configuration_assets":{},
        "original_input_xml":original_input_xml if original_input_xml is not None else xml,
        "evidence_class":evidence_class,
    }
