"""Read-only command line entry point for current-writer and frozen Owner bundles."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys

from roundtrip_foundation.snapshot_replay import Hold, REPO
from roundtrip_foundation.owner_bundle_replay import inspect_bundle
from .audit import audit_frozen_run, create_current_writer_case
from .field_inventory import inventory_source_fields
from .report_builder import write_source_only


def main(argv=None):
    parser=argparse.ArgumentParser(description="R3 field-level fidelity / no source edits")
    modes=parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--synthetic",action="store_true",
                       help="Current writer synthetic fixture, NOT Owner history")
    modes.add_argument("--repo-native",action="store_true",
                       help="Repository GLRD input, explicitly current-writer only")
    modes.add_argument("--source-only-xml",type=Path,
                       help="Inventory received original source XML without inventing output")
    modes.add_argument("--owner-bundle",type=Path,
                       help="Qualified R1 archived run-custody.json bundle directory")
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--test-results-json",type=Path,
                        help="Optional observed test command/status receipt, not inferred")
    args=parser.parse_args(argv)
    try:
        if args.source_only_xml:
            xml=args.source_only_xml.read_bytes()
            source=inventory_source_fields(xml,"ORIGINAL_INPUT_XML")
            counts=write_source_only(args.output,source)
            print(json.dumps({"status":counts["status"],
                              "sourceFields":counts["sourceInventory"]["fields"],
                              "outputFields":None,"authenticReplay":"NOT_RUN"},
                             sort_keys=True))
            return 0
        test_receipt=(json.loads(args.test_results_json.read_text(encoding="utf-8"))
                      if args.test_results_json else None)
        if args.owner_bundle:
            custody=inspect_bundle(args.owner_bundle)
            p=custody["primary"]
            call={
                "conversion_snapshot":custody["snapshot"],
                "engine_input_xml":p["engineInputXml"],
                "original_cii":p["originalCii"],
                "effective_config_json":p["effectiveConfigJson"],
                "configuration_assets":custody["pythonAssets"],
                "original_input_xml":p["originalUploadedXml"],
                "evidence_class":"CLAIMED_ARCHIVED_OWNER_BUNDLE",
                "authenticated_owner_archive":True,
            }
        else:
            if args.synthetic:
                xml=(REPO/"roundtrip_foundation/fixtures/multi-stage-synthetic.xml").read_bytes()
                label="SYNTHETIC_CURRENT_WRITER"
            else:
                xml=(REPO/"Benchmarks/XML to CII 2019/GLRD-1000-PI-01.xml").read_bytes()
                label="REPOSITORY_NATIVE_CURRENT_WRITER"
            call=create_current_writer_case(xml,evidence_class=label)
        report=audit_frozen_run(**call,artifact_dir=args.output,
                                test_receipt=test_receipt)
        summary=report["coverage"]
        print(json.dumps({
            "status":summary["status"],"evidenceClass":summary["evidenceClass"],
            "authenticReplay":summary["evidence"]["authenticReplay"],
            "engineInputSha256":summary["evidence"]["engineInputSha256"],
            "originalCiiSha256":summary["evidence"]["originalCiiSha256"],
            "sourceFields":summary["counts"]["sourceFieldsInventoried"],
            "outputFields":summary["counts"]["outputFieldsInventoried"],
            "classifications":summary["counts"]["classifications"],
            "discrepancies":summary["valueVerification"]["discrepancyCount"],
        },sort_keys=True))
        return 2 if report["verification"]["discrepancyCount"] else 0
    except (Hold,OSError,KeyError,ValueError,TypeError) as exc:
        print(json.dumps({"status":"HOLD","reason":str(exc),
                          "authenticReplay":"NOT_RUN_OR_UNQUALIFIED"}),file=sys.stderr)
        return 2


if __name__=="__main__":
    raise SystemExit(main())
