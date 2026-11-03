#!/usr/bin/env python3
"""Integration test: StagedJSON -> InputXML -> CII restores supports (G4),
node names (G5), and process-data enrichment values used by XML->CII(2019)
and InputXML->CII(2019).

Uses tiny, self-authored models (no external/benchmark data). The support kind
and node name are real attributes on the model, exercising the configurable
classification + NODENAME emission end-to-end. The process-data cases lock the
line-list enrichment contract: branch token position 4 -> S8810101 -> process
values must be present before CII generation.
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import inputxml_to_cii2019 as inputxml2019
import xml_to_cii2019 as xml2019


def _staged_model():
    # One 3000mm run in +X with a rest shoe support at mid-span carrying a
    # stress node name. Two flanges give the run finite endpoints.
    return [{
        "name": "/CHAIN/B1", "type": "BRANCH", "bore": "150mm",
        "attributes": {"HBOR": "150mm"},
        "children": [
            {"type": "PIPE", "attributes": {
                "APOS": {"x": 0, "y": 0, "z": 0},
                "LPOS": {"x": 3000, "y": 0, "z": 0}, "HBOR": "150mm"}},
            {"type": "SUPPORT", "attributes": {
                "CMPSUPTYPE": "SH-150", "CMPSTRESSN": "PS-9001.1",
                "POS": {"x": 1500, "y": 0, "z": 0}}},
        ],
    }]


def _psi_xml_with_process_values() -> str:
    return '''<PipeStressExport>
  <DateTime>13:40:45 6 May 2026</DateTime>
  <Source>unit-test</Source>
  <Version>3.1.7</Version>
  <UserName>test</UserName>
  <Purpose>process enrichment regression</Purpose>
  <ProjectName>XML_CII_PROCESS</ProjectName>
  <MDBName>/UT</MDBName>
  <RestrainOpenEnds>No</RestrainOpenEnds>
  <AmbientTemperature>21</AmbientTemperature>
  <Pipe>
    <Branch>
      <Branchname>/ASIM-1885-10&quot;-S8810101-91261M7-HC/B1</Branchname>
      <PipelineReference>S8810101</PipelineReference>
      <LineNo>S8810101</LineNo>
      <Temperature>
        <Temperature1>155.5</Temperature1>
        <Temperature2>244.4</Temperature2>
        <Temperature3>-29.9</Temperature3>
      </Temperature>
      <Pressure>
        <Pressure1>987.65</Pressure1>
      </Pressure>
      <FluidDensity>56.78</FluidDensity>
      <Node>
        <NodeNumber>10</NodeNumber>
        <NodeName>N10</NodeName>
        <Endpoint>1</Endpoint>
        <ComponentType>PIPE</ComponentType>
        <Weight>0</Weight>
        <OutsideDiameter>273</OutsideDiameter>
        <WallThickness>9.27</WallThickness>
        <CorrosionAllowance>3</CorrosionAllowance>
        <InsulationThickness>12.5</InsulationThickness>
        <Position>0 0 0</Position>
      </Node>
      <Node>
        <NodeNumber>20</NodeNumber>
        <NodeName>N20</NodeName>
        <Endpoint>1</Endpoint>
        <ComponentType>PIPE</ComponentType>
        <Weight>0</Weight>
        <OutsideDiameter>273</OutsideDiameter>
        <WallThickness>9.27</WallThickness>
        <CorrosionAllowance>3</CorrosionAllowance>
        <InsulationThickness>12.5</InsulationThickness>
        <Position>3000 0 0</Position>
      </Node>
    </Branch>
  </Pipe>
</PipeStressExport>'''


def _inject_enriched_inputxml_process_values(path: Path) -> None:
    tree = ET.parse(path)
    root = tree.getroot()
    elements = list(root.iter('PIPINGELEMENT'))
    if not elements:
        raise AssertionError('generated InputXML has no PIPINGELEMENT')
    first = elements[0]
    first.attrib.update({
        'TEMP_EXP_C1': '155.500000',
        'TEMP_EXP_C2': '244.400000',
        'TEMP_EXP_C3': '-29.900000',
        'PRESSURE1': '987.650000',
        'HYDRO_PRESSURE': '1234.500000',
        'INSUL_THICK': '12.500000',
        'FLUID_DENSITY': '56.780000',
    })
    tree.write(path, encoding='utf-8', xml_declaration=False)


def _inputxml_defaults() -> inputxml2019.ConverterDefaults:
    return inputxml2019.ConverterDefaults(
        diameter=0.0,
        wall_thickness=0.01,
        insulation_thickness=0.0,
        corrosion_allowance=0.0,
        temperature1=0.0,
        temperature2=0.0,
        temperature3=0.0,
        pressure1=0.0,
        pressure2=0.0,
        pressure3=0.0,
        reducer_angle=0.0,
    )


class TestChainG4G5(unittest.TestCase):
    def test_supports_and_nodenames_reach_cii(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            staged = d / "model.json"
            staged.write_text(json.dumps(_staged_model()), encoding="utf-8")
            inputxml = d / "model.xml"
            cii = d / "model.cii"

            r1 = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "stagedjson_to_inputxml.py"),
                 "--input", str(staged), "--output", str(inputxml)],
                capture_output=True, text=True)
            self.assertEqual(r1.returncode, 0, r1.stderr)
            xml_text = inputxml.read_text(encoding="utf-8")
            # G4: a restraint reached the InputXML.
            self.assertIn("<RESTRAINT", xml_text)
            # G5: the stress node name was carried on an element.
            self.assertIn("PS-9001.1", xml_text)

            r2 = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "inputxml_to_cii2019.py"),
                 "--input", str(inputxml), "--output", str(cii)],
                capture_output=True, text=True)
            self.assertEqual(r2.returncode, 0, r2.stderr)
            cii_text = cii.read_text(encoding="utf-8")
            # G5: NODENAME section present and carries the real support name.
            self.assertIn("#$ NODENAME", cii_text)
            self.assertIn("PS-9001.1", cii_text)
            # G4: a populated RESTRANT section exists.
            self.assertIn("#$ RESTRANT", cii_text)

    def test_xml_to_cii2019_process_values_reach_cii(self):
        """XML->CII(2019): enriched branch values must be parsed and emitted.

        This covers the normal XML path after line-list match on Branchname token
        position 4, e.g. /ASIM-1885-10\"-S8810101-... -> S8810101.
        """
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            xml_path = d / "enriched.xml"
            cii_path = d / "enriched.cii"
            xml_path.write_text(_psi_xml_with_process_values(), encoding="utf-8")

            doc = xml2019._parse_xml_document(xml_path)
            self.assertEqual(doc.branches[0].branch_name, '/ASIM-1885-10"-S8810101-91261M7-HC/B1')
            self.assertEqual(doc.branches[0].branch_temperature, 155.5)
            self.assertEqual(doc.branches[0].branch_pressure, 987.65)
            self.assertEqual(doc.branches[0].branch_fluid_density, 56.78)
            self.assertEqual(doc.branches[0].nodes[1].insulation_thickness, 12.5)

            r = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "xml_to_cii2019.py"),
                 "--input", str(xml_path), "--output", str(cii_path)],
                capture_output=True, text=True)
            self.assertEqual(r.returncode, 0, r.stderr)
            cii_text = cii_path.read_text(encoding="utf-8")
            self.assertIn('S8810101', cii_text)
            self.assertIn('155.500', cii_text)
            self.assertIn('987.650', cii_text)
            self.assertIn('56.7800', cii_text)
            self.assertIn('12.5000', cii_text)

    def test_inputxml_to_cii2019_enriched_inputxml_values_are_preserved(self):
        """InputXML->CII(2019): enriched InputXML must keep mapped process values.

        This locks the companion path to the XML enrichment path. It verifies the
        enriched InputXML payload carries P1/T1/T2/T3/hydro/insulation/density,
        and verifies the current InputXML parser/renderer consumes the supported
        stress fields before CII generation.
        """
        with tempfile.TemporaryDirectory() as d:
            d = Path(d)
            staged = d / "model.json"
            staged.write_text(json.dumps(_staged_model()), encoding="utf-8")
            inputxml = d / "enriched_inputxml.xml"
            cii = d / "enriched_inputxml.cii"

            r1 = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "stagedjson_to_inputxml.py"),
                 "--input", str(staged), "--output", str(inputxml)],
                capture_output=True, text=True)
            self.assertEqual(r1.returncode, 0, r1.stderr)
            _inject_enriched_inputxml_process_values(inputxml)
            enriched_inputxml_text = inputxml.read_text(encoding="utf-8")
            for expected in (
                'TEMP_EXP_C1="155.500000"',
                'TEMP_EXP_C2="244.400000"',
                'TEMP_EXP_C3="-29.900000"',
                'PRESSURE1="987.650000"',
                'HYDRO_PRESSURE="1234.500000"',
                'INSUL_THICK="12.500000"',
                'FLUID_DENSITY="56.780000"',
            ):
                self.assertIn(expected, enriched_inputxml_text)

            parsed = inputxml2019._parse_model(inputxml, _inputxml_defaults())
            self.assertEqual(parsed.elements[0].temperature1, 155.5)
            self.assertEqual(parsed.elements[0].temperature2, 244.4)
            self.assertEqual(parsed.elements[0].temperature3, -29.9)
            self.assertEqual(parsed.elements[0].insulation_thickness, 12.5)

            r2 = subprocess.run(
                [sys.executable, str(SCRIPT_DIR / "inputxml_to_cii2019.py"),
                 "--input", str(inputxml), "--output", str(cii)],
                capture_output=True, text=True)
            self.assertEqual(r2.returncode, 0, r2.stderr)
            cii_text = cii.read_text(encoding="utf-8")
            self.assertIn('155.500', cii_text)
            self.assertIn('244.400', cii_text)
            self.assertIn('-29.900', cii_text)
            self.assertIn('12.5000', cii_text)


if __name__ == "__main__":
    unittest.main()
