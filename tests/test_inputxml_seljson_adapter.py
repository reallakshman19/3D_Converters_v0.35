import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location(
    "inputxml_canonical_compiler_seljson_test",
    MODULE_PATH,
)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"


def node(number, position, component_ref=None):
    position_xml = f"<Position>{position}</Position>" if position is not None else ""
    component_ref = component_ref or f"SEL-{number}"
    return (
        "<Node>"
        f"<NodeNumber>{number}</NodeNumber><NodeName>N{number}</NodeName>"
        "<Endpoint>1</Endpoint><Rigid>0</Rigid><ComponentType>PIPE</ComponentType>"
        f"<Weight>0</Weight><ComponentRefNo>{component_ref}</ComponentRefNo>"
        "<ConnectionType/><OutsideDiameter>114.3</OutsideDiameter>"
        "<WallThickness>6.02</WallThickness><CorrosionAllowance>0</CorrosionAllowance>"
        f"<InsulationThickness>0</InsulationThickness>{position_xml}"
        "<BendRadius>0</BendRadius><SIF>0</SIF><MaterialCode>106</MaterialCode>"
        "</Node>"
    )


def source_xml(second_position="1000 0 0", metadata=""):
    return (
        "<Root>"
        f"{metadata}<Branch><Branchname>/SELECTIONJSON/P8810031/B4</Branchname>"
        "<LineNo>P8810031</LineNo>"
        "<Pressure><Pressure1>1000</Pressure1>"
        "<HydroPressure>1500</HydroPressure></Pressure>"
        "<Temperature><Temperature1>100</Temperature1></Temperature>"
        "<MaterialNumber>106</MaterialNumber><InsulationDensity>0</InsulationDensity>"
        f"<FluidDensity>965</FluidDensity>{node('10', '0 0 0')}"
        f"{node('20', second_position)}</Branch></Root>"
    ).encode()


class SelectionJsonAdapterTests(unittest.TestCase):
    def compile(
        self,
        source,
        *,
        dialect="seljson-custom-root",
        source_name="selection-root.xml",
    ):
        return compiler.compile_document(
            source,
            source_name=source_name,
            source_repository="reallaksh19/3D_Converters",
            source_path=f"test://{source_name}",
            producer="selection-json-adapter-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=dialect,
            context={
                "version": "11.00",
                "jobName": "SELJSON_CANONICAL_TEST",
                "north": [0, 1, 0],
                "fluidDensityScale": "0.000001",
            },
        )

    def assert_code(self, ledger, code):
        self.assertTrue(
            any(row["code"] == code for row in ledger["diagnostics"]),
            ledger["diagnostics"],
        )

    def test_explicit_selectionjson_dialect_passes(self):
        root, ledger, validation = self.compile(source_xml())
        self.assertIsNotNone(root)
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("seljson-custom-root", ledger["dialect"])
        self.assertEqual("P8810031", root.find("PIPINGMODEL/PIPINGELEMENT").get("LINE"))
        self.assertTrue(any(
            row["sourceType"] == "SELECTIONJSON_CUSTOM_ROOT_DOCUMENT"
            for row in ledger["records"]
        ))
        self.assertFalse(any(
            row["sourceType"] == "XML_BUILDER_ROOT_DOCUMENT"
            for row in ledger["records"]
        ))
        records = root.xpath("//ext:Record", namespaces={"ext": compiler.EXT_NS})
        self.assertTrue(any(row.get("name") == "SelectionJsonSourceDocument" for row in records))
        self.assertFalse(any(row.get("name") == "XmlBuilderSourceDocument" for row in records))

    def test_same_ambiguous_bytes_without_override_resolve_as_xml_builder(self):
        root, ledger, validation = self.compile(source_xml(), dialect=None)
        self.assertIsNotNone(root)
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("xml-builder-root-branch-node", ledger["dialect"])
        self.assertTrue(any(
            row["sourceType"] == "XML_BUILDER_ROOT_DOCUMENT"
            for row in ledger["records"]
        ))

    def test_filename_never_supplies_selectionjson_identity(self):
        _, ledger, validation = self.compile(
            source_xml(),
            dialect=None,
            source_name="model_seljson_to_inputxml.xml",
        )
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("xml-builder-root-branch-node", ledger["dialect"])

    def test_registered_selectionjson_producer_is_validated_and_retained(self):
        metadata = (
            "<Producer>selectionjson-transfer-v1</Producer>"
            "<Profile>seljson-custom-root</Profile>"
            "<SourceIdentity>SEL-SOURCE-1</SourceIdentity>"
            "<SelectionJsonSourceIds>S10,S20</SelectionJsonSourceIds>"
        )
        root, ledger, validation = self.compile(source_xml(metadata=metadata))
        self.assertEqual("PASS", validation["status"])
        intake = next(
            row for row in ledger["records"]
            if row["sourceType"] == "TOPOLOGY_PROFILE_INTAKE"
        )
        self.assertEqual("selectionjson-transfer-v1", intake["sourceFields"]["producer"])
        records = root.xpath(
            "//ext:Record[@name='SourceProducer']",
            namespaces={"ext": compiler.EXT_NS},
        )
        self.assertEqual(["selectionjson-transfer-v1"], [row.text for row in records])

    def test_contradictory_producer_metadata_blocks_at_intake(self):
        metadata = (
            "<Producer>xml-builder-export-v1</Producer>"
            "<Profile>seljson-custom-root</Profile>"
        )
        root, ledger, validation = self.compile(source_xml(metadata=metadata))
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "ROOT_PROFILE_MISMATCH")
        diagnostic = next(
            row for row in ledger["diagnostics"]
            if row["code"] == "ROOT_PROFILE_MISMATCH"
        )
        self.assertEqual("/Root[1]/Producer[1]", diagnostic["sourceEntityId"])

    def test_selectionjson_producer_metadata_blocks_xml_builder_default(self):
        metadata = (
            "<Producer>selectionjson-transfer-v1</Producer>"
            "<SelectionJsonSourceIds>S10,S20</SelectionJsonSourceIds>"
        )
        root, ledger, validation = self.compile(source_xml(metadata=metadata), dialect=None)
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assertEqual("xml-builder-root-branch-node", ledger["dialect"])
        self.assert_code(ledger, "ROOT_PROFILE_MISMATCH")

    def test_profile_contradiction_remains_independent_from_producer(self):
        metadata = (
            "<Producer>selectionjson-transfer-v1</Producer>"
            "<Profile>xml-builder-root-branch-node</Profile>"
        )
        root, ledger, validation = self.compile(source_xml(metadata=metadata))
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "ROOT_PROFILE_MISMATCH")

    def test_selectionjson_topology_loss_blocks(self):
        root, ledger, validation = self.compile(source_xml(second_position=None))
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "NODE_POSITION_MISSING")

    def test_profile_evidence_differs_but_engineering_output_matches(self):
        selection_root, _, selection_validation = self.compile(source_xml())
        builder_root, _, builder_validation = self.compile(source_xml(), dialect=None)
        self.assertEqual("PASS", selection_validation["status"])
        self.assertEqual("PASS", builder_validation["status"])
        selection_element = selection_root.find("PIPINGMODEL/PIPINGELEMENT")
        builder_element = builder_root.find("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual(selection_element.attrib, builder_element.attrib)

    def test_component_reference_source_identity_is_retained(self):
        root, ledger, validation = self.compile(source_xml())
        self.assertEqual("PASS", validation["status"])
        self.assertTrue(any(
            row["sourceType"] == "TOPOLOGY_COMPONENT_MAPPING"
            and row["sourceFields"]["componentRefNo"].startswith("SEL-")
            for row in ledger["records"]
        ))
        records = root.xpath(
            "//ext:Record[@name='TopologyNodeEvidence']",
            namespaces={"ext": compiler.EXT_NS},
        )
        self.assertTrue(any("SEL-" in (row.text or "") for row in records))


if __name__ == "__main__":
    unittest.main()
