#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import unittest

import cii2019_multi_merge as merge
import cii2019_section_rules as rules


def _g(values):
    return "  " + "".join(merge._g13(float(value)) for value in values)


def _i(values):
    return "  " + "".join(f"{int(value):13d}" for value in values)


def _element():
    return [
        _g([10, 20, 100, 0, 0, 100]),
        _g([6, 10, 0, 100, 0, 0]),
        _g([0, 0, 0, 0, 0, 0]),
        _g([0, 0, 0, 0, 0, 0]),
        _g([0, 0, 0, 0, 0, 0]),
        _g([0, 0, 0, 0, 0, 0]),
        _g([0, 0, 0, 0, 0, 0]),
        _g([0, 0, 0, 0, 9999.99, 9999.99]),
        _g([0, 0, 0, 0, 0]),
        "           0 ",
        "           0 LINE",
        _i([-1, -1]),
        _i([1, 0, 0, 1, 0, 0]),
        _i([0, 0, 0, 0, 1, 1]),
        _i([0, 0, 0]),
    ]


def _restraint():
    rows = []
    for slot in range(6):
        rows.extend(
            [
                _g([20, 1, 1.7512e12, 0, 0, 10]) if slot == 0 else _g([0, 0, 0, 0, 0, 0]),
                _g([0, 0, 0]),
                "           0 ",
                "           0 ",
            ]
        )
    return rows


def _units(scale=1.0):
    labels = [f"  UNIT-{index}" for index in range(24)]
    return [
        _g([25.4 * scale, 4.44822, 0.453592, 0.112985, 0.112985, 6.89476]),
        _g([0.555556, -17.7778, 6.89476, 6.89476, 0.02768, 0.02768]),
        _g([0.02768, 1.75127, 0.112985, 1.75127, 1, 6.89476]),
        _g([0.0254, 25.4, 25.4, 25.4]),
    ] + labels


def _miscel(with_hanger=False):
    rows = [_g([106])]
    if with_hanger:
        rows.extend(
            [
                _g([1, 25, 0, 9999.99, 1, 1]),
                _i([1, 0, 0, 0, 0]),
                _i([20]),
                _g([0, 25, 0, 0, 0, 0]),
                _g([0, 9999.99, 0, 0, 0]),
                "       4 TAG1",
                "       0 ",
                _i([0, 0, 0, 0]),
                _i([0]),
                _i([1]),
                _i([0]),
                _i([10]),
            ]
        )
    rows.extend(
        [
            _i([0, 0, 0, 2, 0, 0]),
            _i([0, 0, 21, 22, 0, 0]),
            _i([0, 0, 0, 0, 0, 3]),
            _i([0]),
        ]
    )
    return rows


def _fixture(*, with_hanger=False, unit_scale=1.0):
    control = rules.ControlCounts(
        numelt=1,
        numnoz=0,
        nohgrs=1 if with_hanger else 0,
        nonam=1,
        nored=0,
        numflg=0,
        bends=1,
        rigids=0,
        expjts=0,
        restraints=1,
        displmnt=0,
        forcmnt=0,
        uniform=0,
        wind=0,
        offsets=0,
        allowbls=0,
        sif_tees=1,
        izup=0,
        equipmnt=0,
    )
    sections = {name: [] for name in rules.SECTION_ORDER_2019}
    sections["VERSION"] = [_g([5, 11, 1256])] + [" "] * 60
    sections["CONTROL"] = rules.format_control_rows(control)
    sections["ELEMENTS"] = _element()
    sections["NODENAME"] = ["  NODE-10"]
    sections["BEND"] = [_g([100, 0, 45, 10, 0, 20]), _g([0, 0, 0, 5, 0, 0]), _g([0, 0])]
    sections["RESTRANT"] = _restraint()
    sections["SIF&TEES"] = [_g([20, 0, 0, 0, 0, 0])] + [_g([0, 0, 0, 0, 0, 0]) for _ in range(9)]
    sections["MISCEL_1"] = _miscel(with_hanger)
    sections["UNITS"] = _units(unit_scale)
    sections["COORDS"] = [
        _i([2]),
        _i([10]) + "".join(merge._g13(value) for value in (0, 0, 0)),
        _i([20]) + "".join(merge._g13(value) for value in (100, 0, 0)),
    ]
    return merge._serialize(sections)


def _with_fixed_width_coords(text: str) -> str:
    sections = rules.parse_section_map(text)
    # Official CAESAR neutral-file format is (2X,I13,3F13.4).  These X/Y
    # values deliberately fill their 13-character fields so there is no
    # whitespace between them; str.split() therefore cannot parse this row.
    sections["COORDS"] = [
        _i([1]),
        "  " + f"{10:13d}{12345678.0:13.4f}{-1234567.0:13.4f}{0.0:13.4f}",
    ]
    return merge._serialize(sections)


class TestCii2019MultiMerge(unittest.TestCase):
    def test_offset_propagates_and_aux_pointers_rebase(self):
        output, summary = merge.merge_cii_texts(
            [_fixture(), _fixture()], offsets=[0, 5000], labels=["A", "B"]
        )
        sections = rules.parse_section_map(output)
        control = rules.parse_control_counts(sections["CONTROL"])
        self.assertEqual(control.numelt, 2)
        self.assertEqual(control.bends, 2)
        self.assertEqual(control.restraints, 2)
        self.assertEqual(control.sif_tees, 2)
        second = sections["ELEMENTS"][15:30]
        self.assertEqual(round(float(merge._field(second[0], 0))), 5010)
        self.assertEqual(round(float(merge._field(second[0], 1))), 5020)
        self.assertEqual([int(x) for x in second[12].split()], [2, 0, 0, 2, 0, 0])
        self.assertEqual([int(x) for x in second[13].split()], [0, 0, 0, 0, 2, 2])
        self.assertEqual(summary.unique_nodes, 4)

    def test_coords_parse_fortran_fixed_fields_without_whitespace(self):
        fixed = _with_fixed_width_coords(_fixture())
        output, _ = merge.merge_cii_texts(
            [fixed, fixed], offsets=[0, 5000], labels=["fixed-A", "fixed-B"]
        )
        sections = rules.parse_section_map(output)
        self.assertEqual(int(sections["COORDS"][0].split()[0]), 2)
        first_node, first_xyz = merge._coord_record(sections["COORDS"][1], "merged")
        second_node, second_xyz = merge._coord_record(sections["COORDS"][2], "merged")
        self.assertEqual((first_node, second_node), (10, 5010))
        self.assertEqual(first_xyz, (12345678.0, -1234567.0, 0.0))
        self.assertEqual(second_xyz, first_xyz)

    def test_node_collision_fails_closed(self):
        with self.assertRaisesRegex(merge.MergeError, "node collision"):
            merge.merge_cii_texts([_fixture(), _fixture()], offsets=[0, 0])

    def test_unit_mismatch_fails_closed(self):
        with self.assertRaisesRegex(merge.MergeError, "UNITS differ"):
            merge.merge_cii_texts([_fixture(), _fixture(unit_scale=2.0)], offsets=[0, 5000])

    def test_hanger_nodes_are_offset_and_repacked(self):
        output, _ = merge.merge_cii_texts(
            [_fixture(with_hanger=True), _fixture(with_hanger=True)], offsets=[0, 5000]
        )
        sections = rules.parse_section_map(output)
        model = merge.InputModel("merged", 0, sections, rules.parse_control_counts(sections["CONTROL"]))
        parsed = merge._miscel(model)
        self.assertEqual([hanger.node for hanger in parsed.hangers], [20, 5020])
        self.assertEqual([hanger.cnode for hanger in parsed.hangers], [10, 5010])

    def test_real_benchmark_self_merge_maps_10_20_30_to_5010_5020_5030(self):
        benchmark = (
            Path(__file__).resolve().parents[2]
            / "Benchmarks"
            / "INPUT XML to CII 2019"
            / "BM_CII"
            / "BM_CII[Benchmark].CII"
        )
        text = benchmark.read_text(encoding="utf-8", errors="replace")
        output, summary = merge.merge_cii_texts(
            [text, text], offsets=[0, 5000], labels=["benchmark-A", "benchmark-B"]
        )
        sections = rules.parse_section_map(output)
        control = rules.parse_control_counts(sections["CONTROL"])
        self.assertEqual(control.numelt, 80)
        self.assertEqual(control.bends, 14)
        self.assertEqual(control.rigids, 30)
        self.assertEqual(control.restraints, 16)
        self.assertEqual(control.allowbls, 2)
        self.assertEqual(control.sif_tees, 18)
        self.assertEqual(control.nohgrs, 2)
        self.assertEqual(summary.elements, 80)

        second_first = sections["ELEMENTS"][40 * 15 : 41 * 15]
        second_second = sections["ELEMENTS"][41 * 15 : 42 * 15]
        self.assertEqual(round(float(merge._field(second_first[0], 0))), 5010)
        self.assertEqual(round(float(merge._field(second_first[0], 1))), 5020)
        self.assertEqual(round(float(merge._field(second_second[0], 0))), 5020)
        self.assertEqual(round(float(merge._field(second_second[0], 1))), 5030)
        self.assertEqual([int(x) for x in second_first[12].split()], [0, 16, 0, 10, 0, 0])
        self.assertEqual([int(x) for x in second_first[13].split()], [0, 0, 0, 2, 0, 0])

        model = merge.InputModel("merged-benchmark", 0, sections, control)
        parsed = merge._miscel(model)
        self.assertEqual([hanger.node for hanger in parsed.hangers], [205, 5205])
        self.assertEqual(int(sections["COORDS"][0].split()[0]), 2)
        self.assertTrue(rules.validate_cii2019_sections(output).ok)


if __name__ == "__main__":
    unittest.main()