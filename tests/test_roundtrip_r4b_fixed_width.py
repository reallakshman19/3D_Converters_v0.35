"""R4B: authentic CII writer fixed-width negative adjacency must reparse safely.

No Owner GLRD source bytes or physical engineering mass values are embedded.
"""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'converters'/'scripts'))
from cii2019_reparse_proof import (  # noqa: E402
    ReparseError,_element_first_row_numbers,parse_cii2019,
)


def row():
    # Actual writer geometry field widths: 15, then 5 x 13.
    return ''.join((
        f'{720.0:15.3f}',f'{730.0:13.3f}',f'{-0.01:13.6E}',
        f'{-5.79:13.5f}',f'{-14.65:13.5f}',f'{60.3:13.4f}',
    ))


def fixture(geometry):
    block=[geometry]+['']*11+['0 1 0 0 0 0','0 0 0 0 0 0','0 0 0']
    return '#$ ELEMENTS\n'+'\n'.join(block)+'\n'


class FixedWidthR1Tests(unittest.TestCase):
    def test_tightly_adjacent_negative_real_is_not_one_token(self):
        geometry=row()
        self.assertEqual(len(geometry),80)
        self.assertIn('730.000-1.000000E-02',geometry)
        self.assertEqual(
            _element_first_row_numbers(geometry,'ELEMENT 1'),
            ['720.000','730.000','-1.000000E-02',
             '-5.79000','-14.65000','60.3000'])
        parsed=parse_cii2019(fixture(geometry))
        self.assertEqual(len(parsed['elements']),1)
        self.assertEqual(parsed['elements'][0]['fromNode'],'720')
        self.assertEqual(parsed['elements'][0]['toNode'],'730')
        self.assertEqual(parsed['elements'][0]['pointers']['RIGID'],1)

    def test_short_legacy_spaced_fixture_still_supported(self):
        parsed=parse_cii2019(fixture('10 20 0 0 0 60'))
        self.assertEqual(parsed['elements'][0]['fromNode'],'10')
        self.assertEqual(parsed['elements'][0]['toNode'],'20')

    def test_malformed_fixed_width_rejected_not_heuristically_repaired(self):
        with self.assertRaisesRegex(ReparseError,'invalid writer fixed-width'):
            parse_cii2019(fixture(row().replace('60.3000','BADXYZ!')))
        with self.assertRaisesRegex(ReparseError,'requires 6 geometry'):
            parse_cii2019(fixture('10 20 0'))


if __name__=='__main__':
    unittest.main()
