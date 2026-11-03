import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "inputxml_canonical_compiler.py"
spec = importlib.util.spec_from_file_location("family_profile_compiler", MODULE_PATH)
compiler = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = compiler
spec.loader.exec_module(compiler)

CONTRACTS = ROOT / "contracts" / "inputxml" / "v1"
COUNT_FIELDS = (
    "NUMELT", "NUMNOZ", "NOHGRS", "NUMBEND", "NUMRIGID", "NUMEXPJNT",
    "NUMREST", "NUMFORCMNT", "NUMUNFLOAD", "NUMWIND", "NUMELEOFF",
    "NUMALLOW", "NUMISECT",
)


def count_attributes(**overrides):
    values = {field: 0 for field in COUNT_FIELDS}
    values["NUMELT"] = 1
    values.update(overrides)
    return " ".join(f'{field}="{values[field]}"' for field in COUNT_FIELDS)


def element(attributes, children=""):
    return f"<PIPINGELEMENT {attributes}>{children}</PIPINGELEMENT>"


def full_document(
    elements,
    *,
    version="11.00",
    job="FAMILY",
    counts=None,
    model_extra="",
    root_extra="",
    model_children="",
):
    counts = counts or count_attributes(NUMELT=len(elements))
    return (
        f'<CAESARII xmlns="COADE" VERSION="{version}" XML_TYPE="Input" {root_extra}>'
        f'<PIPINGMODEL xmlns="" JOBNAME="{job}" {counts} '
        f'NORTH_X="0" NORTH_Y="1" NORTH_Z="0" {model_extra}>'
        + "".join(elements)
        + model_children
        + "</PIPINGMODEL></CAESARII>"
    )


def base_attrs(
    *,
    from_node=10,
    to_node=20,
    dx=1,
    dy=0,
    dz=0,
    line_field="LINE_ID",
    line="L1",
    pressure_field="PRESSURE1",
    pressure="10",
    element_id=None,
    dimensions=True,
    coordinates="",
    extra="",
):
    fields = [
        f'FROM_NODE="{from_node}"',
        f'TO_NODE="{to_node}"',
        f'DELTA_X="{dx}"',
        f'DELTA_Y="{dy}"',
        f'DELTA_Z="{dz}"',
        f'{line_field}="{line}"',
    ]
    if element_id is not None:
        fields.append(f'ID="{element_id}"')
    if dimensions:
        fields.extend(['DIAMETER="100"', 'WALL_THICK="5"'])
    if pressure_field:
        fields.append(f'{pressure_field}="{pressure}"')
    if coordinates:
        fields.append(coordinates)
    if extra:
        fields.append(extra)
    return " ".join(fields)


class FamilyProfileTests(unittest.TestCase):
    def compile(self, xml, *, dialect=None, context=None):
        return compiler.compile_document(
            xml.encode("utf-8"),
            source_name="family.xml",
            source_repository="reallaksh19/3D_Converters",
            source_path="tests/family.xml",
            producer="family-profile-test",
            registry_path=CONTRACTS / "inputxml-dialect-registry.json",
            adapter_registry_path=(
                CONTRACTS / "compiler" / "inputxml-compiler-adapters.json"
            ),
            serialization_policy_path=(
                CONTRACTS / "compiler" / "inputxml-deterministic-serialization.json"
            ),
            alias_registry_path=(
                CONTRACTS / "catalogs" / "inputxml-alias-registry.json"
            ),
            canonical_xsd_path=CONTRACTS / "inputxml-canonical-v1.xsd",
            categorized_xsd_path=CONTRACTS / "categorized-inputxml-v3.xsd",
            semantic_rules_path=CONTRACTS / "inputxml-semantic-rules-v1.sch",
            dialect_override=dialect,
            context=context or {},
        )

    def assert_code(self, ledger, code):
        self.assertTrue(
            any(item["code"] == code for item in ledger["diagnostics"]),
            f"missing diagnostic code {code}: {ledger['diagnostics']}",
        )

    def test_incompatible_override_blocks_at_intake(self):
        xml = full_document([element(base_attrs())])
        root, ledger, validation = self.compile(
            xml,
            dialect="caesar-inputxml-pressure-c",
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "PROFILE_SOURCE_MISMATCH")

    def test_pressure1_alias_only_normalizes(self):
        root, ledger, validation = self.compile(
            full_document([element(base_attrs())])
        )
        self.assertEqual("PASS", validation["status"])
        output = root.find("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual("10", output.get("PRESSURE_C1"))
        self.assertIsNone(output.get("PRESSURE1"))
        self.assertTrue(
            any(row["sourceType"] == "ATTRIBUTE_ALIAS" for row in ledger["records"])
        )

    def test_equivalent_canonical_and_alias_values_are_accounted(self):
        attrs = base_attrs(extra='PRESSURE_C1="10.0"')
        root, ledger, validation = self.compile(
            full_document([element(attrs)]),
            dialect="caesar-inputxml-pressure1",
        )
        self.assertEqual("PASS", validation["status"])
        self.assertEqual(
            "10",
            root.find("PIPINGMODEL/PIPINGELEMENT").get("PRESSURE_C1"),
        )
        self.assertTrue(
            any(
                row["sourceType"] == "ATTRIBUTE_ALIAS_EQUIVALENCE"
                for row in ledger["records"]
            )
        )

    def test_conflicting_canonical_and_alias_values_block(self):
        attrs = base_attrs(extra='PRESSURE_C1="11"')
        root, ledger, validation = self.compile(
            full_document([element(attrs)]),
            dialect="caesar-inputxml-pressure1",
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "ALIAS_VALUE_CONFLICT")

    def test_wrong_case_alias_is_not_accepted(self):
        attrs = base_attrs(pressure_field="pressure1", pressure="10")
        root, ledger, validation = self.compile(
            full_document([element(attrs)]),
            dialect="caesar-inputxml-pressure1",
        )
        self.assertIsNotNone(root)
        self.assertEqual("LEDGER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "UNSUPPORTED_ENGINEERING_FIELD")

    def test_geometry_sentinel_blocks(self):
        root, ledger, validation = self.compile(
            full_document([element(base_attrs(dx="-1.0101"))])
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "GEOMETRY_SENTINEL_PROHIBITED")

    def test_contiguous_scope_inherits_and_records_seed(self):
        first = element(base_attrs(from_node=10, to_node=20))
        second = element(
            base_attrs(
                from_node=20,
                to_node=30,
                dimensions=False,
                extra='DIAMETER="-1.0101" WALL_THICK="-1.0101"',
            )
        )
        root, ledger, validation = self.compile(
            full_document([first, second])
        )
        self.assertEqual("PASS", validation["status"])
        rows = root.findall("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual("100", rows[1].get("DIAMETER"))
        inherited = [
            row for row in ledger["records"] if row["sourceType"] == "INHERITED_FIELD"
        ]
        self.assertTrue(inherited)
        self.assertTrue(
            all(row["sourceFields"].get("seedElementId") for row in inherited)
        )

    def test_return_to_same_line_does_not_revive_old_scope(self):
        first = element(base_attrs(from_node=10, to_node=20, line="L1"))
        second = element(base_attrs(from_node=20, to_node=30, line="L2"))
        third = element(
            base_attrs(
                from_node=30,
                to_node=40,
                line="L1",
                dimensions=False,
                extra='DIAMETER="-1.0101" WALL_THICK="-1.0101"',
            )
        )
        root, ledger, validation = self.compile(
            full_document([first, second, third])
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "LINE_SCOPE_SEED_MISSING")

    def test_every_source_count_assertion_is_verified(self):
        base = full_document([element(base_attrs())])
        _, _, validation = self.compile(base)
        self.assertEqual("PASS", validation["status"])
        for field in COUNT_FIELDS:
            with self.subTest(field=field):
                actual = 1 if field == "NUMELT" else 0
                wrong = actual + 1
                modified = base.replace(
                    f'{field}="{actual}"',
                    f'{field}="{wrong}"',
                )
                root, ledger, blocked = self.compile(modified)
                self.assertIsNone(root)
                self.assertEqual("PROFILE_RESOLVER_GATE", blocked["blockedAt"])
                self.assert_code(ledger, "SOURCE_COUNT_MISMATCH")

    def test_repeated_restraints_use_owner_count(self):
        restraint = (
            '<RESTRAINT NUM="{slot}" NODE="10" TYPE="1" STIFFNESS="1" '
            'GAP="0" FRIC_COEF="0" CNODE="0" XCOSINE="1" '
            'YCOSINE="0" ZCOSINE="0"/>'
        )
        children = restraint.format(slot=1) + restraint.format(slot=2)
        xml = full_document(
            [element(base_attrs(), children)],
            counts=count_attributes(NUMELT=1, NUMREST=1),
        )
        root, _, validation = self.compile(xml)
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("1", root.find("PIPINGMODEL").get("NUMREST"))
        self.assertEqual(
            2,
            len(root.findall("PIPINGMODEL/PIPINGELEMENT/RESTRAINT")),
        )

    def test_post_sanitization_identity_collision_blocks(self):
        first = element(base_attrs(element_id="A B", from_node=10, to_node=20))
        second = element(base_attrs(element_id="A_B", from_node=20, to_node=30))
        root, ledger, validation = self.compile(full_document([first, second]))
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "IDENTITY_COLLISION")

    def test_coordinate_delta_agreement_passes(self):
        coordinates = (
            'FROM_X="0" FROM_Y="0" FROM_Z="0" '
            'TO_X="10" TO_Y="0" TO_Z="0"'
        )
        attrs = base_attrs(dx=10, coordinates=coordinates)
        root, _, validation = self.compile(full_document([element(attrs)]))
        self.assertEqual("PASS", validation["status"])
        self.assertEqual(
            "10",
            root.find("PIPINGMODEL/PIPINGELEMENT").get("TO_X"),
        )

    def test_coordinate_delta_conflict_blocks(self):
        coordinates = (
            'FROM_X="0" FROM_Y="0" FROM_Z="0" '
            'TO_X="11" TO_Y="0" TO_Z="0"'
        )
        attrs = base_attrs(dx=10, coordinates=coordinates)
        root, ledger, validation = self.compile(full_document([element(attrs)]))
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "COORDINATE_DELTA_MISMATCH")

    def test_direct_canonical_rejects_context_enrichment(self):
        attrs = base_attrs(
            line_field="LINE",
            pressure_field=None,
            element_id="E1",
        )
        xml = full_document([element(attrs)])
        root, ledger, validation = self.compile(
            xml,
            dialect="canonical-inputxml-v1",
            context={"jobName": "OTHER"},
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "PROFILE_SOURCE_MISMATCH")

    def test_enrichment_evidence_is_preserved_without_override(self):
        attrs = base_attrs(
            line_field="LINE",
            pressure_field="PRESSURE_C1",
            element_id="E1",
        )
        xml = full_document([element(attrs, "<DTXR_POS>evidence</DTXR_POS>")])
        root, ledger, validation = self.compile(xml)
        self.assertEqual("PASS", validation["status"])
        output = root.find("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual("1", output.get("DELTA_X"))
        self.assertTrue(
            any(
                row["sourceEntityId"].endswith("/DTXR_POS")
                and row["disposition"] == "PRESERVE_EXTENSION"
                for row in ledger["records"]
            )
        )

    def test_unknown_engineering_child_is_retained_and_blocks(self):
        attrs = base_attrs(
            line_field="LINE",
            pressure_field="PRESSURE_C1",
            element_id="E1",
        )
        xml = full_document(
            [element(attrs, "<UnknownEngineering VALUE=\"1\"/>")],
        )
        root, ledger, validation = self.compile(
            xml,
            dialect="enriched-inputxml-app",
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "PROFILE_SOURCE_MISMATCH")

    def test_fragment_wrapper_requires_only_direct_elements(self):
        fragment = (
            "<Fragment>"
            + element(base_attrs(line_field="LINE", pressure_field=None))
            + "<Metadata/>"
            + "</Fragment>"
        )
        root, ledger, validation = self.compile(
            fragment,
            context={"version": "11.00", "jobName": "F", "north": [0, 1, 0]},
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "PROFILE_SOURCE_MISMATCH")

    def test_fragment_context_line_is_explicit_and_ledgered(self):
        fragment = element(
            base_attrs(
                line_field="LINE",
                line="",
                pressure_field=None,
            ).replace('LINE=""', "")
        )
        root, ledger, validation = self.compile(
            fragment,
            context={
                "version": "11.00",
                "jobName": "F",
                "north": [0, 1, 0],
                "defaultLine": "L-FRAGMENT",
            },
        )
        self.assertEqual("PASS", validation["status"])
        self.assertEqual(
            "L-FRAGMENT",
            root.find("PIPINGMODEL/PIPINGELEMENT").get("LINE"),
        )
        self.assertTrue(
            any(
                row["sourceEntityId"] == "compiler-context@defaultLine"
                for row in ledger["records"]
            )
        )

    def test_categorized_xsd_failure_blocks_at_intake(self):
        xml = (
            '<CategorizedInputXML schema="categorized-inputxml/v3" '
            'sourceName="x"><Line id="L1"><LineBlock><Branchname>L1</Branchname>'
            '<LineNo>L1</LineNo></LineBlock></Line></CategorizedInputXML>'
        )
        root, ledger, validation = self.compile(
            xml,
            context={"version": "11.00", "jobName": "C", "north": [0, 1, 0]},
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "CATEGORIZED_XSD_FAILED")

    def test_categorized_requires_explicit_job_authority(self):
        xml = categorized_document(delta="1")
        root, ledger, validation = self.compile(
            xml,
            context={"version": "11.00", "north": [0, 1, 0]},
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_INTAKE_GATE", validation["blockedAt"])
        self.assert_code(ledger, "CONTEXT_AUTHORITY_MISSING")

    def test_categorized_overlay_conflict_blocks(self):
        xml = categorized_document(delta="2", original_delta="1")
        root, ledger, validation = self.compile(
            xml,
            context={"version": "11.00", "jobName": "C", "north": [0, 1, 0]},
        )
        self.assertIsNone(root)
        self.assertEqual("PROFILE_RESOLVER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "CATEGORIZED_OVERLAY_CONFLICT")

    def test_cii14_preserves_complete_version_segments(self):
        attrs = base_attrs(
            line_field="LINE",
            pressure_field="PRESSURE_C1",
            element_id="E14",
        )
        root, _, validation = self.compile(
            full_document([element(attrs)], version="14.00.01")
        )
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("14.00.01", root.get("VERSION"))
        self.assertEqual("cii14-inputxml", validation["dialect"])

    def test_diagnostic_sidecar_retains_candidate_and_blocks(self):
        attrs = base_attrs(
            line_field="LINE",
            pressure_field="PRESSURE_C1",
            element_id="E1",
        )
        root, ledger, validation = self.compile(
            full_document([element(attrs)]),
            dialect="xml-to-cii-diagnostic-sidecar",
        )
        self.assertIsNotNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertEqual("LEDGER_GATE", validation["blockedAt"])
        self.assert_code(ledger, "DIAGNOSTIC_RECONCILIATION_REQUIRED")

    def test_source_accounting_complete_is_evidence_backed(self):
        root, ledger, validation = self.compile(
            full_document([element(base_attrs())])
        )
        self.assertIsNotNone(root)
        outcome = validation["resolverOutcome"]
        self.assertEqual("COMPLETE", outcome["sourceAccountingStatus"])
        proof = outcome["profileMetrics"]["sourceAccounting"]
        self.assertEqual("COMPLETE", proof["status"])
        self.assertEqual(proof["inventoryCount"], proof["accountedCount"])
        self.assertTrue(
            any(
                row["sourceType"] == "SOURCE_ACCOUNTING_PROOF"
                for row in ledger["records"]
            )
        )


def categorized_document(*, delta, original_delta=None):
    original_delta_attr = (
        f' DELTA_X="{original_delta}"' if original_delta is not None else ""
    )
    original = (
        f'<PIPINGELEMENT ID="E-CAT" FROM_NODE="10" TO_NODE="20"'
        f'{original_delta_attr}/>'
    )
    escaped = (
        original.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
    return (
        '<CategorizedInputXML schema="categorized-inputxml/v3" sourceName="x">'
        '<Line id="L1"><LineBlock><Branchname>L1</Branchname><LineNo>L1</LineNo>'
        '</LineBlock><Element fromNode="10" toNode="20" elementKey="E-CAT">'
        f'<RouteGeometryBlock><DELTA_X>{delta}</DELTA_X><DELTA_Y>0</DELTA_Y>'
        '<DELTA_Z>0</DELTA_Z></RouteGeometryBlock>'
        '<SectionDimensionBlock><DIAMETER>100</DIAMETER><WALL_THICK>5</WALL_THICK>'
        '</SectionDimensionBlock>'
        f'<OriginalElement>{escaped}</OriginalElement>'
        '</Element></Line></CategorizedInputXML>'
    )


if __name__ == "__main__":
    unittest.main()
