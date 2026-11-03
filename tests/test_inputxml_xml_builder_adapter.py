import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location(
    "inputxml_canonical_compiler_xml_builder_test",
    MODULE_PATH,
)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"


def restraint(restraint_type="14"):
    return (
        "<Restraint>"
        f"<Type>{restraint_type}</Type>"
        "<Stiffness>1000</Stiffness><Gap>0</Gap><Friction>0.3</Friction>"
        "<DirectionCosineX>0</DirectionCosineX>"
        "<DirectionCosineY>1</DirectionCosineY>"
        "<DirectionCosineZ>0</DirectionCosineZ>"
        "</Restraint>"
    )


def node(
    number,
    position,
    *,
    component="PIPE",
    component_ref=None,
    restraints="",
    diameter="114.3",
    wall="6.02",
    material="106",
    extra="",
):
    position_xml = f"<Position>{position}</Position>" if position is not None else ""
    component_ref = component_ref or f"C-{number}"
    return (
        "<Node>"
        f"<NodeNumber>{number}</NodeNumber><NodeName>N{number}</NodeName>"
        "<Endpoint>1</Endpoint><Rigid>0</Rigid>"
        f"<ComponentType>{component}</ComponentType><Weight>0</Weight>"
        f"<ComponentRefNo>{component_ref}</ComponentRefNo><ConnectionType/>"
        f"<OutsideDiameter>{diameter}</OutsideDiameter>"
        f"<WallThickness>{wall}</WallThickness>"
        "<CorrosionAllowance>0</CorrosionAllowance>"
        "<InsulationThickness>0</InsulationThickness>"
        f"{position_xml}<BendRadius>0</BendRadius><SIF>0</SIF>"
        f"<MaterialCode>{material}</MaterialCode>{extra}{restraints}</Node>"
    )


def branch(nodes, *, line="L-100", branch_name=None, extra=""):
    branch_name = branch_name if branch_name is not None else line
    return (
        "<Branch>"
        f"<Branchname>{branch_name}</Branchname><LineNo>{line}</LineNo>"
        "<Pressure><Pressure1>1000</Pressure1>"
        "<HydroPressure>1500</HydroPressure></Pressure>"
        "<Temperature><Temperature1>100</Temperature1></Temperature>"
        "<MaterialNumber>106</MaterialNumber>"
        "<InsulationDensity>0</InsulationDensity><FluidDensity>965</FluidDensity>"
        f"{extra}{''.join(nodes)}</Branch>"
    )


def source_xml(*, second_position="1000 0 0", restraints="", root_extra=""):
    nodes = [
        node("10", "0 0 0"),
        node("20", second_position, restraints=restraints),
    ]
    return f"<Root>{root_extra}{branch(nodes)}</Root>".encode()


class XmlBuilderAdapterTests(unittest.TestCase):
    def compile(self, source, *, source_name="xml-builder.xml", context=None):
        resolved_context = {
            "version": "11.00",
            "jobName": "XML_BUILDER_TEST",
            "north": [0, 1, 0],
            "fluidDensityScale": "0.000001",
        }
        if context is not None:
            resolved_context = context
        return compiler.compile_document(
            source,
            source_name=source_name,
            source_repository="reallaksh19/3D_Converters",
            source_path=f"test://{source_name}",
            producer="xml-builder-adapter-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            context=resolved_context,
        )

    def assert_code(self, ledger, code):
        self.assertTrue(
            any(row["code"] == code for row in ledger["diagnostics"]),
            ledger["diagnostics"],
        )

    def test_explicit_two_node_route_passes(self):
        root, ledger, validation = self.compile(source_xml())
        self.assertIsNotNone(root)
        self.assertEqual("PASS", validation["status"])
        element = root.find("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual("L-100", element.get("LINE"))
        self.assertEqual("1000", element.get("DELTA_X"))
        self.assertEqual("0", element.get("DELTA_Y"))
        self.assertEqual("0", element.get("DELTA_Z"))
        self.assertEqual("106", element.get("MATERIAL_NUM"))
        self.assertEqual("0.000965", element.get("FLUID_DENSITY"))
        self.assertTrue(
            any(
                row["sourceType"] == "XML_BUILDER_ROOT_DOCUMENT"
                for row in ledger["records"]
            )
        )
        self.assertFalse(
            any(
                row["sourceType"] == "SELECTIONJSON_CUSTOM_ROOT_DOCUMENT"
                for row in ledger["records"]
            )
        )
        proof = validation["resolverOutcome"]["profileMetrics"]["sourceAccounting"]
        self.assertEqual("COMPLETE", proof["status"])
        self.assertTrue(all(value == 0 for value in proof["invariants"].values()))

    def test_missing_position_blocks_without_candidate(self):
        root, ledger, validation = self.compile(source_xml(second_position=None))
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "NODE_POSITION_MISSING")

    def test_restraint_overflow_blocks_before_truncation(self):
        root, ledger, validation = self.compile(
            source_xml(restraints=restraint() * 7)
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "RESTRAINT_CARDINALITY_EXCEEDED")
        self.assertFalse(
            any("TRUNCATED" in str(row) for row in ledger["records"])
        )

    def test_duplicate_node_number_is_not_overwritten(self):
        source = f"<Root>{branch([node('10', '0 0 0'), node('10', '1 0 0')])}</Root>".encode()
        root, ledger, validation = self.compile(source)
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "DUPLICATE_NODE_NUMBER")

    def test_sub_half_millimetre_delta_remains_real_geometry(self):
        root, _, validation = self.compile(source_xml(second_position="0.1 0 0"))
        self.assertEqual("PASS", validation["status"])
        element = root.find("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual("0.1", element.get("DELTA_X"))
        self.assertNotEqual("-1.0101", element.get("DELTA_X"))

    def test_misleading_filename_does_not_select_selectionjson(self):
        _, ledger, validation = self.compile(
            source_xml(),
            source_name="route_seljson_to_inputxml.xml",
        )
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("xml-builder-root-branch-node", ledger["dialect"])

    def test_missing_explicit_document_context_blocks_at_intake(self):
        root, ledger, validation = self.compile(
            source_xml(),
            context={"jobName": "ONLY_JOB"},
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "HIDDEN_DEFAULT_PROHIBITED")

    def test_dtd_blocks_before_topology_engine(self):
        source = b'<!DOCTYPE Root [<!ENTITY x "test">]><Root>&x;</Root>'
        root, ledger, validation = self.compile(source)
        self.assertIsNone(root)
        self.assertEqual("MEDIA_INSPECTION_GATE", validation["blockedAt"])
        self.assert_code(ledger, "XML_MEDIA_PARSE_FAILED")
        self.assertFalse(
            any(
                row["sourceType"] == "STRICT_TOPOLOGY_BRIDGE_PROOF"
                for row in ledger["records"]
            )
        )


if __name__ == "__main__":
    unittest.main()
