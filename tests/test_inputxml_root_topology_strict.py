import importlib.util
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts.inputxml_compiler import topology_resolver

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location(
    "strict_root_topology_tests",
    MODULE_PATH,
)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)
CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"


def restraint(kind="Restraint", type_value="14"):
    return (
        f"<{kind}><Type>{type_value}</Type><Stiffness>1000</Stiffness>"
        "<Gap>0</Gap><Friction>0.3</Friction>"
        "<DirectionCosineX>0</DirectionCosineX>"
        "<DirectionCosineY>1</DirectionCosineY>"
        "<DirectionCosineZ>0</DirectionCosineZ>"
        f"</{kind}>"
    )


def node(
    number,
    position,
    *,
    component="PIPE",
    diameter="114.3",
    wall="6.02",
    material="106",
    weight="0",
    rigid="0",
    radius="0",
    sif="0",
    connection="",
    restraints="",
    extra="",
):
    position_xml = f"<Position>{position}</Position>" if position is not None else ""
    material_xml = f"<MaterialCode>{material}</MaterialCode>" if material is not None else ""
    diameter_xml = f"<OutsideDiameter>{diameter}</OutsideDiameter>" if diameter is not None else ""
    wall_xml = f"<WallThickness>{wall}</WallThickness>" if wall is not None else ""
    return (
        "<Node>"
        f"<NodeNumber>{number}</NodeNumber><NodeName>N{number}</NodeName>"
        f"<Endpoint>1</Endpoint><Rigid>{rigid}</Rigid>"
        f"<ComponentType>{component}</ComponentType><Weight>{weight}</Weight>"
        f"<ComponentRefNo>C-{number}</ComponentRefNo>"
        f"<ConnectionType>{connection}</ConnectionType>{diameter_xml}{wall_xml}"
        "<CorrosionAllowance>0</CorrosionAllowance>"
        "<InsulationThickness>0</InsulationThickness>"
        f"{position_xml}<BendRadius>{radius}</BendRadius><SIF>{sif}</SIF>"
        f"{material_xml}{extra}{restraints}</Node>"
    )


def branch(
    nodes,
    *,
    line="L1",
    line_id=None,
    name=None,
    material="106",
    pressure="1000",
    temperature="100",
    extra="",
):
    name = line if name is None else name
    material_xml = f"<MaterialNumber>{material}</MaterialNumber>" if material is not None else ""
    line_id_xml = f"<LINE_ID>{line_id}</LINE_ID>" if line_id is not None else ""
    return (
        "<Branch>"
        f"<Branchname>{name}</Branchname><LineNo>{line}</LineNo>{line_id_xml}"
        f"<Pressure><Pressure1>{pressure}</Pressure1>"
        "<HydroPressure>1500</HydroPressure></Pressure>"
        f"<Temperature><Temperature1>{temperature}</Temperature1></Temperature>"
        f"{material_xml}<InsulationDensity>0</InsulationDensity>"
        "<FluidDensity>965</FluidDensity>"
        f"{extra}{''.join(nodes)}</Branch>"
    )


def document(*branches, metadata=""):
    return f"<Root>{metadata}{''.join(branches)}</Root>".encode()


class StrictRootTopologyTests(unittest.TestCase):
    def compile(self, source, *, dialect=None, extra_context=None):
        context = {
            "version": "11.00",
            "jobName": "STRICT_ROOT_TEST",
            "north": [0, 1, 0],
            "fluidDensityScale": "0.000001",
        }
        context.update(extra_context or {})
        return compiler.compile_document(
            source,
            source_name="strict-root.xml",
            source_repository="reallaksh19/3D_Converters",
            source_path="test://strict-root.xml",
            producer="strict-root-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            alias_registry_path=CONTRACTS / "catalogs" / "inputxml-alias-registry.json",
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=dialect,
            context=context,
        )

    def assert_code(self, ledger, code):
        self.assertTrue(
            any(item["code"] == code for item in ledger["diagnostics"]),
            ledger["diagnostics"],
        )

    def basic(self, **second):
        second_position = second.pop("position", "1000 0 0")
        return document(
            branch([node("10", "0 0 0"), node("20", second_position, **second)])
        )

    def test_three_node_route_preserves_two_adjacencies(self):
        source = document(
            branch([
                node("10", "0 0 0"),
                node("20", "1000 0 0"),
                node("30", "1000 1000 0"),
            ])
        )
        root, ledger, validation = self.compile(source)
        self.assertEqual("PASS", validation["status"])
        elements = root.findall("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual(2, len(elements))
        edge_records = [
            row for row in ledger["records"]
            if row["sourceType"] == "TOPOLOGY_EDGE_MAPPING"
        ]
        self.assertEqual(2, len(edge_records))
        self.assertEqual(
            ["10", "20", "30"],
            [elements[0].get("FROM_NODE"), elements[0].get("TO_NODE"), elements[1].get("TO_NODE")],
        )

    def test_invalid_middle_node_does_not_connect_around(self):
        source = document(
            branch([
                node("10", "0 0 0"),
                node("bad", "500 0 0"),
                node("30", "1000 0 0"),
            ])
        )
        root, ledger, validation = self.compile(source)
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "NODE_NUMBER_INVALID")
        self.assertFalse(any(
            row["sourceType"] == "TOPOLOGY_EDGE_MAPPING"
            for row in ledger["records"]
        ))

    def test_branch_display_path_is_separate_from_line_identity(self):
        display = '/ASIM-1836-4"-P8810031-31441C4-PP/B4'
        source = document(
            branch(
                [node("10", "0 0 0"), node("20", "1 0 0")],
                line="P8810031",
                line_id="P8810031",
                name=display,
            )
        )
        root, ledger, validation = self.compile(source)
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("P8810031", root.find("PIPINGMODEL/PIPINGELEMENT").get("LINE"))
        branch_decision = next(
            row for row in ledger["records"]
            if row["sourceType"] == "TOPOLOGY_SOURCE_DECISION"
            and row["sourceEntityId"].endswith("/Branchname[1]")
        )
        self.assertEqual(
            "PRESERVE_BRANCH_DISPLAY_PATH_SEPARATELY",
            branch_decision["sourceFields"]["decisionRule"],
        )

    def test_line_no_and_line_id_conflict_blocks(self):
        source = document(
            branch(
                [node("10", "0 0 0"), node("20", "1 0 0")],
                line="P8810031",
                line_id="OTHER",
                name="/MODEL/B4",
            )
        )
        root, ledger, validation = self.compile(source)
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "BRANCH_IDENTITY_CONFLICT")

    def test_repeated_line_identity_is_legal_and_branch_state_isolated(self):
        source = document(
            branch(
                [
                    node("10", "0 0 0", diameter="114.3"),
                    node("20", "1000 0 0", diameter="114.3"),
                ],
                line="P8810031",
                name="/MODEL/P8810031/B4",
                pressure="1000",
            ),
            branch(
                [
                    node("30", "0 1000 0", diameter="219.1"),
                    node("40", "1000 1000 0", diameter="219.1"),
                ],
                line="P8810031",
                name="/MODEL/P8810031/B5",
                pressure="2000",
            ),
        )
        root, _, validation = self.compile(source)
        self.assertEqual("PASS", validation["status"])
        elements = root.findall("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual(2, len(elements))
        self.assertEqual(["P8810031", "P8810031"], [row.get("LINE") for row in elements])
        self.assertEqual(["1000", "2000"], [row.get("PRESSURE_C1") for row in elements])
        self.assertEqual(["114.3", "219.1"], [row.get("DIAMETER") for row in elements])

    def test_duplicate_branch_display_names_do_not_merge_occurrences(self):
        source = document(
            branch([node("10", "0 0 0"), node("20", "1 0 0")], line="L1", name="/MODEL/SHARED"),
            branch([node("30", "0 10 0"), node("40", "1 10 0")], line="L2", name="/MODEL/SHARED"),
        )
        root, _, validation = self.compile(source)
        self.assertIsNotNone(root)
        self.assertEqual("PASS", validation["status"])

    def test_equal_coordinates_with_distinct_nodes_do_not_merge(self):
        root, ledger, validation = self.compile(self.basic(position="0 0 0"))
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "EDGE_ZERO_LENGTH")
        self.assertFalse(any("COALESC" in item["code"] for item in ledger["diagnostics"]))

    def test_near_coordinates_remain_distinct_without_tolerance(self):
        root, _, validation = self.compile(self.basic(position="0.0001 0 0"))
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("0.0001", root.find("PIPINGMODEL/PIPINGELEMENT").get("DELTA_X"))

    def test_fractional_node_number_blocks(self):
        root, ledger, validation = self.compile(
            document(branch([node("10", "0 0 0"), node("20.5", "1 0 0")]))
        )
        self.assertIsNone(root)
        self.assert_code(ledger, "NODE_NUMBER_INVALID")
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])

    def test_nonfinite_position_blocks(self):
        root, ledger, validation = self.compile(self.basic(position="NaN 0 0"))
        self.assertIsNone(root)
        self.assert_code(ledger, "NODE_POSITION_INVALID")
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])

    def test_missing_branch_state_seed_blocks(self):
        source = document(
            branch([
                node("10", "0 0 0", diameter=None),
                node("20", "1 0 0", diameter=None),
            ])
        )
        root, ledger, validation = self.compile(source)
        self.assertIsNone(root)
        self.assert_code(ledger, "BRANCH_STATE_SEED_MISSING")
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])

    def test_rigid_weight_requires_explicit_unit_scale(self):
        root, ledger, validation = self.compile(
            self.basic(component="RIGID", rigid="1", weight="10")
        )
        self.assertIsNone(root)
        self.assert_code(ledger, "RIGID_WEIGHT_UNIT_UNRESOLVED")
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])

    def test_rigid_with_scale_emits_one_record(self):
        root, _, validation = self.compile(
            self.basic(component="RIGID", rigid="1", weight="10"),
            extra_context={"rigidWeightScale": "1"},
        )
        self.assertEqual("PASS", validation["status"])
        self.assertEqual(1, len(root.findall("PIPINGMODEL/PIPINGELEMENT/RIGID")))

    def test_bend_requires_explicit_radius(self):
        root, ledger, validation = self.compile(self.basic(component="BEND", radius="0"))
        self.assertIsNone(root)
        self.assert_code(ledger, "COMPONENT_PROJECTION_UNRESOLVED")
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])

    def test_tee_without_port_authority_blocks(self):
        root, ledger, validation = self.compile(self.basic(component="TEE", sif="0"))
        self.assertIsNone(root)
        self.assert_code(ledger, "SIF_TYPE_UNRESOLVED")
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])

    def test_gasket_evidence_retains_blocked_candidate(self):
        root, ledger, validation = self.compile(self.basic(component="GASK"))
        self.assertIsNotNone(root)
        self.assertEqual("LEDGER_GATE", validation["blockedAt"])
        self.assertEqual("BLOCKED_WITH_CANDIDATE", validation["resolverOutcome"]["outcomeKind"])
        self.assert_code(ledger, "COMPONENT_PROJECTION_UNRESOLVED")
        records = root.xpath(
            "//ext:Record[@name='UnsupportedComponentEvidence']",
            namespaces={"ext": compiler.EXT_NS},
        )
        self.assertTrue(records)
        self.assertTrue(all(row.get("disposition") == "DEFER_EXPLICITLY" for row in records))

    def test_custom_restraint_is_explicitly_accounted(self):
        root, ledger, validation = self.compile(
            self.basic(restraints=restraint("CustomRestraint"))
        )
        self.assertEqual("PASS", validation["status"])
        self.assertEqual(1, len(root.findall("PIPINGMODEL/PIPINGELEMENT/RESTRAINT")))
        self.assertTrue(any(
            row["sourceType"] == "CUSTOM_RESTRAINT_COMPATIBILITY"
            for row in ledger["records"]
        ))

    def test_unresolved_restraint_type_blocks_before_emission(self):
        root, ledger, validation = self.compile(
            self.basic(restraints=restraint(type_value="UNKNOWN"))
        )
        self.assertIsNone(root)
        self.assert_code(ledger, "RESTRAINT_TYPE_UNRESOLVED")
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])

    def test_source_accounting_uses_only_semantic_decisions(self):
        root, ledger, validation = self.compile(self.basic())
        self.assertEqual("PASS", validation["status"])
        proof = validation["resolverOutcome"]["profileMetrics"]["sourceAccounting"]
        self.assertEqual("TOPOLOGY_SOURCE_DECISION", proof["accountingAuthoritySourceType"])
        self.assertEqual(0, proof["invariants"]["blanketInventoryAuthorityCount"])
        records_by_id = {row["recordId"]: row for row in ledger["records"]}
        indexes = [
            row for row in ledger["records"]
            if row["sourceType"] == "TOPOLOGY_SOURCE_ACCOUNTING_INDEX"
        ]
        self.assertTrue(indexes)
        for row in indexes:
            prior_ids = row["sourceFields"]["priorDecisionRecordIds"]
            self.assertEqual(1, len(prior_ids))
            self.assertEqual("TOPOLOGY_SOURCE_DECISION", records_by_id[prior_ids[0]]["sourceType"])

    def test_blanket_inventory_record_cannot_cover_missing_decision(self):
        original = topology_resolver.record_topology_source_decisions
        missing = "/Root[1]/Branch[1]/Node[2]/Position[1]"

        def incomplete(source, bridge_result, ledger):
            original(source, bridge_result, ledger)
            ledger.records[:] = [
                row for row in ledger.records
                if not (
                    row["sourceType"] == "TOPOLOGY_SOURCE_DECISION"
                    and row["sourceEntityId"] == missing
                )
            ]
            ledger.add(
                source_entity_id=missing,
                source_type="TOPOLOGY_SOURCE_ELEMENT",
                source_fields={"legacyBlanketInventory": True},
                projection_cardinality="1_TO_0",
                disposition="PRESERVE_EXTENSION",
                evidence=["deliberate accounting tamper test"],
            )

        with patch.object(
            topology_resolver,
            "record_topology_source_decisions",
            side_effect=incomplete,
        ):
            root, ledger, validation = self.compile(self.basic())
        self.assertIsNotNone(root)
        self.assertEqual("SOURCE_ACCOUNTING_GATE", validation["blockedAt"])
        proof = validation["resolverOutcome"]["profileMetrics"]["sourceAccounting"]
        self.assertEqual("INCOMPLETE", proof["status"])
        self.assertIn(missing, proof["unaccountedSourceIdentities"])
        self.assertEqual(1, proof["invariants"]["blanketInventoryAuthorityCount"])
        self.assert_code(ledger, "TOPOLOGY_SOURCE_ACCOUNTING_INCOMPLETE")


if __name__ == "__main__":
    unittest.main()
