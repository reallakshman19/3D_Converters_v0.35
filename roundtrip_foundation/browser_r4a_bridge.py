"""Browser/Pyodide R4A bridge to R1's existing qualified source lineage.

Receives exact frozen engine-input XML, original CII, no-edit replay CII,
effective configuration, and any staged JSON. Never writes engineering data.
The original and replay CII are independently compared byte-for-byte here;
the caller must additionally prove its actual browser converter ran no-edit.
"""
from __future__ import annotations
import json
from hashlib import sha256

from .snapshot_replay import (
    Hold, capture_snapshot, compare_bytes, digest, require,
    validate_serialized_cii,
)
from .lineage import build_lineage_ledger, validate_lineage_ledger
from .full_pointer_validation import validate_all_element_pointers


def browser_verified_lineage(*, original_xml: bytes, original_cii: bytes,
                             replay_cii: bytes, config_json: bytes,
                             staged_json: bytes | None, options: dict,
                             run_id: str, original_input_sha256: str | None=None):
    require(type(original_xml) is bytes and original_xml and
            type(original_cii) is bytes and original_cii and
            type(replay_cii) is bytes and replay_cii and
            type(config_json) is bytes and config_json,
            "HOLD_INPUT_CUSTODY","Missing exact original/converter input bytes")
    require(type(options) is dict and
            set(options) == {"coordsMode", "weightScale",
              "splitCondensedValveFlange", "useRestraintTypeBasedOnJson",
              "stagedJsonPresent", "templateCiiPresent"},
            "HOLD_CONFIGURATION_NOT_FROZEN",
            "Unsupported inferred/incomplete converter options")
    require(options["templateCiiPresent"] is False,
            "HOLD_TEMPLATE_ASSET_NOT_SUPPORTED","Template CII not provided to R4 browser bridge")
    assets = {"staged.json":staged_json} if staged_json is not None else {}
    require(options["stagedJsonPresent"] == (staged_json is not None),
            "HOLD_CONFIGURATION_NOT_FROZEN","Staged JSON mismatch")
    try:
        config=json.loads(config_json)
    except (UnicodeError,ValueError) as exc:
        raise Hold("HOLD_CONFIGURATION_NOT_FROZEN",str(exc)) from exc
    require(isinstance(config,dict), "HOLD_CONFIGURATION_NOT_FROZEN",
            "Configuration must be exact run-pinned JSON object")
    # When the converter obtains files outside these in-memory frozen inputs,
    # its full runtime provenance is unknown. Do not claim complete custody.
    known_external=("masterFilePath","masterPath","linelistFile",
                    "pipeClassFile","valveWeightFile","materialMapFile")
    require(not any(config.get(k) for k in known_external),
            "HOLD_EXTERNAL_MASTER_NOT_FROZEN",
            "Nonembedded external engineering masters cannot be inferred")
    comparison=compare_bytes(original_cii,replay_cii)
    require(comparison["differingBytes"]==0 and
            comparison["originalSha256"]==comparison["replaySha256"] and
            comparison["originalBytes"]==comparison["replayBytes"],
            "HOLD_NO_EDIT_PARITY",
            "Real no-edit browser converter CII differs from the original")
    original_structure=validate_serialized_cii(original_cii)
    snapshot=capture_snapshot(
        engine_input_xml=original_xml,
        original_cii=original_cii,
        effective_config_json=config_json,
        options=options,
        assets=assets,
        run_id=run_id,
        completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS",
    )
    receipt={
        "verdict":"PASS_EXACT_REPLAY",
        "snapshotFingerprint":snapshot["fingerprintSha256"],
        "comparison":comparison,
        "structure":original_structure,
        "originalStructure":original_structure,
        "converter":{"entrypoint":"xml_to_cii2019_runtime_custody.py",
                     "executionEvidence":"Browser Pyodide noedit replay from caller; independently compared exact bytes"},
    }
    ledger=build_lineage_ledger(
        conversion_snapshot=snapshot,
        engine_input_xml=original_xml,
        original_cii=original_cii,
        effective_config_json=config_json,
        configuration_assets=assets,
        replay_report=receipt,
    )
    checked=validate_lineage_ledger(ledger,expected_snapshot=snapshot)
    require(checked["status"]=="PASS",
            "HOLD_R1_LINEAGE_INVALID","R1 independent structural validation failed")
    return {
        "schema":"xml-cii-source-mass-browser-lineage/r4a",
        "status":"PASS_R1_STRUCTURAL_LINEAGE_WITH_UNATTESTED_MASS",
        "runIdentity":{
            "runId":run_id,
            "sourceXmlSha256":digest(original_xml),
            "originalCiiSha256":digest(original_cii),
            "configurationSha256":digest(config_json),
            "stagedJsonSha256":digest(staged_json) if staged_json else None,
            "originalUploadedXmlSha256":original_input_sha256,
            "snapshotFingerprint":snapshot["fingerprintSha256"],
            "converterCodeIdentity":snapshot["converter"]["codeIdentity"],
            "runtimeIdentity":snapshot["converter"]["runtimeIdentity"],
        },
        "noEditComparison":comparison,
        "sourceNodes":ledger["sourceNodes"],
        "pythonPreprocessedNodes":ledger["pythonPreprocessedNodes"],
        "elements":ledger["elements"],
        "auxiliaryRecords":[r for r in ledger["auxiliaryRecords"] if r["section"]=="RIGID"],
        "transformations":ledger["transformations"],
        "index":ledger["index"],
        "statistics":ledger["statistics"],
        "physicalMassAuthority":"NOT_ATTESTED",
        "engineeringEditApproved":False,
    }
