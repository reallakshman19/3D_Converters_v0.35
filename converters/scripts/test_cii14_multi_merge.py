#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import unittest
import zipfile

import cii14_multi_merge as merge
import cii14_section_rules as rules14
import cii2019_section_rules as rules11


ARCHIVE = Path(__file__).resolve().parents[2] / "Benchmarks" / "v11-v14.zip"


def _paired_texts() -> tuple[str, str]:
    with zipfile.ZipFile(ARCHIVE) as archive:
        names = archive.namelist()
        v11_name = next(name for name in names if name.lower().endswith("v11.cii"))
        v14_name = next(name for name in names if name.lower().endswith("v14.cii"))
        v11 = archive.read(v11_name).decode("utf-8", errors="replace")
        v14 = archive.read(v14_name).decode("utf-8", errors="replace")
    return v11, v14


def _pointer_values(block: list[str], row_index: int) -> list[int]:
    return [int(round(float(token))) for token in block[row_index].split()]


class TestCii14ProfileAndMerge(unittest.TestCase):
    def test_paired_archive_locks_ver14_record_deltas(self):
        self.assertTrue(ARCHIVE.exists(), f"Missing paired benchmark: {ARCHIVE}")
        v11, v14 = _paired_texts()
        s11 = rules11.parse_section_map(v11)
        s14 = rules14.parse_section_map(v14)
        c11 = rules11.parse_control_counts(s11["CONTROL"])
        c14 = rules14.parse_control_counts(s14["CONTROL"])

        self.assertEqual(rules11.parse_section_order(v11), rules14.parse_section_order(v14))
        self.assertEqual(c11.numelt, 112)
        self.assertEqual(c14.numelt, 112)
        self.assertEqual(len([row for row in s11["ELEMENTS"] if row.strip()]), 112 * 15)
        self.assertEqual(len([row for row in s14["ELEMENTS"] if row.strip()]), 112 * 15)

        self.assertEqual(c11.sif_tees, 2)
        self.assertEqual(c14.sif_tees, 2)
        self.assertEqual(len(s11["SIF&TEES"]), 2 * 10)
        self.assertEqual(len(s14["SIF&TEES"]), 2 * 14)

        self.assertEqual(c11.nored, 1)
        self.assertEqual(c14.nored, 1)
        self.assertEqual(len(s11["REDUCERS"]), 1)
        self.assertEqual(len(s14["REDUCERS"]), 2)

        self.assertEqual(rules11.UNITS_TOTAL_LINES, 28)
        self.assertEqual(rules14.UNITS_TOTAL_LINES, 28)
        self.assertEqual(len(s11["UNITS"]), 28)
        self.assertEqual(len(s14["UNITS"]), 28)
        self.assertEqual(rules14.version_signature(s14["VERSION"])[:2], (5, 14))

    def test_real_ver14_benchmark_self_merge_with_5000_offset(self):
        _v11, v14 = _paired_texts()
        source_sections = rules14.parse_section_map(v14)
        source_control = rules14.parse_control_counts(source_sections["CONTROL"])

        output, summary = merge.merge_cii14_texts(
            [v14, v14], offsets=[0, 5000], labels=["SYS-v14-A", "SYS-v14-B"]
        )
        sections = rules14.parse_section_map(output)
        control = rules14.parse_control_counts(sections["CONTROL"])

        self.assertEqual(summary.profile, "CAESAR-II-CII-VER14/qualified-v1")
        self.assertEqual(summary.elements, 224)
        self.assertEqual(control.numelt, 224)
        self.assertEqual(control.bends, 18)
        self.assertEqual(control.rigids, 86)
        self.assertEqual(control.restraints, 80)
        self.assertEqual(control.sif_tees, 4)
        self.assertEqual(control.nored, 2)
        self.assertEqual(len(sections["SIF&TEES"]), 4 * 14)
        self.assertEqual(len(sections["REDUCERS"]), 2 * 2)

        first_source = source_sections["ELEMENTS"][:15]
        second_copy_first = sections["ELEMENTS"][112 * 15:113 * 15]
        source_from = round(float(merge._field(first_source[0], 0)))
        source_to = round(float(merge._field(first_source[0], 1)))
        self.assertEqual(round(float(merge._field(second_copy_first[0], 0))), source_from + 5000)
        self.assertEqual(round(float(merge._field(second_copy_first[0], 1))), source_to + 5000)

        source_counts = merge._pointer_counts(source_control)
        for row_index, names in merge.POINTER_LAYOUT:
            original = _pointer_values(first_source, row_index)
            actual = _pointer_values(second_copy_first, row_index)
            expected = [value + source_counts[name] if value else 0 for value, name in zip(original, names)]
            self.assertEqual(actual, expected, f"pointer rebase mismatch in ELEMENT row {row_index}")

        if source_control.sif_tees:
            second_sif_start = source_control.sif_tees * rules14.LINES_PER_AUX_BLOCK["SIF&TEES"]
            source_sif_node = round(float(merge._field(source_sections["SIF&TEES"][0], 0)))
            merged_sif_node = round(float(merge._field(sections["SIF&TEES"][second_sif_start], 0)))
            self.assertEqual(merged_sif_node, source_sif_node + 5000)

        validation = rules14.validate_cii14_sections(output)
        self.assertTrue(validation.ok, validation.to_dict())

    def test_cross_version_merge_is_rejected(self):
        v11, v14 = _paired_texts()
        with self.assertRaisesRegex(merge.MergeError, "expected Ver 14 signature|invalid CII Ver 14 structure"):
            merge.merge_cii14_texts([v14, v11], offsets=[0, 5000], labels=["v14", "v11"])

    def test_node_collision_is_rejected_by_default(self):
        _v11, v14 = _paired_texts()
        with self.assertRaisesRegex(merge.MergeError, "node collision"):
            merge.merge_cii14_texts([v14, v14], offsets=[0, 0], labels=["A", "B"])

    def test_unqualified_nonzero_section_fails_closed(self):
        _v11, v14 = _paired_texts()
        sections = rules14.parse_section_map(v14)
        control = rules14.parse_control_counts(sections["CONTROL"])
        guarded = rules14.ControlCounts(
            numelt=control.numelt,
            numnoz=control.numnoz,
            nohgrs=control.nohgrs,
            nonam=control.nonam,
            nored=control.nored,
            numflg=1,
            bends=control.bends,
            rigids=control.rigids,
            expjts=control.expjts,
            restraints=control.restraints,
            displmnt=control.displmnt,
            forcmnt=control.forcmnt,
            uniform=control.uniform,
            wind=control.wind,
            offsets=control.offsets,
            allowbls=control.allowbls,
            sif_tees=control.sif_tees,
            izup=control.izup,
            equipmnt=control.equipmnt,
        )
        sections["CONTROL"] = rules14.format_control_rows(guarded)
        sections["FLANGES"] = ["" for _ in range(rules14.LINES_PER_AUX_BLOCK["FLANGES"])]
        modified = merge._serialize(sections)
        with self.assertRaisesRegex(merge.MergeError, "FLANGES count=1 is not yet independently qualified"):
            merge.merge_cii14_texts([modified, modified], offsets=[0, 5000], labels=["guard-A", "guard-B"])


if __name__ == "__main__":
    unittest.main()
