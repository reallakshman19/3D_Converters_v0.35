"""Emit synthetic-only R1 replay and lineage evidence, after real converter tests.

From repository root:
    python3 -m unittest discover -s tests -p test_roundtrip_foundation.py -v
    python3 -m roundtrip_foundation.generate_evidence --out roundtrip-evidence

The native historical Owner GLRD 433/144 snapshot is NOT present.
"""
import argparse
import json
from pathlib import Path

from .snapshot_replay import (
    capture_snapshot, digest, run_existing_converter, replay_cii_without_edits,
)
from .lineage import build_lineage_ledger, validate_lineage_ledger

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "roundtrip_foundation/fixtures/multi-stage-synthetic.xml"
CONFIG = b"{}"  # Explicit synthetic configuration only.
OPTIONS = {
    "coordsMode": "first", "weightScale": "10",
    "splitCondensedValveFlange": True,
    "useRestraintTypeBasedOnJson": True,
    "stagedJsonPresent": False, "templateCiiPresent": False,
}
ATTEST = "COMPLETE_NO_EXTERNAL_MASTERS"

def write_json(dest: Path, value: dict):
    dest.write_text(json.dumps(value, sort_keys=True, indent=2,
                               ensure_ascii=False) + "\n", encoding="utf-8")

def generate(out: Path, unittest_log=""):
    out.mkdir(parents=True, exist_ok=True)
    engine_xml = FIXTURE.read_bytes()
    first = capture_snapshot(
        engine_input_xml=engine_xml, original_cii=b"INITIAL_GENERATION_ONLY",
        effective_config_json=CONFIG, options=OPTIONS, assets={},
        run_id="SYNTHETIC_MULTIBRANCH_REAL_CONVERTER",
        original_uploaded_xml=engine_xml, completeness_attestation=ATTEST)
    original_cii, generation_log = run_existing_converter(first, engine_xml, CONFIG, {})
    snapshot = capture_snapshot(
        engine_input_xml=engine_xml, original_cii=original_cii,
        effective_config_json=CONFIG, options=OPTIONS, assets={},
        run_id="SYNTHETIC_MULTIBRANCH_REAL_CONVERTER",
        original_uploaded_xml=engine_xml, completeness_attestation=ATTEST)
    replay = replay_cii_without_edits(
        conversion_snapshot=snapshot, engine_input_xml=engine_xml,
        original_cii=original_cii, effective_config_json=CONFIG,
        configuration_assets={})
    if replay["verdict"] != "PASS_EXACT_REPLAY":
        raise RuntimeError("Real converter exact replay failed: " + str(replay))
    ledger = build_lineage_ledger(
        conversion_snapshot=snapshot, engine_input_xml=engine_xml,
        original_cii=original_cii, effective_config_json=CONFIG,
        configuration_assets={}, replay_report=replay)
    validation = validate_lineage_ledger(ledger, expected_snapshot=snapshot)
    if validation["status"] != "PASS":
        raise RuntimeError("Read-only lineage validation failed")
    coverage = ledger["statistics"]
    write_json(out / "snapshot-manifest.json", snapshot)
    write_json(out / "no-edit-replay-report.json", {
        **replay, "evidenceClass": "GENERATED_SYNTHETIC_BASELINE_REAL_PYTHON",
        "baselineIndependence": "NOT_HISTORICAL_INDEPENDENT",
        "sourceXmlSha256": digest(engine_xml),
        "sourceXmlBytes": len(engine_xml),
        "converterRun": generation_log,
        "originalCiiSha256": digest(original_cii),
    })
    write_json(out / "source-cii-lineage.json", ledger)
    write_json(out / "lineage-coverage-report.json", {
        "schema": "xml-cii-lineage-coverage/v1",
        "dataClass": "SYNTHETIC_MULTIBRANCH",
        "counts": coverage, "verification": validation,
        "physicalMassApproval": "NOT_ATTESTED",
        "authenticOwnerGlrd433_144": {
            "datasetAvailable": False, "status": "NOT_RUN",
            "missingInputs": [
                "Hydrated Owner final conversion configuration",
                "Run-pinned actual EnrichedXML and full staged JSON",
                "Imported effective master dependencies and overrides",
                "Exact historically emitted 433 ELEMENT / 144 RIGID CII",
                "Converter/Pyodide engine version custody at that run",
            ],
        },
    })
    stages = [
        {"order": 1, "stage": "UPLOADED_XML", "source": "workflow job sourceText",
         "custody": "Optional original uploaded bytes; not itself the Python engine input"},
        {"order": 2, "stage": "JS_PREVIEW_ENRICHMENT",
         "source": "xml-cii-standalone-run-parity.js::enrichStandaloneXmlForRun",
         "custody": "May include master/override, process, split, DTXR and cleanup"},
        {"order": 3, "stage": "ENGINE_INPUT_XML",
         "source": "xml-cii-workflow-service.js::finalRigidReviewEvidence.engineInputText",
         "custody": "Exact replay boundary: SHA-256 " + snapshot["inputs"]["engineInputXmlSha256"]},
        {"order": 4, "stage": "ENGINE_INVOCATION",
         "source": "converters/xml-cii-2019-standalone/invocation-builder.js",
         "entrypoint": "xml_to_cii2019_runtime_custody.py",
         "arguments": snapshot["configuration"]["effectiveInvocation"]},
        {"order": 5, "stage": "PYTHON_PREPROCESS",
         "source": "xml_to_cii2019_runtime_custody.py::main",
         "operations": ["staged JSON enrichment", "process data", "bend radius policy",
                        "negative-node renumber", "effective restraint policy"]},
        {"order": 6, "stage": "NODE_CLEANUP",
         "source": "xml_to_cii2019.py::_parse_xml_document / _drop_short_element_nodes",
         "operations": ["positive source-node retention", "<=6mm arriving node deletion"]},
        {"order": 7, "stage": "EDGE_AND_WRITER",
         "source": "xml_to_cii2019.py::_build_edges / _build_cii_text",
         "operations": ["branch edge creation", "ELEMENTS", "auxiliary pointers",
                        "RIGID weight from qualified FROM/TO rule", "CII text serialize"]},
        {"order": 8, "stage": "READ_ONLY_LINEAGE",
         "source": "roundtrip_foundation/lineage.py",
         "operations": ["original/source inventory", "observational post-Python stage",
                        "real parser retained adjacency", "independent CII reparse",
                        "multi-level mapping with UNMATCHED/AMBIGUOUS classifications"]},
    ]
    write_json(out / "conversion-stage-map.json", {
        "schema": "xml-cii-conversion-stage-map/v1",
        "dataClass": "SYNTHETIC", "pipeline": stages,
        "note": "The Python transformed XML is NOT assumed byte-identical to engine input XML.",
        "productionSourceUnchanged": True,
    })
    audit = """# Architecture audit — XML-CII2019-ROUNDTRIP-FOUNDATION-R1

Baseline: main@3394c022f9400f05a736948033d26eb46274446c

## Source and converter stages
- Browser XML runs merge Preview, manual facts, weight overrides and support maps in
  \`tabs/xml-cii-2019-standalone/xml-cii-workflow-service.js\`.
- \`enrichStandaloneXmlForRun\` in \`xml-cii-standalone-run-parity.js\`
  produces the final JavaScript XML. The successful run may retain the exact
  \`finalRigidReviewEvidence.engineInputText\` and effective support JSON.
- \`runXmlCii2019StandaloneEngineJob\` invokes
  \`converters/xml-cii-2019-standalone/engine.js\`; its
  \`buildStandaloneCiiInvocation\` chooses Python runtime-custody and resolves
  coords mode, weight scale, split setting and restraint choice.
- The active entrypoint \`xml_to_cii2019_runtime_custody.py\` still executes
  staged-json enrichment, process mapping, bend policy and source parsing.
  Python may renumber negative FLAN/RIGID nodes or omit short arriving nodes.
- \`_parse_xml_document\` calls \`_drop_short_element_nodes\` for <=6mm segments;
  \`_build_edges\` and \`_build_elements_payload\` construct final ELEMENTS;
  \`_build_rigid_indices\` and \`_build_rigid_payload\` construct RIGIDs.
- ELEMENT physical line 13, numeric slot 2 references a 1-based auxiliary
  RIGID index, never a source ComponentRefNo or original NodeNumber.

## External neutral-file documentation
The Hexagon CAESAR II Neutral File guide describes sectional #$ records,
and its CONTROL and Auxiliary Element Data guides distinguish counts and
RIGID weight/type records. The on-disk record layout is resolved using the
specific repository 2019 writer plus \`cii2019_section_rules.py\`, not by
assuming that all CAESAR II versions are byte-identical.
- https://docs.hexagonppm.com/r/en-US/CAESAR-II-Users-Guide/Version-13/337037
- https://docs.hexagonppm.com/r/en-US/CAESAR-II-Users-Guide/15/337039
- https://docs.hexagonppm.com/r/en-US/CAESAR-II-Users-Guide/Version-13/1281863

## Replay input requirements / evidence classes
The snapshot contains exact engine-input XML hash, exact original CII hash,
exact effective support JSON hash, explicitly selected engine options,
staged/template asset hashes if declared, all supported converter module
hashes, and Python version. Unknown effective options or unmapped external
master file references are refused; no missing config silently becomes {}.

This public example explicitly uses synthetic support JSON {} and an
attestation of no external master files. It does NOT establish what the
Owner's GLRD 433/144 conversion used. A baseline generated by today's real
converter and replayed is deterministic replay evidence, not independent
historical reproduction.

## Lineage authority
- Source nodes are keyed by SHA+branch ordinal+node ordinal.
- The probe reruns active Python preprocessing with identical frozen inputs
  without altering the converter or its writer.
- Negative-node identity is marked TRANSFORMED_WITH_LINEAGE only when ordinal,
  branch, component reference/type and original position remain stable.
- <=6mm drops are recorded only when reconstructed retained adjacency equals
  the real \`_parse_xml_document\` output; otherwise the relationship is
  unresolved.
- Final ELEMENTS are matched by branch, FROM/TO, and matching actual
  emitted geometry, with verified pre/post source IDs; geometry alone never
  establishes physical ownership.
- Every final ELEMENT and RIGID is classified; ambiguous shared
  ComponentRefNo and auxiliary pointers remain nonauthoritative.
- \`physicalMassAuthority=NOT_ATTESTED\` even when unique structural lineage
  is found: physical mass approval and allocation are future tasks.

## Scope and limits
This R1 is entirely read-only. No source edits, direct CII edits, UI changes,
mass-selection changes, merges or deployments. It does not trace earlier JS
enrichment back to uploaded XML, nor claim reversible Bore/Rating/DTXR.
Real Owner GLRD 433/144 was NOT_RUN: complete run-pinned configuration and
historic original CII were not provided. Refer to coverage for exact missing
inputs. Full authentic lossless bidirectional engineering qualification
remains HOLD.
"""
    (out / "architecture-audit.md").write_text(audit, encoding="utf-8")
    log = Path(unittest_log).read_text(encoding="utf-8") if unittest_log else "Tests executed separately; see CI run."
    (out / "test-results.md").write_text(
        "# Executed R1 foundation tests\n\n"
        "Evidence class: real native Python existing converter, synthetic multi-branch input; "
        "the repository-native GLRD fixture is a separate smoke test.\n\n"
        "No-edit replay: **" + replay["verdict"] + "**. "
        "Original SHA-256 " + replay["comparison"]["originalSha256"] +
        ", replay SHA-256 " + replay["comparison"]["replaySha256"] +
        ", byte lengths " + str(replay["comparison"]["originalBytes"]) +
        "/" + str(replay["comparison"]["replayBytes"]) +
        ", differing bytes " + str(replay["comparison"]["differingBytes"]) + ".\n\n"
        "Lineage: " + json.dumps(coverage, sort_keys=True) + "\n\n"
        "Tests executed (CI output):\n\n\`\`\`text\n" + log[-18000:] + "\n\`\`\`\n\n"
        "**NOT_RUN:** Authentic Owner 433/144 GLRD, historical independent CII, browser/Pyodide parity, "
        "large-model performance, pre-JS original-to-engine-input lineage, direct mass approval.\n",
        encoding="utf-8")
    print(json.dumps({
        "verdict": replay["verdict"], "comparison": replay["comparison"],
        "counts": coverage, "sourceDigest": digest(engine_xml),
        "generatedEvidenceFiles": sorted(x.name for x in out.iterdir())},
        sort_keys=True))

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=Path("roundtrip-evidence"))
    parser.add_argument("--unittest-log", default="")
    args = parser.parse_args()
    generate(args.out, args.unittest_log)
