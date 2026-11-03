import unittest

from tests.test_inputxml_pdf_input_echo_support import (
    compile_document,
    context_for,
    line_scope,
    pipe_block,
    report,
    state_lines,
)


def two_line_report(*, second_line_state=None):
    blocks = [
        pipe_block(10, 20, name="A1", state=state_lines()),
        pipe_block(20, 30, axis="DY", length="500", name="A2"),
        pipe_block(
            100,
            110,
            name="B1",
            state=(
                second_line_state
                if second_line_state is not None
                else state_lines(
                    diameter="219.1",
                    wall="8.18",
                    temperature="220",
                    pressure="25",
                    hydro="37.5",
                    material=203,
                    fluid_density="810",
                )
            ),
        ),
        pipe_block(110, 120, axis="DZ", length="750", name="B2"),
    ]
    return report(blocks)


def two_scopes():
    return [
        line_scope("scope-A", "LINE-A", [1, 2]),
        line_scope("scope-B", "LINE-B", [3, 4]),
    ]


class PdfInputEchoLineScopeTests(unittest.TestCase):
    def test_two_lines_have_independent_state_chains(self):
        text = two_line_report()
        root, ledger, validation = compile_document(
            text,
            context=context_for(text, two_scopes()),
        )
        self.assertEqual("PASS", validation["status"])
        elements = root.findall("PIPINGMODEL/PIPINGELEMENT")
        self.assertEqual(["LINE-A", "LINE-A", "LINE-B", "LINE-B"], [
            row.get("LINE") for row in elements
        ])
        self.assertEqual(["114.3", "114.3", "219.1", "219.1"], [
            row.get("DIAMETER") for row in elements
        ])
        self.assertEqual(["1000", "1000", "2500", "2500"], [
            row.get("PRESSURE_C1") for row in elements
        ])
        inherited = [
            row for row in ledger["records"]
            if row["sourceType"] == "PDF_INPUT_ECHO_INHERITANCE"
        ]
        self.assertTrue(all(
            row["sourceFields"]["lineScopeId"]
            == row["sourceFields"]["predecessorLineScopeId"]
            for row in inherited
        ))

    def test_same_numeric_state_on_second_line_must_be_explicit(self):
        text = two_line_report(second_line_state=state_lines())
        root, ledger, validation = compile_document(
            text,
            context=context_for(text, two_scopes()),
        )
        self.assertEqual("PASS", validation["status"])
        self.assertEqual("114.3", root.findall("PIPINGMODEL/PIPINGELEMENT")[2].get("DIAMETER"))
        explicit = [
            row for row in ledger["records"]
            if row["sourceEntityId"] == "PDF-PE-000003@DIAMETER"
        ]
        self.assertEqual(1, len(explicit))
        self.assertEqual("PDF_INPUT_ECHO_EXPLICIT_FIELD", explicit[0]["sourceType"])

    def test_same_line_inheritance_names_exact_predecessor_and_origin(self):
        text = two_line_report()
        _, ledger, validation = compile_document(
            text,
            context=context_for(text, two_scopes()),
        )
        self.assertEqual("PASS", validation["status"])
        record = [
            row for row in ledger["records"]
            if row["sourceEntityId"] == "PDF-PE-000002@DIAMETER"
        ][0]
        fields = record["sourceFields"]
        self.assertEqual("PDF-BLOCK-000001", fields["predecessorBlockId"])
        self.assertEqual("PDF-PE-000001", fields["predecessorElementId"])
        self.assertEqual("PDF-BLOCK-000001", fields["originBlockId"])
        self.assertEqual("scope-A", fields["lineScopeId"])
        self.assertEqual("scope-A", fields["predecessorLineScopeId"])

    def test_optional_state_absence_is_scoped_and_inherited_as_absence(self):
        text = two_line_report()
        _, ledger, validation = compile_document(
            text,
            context=context_for(text, two_scopes()),
        )
        self.assertEqual("PASS", validation["status"])
        first = [
            row for row in ledger["records"]
            if row["sourceEntityId"] == "PDF-PE-000001@POISSONS"
        ][0]
        second = [
            row for row in ledger["records"]
            if row["sourceEntityId"] == "PDF-PE-000002@POISSONS"
        ][0]
        self.assertEqual("PDF_INPUT_ECHO_EXPLICIT_ABSENCE", first["sourceType"])
        self.assertEqual("PDF_INPUT_ECHO_INHERITED_ABSENCE", second["sourceType"])
        self.assertEqual("scope-A", second["sourceFields"]["predecessorLineScopeId"])

    def test_line_id_default_alone_cannot_legalize_unknown_cardinality(self):
        text = two_line_report()
        context = context_for(text, two_scopes())
        context.pop("lineScopes")
        context.update({"lineId": "LINE-A", "defaultLine": "LINE-A"})
        root, _, validation = compile_document(
            text,
            context=context,
            source_name="LINE-A-input-echo.pdf.txt",
        )
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])

    def test_job_name_node_and_coordinates_are_not_line_authority(self):
        text = two_line_report().replace("PDF-STRICT-TEST", "LINE-A")
        context = context_for(text, two_scopes())
        context.pop("lineScopes")
        context.update({
            "lineId": "LINE-A",
            "coordinateAnchors": {"10": [0, 0, 0]},
        })
        root, _, validation = compile_document(text, context=context)
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])

    def test_overlapping_line_scopes_block(self):
        text = two_line_report()
        scopes = [
            line_scope("scope-A", "LINE-A", [1, 2]),
            line_scope("scope-B", "LINE-B", [2, 3, 4]),
        ]
        root, _, validation = compile_document(
            text,
            context=context_for(text, scopes),
        )
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])

    def test_line_scope_gap_blocks(self):
        text = two_line_report()
        scopes = [
            line_scope("scope-A", "LINE-A", [1]),
            line_scope("scope-B", "LINE-B", [3, 4]),
        ]
        root, _, validation = compile_document(
            text,
            context=context_for(text, scopes),
        )
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])

    def test_duplicate_or_reordered_membership_blocks(self):
        text = two_line_report()
        for membership in ([1, 1, 2], [2, 1]):
            with self.subTest(membership=membership):
                scopes = [
                    line_scope("scope-A", "LINE-A", list(membership)),
                    line_scope("scope-B", "LINE-B", [3, 4]),
                ]
                root, _, validation = compile_document(
                    text,
                    context=context_for(text, scopes),
                )
                self.assertIsNone(root)
                self.assertEqual("BLOCKED", validation["status"])

    def test_first_element_of_new_line_cannot_inherit_prior_line(self):
        blocks = [
            pipe_block(10, 20, name="A1", state=state_lines()),
            pipe_block(20, 30, name="A2"),
            pipe_block(100, 110, name="B1"),
        ]
        text = report(blocks)
        scopes = [
            line_scope("scope-A", "LINE-A", [1, 2]),
            line_scope("scope-B", "LINE-B", [3]),
        ]
        root, ledger, validation = compile_document(
            text,
            context=context_for(text, scopes),
        )
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])
        self.assertTrue(any(
            "First element of PDF line scope scope-B" in row["message"]
            for row in ledger["diagnostics"]
        ))

    def test_sentinel_on_line_start_blocks(self):
        bad_state = state_lines(diameter="-1.0101")
        text = report([pipe_block(10, 20, state=bad_state)])
        scopes = [line_scope("scope-A", "LINE-A", [1])]
        root, _, validation = compile_document(
            text,
            context=context_for(text, scopes),
        )
        self.assertIsNone(root)
        self.assertEqual("BLOCKED", validation["status"])

    def test_duplicate_source_field_or_axis_blocks(self):
        duplicate_field = report([
            pipe_block(10, 20, state=[*state_lines(), "Dia= 200 mm."])
        ])
        duplicate_axis = report([
            "\n".join([
                "From 10 To 20 DX= 1000 mm. DX= 2000 mm.",
                "Element Name= DUP-AXIS",
                *state_lines(),
            ])
        ])
        for text in (duplicate_field, duplicate_axis):
            with self.subTest(text=text.splitlines()[5]):
                root, _, validation = compile_document(
                    text,
                    context=context_for(
                        text,
                        [line_scope("scope-A", "LINE-A", [1])],
                    ),
                )
                self.assertIsNone(root)
                self.assertEqual("BLOCKED", validation["status"])


if __name__ == "__main__":
    unittest.main()
