"""Read-only, exact-input custody and native runtime-custody no-edit replay.

This boundary receives the EXACT XML passed to the Python engine, after any
browser-side JS enrichment. It does not rerun JS Preview or claim that the
Python post-processed XML is identical to this input.

No CII writer, XML editor or engineering policy is implemented here.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import pathlib
import platform
import subprocess
import sys
import tempfile
from typing import Any

REPO = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = REPO / "converters" / "scripts"
sys.path.insert(0, str(SCRIPTS))
from cii2019_reparse_proof import parse_cii2019
from cii2019_section_rules import assert_cii2019_sections_valid, parse_section_map, parse_control_counts

SOURCE_FILES = (
    "xml_to_cii2019_runtime_custody.py",
    "xml_to_cii2019_direction.py",
    "xml_to_cii2019_patched.py",
    "xml_to_cii2019.py",
    "xml_to_cii2019_bend_radius_policy.py",
    "xml_to_cii2019_master_addon.py",
    "cii2019_section_rules.py",
    "cii2019_reparse_proof.py",
)
ENTRYPOINT = "xml_to_cii2019_runtime_custody.py"
SCHEMA = "xml-cii-roundtrip-snapshot/v1"

class Hold(Exception):
    def __init__(self, code: str, detail: str):
        super().__init__(detail)
        self.code = code

def require(condition: bool, code: str, message: str):
    if not condition:
        raise Hold(code, message)

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def canonical_json(data: Any) -> bytes:
    return json.dumps(data, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":")).encode("utf-8")

def converter_code_identity() -> dict[str, str]:
    return {filename: digest((SCRIPTS / filename).read_bytes())
            for filename in SOURCE_FILES}

def validate_options(options: dict):
    require(type(options) is dict, "HOLD_MISSING_INPUT", "Effective options are missing")
    keys = {"coordsMode", "weightScale", "splitCondensedValveFlange",
            "useRestraintTypeBasedOnJson", "stagedJsonPresent", "templateCiiPresent"}
    require(set(options) == keys, "HOLD_MISSING_INPUT",
            "All effective invocation options must be explicitly supplied; no inferred defaults")
    require(options["coordsMode"] in ("first", "all", "none") and
            str(options["weightScale"]) in ("1", "10") and
            type(options["splitCondensedValveFlange"]) is bool and
            type(options["useRestraintTypeBasedOnJson"]) is bool and
            type(options["stagedJsonPresent"]) is bool and
            type(options["templateCiiPresent"]) is bool,
            "HOLD_CONFIGURATION_MISMATCH", "Unqualified effective converter options")

def build_argv(options: dict) -> list[str]:
    validate_options(options)
    args = ["--coords-mode", options["coordsMode"],
            "--weight-scale", str(options["weightScale"])]
    args.append("--split-condensed-valve-flange" if options["splitCondensedValveFlange"]
                else "--no-split-condensed-valve-flange")
    args.append("--use-restraint-type-based-on-json" if options["useRestraintTypeBasedOnJson"]
                else "--no-use-restraint-type-based-on-json")
    if options["stagedJsonPresent"]:
        args.extend(["--staged-json", "<STAGED_JSON>"])
    if options["templateCiiPresent"]:
        args.extend(["--template-cii", "<TEMPLATE_CII>"])
    args.extend(["--support-config-json", "<EXACT_CONFIG>"])
    return args

def capture_snapshot(*, engine_input_xml: bytes, original_cii: bytes,
                     effective_config_json: bytes, options: dict,
                     assets: dict[str, bytes], run_id: str,
                     original_uploaded_xml: bytes | None = None,
                     completeness_attestation: str):
    """Capture a manifest; caller stores immutable input bytes separately.

    Attestation is NOT inferred. For unknown provenance or external dependencies
    use 'UNRESOLVED' and replay will refuse. A synthetic test may explicitly use
    'COMPLETE_NO_EXTERNAL_MASTERS' with an empty asset map.
    """
    require(type(engine_input_xml) is bytes and bool(engine_input_xml) and
            type(original_cii) is bytes and bool(original_cii) and
            type(effective_config_json) is bytes and bool(effective_config_json) and
            type(run_id) is str and bool(run_id.strip()),
            "HOLD_MISSING_INPUT", "XML/CII, exact effective config and run ID are mandatory")
    validate_options(options)
    require(type(assets) is dict and all(type(k) is str and
            type(v) is bytes for k, v in assets.items()),
            "HOLD_MISSING_INPUT", "Asset names/bytes must be supplied explicitly")
    try:
        cfg = json.loads(effective_config_json)
        require(type(cfg) is dict, "HOLD_CONFIGURATION_MISMATCH",
                "Effective config must be an object")
    except (ValueError, UnicodeDecodeError) as exc:
        raise Hold("HOLD_CONFIGURATION_MISMATCH", str(exc)) from exc
    required = set()
    if options["stagedJsonPresent"]:
        required.add("staged.json")
    if options["templateCiiPresent"]:
        required.add("template.cii")
    require(required.issubset(assets), "HOLD_MISSING_INPUT",
            "Declared staged JSON/template file bytes are missing")
    # External files cannot be accidentally treated as inputs to the converter:
    # this bounded boundary only supports the two CLI asset paths above.
    require(set(assets) == required, "HOLD_MISSING_INPUT",
            "Unmapped external master files require a qualified new invocation adapter")
    manifest = {
        "schema": SCHEMA, "runId": run_id, "sourceKind": "xml",
        "sourceStage": "ENGINE_INPUT_XML",
        "inputs": {
            "uploadedXmlSha256": digest(original_uploaded_xml) if original_uploaded_xml is not None else None,
            "uploadedXmlStatus": "CAPTURED" if original_uploaded_xml is not None else "NOT_AVAILABLE",
            "engineInputXmlSha256": digest(engine_input_xml),
            "originalCiiSha256": digest(original_cii),
            "engineInputXmlBytes": len(engine_input_xml),
            "originalCiiBytes": len(original_cii),
        },
        "configuration": {
            "effectiveConfigSha256": digest(effective_config_json),
            "stagedJsonSha256": digest(assets["staged.json"]) if "staged.json" in assets else None,
            "masterManifestSha256": digest(canonical_json({
                n: digest(data) for n, data in sorted(assets.items())})),
            "assetsSha256": {n: digest(data) for n, data in sorted(assets.items())},
            "options": dict(options),
            "weightScale": str(options["weightScale"]),
            "effectiveInvocation": build_argv(options),
        },
        "converter": {
            "entrypoint": ENTRYPOINT,
            "codeIdentity": converter_code_identity(),
            "runtimeIdentity": {
                "implementation": platform.python_implementation(),
                "pythonVersion": platform.python_version(),
            },
        },
        "completeness": {
            "status": completeness_attestation,
            "missingInputs": [] if completeness_attestation == "COMPLETE_NO_EXTERNAL_MASTERS"
            else ["Effective external dependencies and pre-Python custody have not been attested"],
        },
    }
    manifest["fingerprintSha256"] = digest(canonical_json(manifest))
    return manifest

def validate_custody(snapshot: dict, engine_input_xml: bytes, original_cii: bytes,
                     effective_config_json: bytes, assets: dict[str, bytes]):
    require(type(snapshot) is dict and snapshot.get("schema") == SCHEMA,
            "HOLD_MISSING_INPUT", "No complete snapshot manifest")
    current = dict(snapshot)
    fingerprint = current.pop("fingerprintSha256", None)
    require(type(fingerprint) is str and digest(canonical_json(current)) == fingerprint,
            "HOLD_CONFIGURATION_MISMATCH", "Snapshot manifest changed")
    require(snapshot.get("sourceStage") == "ENGINE_INPUT_XML" and snapshot.get("sourceKind") == "xml",
            "HOLD_MISSING_INPUT", "Wrong source boundary")
    require(snapshot.get("completeness", {}).get("status") == "COMPLETE_NO_EXTERNAL_MASTERS",
            "HOLD_MISSING_INPUT", "Full effective dependency custody is unresolved")
    inputs = snapshot["inputs"]
    require(type(engine_input_xml) is bytes and digest(engine_input_xml) == inputs["engineInputXmlSha256"] and
            len(engine_input_xml) == inputs["engineInputXmlBytes"],
            "HOLD_STALE_SOURCE", "Engine input XML digest/length changed")
    require(type(original_cii) is bytes and digest(original_cii) == inputs["originalCiiSha256"] and
            len(original_cii) == inputs["originalCiiBytes"],
            "HOLD_STALE_CII", "Original CII digest/length changed")
    config = snapshot["configuration"]
    require(type(effective_config_json) is bytes and digest(effective_config_json) ==
            config["effectiveConfigSha256"], "HOLD_CONFIGURATION_MISMATCH",
            "Effective configuration has changed")
    require(type(assets) is dict and {k: digest(v) for k, v in assets.items()} ==
            config["assetsSha256"], "HOLD_MISSING_INPUT", "Required assets missing or modified")
    require(digest(canonical_json(config["assetsSha256"])) == config["masterManifestSha256"],
            "HOLD_CONFIGURATION_MISMATCH", "Master/asset manifest changed")
    require(build_argv(config["options"]) == config["effectiveInvocation"] and
            config["weightScale"] == str(config["options"]["weightScale"]),
            "HOLD_CONFIGURATION_MISMATCH", "Effective invocation and weight scale changed")
    require(snapshot["converter"]["entrypoint"] == ENTRYPOINT and
            snapshot["converter"]["codeIdentity"] == converter_code_identity() and
            snapshot["converter"]["runtimeIdentity"] == {
                "implementation": platform.python_implementation(),
                "pythonVersion": platform.python_version()},
            "HOLD_CONVERTER_IDENTITY", "Converter source or Python runtime differs")

def run_existing_converter(snapshot: dict, engine_input_xml: bytes, config: bytes,
                           assets: dict[str, bytes]) -> tuple[bytes, dict]:
    with tempfile.TemporaryDirectory(prefix="xml-cii-noedit-") as d:
        root = pathlib.Path(d)
        source = root / "engine-input.xml"
        output = root / "regenerated.cii"
        source.write_bytes(engine_input_xml)
        argv = [sys.executable, str(SCRIPTS / ENTRYPOINT), "--input", str(source),
                "--output", str(output)]
        paths = {"<STAGED_JSON>": root / "staged.json",
                 "<TEMPLATE_CII>": root / "template.cii"}
        for key, path in paths.items():
            key_name = "staged.json" if key == "<STAGED_JSON>" else "template.cii"
            if key_name in assets:
                path.write_bytes(assets[key_name])
        for item in snapshot["configuration"]["effectiveInvocation"]:
            if item == "<EXACT_CONFIG>":
                argv.append(config.decode("utf-8"))
            elif item in paths:
                argv.append(str(paths[item]))
            else:
                argv.append(item)
        result = subprocess.run(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True, check=False)
        require(result.returncode == 0 and output.is_file(),
                "HOLD_CONVERTER_ERROR", f"Native existing converter failed: {result.stderr[-1000:]}")
        return output.read_bytes(), {
            "entrypoint": ENTRYPOINT,
            "actualArguments": [x.replace(str(source), "<INPUT_XML>").replace(str(output), "<OUTPUT_CII>")
                                .replace(str(root), "<TEMP_ASSET_DIR>") for x in argv[2:]],
            "stdout": result.stdout[-1500:], "stderr": result.stderr[-1500:],
        }

def validate_serialized_cii(contents: bytes) -> dict:
    try:
        cii = contents.decode("utf-8")
        assert_cii2019_sections_valid(cii)
        reparsed = parse_cii2019(cii)
        sections = parse_section_map(cii)
        names = ("BEND", "RIGID", "RESTRANT", "SIF&TEES", "REDUCERS", "NODENAME")
        counts = {r["name"]: r["recordCount"] for r in reparsed["sections"]}
        for elem in reparsed["elements"]:
            for section in names:
                ptr = elem["pointers"].get(section, 0)
                require(0 <= ptr <= counts.get(section, 0),
                        "HOLD_CII_INVALID", f"Element {elem['index']} invalid {section} pointer {ptr}")
        control = parse_control_counts(sections["CONTROL"])
        require(control.numelt == len(reparsed["elements"]) and
                control.numrig == counts.get("RIGID", 0), "HOLD_CII_INVALID",
                "CONTROL element/RIGID counts disagree with actual payload")
        return {"status": "PASS", "elementCount": len(reparsed["elements"]),
                "rigidCount": counts.get("RIGID", 0), "auxiliaryCounts": counts,
                "allPointersValid": True, "independentReparse": "PASS"}
    except Hold:
        raise
    except Exception as exc:
        raise Hold("HOLD_CII_INVALID", "CII reparse/structure failed: " + str(exc)) from exc

def compare_bytes(a: bytes, b: bytes) -> dict:
    # Counts one difference per differing overlapping byte, plus trailing length.
    changed = sum(x != y for x, y in zip(a, b)) + abs(len(a) - len(b))
    first = next((i for i, (x, y) in enumerate(zip(a, b)) if x != y), None)
    if first is None and len(a) != len(b):
        first = min(len(a), len(b))
    return {"originalSha256": digest(a), "replaySha256": digest(b),
            "originalBytes": len(a), "replayBytes": len(b),
            "differingBytes": changed, "firstDifference": first}

def replay_cii_without_edits(*, conversion_snapshot, engine_input_xml,
                             original_cii, effective_config_json, configuration_assets):
    """Always returns a status receipt; exposes bytes only after exact parity."""
    try:
        validate_custody(conversion_snapshot, engine_input_xml, original_cii,
                         effective_config_json, configuration_assets)
        validation_original = validate_serialized_cii(original_cii)
        regenerated, execution = run_existing_converter(
            conversion_snapshot, engine_input_xml, effective_config_json, configuration_assets)
        validation_replay = validate_serialized_cii(regenerated)
        diff = compare_bytes(original_cii, regenerated)
        require(diff["differingBytes"] == 0 and
                diff["originalSha256"] == diff["replaySha256"],
                "HOLD_NO_EDIT_PARITY", f"Actual converter replay differs: {diff}")
        return {"verdict": "PASS_EXACT_REPLAY", "snapshotFingerprint":
                conversion_snapshot["fingerprintSha256"],
                "comparison": diff, "structure": validation_replay,
                "originalStructure": validation_original, "converter": execution}
    except Hold as exc:
        return {"verdict": exc.code, "reason": str(exc), "publishable": False}
    except Exception as exc:
        return {"verdict": "HOLD_INTERNAL_ERROR", "reason": str(exc), "publishable": False}
