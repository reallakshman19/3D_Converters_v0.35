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

    def test_r3_duplicate_mass_token_not_two_approved_physical_masses(self):
        # A repeated positive sibling Weight is a source custody concern,
        # not evidence for multiplying physical component mass.
        modified=FIXTURE.replace(
            b"<ComponentRefNo>/SHARED-COMP</ComponentRefNo>"
            b"<Position>200 0 0</Position><OutsideDiameter>60.3</OutsideDiameter>"
            b"<WallThickness>3.9</WallThickness><Weight>0</Weight>",
            b"<ComponentRefNo>/SHARED-COMP</ComponentRefNo>"
            b"<Position>200 0 0</Position><OutsideDiameter>60.3</OutsideDiameter>"
            b"<WallThickness>3.9</WallThickness><Weight>15</Weight>")
        self.assertNotEqual(modified,FIXTURE)
        case=create_current_writer_case(modified,
                                        evidence_class="SYNTHETIC_CURRENT_WRITER")
        report=audit_frozen_run(**case)
        mass=report["lineage"]["massCustody"]
        shared=next(x for x in mass["components"]
                    if x["componentRefNo"]=="/SHARED-COMP")
        self.assertTrue(shared["duplicateComponentNodeIdentity"])
        self.assertTrue(shared["possiblePropagationOrDuplicatedWeightTokens"])
        self.assertEqual(shared["originalPhysicalMassAuthority"],"UNRESOLVED")
        self.assertIsNone(shared["ownerAuthorizedPhysicalAllocation"])
        self.assertEqual(mass["statistics"]["physicallyApprovedComponentMasses"],0)
        self.assertEqual(report["coverage"]["massCustodyStatistics"][
            "suspectedDuplicatePositiveWeightGroups"],1)

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



class SR01ExactHeadDiagnostics(unittest.TestCase):
    """Four real-converter cases: retained pre-fix witness and corrected gate."""

    def test_sr01_four_real_converter_cases(self):
        import hashlib, json, sys
        import xml.etree.ElementTree as ET
        scripts = str(ROOT / "converters" / "scripts")
        if scripts not in sys.path:
            sys.path.insert(0, scripts)
        import xml_to_cii2019_patched as patched
        from roundtrip_foundation.snapshot_replay import capture_snapshot, run_existing_converter
        from roundtrip_foundation.lineage import observe_python_transformations
        from roundtrip_fidelity.audit import CURRENT_WRITER_OPTIONS
        witnesses = []
        for name, xml_p1, master_p1, row_key, expected in (
            ("A", "2", "9", "001", "9"),
            ("B", "3", "9", "001", "9"),
            ("C", "3", "10", "001", "10"),
            ("D", "3", "9", "NO-MATCH", "3"),
        ):
            source = FIXTURE.replace(
                b"<Branchname>/RT/B1</Branchname>",
                (b"<Branchname>/PROC-001-B-X</Branchname><Pressure><Pressure1>"
                 + xml_p1.encode() + b"</Pressure1></Pressure>"))
            self.assertNotEqual(source, FIXTURE)
            master_rows = [{"lineNo":row_key, "P1":master_p1}]
            support = {
                "linelist": {
                    "masterRows": master_rows,
                    "fieldMap": {"lineSeqNo": "lineNo", "p1": "P1"},
                    "lineKeyTokenPositions": "2",
                    "tokenDelimiter": "-",
                }
            }
            config = json.dumps(support, sort_keys=True, separators=(",", ":")).encode()
            normalized = patched._load_support_config(config.decode())
            patched._normalize_process_field_map(normalized)
            line_key = patched._line_key_from_branch("/PROC-001-B-X", normalized)
            matching = patched._matching_linelist_rows(line_key, normalized)
            self.assertEqual(line_key, "001")
            self.assertEqual(len(matching), 0 if name == "D" else 1)
            if matching:
                self.assertEqual(patched._mapped_process_value(line_key, normalized, "p1",
                                 ["P1", "Design Pressure", "Operating Pressure"]), expected)
            bootstrap = capture_snapshot(
                engine_input_xml=source,
                original_cii=b"PRE_CONVERTER_BOOTSTRAP_NOT_CII",
                effective_config_json=config,
                options=CURRENT_WRITER_OPTIONS,
                assets={},
                run_id="R3-SR01-EXACT-HEAD-"+name,
                original_uploaded_xml=source,
                completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS",
            )
            emitted, command = run_existing_converter(bootstrap, source, config, {})
            snapshot = capture_snapshot(
                engine_input_xml=source,
                original_cii=emitted,
                effective_config_json=config,
                options=CURRENT_WRITER_OPTIONS,
                assets={},
                run_id="R3-SR01-EXACT-HEAD-"+name,
                original_uploaded_xml=source,
                completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS",
            )
            call = dict(
                conversion_snapshot=snapshot,
                engine_input_xml=source,
                original_cii=emitted,
                effective_config_json=config,
                configuration_assets={},
                original_input_xml=source,
                evidence_class="SYNTHETIC_CURRENT_WRITER",
            )
            audited = audit_frozen_run(**call)
            preprocessed, _, _ = observe_python_transformations(
                source, config, {}, CURRENT_WRITER_OPTIONS)
            first_branch = next(x for x in ET.fromstring(preprocessed).iter()
                                if x.tag.split("}")[-1] == "Branch")
            preprocessed_p1 = first_branch.find("./Pressure/Pressure1").text
            fields = inventory_cii_fields(emitted)["fields"]
            raw = next(f for f in fields if f["ciiFieldId"] == "ELEMENT:1:ROW:4:COL:1")
            rel = next(r for r in audited["reversibility"]["relationships"]
                       if r["ciiFieldId"] == raw["ciiFieldId"])
            witness = {
                "case":name,
                "xmlP1":xml_p1,
                "masterP1":master_p1,
                "expectedCiiP1":expected,
                "preprocessedP1":preprocessed_p1,
                "actualSerializedP1":raw["emittedToken"].strip(),
                "actualNumericP1":raw["emittedValue"],
                "sourceXmlSha256":hashlib.sha256(source).hexdigest(),
                "configSha256":hashlib.sha256(config).hexdigest(),
                "embeddedMasterRowsSha256":hashlib.sha256(
                    json.dumps(master_rows,sort_keys=True,separators=(",",":")).encode()).hexdigest(),
                "ciiSha256":hashlib.sha256(emitted).hexdigest(),
                "matchedLineKey":line_key,
                "matchedMasterRows":len(matching),
                "selectedRowOrdinal": 0 if matching else None,
                "selectedHeader":"P1" if matching else None,
                "converter":command["entrypoint"],
                "runInvocation":command["actualArguments"],
                "sourceCandidateIds":rel["sourceFieldIds"],
                "originalSourceToken":rel["originalSourceToken"],
                "postTransformation":rel["transformation"],
                "reasonCodes":rel["reasonCodes"],
                "classification":rel["reversibility"],
                "inverseMappingUnique":rel["inverseMappingUnique"],
                "editTechnicalEligibility":rel["editTechnicalEligibility"],
                "engineeringEditApproved":rel["engineeringEditApproved"],
                "valueStatus":rel["valueStatus"],
                "valueSourceAuthority":rel.get("valueSourceAuthority"),
                "processProvenance":rel.get("processProvenance"),
                "noEditReplay":audited["noEditReplay"]["verdict"],
            }
            witnesses.append(witness)
            print("R3_SR01_WITNESS="+json.dumps(witness,sort_keys=True),flush=True)
            self.assertEqual(float(raw["emittedValue"]), float(expected))
            self.assertEqual(float(preprocessed_p1), float(expected))
            self.assertEqual(audited["noEditReplay"]["verdict"],"PASS_EXACT_REPLAY")
        overridden = witnesses[:3]
        suspect = [
            x for x in overridden
            if x["valueStatus"] == "PASS_EXACT_WRITER_SERIALIZATION"
            and x["inverseMappingUnique"]
            and len(x["sourceCandidateIds"]) == 1
            and x["originalSourceToken"] == x["xmlP1"]
            and x["classification"] in ("LOSSLESS","LOSSLESS_WITH_PROVENANCE")
        ]
        print("R3_SR01_POST_FIX="+json.dumps({
            "casesPassedRealCii":len(witnesses),
            "falseUniqueInverseClaims":len(suspect),
            "status":"PASS_CORRECTED" if not suspect else "FAIL_DEFECT_PERSISTS",
        },sort_keys=True),flush=True)
        self.assertEqual(len(suspect), 0, "Master override still claims a unique XML inverse")
        for observed in overridden:
            self.assertEqual(observed["valueSourceAuthority"],"CONFIGURATION_MASTER")
            self.assertEqual(observed["classification"],"LOSSY")
            self.assertFalse(observed["inverseMappingUnique"])
            self.assertEqual(observed["editTechnicalEligibility"],"HOLD")
            self.assertFalse(observed["engineeringEditApproved"])
            master=observed["processProvenance"]["winningMaster"]
            self.assertEqual(master["rowOrdinal"],0)
            self.assertEqual(master["selectedHeader"],"P1")
        self.assertEqual(witnesses[3]["valueSourceAuthority"],"EFFECTIVE_XML")
        self.assertTrue(witnesses[3]["inverseMappingUnique"])



class SR01AdditionalRegressions(unittest.TestCase):
    """Adversarial process-source controls using the production converter."""

    def _case(self, xml_p1="3", rows=None, include_p1=True, key_position="2",
              mapped_header="P1", extra_xml=b""):
        import json
        from roundtrip_foundation.snapshot_replay import capture_snapshot, run_existing_converter
        from roundtrip_fidelity.audit import CURRENT_WRITER_OPTIONS
        if rows is None:
            rows=[{"lineNo":"001","P1":"9"}]
        xml_pressure=(b"<Pressure><Pressure1>"+xml_p1.encode()+
                      b"</Pressure1><HydroPressure>7</HydroPressure></Pressure>"
                      if include_p1 else
                      b"<Pressure><HydroPressure>7</HydroPressure></Pressure>")
        replacement=(b"<Branchname>/PROC-001-B-X</Branchname>"+
                     xml_pressure+extra_xml)
        xml=FIXTURE.replace(b"<Branchname>/RT/B1</Branchname>",replacement)
        self.assertNotEqual(xml,FIXTURE)
        cfg=json.dumps({"linelist":{"masterRows":rows,
                         "fieldMap":{"lineSeqNo":"lineNo","p1":mapped_header},
                         "lineKeyTokenPositions":key_position,
                         "tokenDelimiter":"-"}},sort_keys=True,separators=(",",":")).encode()
        def snapshot(cii):
            return capture_snapshot(
                engine_input_xml=xml,original_cii=cii,effective_config_json=cfg,
                options=CURRENT_WRITER_OPTIONS,assets={},
                run_id="R3-SR01-ADVERSARIAL",original_uploaded_xml=xml,
                completeness_attestation="COMPLETE_NO_EXTERNAL_MASTERS")
        output,invocation=run_existing_converter(
            snapshot(b"BOOTSTRAP_NOT_HISTORICAL_CII"),xml,cfg,{})
        snap=snapshot(output)
        call={"conversion_snapshot":snap,"engine_input_xml":xml,
              "original_cii":output,"effective_config_json":cfg,
              "configuration_assets":{},"original_input_xml":xml,
              "evidence_class":"SYNTHETIC_CURRENT_WRITER"}
        run=audit_frozen_run(**call)
        fields=inventory_cii_fields(output)["fields"]
        relations=run["reversibility"]["relationships"]
        def relation(name="ELEMENT.pressure1",element=1):
            actual=next(f for f in fields if f["ciiField"]==name and
                        f["ciiElementIdentity"]==f"ELEMENT:{element}")
            evidence=next(r for r in relations if r["ciiFieldId"]==actual["ciiFieldId"])
            return actual,evidence
        return {"xml":xml,"config":cfg,"cii":output,"run":run,
                "call":call,"snapshot":snap,"relation":relation,
                "invocation":invocation}

    def _assert_master(self, scenario, field, expected, index=1):
        token,record=scenario["relation"](field,index)
        self.assertAlmostEqual(float(token["emittedValue"]),float(expected),places=8)
        self.assertEqual(record["valueSourceAuthority"],"CONFIGURATION_MASTER")
        self.assertEqual(record["reversibility"],"LOSSY")
        self.assertFalse(record["inverseMappingUnique"])
        self.assertEqual(record["editTechnicalEligibility"],"HOLD")
        self.assertFalse(record["engineeringEditApproved"])
        self.assertEqual(record["processProvenance"]["configurationSha256"],
                         scenario["snapshot"]["configuration"]["effectiveConfigSha256"])
        self.assertIsNotNone(record["processProvenance"]["winningMaster"])
        return record

    def test_sr01_equal_xml_master_still_master_authority(self):
        case=self._case(xml_p1="9")
        rel=self._assert_master(case,"ELEMENT.pressure1",9)
        self.assertEqual(rel["originalSourceToken"],"9")
        self.assertEqual(rel["processProvenance"]["winningMaster"]["rowOrdinal"],0)

    def test_sr01_duplicate_master_rows_first_numeric_selected(self):
        case=self._case(rows=[{"lineNo":"001","P1":"8"},
                              {"lineNo":"001","P1":"9"}])
        rel=self._assert_master(case,"ELEMENT.pressure1",8)
        self.assertEqual(rel["processProvenance"]["matchedMasterRowOrdinals"],[0,1])
        self.assertEqual(rel["processProvenance"]["winningMaster"]["rowOrdinal"],0)
        self.assertEqual(rel["processProvenance"]["winningMaster"]["selectionRule"],
                         "FIRST_VALID_NUMERIC")

    def test_sr01_blank_master_falls_back_to_xml(self):
        case=self._case(rows=[{"lineNo":"001","P1":""}])
        token,rel=case["relation"]()
        self.assertEqual(float(token["emittedValue"]),3.0)
        self.assertEqual(rel["valueSourceAuthority"],"EFFECTIVE_XML")
        self.assertTrue(rel["inverseMappingUnique"])
        self.assertIsNone(rel["processProvenance"]["winningMaster"])

    def test_sr01_missing_xml_pressure_master_is_not_invented_xml(self):
        case=self._case(include_p1=False)
        rel=self._assert_master(case,"ELEMENT.pressure1",9)
        self.assertEqual(rel["sourceFieldIds"],[])
        self.assertIsNone(rel["originalSourceToken"])

    def test_sr01_bad_line_key_has_no_master_match(self):
        case=self._case(key_position="3")
        token,rel=case["relation"]()
        self.assertEqual(float(token["emittedValue"]),3.0)
        self.assertEqual(rel["valueSourceAuthority"],"EFFECTIVE_XML")
        self.assertEqual(rel["processProvenance"]["matchedMasterRowOrdinals"],[])

    def test_sr01_header_fallback_is_recorded(self):
        case=self._case(mapped_header="NONEXISTENT_HEADER")
        rel=self._assert_master(case,"ELEMENT.pressure1",9)
        self.assertEqual(rel["processProvenance"]["winningMaster"]["selectedHeader"],"P1")

    def test_sr01_configuration_digest_tamper_rejected(self):
        import json
        from roundtrip_foundation.snapshot_replay import Hold
        case=self._case()
        wrong=json.loads(case["config"])
        wrong["linelist"]["masterRows"][0]["P1"]="10"
        content=json.dumps(wrong,sort_keys=True,separators=(",",":")).encode()
        with self.assertRaises(Hold):
            audit_frozen_run(**{**case["call"],"effective_config_json":content})


    def test_sr01_original_xml_changes_under_frozen_master(self):
        import hashlib
        a=self._case(xml_p1="3")
        b=self._case(xml_p1="4")
        self._assert_master(a,"ELEMENT.pressure1",9)
        self._assert_master(b,"ELEMENT.pressure1",9)
        self.assertNotEqual(hashlib.sha256(a["xml"]).hexdigest(),
                            hashlib.sha256(b["xml"]).hexdigest())
        self.assertEqual(hashlib.sha256(a["cii"]).hexdigest(),
                         hashlib.sha256(b["cii"]).hexdigest())

    def test_sr01_master_changes_under_frozen_original_xml(self):
        import hashlib
        a=self._case(rows=[{"lineNo":"001","P1":"9"}])
        b=self._case(rows=[{"lineNo":"001","P1":"10"}])
        self._assert_master(a,"ELEMENT.pressure1",9)
        self._assert_master(b,"ELEMENT.pressure1",10)
        self.assertEqual(hashlib.sha256(a["xml"]).hexdigest(),
                         hashlib.sha256(b["xml"]).hexdigest())
        self.assertNotEqual(hashlib.sha256(a["config"]).hexdigest(),
                            hashlib.sha256(b["config"]).hexdigest())
        self.assertNotEqual(hashlib.sha256(a["cii"]).hexdigest(),
                            hashlib.sha256(b["cii"]).hexdigest())

    def test_sr01_repeated_process_values_have_no_unique_xml_inverse(self):
        case=self._case()
        for index in range(1,5):
            with self.subTest(element=index):
                self._assert_master(case,"ELEMENT.pressure1",9,index)
        counts=case["run"]["reversibility"]["counts"]
        self.assertEqual(counts["masterControlledUniqueInverseClaims"],0)
        self.assertGreaterEqual(counts["masterControlledOutputFields"],4)

    def test_sr01_hydro_temperature_density_writer_selected_master(self):
        extra=(b"<Temperature><Temperature1>40</Temperature1>"
               b"<Temperature2>50</Temperature2>"
               b"<Temperature3>60</Temperature3></Temperature>"
               b"<FluidDensity>500</FluidDensity>")
        row={"lineNo":"001","P1":"9","Temperature Max":"111",
             "Temperature":"112","Temperature Min":"113",
             "Hydro Test Pressure":"14","Mixed kg/m3":"900"}
        case=self._case(rows=[row],extra_xml=extra)
        for name,expected in (("ELEMENT.temperature1",111),
                              ("ELEMENT.temperature2",112),
                              ("ELEMENT.temperature3",113),
                              ("ELEMENT.hydroPressure",14),
                              ("ELEMENT.fluidDensity",0.0009)):
            with self.subTest(name=name):
                self._assert_master(case,name,expected)

    def test_sr01_master_fallback_nested_raw_header(self):
        case=self._case(rows=[{"lineNo":"001","_raw":{"P1":"9"}}])
        record=self._assert_master(case,"ELEMENT.pressure1",9)
        self.assertEqual(record["processProvenance"]["winningMaster"]["valueContainer"],"_raw")

    def test_sr01_negative_control_refuses_unique_master_xml_provenance(self):
        from roundtrip_fidelity.reversibility_classifier import classify
        case=self._case()
        _,record=case["relation"]()
        fields=case["run"]["lineage"]["ciiFieldInventory"]["fields"]
        field=next(f for f in fields if f["ciiFieldId"]==record["ciiFieldId"])
        source=next(f for f in case["run"]["lineage"]["sourceStages"]["effectiveEnriched"]["fields"]
                    if f["fieldId"]==record["sourceFieldIds"][0])
        classified,reasons=classify(field,[source],set())
        self.assertEqual(classified,"LOSSY")
        self.assertIn("MASTER_SELECTED_VALUE_XML_INVERSE_NOT_UNIQUE",reasons)

    def test_sr01_seven_artifacts_have_consistent_master_authority(self):
        import csv,json
        case=self._case()
        with tempfile.TemporaryDirectory() as folder:
            audit_frozen_run(**case["call"],artifact_dir=folder)
            root=Path(folder)
            self.assertTrue(all((root/n).is_file() for n in ARTIFACTS))
            with (root/"field-coverage.csv").open(newline="",encoding="utf-8") as stream:
                rows=list(csv.DictReader(stream))
            found=next(x for x in rows if x["ciiFieldId"]=="ELEMENT:1:ROW:4:COL:1")
            self.assertEqual(found["valueSourceAuthority"],"CONFIGURATION_MASTER")
            self.assertEqual(found["masterRowOrdinal"],"0")
            self.assertEqual(found["masterFieldHeader"],"P1")
            self.assertEqual(found["inverseMappingUnique"],"False")
            coverage=json.loads((root/"field-coverage-summary.json").read_text())
            self.assertEqual(coverage["counts"]["masterControlledUniqueInverseClaims"],0)
            self.assertIn("False unique master inverse claims | 0",
                          (root/"reversibility-audit.md").read_text())
            self.assertIn("NOT_RUN",(root/"test-results.md").read_text())



if __name__=="__main__":
    unittest.main()
