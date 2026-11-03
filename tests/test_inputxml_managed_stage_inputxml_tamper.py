import copy
import unittest

from lxml import etree as ET

from scripts.inputxml_compiler.base import CompileBlocked, EXT_NS
from scripts.inputxml_compiler.managed_stage_engineering import verify_engineering_projection
from scripts.inputxml_compiler.managed_stage_entities import verify_source_entities_and_ports
from scripts.inputxml_compiler.managed_stage_identity import verify_result_identity
from scripts.inputxml_compiler.managed_stage_inputxml import build_managed_stage_candidate
from scripts.inputxml_compiler.managed_stage_parity import verify_parity_and_metrics
from scripts.inputxml_compiler.managed_stage_topology import verify_topology_and_trace
from tests.managed_stage_test_support import raw_bridge_result


class ManagedStageInputXmlTamperTests(unittest.TestCase):
    def prepared(self):
        intake, ledger, result = raw_bridge_result()
        verify_result_identity(intake, result, ledger)
        source = verify_source_entities_and_ports(intake, result, ledger)
        topology = verify_topology_and_trace(result, source, ledger)
        topology["branchCollectionPath"] = intake.branch_collection_path
        projection = verify_engineering_projection(result, source, topology, ledger)
        verify_parity_and_metrics(result, source, topology, projection, ledger)
        return intake, ledger, result, topology

    def xml(self, result):
        return ET.fromstring(result["topologyInputXml"].encode("utf-8"))

    def set_xml(self, result, root):
        result["topologyInputXml"] = ET.tostring(
            root,
            encoding="unicode",
            xml_declaration=False,
        )

    def model(self, root):
        return next(
            child for child in root
            if ET.QName(child).localname == "PIPINGMODEL"
        )

    def element(self, root):
        return next(
            child for child in self.model(root)
            if ET.QName(child).localname == "PIPINGELEMENT"
        )

    def parsed_element(self, result):
        return result["parsedInputXmlTopology"]["elements"][0]

    def test_missing_trace_attribute_blocks_before_removal(self):
        intake, ledger, result, topology = self.prepared()
        root = self.xml(result)
        self.element(root).attrib.pop("CANONICAL_EDGE_ID")
        self.set_xml(result, root)
        with self.assertRaises(CompileBlocked):
            build_managed_stage_candidate(result, intake, topology, ledger)

    def test_contradictory_trace_attribute_blocks(self):
        intake, ledger, result, topology = self.prepared()
        root = self.xml(result)
        self.element(root).set("CANONICAL_EDGE_ID", "CE-FORGED")
        self.parsed_element(result)["attributes"]["CANONICAL_EDGE_ID"] = "CE-FORGED"
        self.set_xml(result, root)
        with self.assertRaises(CompileBlocked):
            build_managed_stage_candidate(result, intake, topology, ledger)

    def test_unknown_trace_attribute_blocks(self):
        intake, ledger, result, topology = self.prepared()
        root = self.xml(result)
        self.element(root).set("UNREGISTERED_TRACE", "x")
        self.parsed_element(result)["attributes"]["UNREGISTERED_TRACE"] = "x"
        self.set_xml(result, root)
        with self.assertRaises(CompileBlocked):
            build_managed_stage_candidate(result, intake, topology, ledger)

    def test_required_geometry_sentinel_blocks(self):
        intake, ledger, result, topology = self.prepared()
        root = self.xml(result)
        self.element(root).set("DELTA_X", "-1.010100")
        self.parsed_element(result)["attributes"]["DELTA_X"] = "-1.010100"
        self.set_xml(result, root)
        with self.assertRaises(CompileBlocked):
            build_managed_stage_candidate(result, intake, topology, ledger)

    def test_producer_count_mismatch_blocks_without_silent_rewrite(self):
        intake, ledger, result, topology = self.prepared()
        root = self.xml(result)
        self.model(root).set("NUMELT", "2")
        self.set_xml(result, root)
        with self.assertRaises(CompileBlocked):
            build_managed_stage_candidate(result, intake, topology, ledger)
        self.assertTrue(any(
            row["code"] == "MANAGED_STAGE_COUNT_MISMATCH"
            for row in ledger.diagnostics
        ))

    def test_job_name_mismatch_blocks(self):
        intake, ledger, result, topology = self.prepared()
        root = self.xml(result)
        self.model(root).set("JOBNAME", "FORGED_JOB")
        self.set_xml(result, root)
        with self.assertRaises(CompileBlocked):
            build_managed_stage_candidate(result, intake, topology, ledger)

    def test_optional_sentinel_is_retained_as_explicit_absence(self):
        intake, ledger, result, topology = self.prepared()
        candidate = build_managed_stage_candidate(
            copy.deepcopy(result),
            intake,
            topology,
            ledger,
        )
        element = candidate.find("PIPINGMODEL/PIPINGELEMENT")
        self.assertNotIn("TEMP_EXP_C2", element.attrib)
        evidence = candidate.xpath(
            "//ext:Record[@name='ManagedStageTopologyInputXmlAttribute']",
            namespaces={"ext": EXT_NS},
        )
        self.assertTrue(any(
            row.get("sourceField") == "TEMP_EXP_C2"
            for row in evidence
        ))


if __name__ == "__main__":
    unittest.main()
