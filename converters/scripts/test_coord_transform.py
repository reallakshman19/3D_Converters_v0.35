#!/usr/bin/env python3
"""Tests for G2 (world datum) + G3 (vertical-axis map) coordinate transform."""
from __future__ import annotations

import copy
import unittest

import stagedjson_to_inputxml as S
from inputxml_bookmark import InputXmlDefaults


class TestAxisMap(unittest.TestCase):
    def test_y_vertical_swaps_y_and_z(self):
        # PDMS (E,N,U) -> CAESAR (E, U, N)
        self.assertEqual(S.map_axes(1, 2, 3, 'Y'), (1, 3, 2))

    def test_z_vertical_is_identity(self):
        self.assertEqual(S.map_axes(1, 2, 3, 'Z'), (1, 2, 3))


class TestTransformCoordinates(unittest.TestCase):
    def _data(self):
        return [{"attributes": {"POS": {"x": 10.0, "y": 20.0, "z": 30.0}},
                 "children": [{"attributes": {"APOS": {"X": 1.0, "Y": 2.0, "Z": 3.0}}}]}]

    def test_axis_map_applied_recursively(self):
        d = self._data()
        S.transform_coordinates(d, InputXmlDefaults(vertical_axis='Y'))
        self.assertEqual(d[0]["attributes"]["POS"], {"x": 10.0, "y": 30.0, "z": 20.0})
        self.assertEqual(d[0]["children"][0]["attributes"]["APOS"],
                         {"X": 1.0, "Y": 3.0, "Z": 2.0})

    def test_datum_added_in_pdms_frame_then_mapped(self):
        d = self._data()
        S.transform_coordinates(
            d, InputXmlDefaults(vertical_axis='Y', datum_u=100000.0))
        # U (=z) gets +100000 in PDMS frame, then U lands on Y.
        self.assertEqual(d[0]["attributes"]["POS"], {"x": 10.0, "y": 100030.0, "z": 20.0})

    def test_identity_when_legacy_and_no_datum(self):
        d = self._data()
        before = copy.deepcopy(d)
        S.transform_coordinates(d, InputXmlDefaults(vertical_axis='Z'))
        self.assertEqual(d, before)

    def test_deltas_are_datum_invariant(self):
        a = {"x": 0.0, "y": 0.0, "z": 0.0}
        b = {"x": 0.0, "y": 0.0, "z": 1000.0}
        d = [{"attributes": {}, "children": [
            {"attributes": {"APOS": dict(a), "LPOS": dict(b)}}]}]
        S.transform_coordinates(d, InputXmlDefaults(vertical_axis='Y', datum_u=5000.0))
        ap = d[0]["children"][0]["attributes"]["APOS"]
        lp = d[0]["children"][0]["attributes"]["LPOS"]
        delta = (lp["x"] - ap["x"], lp["y"] - ap["y"], lp["z"] - ap["z"])
        # Original delta was (0,0,1000); after Y-map it is (0,1000,0); datum cancels.
        self.assertEqual(delta, (0.0, 1000.0, 0.0))


class TestDeriveNorth(unittest.TestCase):
    def test_north_follows_vertical_axis(self):
        self.assertEqual(S.derive_north(InputXmlDefaults(vertical_axis='Y')), ('0', '0', '1'))
        self.assertEqual(S.derive_north(InputXmlDefaults(vertical_axis='Z')), ('0', '1', '0'))

    def test_explicit_north_respected_when_opted_out(self):
        d = InputXmlDefaults(vertical_axis='Y', derive_north_from_axis=False,
                             north_x='0', north_y='1', north_z='0')
        self.assertEqual(S.derive_north(d), ('0', '1', '0'))


if __name__ == "__main__":
    unittest.main()
