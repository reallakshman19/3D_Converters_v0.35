#!/usr/bin/env python3
"""Tests for the XML->CII master-enrichment addon (self-contained, no big files)."""
from __future__ import annotations

import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

import xml_to_cii2019_master_addon as ADDON


TINY_XML = """<?xml version="1.0"?>
<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd">
 <Pipe><FullName>/X</FullName>
  <Branch><Branchname>/ASIM-1885-10"-S8810101-91261M7-HC/B1</Branchname>
   <Node><NodeNumber>10</NodeNumber><NodeName>PS-1</NodeName><OutsideDiameter>273</OutsideDiameter><Position>150510.00 42980.00 100003.00</Position></Node>
  </Branch>
  <Branch><Branchname>/ASIM-88-1885-6"-S8810111-91261M7-HC/B1</Branchname>
   <Node><NodeNumber>20</NodeNumber><NodeName>PS-2</NodeName><OutsideDiameter>168.3</OutsideDiameter></Node>
  </Branch>
 </Pipe>
</PipeStressExport>
"""

PCLASS = [
    {"Piping Class": "13421", "convertedBore": 250, "Wall thickness": "9.27", "Corrosion": "1", "Material_Name": "ASTM A106-B", "Rating": "300"},
    {"Piping Class": "13421", "convertedBore": 150, "Wall thickness": "7.11", "Corrosion": "1", "Material_Name": "ASTM A106-B", "Rating": "300"},
]
MATMAP = [{"code": "106", "material": "A106-B"}]
LINELIST = [{"ColumnX1": "S8810101", "pipingClass": "13421", "rating": "150"}]
PROCESS_LINELIST = [{"ColumnX1": "S8810101", "t2": "177.3", "t3": "5"}]
STAGED_JSON = [
    {
        "name": "/ASIM-1885-10\"-S8810101-91261M7-HC/B1",
        "type": "BRANCH",
        "attributes": {"NAME": "/ASIM-1885-10\"-S8810101-91261M7-HC/B1"},
        "children": [
            {
                "name": "SUPPORT PS-1",
                "type": "SUPPORT",
                "attributes": {"NAME": "/PS-1/DATUM", "CMPSTRESSN": "PS-1/DATUM", "POSI": "E 10mm S 20mm U 3mm", "DTXR": "Pipe Rest XRT01"},
            },
            {
                "name": "SUPPORT PS-1.1",
                "type": "SUPPORT",
                "attributes": {"NAME": "/PS-1.1", "CMPSTRESSN": "PS-1.1", "POSI": "E 10mm S 20mm U 3mm", "DTXR": "GUIDE PDO-TYPE-603"},
            },
        ],
    }
]


class TestAddon(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        self.xml = self.d / "m.xml"
        self.xml.write_text(TINY_XML, encoding="utf-8")

    def _enrich(self, overrides=None):
        return ADDON.enrich(self.xml, PCLASS, MATMAP, LINELIST, overrides, None)

    def test_line_key_variants_and_bore(self):
        rows = self._enrich()
        self.assertEqual(rows[0]["lineNoKey"], "S8810101")
        self.assertEqual(rows[0]["bore_mm"], 250)            # 10" -> DN250
        self.assertEqual(rows[1]["lineNoKey"], "S8810111")   # extra-prefix variant
        self.assertEqual(rows[1]["bore_mm"], 150)            # 6" -> DN150

    def test_class_from_linelist_then_class_bore_master(self):
        rows = self._enrich()
        self.assertEqual(rows[0]["pipingClass"], "13421")
        self.assertEqual(rows[0]["class_method"], "linelist")
        self.assertEqual(rows[0]["wallThickness"], "9.27")   # class 13421 + bore 250
        self.assertEqual(rows[0]["corrosion"], "1")

    def test_material_name_to_code_fuzzy(self):
        rows = self._enrich()
        self.assertEqual(rows[0]["materialName"], "ASTM A106-B")
        self.assertEqual(rows[0]["materialCode"], "106")     # fuzzy "A106-B" contains

    def test_material_override_wins(self):
        rows = self._enrich(overrides={"material": {"ASTM A106-B": "X999"}})
        self.assertEqual(rows[0]["materialCode"], "X999")
        self.assertEqual(rows[0]["material_method"], "override")

    def test_ca_sidecar_per_element_and_by_node(self):
        xml = self.d / "elem.xml"
        xml.write_text(
            '<?xml version="1.0"?>'
            '<PipeStressExport xmlns="http://aveva.com/pipeStress116.xsd"><Pipe>'
            '<Branch><Branchname>/ASIM-1885-10"-S8810101-91261M7-HC/B1</Branchname>'
            '<Node><NodeNumber>10</NodeNumber><OutsideDiameter>273</OutsideDiameter></Node>'
            '<Node><NodeNumber>20</NodeNumber><OutsideDiameter>273</OutsideDiameter></Node>'
            '</Branch></Pipe></PipeStressExport>', encoding="utf-8")
        sc = ADDON.build_ca_sidecar(xml, PCLASS, MATMAP, LINELIST, None, None)
        self.assertEqual(sc["schema"], "cii-ca-injection/1.0")
        self.assertEqual(len(sc["elements"]), 1)              # one element (10->20)
        e = sc["elements"][0]
        self.assertEqual((e["from_node"], e["to_node"]), (10, 20))
        self.assertEqual(e["CA4"], "9.27")                    # wall, class 13421 + bore 250
        self.assertEqual(e["CA7"], "1")                       # corrosion
        self.assertEqual(e["CA3"], "106")                     # material code (fuzzy A106-B)
        self.assertEqual(sc["by_node"]["20"]["CA4"], "9.27")  # keyed by to-node for merge

    def test_branch_without_linelist_uses_approx_class(self):
        # S8810111 has no line-list row; class must come from a known-class token
        # (91261M7 is NOT a known class and must be rejected -> stays unresolved).
        rows = self._enrich()
        self.assertIsNone(rows[1]["pipingClass"])
        self.assertTrue(rows[1]["needs_review"])

    def test_process_temperature_and_dtxr_addon_enriches_xml(self):
        enriched = ADDON.enrich_xml_addons(self.xml, PROCESS_LINELIST, None, STAGED_JSON)
        self.assertEqual(enriched["stats"]["temperature2"], 1)
        self.assertEqual(enriched["stats"]["temperature3"], 1)
        self.assertEqual(enriched["stats"]["dtxrPs"], 1)
        self.assertEqual(enriched["stats"]["dtxrPos"], 1)
        root = ET.fromstring(enriched["xmlText"])
        def find_text(local_name):
            for element in root.iter():
                if ADDON._local(element.tag) == local_name:
                    return element.text
            return None
        self.assertEqual(find_text("Temperature2"), "177.3")
        self.assertEqual(find_text("Temperature3"), "5")
        self.assertEqual(find_text("DTXR_PS"), "Pipe Rest XRT01|GUIDE PDO-TYPE-603")
        self.assertEqual(find_text("DTXR_POS"), "Pipe Rest XRT01|GUIDE PDO-TYPE-603")


if __name__ == "__main__":
    unittest.main()
