"""Executable R3 fidelity acceptance — actual R1 Python converter, no new writer."""
from __future__ import annotations
import copy
from pathlib import Path
import tempfile
import unittest

from roundtrip_foundation.snapshot_replay import (
    Hold, capture_snapshot, digest, replay_cii_without_edits,
)
from roundtrip_fidelity.audit import (
    audit_frozen_run, create_current_writer_case,
)
from roundtrip_fidelity.field_inventory import (
    inventory_source_fields, match_original_to_effective,
)
from roundtrip_fidelity.field_lineage import inventory_cii_fields
from roundtrip_fidelity.field_value_verifier import (
    verify_field_values, verify_source_linked_pointer_reindex,
)
from roundtrip_fidelity.reversibility_classifier import build_reversibility
from roundtrip_fidelity.report_builder import ARTIFACTS, write_source_only
from roundtrip_foundation.full_pointer_validation import validate_all_element_pointers


ROOT=Path(__file__).resolve().parents[1]
FIXTURE=(ROOT/"roundtrip_foundation/fixtures/multi-stage-synthetic.xml").read_bytes()


def _rewrite_cii(cii, transform):
    raw=cii.decode("utf-8")
    eol="\r\n" if "\r\n" in raw else "\n"
    lines=raw.splitlines()
    transform(lines)
    return (eol.join(lines)+eol).encode("utf-8")


class FieldFidelityR3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.call=create_current_writer_case(
            FIXTURE,evidence_class="SYNTHETIC_CURRENT_WRITER")
        cls.audit_result=audit_frozen_run(**cls.call)
        cls.rels=cls.audit_result["reversibility"]["relationships"]
        cls.records=cls.audit_result["lineage"]["ciiFieldInventory"]["fields"]

    def test_01_noedit_real_writer_and_original_stage_are_not_historical(self):
        run=self.audit_result
        self.assertEqual(run["noEditReplay"]["verdict"],"PASS_EXACT_REPLAY")
        self.assertEqual(run["noEditReplay"]["comparison"]["differingBytes"],0)
        self.assertEqual(run["coverage"]["evidence"]["authenticReplay"],"NOT_RUN")
        self.assertEqual(run["coverage"]["evidence"]["engineInputSha256"],digest(FIXTURE))
        self.assertEqual(run["coverage"]["evidence"]["originalInputSha256"],digest(FIXTURE))
        self.assertEqual(run["lineage"]["sourceStageRelationships"]["status"],"COMPARED")
        self.assertEqual(run["lineage"]["sourceStages"]["originalInput"]["stage"],"ORIGINAL_INPUT_XML")
        self.assertEqual(run["lineage"]["sourceStages"]["effectiveEnriched"]["stage"],"ENGINE_INPUT_XML")

    def test_02_exact_lexical_weight_token_and_separate_original_identity(self):
        inv=self.audit_result["lineage"]["sourceStages"]["effectiveEnriched"]
        hits=[f for f in inv["fields"] if f["sourceFieldPath"]=="Node/Weight"
              and f["originalSourceToken"].strip()=="6"]
        self.assertEqual(len(hits),1)
        field=hits[0]
        self.assertEqual(field["rawTokenEvidence"],"EXACT_XML_BYTES")
        self.assertTrue(field["lexicalMatchesParsed"])
        start=field["sourceFieldLocation"]["startByte"]
        end=field["sourceFieldLocation"]["endByte"]
        self.assertEqual(FIXTURE[start:end],b"6")
        rel=[x for x in self.audit_result["lineage"]["sourceStageRelationships"]["relationships"]
             if x["effectiveFieldId"]==field["fieldId"]]
        self.assertEqual(rel[0]["relationship"],"BYTE_IDENTICAL_SOURCE_STAGE")

    def test_03_full_output_field_and_source_relationship_count_reconciliation(self):
        counts=self.audit_result["reversibility"]["counts"]
        self.assertGreater(counts["outputFieldsInventoried"],11*36)
        self.assertEqual(counts["outputFieldRelationships"],counts["outputFieldsInventoried"])
        self.assertEqual(sum(counts["classifications"].values()),counts["allRelationshipRecords"])
        self.assertEqual(counts["sourceFieldsInventoried"],
                         counts["sourceFieldsWithEmittedRelationships"]+
                         counts["unemittedOrUnresolvedSourceFields"])
        self.assertEqual(self.audit_result["lineage"]["ciiFieldInventory"]["ciiElementsCount"],11)
        self.assertEqual(self.audit_result["lineage"]["ciiFieldInventory"]["ciiAuxiliaryCounts"]["RIGID"],6)
        self.assertEqual(self.audit_result["lineage"]["ciiFieldInventory"]["pointerFieldsValidated"],15)
        self.assertTrue(all(r["reversibility"] in
                            ("LOSSLESS","LOSSLESS_WITH_PROVENANCE","LOSSY","UNRESOLVED")
                            for r in self.rels))

    def test_04_deleted_short_node_never_invents_emitted_field(self):
        event=[e for e in self.audit_result["lineage"]["r1Transformations"]
               if e["stage"]=="PYTHON_SHORT_NODE_DROP"]
        self.assertGreaterEqual(len(event),1)
        sid=event[0]["sourceIdentity"]
        matches=[r for r in self.rels
                 if r["sourceNodeIdentity"]==sid and r["ciiFieldId"] is None]
        self.assertTrue(matches)
        self.assertTrue(all(r["reversibility"]=="LOSSY" for r in matches))
        self.assertTrue(all(r["ciiElementIdentity"] is None for r in matches))

    def test_05_negative_node_python_renumber_stores_both_original_and_final_ids(self):
        events=[e for e in self.audit_result["lineage"]["r1Transformations"]
                if e["stage"]=="PYTHON_NODE_RENUMBER"]
        self.assertTrue(events)
        self.assertTrue(any(str(e["originalNodeNumber"]).startswith("-") and
                            int(e["generatedNodeNumber"])>0 for e in events))
        self.assertTrue(self.audit_result["lineage"]["r1NodeIdentityLinks"])

    def test_06_wall_missing_fallback_is_lossy_and_source_not_fabricated(self):
        rows=[r for r in self.rels if r["ciiField"]=="ELEMENT.wallThicknessMm"
              and "SOURCE_ABSENT_OR_INVALID_DEFAULTED" in r["reasonCodes"]]
        self.assertTrue(rows)
        self.assertTrue(all(x["reversibility"]=="LOSSY" for x in rows))
        self.assertTrue(all(x["emittedValue"]=="0.0100000" or
                            abs(float(x["emittedValue"])-0.01)<1e-9 for x in rows))

    def test_07_writer_endpoint_od_and_rigid_weight_source_scaled(self):
        source_weight=[r for r in self.rels if r["ciiField"]=="RIGID.weight"
                       and r["originalSourceToken"]=="6"]
        self.assertEqual(len(source_weight),1)
        w=source_weight[0]
        self.assertEqual(float(w["emittedValue"]),60)
        self.assertEqual(w["physicalAuthority"],"OWNER_APPROVAL_REQUIRED")
        self.assertFalse(w["engineeringEditApproved"])
        self.assertIn("WEIGHT_MULTIPLY_RUN_PINNED_SCALE",w["transformation"])
        od=[r for r in self.rels if r["ciiField"]=="ELEMENT.outsideDiameterMm"
            and r["valueStatus"]=="PASS_EXACT_WRITER_SERIALIZATION"]
        self.assertTrue(od)
        self.assertTrue(any(r["fromToSelection"]=="FROM" for r in od))

    def test_r3_r1_source_mass_not_automatically_marked_editable(self):
        weights=[r for r in self.rels if r["ciiField"]=="RIGID.weight"
                 and r["physicalAuthority"]=="OWNER_APPROVAL_REQUIRED"]
        self.assertTrue(weights)
        self.assertTrue(all(r["editTechnicalEligibility"]=="HOLD" for r in weights))
        self.assertTrue(all(
            "R2_COMPLETE_SOURCE_WEIGHT_EDIT_ELIGIBILITY_NOT_CROSS_VERIFIED"
            in r["reasonCodes"] for r in weights))
        self.assertFalse(any(r["engineeringEditApproved"] for r in weights))

    def test_r3_removed_effective_node_does_not_alias_unrelated_original_source(self):
        # Even if a caller hands an inconsistent inventory, an absent
        # ordinal must never silently select Python list[-1].
        original=inventory_source_fields(FIXTURE,"ORIGINAL_INPUT_XML")
        effective=inventory_source_fields(FIXTURE.replace(
            b"<Weight>6</Weight>",b"<Weight>6.5</Weight>"),"ENGINE_INPUT_XML")
        target=next(f for f in effective["fields"]
                    if f["sourceFieldPath"]=="Node/Weight"
                    and f["originalSourceToken"].strip()=="6.5")
        target["nodeOrdinal"]=99999
        matched=match_original_to_effective(original,effective)
        relation=next(r for r in matched["relationships"]
                      if r["effectiveFieldId"]==target["fieldId"])
        self.assertEqual(relation["relationship"],"UNRESOLVED")
        self.assertIsNone(relation["originalFieldId"])

    def test_08_shared_physical_component_is_not_mass_authority(self):
        shared=[n for n in self.audit_result["lineage"]["sourceStages"]["effectiveEnriched"]["nodes"]
                if n["componentRefNo"]=="/SHARED-COMP"]
        self.assertGreater(len(shared),1)
        self.assertFalse(any(x["physicalAuthority"]=="VERIFIED" for x in self.rels))
        self.assertFalse(any(x["engineeringEditApproved"] for x in self.rels))

    def test_09_annotation_source_only_rating_dtxr_not_reverse_inferred(self):
        modified=FIXTURE.replace(b"<Weight>6</Weight></Node>",
                                  b"<Weight>6</Weight><Rating>300</Rating>"
                                  b"<DTXR_POS>SUPPORT-NOTE</DTXR_POS></Node>")
        inv=inventory_source_fields(modified,"ENGINE_INPUT_XML")
        for field_name in ("Node/Rating","Node/DTXR_POS"):
            items=[x for x in inv["fields"] if x["sourceFieldPath"]==field_name]
            self.assertEqual(len(items),1)
            self.assertIsNotNone(items[0]["sourceFieldLocation"]["startByte"])
        with tempfile.TemporaryDirectory() as folder:
            source=inventory_source_fields(modified,"ORIGINAL_INPUT_XML")
            receipt=write_source_only(folder,source)
            self.assertEqual(receipt["authenticReplay"],"NOT_RUN")
            self.assertIsNone(receipt["outputFieldsInventoried"])
            self.assertIsNone(receipt["reversibilityCounts"])
            self.assertTrue(all((Path(folder)/name).is_file() for name in ARTIFACTS))

    def test_10_source_only_and_enriched_stage_cannot_be_silently_equated(self):
        modified=FIXTURE.replace(b"<Weight>6</Weight>",b"<Weight>6.5</Weight>")
        original=inventory_source_fields(FIXTURE,"ORIGINAL_INPUT_XML")
        engine=inventory_source_fields(modified,"ENGINE_INPUT_XML")
        diffs=match_original_to_effective(original,engine)["relationships"]
        changed=[r for r in diffs if r["effectiveToken"]=="6.5"]
        self.assertEqual(len(changed),1)
        self.assertEqual(changed[0]["relationship"],"ENRICHED_FIELD_VALUE_CHANGED")
        self.assertFalse(changed[0]["provesUnchangedBm2Origin"])

    def test_11_value_ledger_only_mutation_is_rejected(self):
        inv=copy.deepcopy(self.audit_result["lineage"]["ciiFieldInventory"])
        target=next(x for x in inv["fields"] if x["ciiField"]=="RIGID.weight")
        target["emittedToken"]=" 999.000000"
        with self.assertRaises(Hold):
            verify_field_values(inv,self.call["original_cii"])

    def test_12_original_cii_digest_and_config_mismatch_refuse_noedit(self):
        call=dict(self.call)
        call["engine_input_xml"]=FIXTURE.replace(b"<Weight>6</Weight>",
                                                b"<Weight>6.001</Weight>")
        with self.assertRaises(Hold):
            audit_frozen_run(**call)
        denied=capture_snapshot(
            engine_input_xml=FIXTURE,
            original_cii=self.call["original_cii"],
            effective_config_json=b"{}", options=self.call["conversion_snapshot"][
                "configuration"]["options"],assets={},run_id="MISSING_MASTER_PROOF",
            completeness_attestation="UNRESOLVED")
        with self.assertRaises(Hold):
            audit_frozen_run(**{**self.call,"conversion_snapshot":denied})

    def test_13_output_structural_pointer_out_of_range_rejected(self):
        def mutation(lines):
            e=lines.index("#$ ELEMENTS")
            original=lines[e+1+12]
            lines[e+1+12]=original[:15]+"         9999"+original[28:]
        altered=_rewrite_cii(self.call["original_cii"],mutation)
        with self.assertRaises(Hold):
            validate_all_element_pointers(altered)

    def test_14_source_linked_rigid_pointer_renumber_preserves_engineering_values(self):
        content=self.call["original_cii"]
        index=inventory_cii_fields(content)
        self.assertEqual(index["ciiAuxiliaryCounts"]["RIGID"],6)
        def mutation(lines):
            element_index=lines.index("#$ ELEMENTS")
            rigid_index=lines.index("#$ RIGID")
            changed=0
            for row in range(element_index+1,element_index+1+index['ciiElementsCount']*15,15):
                line=lines[row+12]
                ptr=int(float(line[15:28].strip()))
                if ptr in (1,2):
                    lines[row+12]=line[:15]+str(3-ptr).rjust(13)+line[28:]
                    changed+=1
            self.assertGreaterEqual(changed,2)
            lines[rigid_index+1],lines[rigid_index+2]=(
                lines[rigid_index+2],lines[rigid_index+1])
        changed=_rewrite_cii(content,mutation)
        verified=verify_source_linked_pointer_reindex(
            content,changed,r1_lineage_ledger=self.audit_result["lineage"] and
            self._r1_from_replay())
        self.assertEqual(verified["status"],"PASS_SOURCE_LINKED_AUXILIARY_REINDEX")
        self.assertTrue(verified["pointerChanges"])
        self.assertEqual(verified["engineeringPayloadDifferences"],0)

    def _r1_from_replay(self):
        # Reuse R1's exact frozen lineage; do not reconstruct RIGID keys by pointer.
        from roundtrip_foundation.lineage import build_lineage_ledger
        return build_lineage_ledger(
            conversion_snapshot=self.call["conversion_snapshot"],
            engine_input_xml=self.call["engine_input_xml"],
            original_cii=self.call["original_cii"],
            effective_config_json=self.call["effective_config_json"],
            configuration_assets={},
            replay_report=self.audit_result["noEditReplay"])

    def test_15_precision_loss_exact_decimal_not_tolerance(self):
        altered=FIXTURE.replace(
            b"<ComponentRefNo>/PIPE-10</ComponentRefNo><Position>0 0 0</Position>"
            b"<OutsideDiameter>60.3</OutsideDiameter>",
            b"<ComponentRefNo>/PIPE-10</ComponentRefNo><Position>0 0 0</Position>"
            b"<OutsideDiameter>60.123456789</OutsideDiameter>")
        self.assertNotEqual(altered,FIXTURE)
        case=create_current_writer_case(altered,evidence_class="SYNTHETIC_CURRENT_WRITER")
        audited=audit_frozen_run(**case)
        quantized=[r for r in audited["reversibility"]["relationships"]
                   if r["ciiField"]=="ELEMENT.outsideDiameterMm" and
                   r["precisionLoss"]]
        self.assertTrue(quantized,"actual writer must quantize high-precision OD")
        self.assertTrue(all(r["reversibility"]=="LOSSY" for r in quantized))
        self.assertTrue(all("CII_NUMERIC_QUANTIZATION" in r["reasonCodes"]
                            for r in quantized))

    def test_16_real_writer_one_to_many_branch_temperature(self):
        altered=FIXTURE.replace(b"<Branchname>/RT/B1</Branchname>",
                                b"<Branchname>/RT/B1</Branchname>"
                                b"<Temperature><Temperature1>101.5</Temperature1></Temperature>")
        case=create_current_writer_case(altered,evidence_class="SYNTHETIC_CURRENT_WRITER")
        run=audit_frozen_run(**case)
        originals=[f for f in run["lineage"]["sourceStages"]["effectiveEnriched"]["fields"]
                   if f["sourceFieldPath"]=="Branch/Temperature/Temperature1"
                   and f["branchName"]=="/RT/B1"]
        self.assertEqual(len(originals),1)
        sid=originals[0]["fieldId"]
        targets=[r for r in run["reversibility"]["relationships"]
                 if sid in r["sourceFieldIds"] and r["ciiField"]=="ELEMENT.temperature1"]
        self.assertGreater(len(targets),1)
        self.assertTrue(all(r["emittedValue"] is not None for r in targets))

    def test_17_multiple_source_candidates_not_unique_inverse(self):
        # Without making a fabricated ledger appear original, feed a cloned
        # qualified output relation through the stand-alone pure classifier.
        inv=copy.deepcopy(self.audit_result["lineage"]["ciiFieldInventory"])
        field=next(x for x in inv["fields"] if x["ciiField"]=="ELEMENT.outsideDiameterMm"
                   and len(x["sourceFieldCandidates"])==1 and
                   x["valueStatus"]=="PASS_EXACT_WRITER_SERIALIZATION")
        fields=self.audit_result["lineage"]["sourceStages"]["effectiveEnriched"]["fields"]
        other=next(x for x in fields if x["fieldId"]!=field["sourceFieldCandidates"][0])
        field["sourceFieldCandidates"].append(other["fieldId"])
        from roundtrip_foundation.lineage import build_lineage_ledger
        r1=self._r1_from_replay()
        classifier=build_reversibility(
            field_inventory=inv,
            original_inventory=self.audit_result["lineage"]["sourceStages"]["originalInput"],
            effective_inventory=self.audit_result["lineage"]["sourceStages"]["effectiveEnriched"],
            source_stage_match=self.audit_result["lineage"]["sourceStageRelationships"],
            r1_ledger=r1,value_verification=self.audit_result["verification"],
            evidence_class="SYNTHETIC_CURRENT_WRITER_MUTATION")
        record=next(x for x in classifier["relationships"]
                    if x["ciiFieldId"]==field["ciiFieldId"])
        self.assertEqual(record["reversibility"],"LOSSY")
        self.assertFalse(record["inverseMappingUnique"])

    def test_18_reports_are_reproducible_with_no_invented_tests(self):
        with tempfile.TemporaryDirectory() as d:
            report=audit_frozen_run(**self.call,artifact_dir=d)
            self.assertTrue(all((Path(d)/name).is_file() for name in ARTIFACTS))
            import json
            summary=json.loads((Path(d)/"field-coverage-summary.json").read_text())
            self.assertEqual(summary["counts"]["outputFieldsInventoried"],
                             len(self.records))
            self.assertEqual(summary["evidence"]["authenticReplay"],"NOT_RUN")
            self.assertIn("NOT_RUN",(Path(d)/"test-results.md").read_text())
            self.assertEqual(report["noEditReplay"]["comparison"]["differingBytes"],0)


if __name__=="__main__":
    unittest.main()
