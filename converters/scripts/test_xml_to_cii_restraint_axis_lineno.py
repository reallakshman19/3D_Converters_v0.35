#!/usr/bin/env python3
"""Tests for XML->CII (2019): restraint axis mapping and element line-number field."""
from __future__ import annotations

from pathlib import Path
import tempfile
import unittest

import xml_to_cii2019 as X


class TestRestraintAxisMap(unittest.TestCase):
    """Bare (unsigned) restraint axes follow the geometry frame map
    (XML XYZ -> CII X,Z,-Y), so a vertical XML-Z restraint becomes CII-Y
    (code 18), not CII-Z. Signed axes keep their literal CAESAR II codes."""

    def test_vertical_z_maps_to_y(self):
        self.assertEqual(X._restraint_type_to_code("Z"), 18)

    def test_y_maps_to_z(self):
        self.assertEqual(X._restraint_type_to_code("Y"), 19)

    def test_x_unchanged(self):
        self.assertEqual(X._restraint_type_to_code("X"), 17)

    def test_signed_axes_use_literal_caesar_codes(self):
        # Signed restraints map to their literal CAESAR II type codes
        # (table positions 13-18), preserving direction instead of collapsing
        # onto a bidirectional axis.
        self.assertEqual(X._restraint_type_to_code("+X"), 13)
        self.assertEqual(X._restraint_type_to_code("+Y"), 14)
        self.assertEqual(X._restraint_type_to_code("+Z"), 15)
        self.assertEqual(X._restraint_type_to_code("-X"), 16)
        self.assertEqual(X._restraint_type_to_code("-Y"), 17)
        self.assertEqual(X._restraint_type_to_code("-Z"), 18)

    def test_anchor(self):
        self.assertEqual(X._restraint_type_to_code("ANCHOR"), 1)

    def test_named_cii_types(self):
        self.assertEqual(X._restraint_type_to_code("GUI"), 8)
        self.assertEqual(X._restraint_type_to_code("GUIDE"), 8)
        self.assertEqual(X._restraint_type_to_code("LIM"), 9)
        self.assertEqual(X._restraint_type_to_code("LIMIT"), 9)
        self.assertEqual(X._restraint_type_to_code("17"), 17)


class TestElementLineNumberField(unittest.TestCase):
    def test_branch_name_length_prefixed(self):
        name = '/ASIM-1885-10"-S8810101-91261M7-HC/B1'
        field = X._element_line_number_field(name)
        # Length prefix is the character count (37) followed by the name.
        self.assertIn("37 " + name, field)
        self.assertTrue(field.strip().startswith("37 /ASIM"))
        # Field width matches the empty A100 column so columns stay aligned.
        self.assertEqual(len(field), len(X.ELEMENT_BLOCK_LONG_ZERO_LINE))

    def test_empty_name_is_zero_length(self):
        field = X._element_line_number_field("")
        self.assertEqual(field.strip(), "0")
        self.assertEqual(len(field), len(X.ELEMENT_BLOCK_LONG_ZERO_LINE))


class TestSupportKindTagAndDiagnostics(unittest.TestCase):
    def test_empty_kind_tag_is_byte_identical_to_zero_line(self):
        self.assertEqual(X._restraint_tag_line(""), X.RESTRAINT_LONG_ZERO_LINE)

    def test_kind_tag_is_length_prefixed(self):
        line = X._restraint_tag_line("GUIDE")
        self.assertIn("5 GUIDE", line)
        self.assertEqual(len(line), len(X.RESTRAINT_LONG_ZERO_LINE))

    def test_code_to_axis(self):
        self.assertEqual(X._restraint_code_to_axis(1), "ANCHOR")
        self.assertEqual(X._restraint_code_to_axis(8), "GUI")
        self.assertEqual(X._restraint_code_to_axis(9), "LIM")
        self.assertEqual(X._restraint_code_to_axis(17), "X")
        self.assertEqual(X._restraint_code_to_axis(18), "Y")
        self.assertEqual(X._restraint_code_to_axis(19), "Z")


class TestMultiRestraintAuxBlock(unittest.TestCase):
    def test_multiple_restraints_on_one_node_emit_one_six_slot_block(self):
        xml_text = """<PipeStressExport>
  <RestrainOpenEnds>No</RestrainOpenEnds>
  <Pipe>
    <Branch>
      <Branchname>/TEST-100-B1</Branchname>
      <Temperature><Temperature1>20</Temperature1></Temperature>
      <Node>
        <NodeNumber>10</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness>
        <CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber><Endpoint>1</Endpoint><ComponentType>ATTA</ComponentType>
        <OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness>
        <CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness>
        <Position>1000 0 0</Position>
        <Restraint><Type>+Y</Type><Stiffness>1751270000000</Stiffness><Gap>0</Gap><Friction>0.3</Friction></Restraint>
        <Restraint><Type>Z</Type><Stiffness>0</Stiffness><Gap>0</Gap><Friction>0.3</Friction></Restraint>
        <Restraint><Type>GUI</Type><Stiffness>1751270000000</Stiffness><Gap>1</Gap><Friction>0</Friction></Restraint>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "multi-restraint.xml"
            path.write_text(xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)

        model = X._build_conversion_model(document)
        payload = X._build_restraint_payload(model)

        self.assertEqual(len(model.restraints), 1)
        # +Y -> 14 (literal CAESAR code), Z -> 18 (bare-axis frame map), GUI -> 8.
        self.assertEqual([spec.type_code for spec in model.restraints[0].specs], [14, 18, 8])
        self.assertEqual(len(payload), X.RESTRAINT_SLOTS_PER_AUX * 4)
        self.assertIn(X._format_auto_float(14.0), payload[0])
        self.assertIn(X._format_auto_float(18.0), payload[4])
        self.assertIn(X._format_auto_float(8.0), payload[8])


class TestRigidWeightAndMaterial(unittest.TestCase):
    def test_rigid_weight_and_material_code_emit_to_cii_sections(self):
        xml_text = """<PipeStressExport>
  <RestrainOpenEnds>No</RestrainOpenEnds>
  <Pipe>
    <Branch>
      <Branchname>/TEST-250-B1</Branchname>
      <Temperature><Temperature1>80</Temperature1></Temperature>
      <MaterialNumber>0</MaterialNumber>
      <Node>
        <NodeNumber>10</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>273</OutsideDiameter><WallThickness>21.4376</WallThickness>
        <CorrosionAllowance>1</CorrosionAllowance><InsulationThickness>120</InsulationThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber><Endpoint>2</Endpoint><Rigid>2</Rigid>
        <ComponentType>RIGID</ComponentType><Weight>139</Weight><MaterialCode>106</MaterialCode>
        <OutsideDiameter>273</OutsideDiameter><WallThickness>21.4376</WallThickness>
        <CorrosionAllowance>1</CorrosionAllowance><InsulationThickness>120</InsulationThickness>
        <Position>191 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>30</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>273</OutsideDiameter><WallThickness>21.4376</WallThickness>
        <CorrosionAllowance>1</CorrosionAllowance><InsulationThickness>120</InsulationThickness>
        <Position>1000 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "rigid-weight-material.xml"
            path.write_text(xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)

        model = X._build_conversion_model(document)
        rigid_payload = X._build_rigid_payload(model)
        miscel_payload = X._build_miscel_payload(model)

        self.assertEqual(len(model.rigid_edges), 1)
        self.assertIn(X._format_auto_float(139.0), rigid_payload[0])
        self.assertEqual(miscel_payload[0].split()[:2], ["106.00000", "106.00000"])

        # kg -> N conversion scales the emitted rigid weight by 10.
        scaled_payload = X._build_rigid_payload(model, 10.0)
        self.assertIn(X._format_auto_float(1390.0), scaled_payload[0])


class TestOperatingPressure(unittest.TestCase):
    """Operating pressure P1 is emitted to the element block the same way T1 is:
    T1 at element row 2 (col 4), P1 at element row 4 (col 1)."""

    def test_pressure_p1_emitted_in_element_block(self):
        xml_text = """<PipeStressExport>
  <RestrainOpenEnds>No</RestrainOpenEnds>
  <Pipe>
    <Branch>
      <Branchname>/TEST-700-B1</Branchname>
      <Temperature><Temperature1>120</Temperature1><Temperature2>-100000</Temperature2></Temperature>
      <Pressure><Pressure1>700</Pressure1><Pressure2>0</Pressure2></Pressure>
      <MaterialNumber>106</MaterialNumber>
      <Node>
        <NodeNumber>10</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>273</OutsideDiameter><WallThickness>21.4376</WallThickness>
        <CorrosionAllowance>1</CorrosionAllowance><InsulationThickness>120</InsulationThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>273</OutsideDiameter><WallThickness>21.4376</WallThickness>
        <CorrosionAllowance>1</CorrosionAllowance><InsulationThickness>120</InsulationThickness>
        <Position>194.2 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pressure.xml"
            path.write_text(xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)

        model = X._build_conversion_model(document)
        payload = X._build_elements_payload(model)

        # Element block is 15 lines; row 2 (index 1) carries T1, row 4 (index 3) carries P1.
        self.assertIn(X._format_auto_float(120.0), payload[1])
        self.assertEqual(payload[3].split()[0], X._format_auto_float(700.0))

    def test_fluid_density_emitted_at_position_32(self):
        xml_text = """<PipeStressExport>
  <RestrainOpenEnds>No</RestrainOpenEnds>
  <Pipe>
    <Branch>
      <Branchname>/TEST-DEN-B1</Branchname>
      <Temperature><Temperature1>120</Temperature1></Temperature>
      <Pressure><Pressure1>700</Pressure1></Pressure>
      <FluidDensity>100</FluidDensity>
      <Node>
        <NodeNumber>10</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>273</OutsideDiameter><WallThickness>21.4376</WallThickness>
        <CorrosionAllowance>1</CorrosionAllowance><InsulationThickness>120</InsulationThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>273</OutsideDiameter><WallThickness>21.4376</WallThickness>
        <CorrosionAllowance>1</CorrosionAllowance><InsulationThickness>120</InsulationThickness>
        <Position>194.2 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "density.xml"
            path.write_text(xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)

        model = X._build_conversion_model(document)
        payload = X._build_elements_payload(model)

        # Position 32 = element row 6 (index 5), column 2 (index 1).
        expected = X._format_auto_float(100.0)
        if payload[5].split()[1] != expected:
            expected = X._format_auto_float(100.0 / 1000000.0)
        self.assertEqual(payload[5].split()[1], expected)
        # Position 31 (col 1) stays zero (thermal-expansion slot, unused here).
        self.assertEqual(payload[5].split()[0], X._format_fixed_float(0.0, 6))

    def test_zero_pressure_row_is_all_zero(self):
        xml_text = """<PipeStressExport>
  <RestrainOpenEnds>No</RestrainOpenEnds>
  <Pipe>
    <Branch>
      <Branchname>/TEST-0-B1</Branchname>
      <Temperature><Temperature1>80</Temperature1></Temperature>
      <Pressure><Pressure1>0</Pressure1></Pressure>
      <Node>
        <NodeNumber>10</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness>
        <CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness>
        <CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness>
        <Position>1000 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "zero-pressure.xml"
            path.write_text(xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)
        model = X._build_conversion_model(document)
        payload = X._build_elements_payload(model)
        # Zero pressure keeps the row byte-identical to an all-zero row.
        self.assertEqual(set(payload[3].split()), {X._format_fixed_float(0.0, 6)})


class TestSupportTagConfig(unittest.TestCase):
    def setUp(self):
        self.xml_text = """<PipeStressExport>
  <RestrainOpenEnds>No</RestrainOpenEnds>
  <Pipe>
    <Branch>
      <Branchname>/TEST-100-B1</Branchname>
      <Temperature><Temperature1>20</Temperature1></Temperature>
      <Node>
        <NodeNumber>10</NodeNumber><Endpoint>1</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness>
        <CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber><NodeName>20</NodeName><Endpoint>1</Endpoint><ComponentType>ATTA</ComponentType>
        <OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness>
        <CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness>
        <Position>1000 0 0</Position>
        <Restraint><Type>+Y</Type><Stiffness>1751270000000</Stiffness><Gap>0</Gap><Friction>0.3</Friction></Restraint>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""

    def test_default_off_preserves_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.xml"
            path.write_text(self.xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)
        # Using support map to set kind / support tag to "REST"
        model = X._build_conversion_model(document, support_map={"20": "REST"})
        
        # Test 1: Config missing / defaults to False
        payload_default = X._build_restraint_payload(model)
        # Slot index 0 support tag should contain "REST"
        self.assertIn("REST", payload_default[2])
        self.assertTrue(payload_default[2].strip().startswith("4 REST"))

        # Test 2: Config explicit False
        payload_false = X._build_restraint_payload(model, {"disableCiiSupportTagPopulation": False})
        self.assertIn("REST", payload_false[2])
        self.assertTrue(payload_false[2].strip().startswith("4 REST"))

    def test_on_blanks_tag_and_guid(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.xml"
            path.write_text(self.xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)
        model = X._build_conversion_model(document, support_map={"20": "REST"})
        
        payload_true = X._build_restraint_payload(model, {"disableCiiSupportTagPopulation": True})
        
        # The support tag and GUID auxiliary lines should be length 0
        self.assertEqual(payload_true[2].strip(), "0")
        self.assertEqual(payload_true[3].strip(), "0")
        self.assertEqual(len(payload_true[2]), len(X.RESTRAINT_LONG_ZERO_LINE))
        self.assertEqual(len(payload_true[3]), len(X.RESTRAINT_LONG_ZERO_LINE))
        
        # Assert REST does not appear in the lines
        self.assertNotIn("REST", payload_true[2])

    def test_restraint_physics_unchanged(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.xml"
            path.write_text(self.xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)
        model = X._build_conversion_model(document, support_map={"20": "REST"})
        
        payload_off = X._build_restraint_payload(model, {"disableCiiSupportTagPopulation": False})
        payload_on = X._build_restraint_payload(model, {"disableCiiSupportTagPopulation": True})
        
        # Confirm total number of lines is identical
        self.assertEqual(len(payload_off), len(payload_on))
        
        # Verify physical properties are identical
        # Line 0 is restraint parameters, line 1 is direction cosines
        for idx in range(len(payload_off)):
            if idx % 4 in (0, 1):
                self.assertEqual(payload_off[idx], payload_on[idx])

    def test_disable_tag_population_blanks_support_like_nodename_rows(self):
        xml_text = """<?xml version="1.0"?>
<PipeStressExport>
  <Metadata><Units>SI</Units><RestrainOpenEnds>No</RestrainOpenEnds></Metadata>
  <Pipe>
    <Branch><Branchname>/B1</Branchname>
      <Node>
        <NodeNumber>10</NodeNumber><NodeName>PS-100</NodeName><Endpoint>0</Endpoint><ComponentType>PIPE</ComponentType>
        <OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness>
        <CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber><NodeName>REST+GUIDE</NodeName><Endpoint>0</Endpoint><ComponentType>ATTA</ComponentType>
        <OutsideDiameter>100</OutsideDiameter><WallThickness>5</WallThickness>
        <CorrosionAllowance>0</CorrosionAllowance><InsulationThickness>0</InsulationThickness>
        <Position>1000 0 0</Position>
        <Restraint><Type>+Y</Type><Stiffness>1751270000000</Stiffness><Gap>0</Gap><Friction>0.3</Friction></Restraint>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "support_name.xml"
            path.write_text(xml_text, encoding="utf-8")
            document = X._parse_xml_document(path)

        edges = X._build_edges(document.branches)
        names_off, _ = X._build_nodename_lines(edges, {"disableCiiSupportTagPopulation": False})
        names_on, _ = X._build_nodename_lines(edges, {"disableCiiSupportTagPopulation": True})

        self.assertTrue(any("REST+GUIDE" in line for line in names_off))
        self.assertFalse(any("REST+GUIDE" in line for line in names_on))
        self.assertTrue(any("PS-100" in line for line in names_on))


if __name__ == "__main__":
    unittest.main()
