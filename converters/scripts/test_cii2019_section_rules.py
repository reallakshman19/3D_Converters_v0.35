#!/usr/bin/env python3

from __future__ import annotations

import unittest

import cii2019_section_rules


class TestCii2019SectionRules(unittest.TestCase):
    def test_remove_miscel_1_fails(self):
        # A minimal dummy valid file missing MISCEL_1
        cii_text = """#$ VERSION
#$ CONTROL
   10  0  0  0  0  0
   0   0  0  0  0  0
   0   0  0  0  0  0
   0
#$ ELEMENTS
""" + ("0\n" * 150) + """#$ UNITS
""" + ("0\n" * 28)

        report = cii2019_section_rules.validate_cii2019_sections(cii_text)
        self.assertFalse(report.ok)
        self.assertTrue(any(issue.code == "CII2019-MISSING-SECTION" and issue.section == "MISCEL_1" for issue in report.issues))

    def test_move_miscel_1_before_equipmnt_fails(self):
        cii_text = """#$ VERSION
#$ CONTROL
   10  0  0  0  0  0
   0   0  0  0  0  0
   0   0  0  0  0  0
   1
#$ ELEMENTS
""" + ("0\n" * 150) + """#$ MISCEL_1
""" + ("0\n" * 6) + """#$ EQUIPMNT
""" + ("0\n" * 6) + """#$ UNITS
""" + ("0\n" * 28)

        report = cii2019_section_rules.validate_cii2019_sections(cii_text)
        self.assertFalse(report.ok)
        self.assertTrue(any(issue.code == "CII2019-SECTION-ORDER" for issue in report.issues))

    def test_change_control_sif_tees_count_fails(self):
        cii_text = """#$ VERSION
#$ CONTROL
   10  0  0  0  0  0
   0   0  0  0  0  0
   0   0  0  0  1  0
   0
#$ ELEMENTS
""" + ("0\n" * 150) + """#$ SIF&TEES
# missing payload rows
#$ MISCEL_1
""" + ("0\n" * 6) + """#$ UNITS
""" + ("0\n" * 28)

        report = cii2019_section_rules.validate_cii2019_sections(cii_text)
        self.assertFalse(report.ok)
        self.assertTrue(any(issue.code == "CII2019-AUX-ROW-COUNT" and issue.section == "SIF&TEES" for issue in report.issues))

    def test_change_control_equipmnt_count_fails(self):
        cii_text = """#$ VERSION
#$ CONTROL
   10  0  0  0  0  0
   0   0  0  0  0  0
   0   0  0  0  0  0
   1
#$ ELEMENTS
""" + ("0\n" * 150) + """#$ EQUIPMNT
# missing payload rows
#$ MISCEL_1
""" + ("0\n" * 6) + """#$ UNITS
""" + ("0\n" * 28)

        report = cii2019_section_rules.validate_cii2019_sections(cii_text)
        self.assertFalse(report.ok)
        self.assertTrue(any(issue.code == "CII2019-AUX-ROW-COUNT" and issue.section == "EQUIPMNT" for issue in report.issues))

    def test_remove_one_units_row_fails(self):
        cii_text = """#$ VERSION
#$ CONTROL
   10  0  0  0  0  0
   0   0  0  0  0  0
   0   0  0  0  0  0
   0
#$ ELEMENTS
""" + ("0\n" * 150) + """#$ MISCEL_1
""" + ("0\n" * 6) + """#$ UNITS
""" + ("0\n" * 27) # missing 1 row

        report = cii2019_section_rules.validate_cii2019_sections(cii_text)
        self.assertFalse(report.ok)
        self.assertTrue(any(issue.code == "CII2019-UNITS-ROW-COUNT" for issue in report.issues))

    def test_add_one_extra_sif_tees_row_fails(self):
        cii_text = """#$ VERSION
#$ CONTROL
   10  0  0  0  0  0
   0   0  0  0  1  0
   0   0  0  0  1  0
   0
#$ ELEMENTS
""" + ("0\n" * 150) + """#$ SIF&TEES
""" + ("0\n" * 11) + """#$ MISCEL_1
""" + ("0\n" * 6) + """#$ UNITS
""" + ("0\n" * 28)

        report = cii2019_section_rules.validate_cii2019_sections(cii_text)
        self.assertFalse(report.ok)
        self.assertTrue(any(issue.code == "CII2019-AUX-ROW-COUNT" and issue.section == "SIF&TEES" for issue in report.issues))


if __name__ == "__main__":
    unittest.main()
