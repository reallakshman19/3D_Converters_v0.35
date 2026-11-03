from __future__ import annotations

from pathlib import Path
import json
import re
import tempfile
import unittest
import zipfile

import cii_v11_v14 as mod
import cii_v11_v14_validate as structure

REPO_ROOT = Path(__file__).resolve().parents[2]
BENCHMARK_ZIP = REPO_ROOT / "Benchmarks" / "v11-v14.zip"


def _benchmark_pair() -> tuple[bytes, bytes]:
    if not BENCHMARK_ZIP.is_file():
        raise FileNotFoundError(f"Missing benchmark archive: {BENCHMARK_ZIP}")
    with zipfile.ZipFile(BENCHMARK_ZIP) as archive:
        names = archive.namelist()
        v14_name = next(name for name in names if name.lower().endswith("v14.cii"))
        v11_name = next(name for name in names if name.lower().endswith("v11.cii"))
        return archive.read(v14_name), archive.read(v11_name)


def _section_map(data: bytes) -> dict[str, list[str]]:
    return {section.name: section.lines for section in mod.parse_sections(data)}


def _nums(line: str) -> list[float]:
    parsed = mod._extract_numbers(line)
    if parsed is None:
        raise AssertionError(f"Not numeric: {line!r}")
    return parsed[0]


def _fixed_13(line: str, slot: int) -> str:
    start = 2 + slot * 13
    return line[start:start + 13].strip()


def _audit(source: int, target: int) -> mod.Audit:
    return mod.Audit(source_version=source, target_version=target, source_sha256="fixture")


def _six_value_rows(values: list[float], version: int) -> list[str]:
    if len(values) % 6:
        raise AssertionError("fixture values must be divisible by 6")
    return [mod._render_float_row(values[index:index + 6], version) for index in range(0, len(values), 6)]


def _flatten_rows(rows: list[str]) -> list[float]:
    return [value for row in rows for value in _nums(row)]


def _v14_common_tee(seed: float) -> list[float]:
    values = [0.0] * 42
    for field in list(range(1, 19)) + list(range(23, 27)):
        values[field - 1] = seed + field
    # Make the axial/torsional swap impossible to miss.
    values[14] = seed + 1500.0  # Ver14 item 15 = axial SIF
    values[15] = seed + 1600.0  # Ver14 item 16 = torsional SIF
    return values


def _expected_v11_from_v14(source: list[float]) -> list[float]:
    target = [0.0] * 30
    for first, last in ((1, 14), (17, 18), (23, 26)):
        for field in range(first, last + 1):
            target[field - 1] = source[field - 1]
    target[14] = source[15]  # legacy item 15 torsion <- Ver14 item 16
    target[15] = source[14]  # legacy item 16 axial   <- Ver14 item 15
    return target


def _v11_common_tee(seed: float) -> list[float]:
    values = [0.0] * 30
    for field in list(range(1, 19)) + list(range(23, 27)):
        values[field - 1] = seed + field
    values[14] = seed + 1500.0  # legacy item 15 = torsional SIF
    values[15] = seed + 1600.0  # legacy item 16 = axial SIF
    return values


def _expected_v14_from_v11(source: list[float]) -> list[float]:
    target = [0.0] * 42
    for first, last in ((1, 14), (17, 18), (23, 26)):
        for field in range(first, last + 1):
            target[field - 1] = source[field - 1]
    target[14] = source[15]  # Ver14 item 15 axial   <- legacy item 16
    target[15] = source[14]  # Ver14 item 16 torsion <- legacy item 15
    return target


class CiiV11V14BenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.v14, cls.v11 = _benchmark_pair()
        cls.m14 = _section_map(cls.v14)
        cls.m11 = _section_map(cls.v11)

    def test_detect_versions(self) -> None:
        self.assertEqual(mod.detect_version(mod.parse_sections(self.v11)), 11)
        self.assertEqual(mod.detect_version(mod.parse_sections(self.v14)), 14)

    def test_same_version_is_exact_noop(self) -> None:
        self.assertEqual(mod.convert_bytes(self.v11, 11).data, self.v11)
        self.assertEqual(mod.convert_bytes(self.v14, 14).data, self.v14)

    def test_cli_auto_converts_to_opposite_detected_version(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.CII"
            output = root / "output.cii"
            audit = root / "audit.json"
            source.write_bytes(self.v14)
            self.assertEqual(mod.main([str(source), str(output), "--target", "auto", "--audit-json", str(audit)]), 0)
            self.assertEqual(mod.detect_version(mod.parse_sections(output.read_bytes())), 11)
            report = json.loads(audit.read_text(encoding="utf-8"))
            self.assertEqual(report["source_version"], 14)
            self.assertEqual(report["target_version"], 11)

    def test_v14_to_v11_matches_target_record_shape(self) -> None:
        result = mod.convert_bytes(self.v14, 11)
        data = result.data
        converted = _section_map(data)
        self.assertEqual(len(data), len(self.v11))
        self.assertNotIn(b"\r\n", data)
        self.assertTrue(data.startswith(b"#$ VERSION\n"))
        for name in self.m11:
            self.assertEqual(len(converted[name]), len(self.m11[name]), name)
            self.assertEqual(
                [len(line) for line in converted[name]],
                [len(line) for line in self.m11[name]],
                name,
            )
        self.assertEqual(converted["VERSION"][0], self.m11["VERSION"][0])
        self.assertEqual(converted["UNITS"], self.m11["UNITS"])
        got = _nums(converted["ELEMENTS"][1])
        expected = _nums(self.m14["ELEMENTS"][1])
        self.assertEqual(got[3], expected[3])
        for actual, source in zip(got, expected):
            self.assertLessEqual(abs(actual - source), max(1e-6, abs(source) * 6e-6))

    def test_generated_v11_passes_independent_structure_gate(self) -> None:
        result = mod.convert_bytes(self.v14, 11)
        structure.validate_v11_text(result.data.decode("utf-8"), phase="test-generated")

    def test_miscel_1_mixed_fortran_fields_are_not_float_coerced(self) -> None:
        source = self.m14["MISCEL_1"]
        self.assertGreaterEqual(len(source), 4)

        # Reproduce the actual structural corruption: one G13.6 value causes the
        # old generic REAL renderer to rewrite neighboring I13 integer fields.
        generic = mod._generic_numeric_convert(source[-4], 11)
        self.assertIn(".", _fixed_13(generic, 0))

        converted = _section_map(mod.convert_bytes(self.v14, 11).data)["MISCEL_1"]
        self.assertEqual(converted, source)

        # Paired benchmark execution-option rows use mixed FORTRAN fields.  The
        # integer slots must remain lexical integers, not 0.000000/2.00000.
        integer_slots = (
            (0, 1, 2, 3, 5),
            (0, 4, 5),
            (0, 1, 2, 3, 5),
        )
        for row, slots in zip(converted[-4:-1], integer_slots):
            for slot in slots:
                self.assertRegex(_fixed_13(row, slot), r"^[+-]?\d+$")
        self.assertRegex(_fixed_13(converted[-1], 0), r"^[+-]?\d+$")

        upgraded = _section_map(mod.convert_bytes(self.v11, 14).data)["MISCEL_1"]
        self.assertEqual(upgraded, self.m11["MISCEL_1"])

    def test_v11_to_v14_matches_target_record_shape(self) -> None:
        result = mod.convert_bytes(self.v11, 14)
        data = result.data
        converted = _section_map(data)
        self.assertEqual(len(data), len(self.v14))
        self.assertIsNone(re.search(br"(?<!\r)\n", data))
        self.assertTrue(data.startswith(b"#$ VERSION \r\n"))
        for name in self.m14:
            self.assertEqual(len(converted[name]), len(self.m14[name]), name)
            self.assertEqual(
                [len(line) for line in converted[name]],
                [len(line) for line in self.m14[name]],
                name,
            )
        self.assertEqual(converted["VERSION"][0], self.m14["VERSION"][0])
        self.assertEqual(converted["UNITS"], self.m14["UNITS"])
        sif = converted["SIF&TEES"]
        for base in range(0, len(sif), 14):
            # Ver14-only portions of each semantic tee slot are zero on upgrade.
            tee1 = _flatten_rows(sif[base:base + 7])
            tee2 = _flatten_rows(sif[base + 7:base + 14])
            self.assertTrue(all(abs(value) < 1e-12 for value in tee1[26:]))
            self.assertTrue(all(abs(value) < 1e-12 for value in tee2[26:]))
        reducers = converted["REDUCERS"]
        for base in range(0, len(reducers), 2):
            self.assertTrue(mod._row_is_all_zero(reducers[base + 1]))

    def test_restraint_sentinel_mapping(self) -> None:
        to11 = _section_map(mod.convert_bytes(self.v14, 11).data)["RESTRANT"]
        to14 = _section_map(mod.convert_bytes(self.v11, 14).data)["RESTRANT"]
        source14_first = _nums(self.m14["RESTRANT"][0])
        source11_first = _nums(self.m11["RESTRANT"][0])
        if abs(source14_first[0]) < 1e-9:
            self.assertTrue(mod._close_to(_nums(to11[0])[2], mod._V11_DEFAULT_STIFFNESS))
        if abs(source11_first[0]) < 1e-9:
            self.assertAlmostEqual(_nums(to14[0])[2], 0.0)

    def test_sif_downgrade_maps_both_tee_slots_by_semantics(self) -> None:
        tee1 = _v14_common_tee(1000.0)
        tee2 = _v14_common_tee(5000.0)
        rows = _six_value_rows(tee1 + tee2, 14)
        audit = _audit(14, 11)
        converted = mod._convert_sif_tees(rows, 14, 11, False, audit)
        self.assertEqual(len(converted), 10)
        got = _flatten_rows(converted)
        self.assertEqual(got[:30], _expected_v11_from_v14(tee1))
        self.assertEqual(got[30:], _expected_v11_from_v14(tee2))
        self.assertEqual(audit.loss_events, [])

    def test_sif_downgrade_swaps_axial_and_torsional_fields(self) -> None:
        tee1 = _v14_common_tee(0.0)
        tee2 = _v14_common_tee(100.0)
        converted = mod._convert_sif_tees(_six_value_rows(tee1 + tee2, 14), 14, 11, False, _audit(14, 11))
        first = _flatten_rows(converted[:5])
        self.assertEqual(first[14], tee1[15])
        self.assertEqual(first[15], tee1[14])

    def test_sif_upgrade_maps_both_tee_slots_by_semantics(self) -> None:
        tee1 = _v11_common_tee(1000.0)
        tee2 = _v11_common_tee(5000.0)
        rows = _six_value_rows(tee1 + tee2, 11)
        converted = mod._convert_sif_tees(rows, 11, 14, False, _audit(11, 14))
        self.assertEqual(len(converted), 14)
        got = _flatten_rows(converted)
        self.assertEqual(got[:42], _expected_v14_from_v11(tee1))
        self.assertEqual(got[42:], _expected_v14_from_v11(tee2))

    def test_sif_upgrade_rejects_ambiguous_legacy_only_fields(self) -> None:
        tee1 = _v11_common_tee(0.0)
        tee2 = _v11_common_tee(100.0)
        tee1[18] = 9.0  # legacy item 19 has no qualified Ver14 semantic mapping
        with self.assertRaisesRegex(mod.CiiConversionError, r"items 19"):
            mod._convert_sif_tees(_six_value_rows(tee1 + tee2, 11), 11, 14, False, _audit(11, 14))

    def test_nonzero_v14_sif_extension_fails_closed(self) -> None:
        sections = [mod.Section(s.name, list(s.lines)) for s in mod.parse_sections(self.v14)]
        sif = next(section for section in sections if section.name == "SIF&TEES")
        # Row 6 contains Ver14 items 31-36 of tee #1.
        sif.lines[5] = mod._render_float_row([1.0, 0, 0, 0, 0, 0], 14)
        bad = mod._serialize(sections, 14)
        with self.assertRaises(mod.CiiConversionError):
            mod.convert_bytes(bad, 11)
        lossy = mod.convert_bytes(bad, 11, allow_lossy=True)
        self.assertGreaterEqual(len(lossy.audit.loss_events), 1)
        self.assertTrue(any("SIF&TEES" in event for event in lossy.audit.loss_events))

    def test_nonzero_v14_surface_node_requires_loss_opt_in(self) -> None:
        tee1 = _v14_common_tee(0.0)
        tee2 = _v14_common_tee(100.0)
        tee1[26] = 777.0  # Ver14 item 27 = B31J surface node
        rows = _six_value_rows(tee1 + tee2, 14)
        with self.assertRaisesRegex(mod.CiiConversionError, r"items 27"):
            mod._convert_sif_tees(rows, 14, 11, False, _audit(14, 11))
        audit = _audit(14, 11)
        converted = mod._convert_sif_tees(rows, 14, 11, True, audit)
        self.assertEqual(len(converted), 10)
        self.assertEqual(len(audit.loss_events), 1)
        self.assertIn("items 27", audit.loss_events[0])

    def test_allowables_28_to_26_preserves_first_153_values(self) -> None:
        legacy_values = [float(index) for index in range(1, 154)]
        source_values = legacy_values + [0.0] * 15
        rows = _six_value_rows(source_values, 14)
        audit = _audit(14, 11)
        converted = mod._convert_allowables(rows, 14, 11, False, audit)
        self.assertEqual(len(converted), 26)
        flattened = [value for row in converted for value in _nums(row)]
        self.assertEqual(flattened, legacy_values)
        self.assertEqual(audit.loss_events, [])

    def test_nonzero_v14_allowables_extension_requires_loss_opt_in(self) -> None:
        values = [0.0] * 168
        values[153] = 7.0  # Item 154: outside the 153-value v11 array.
        rows = _six_value_rows(values, 14)
        with self.assertRaises(mod.CiiConversionError):
            mod._convert_allowables(rows, 14, 11, False, _audit(14, 11))
        audit = _audit(14, 11)
        converted = mod._convert_allowables(rows, 14, 11, True, audit)
        self.assertEqual(len(converted), 26)
        self.assertEqual(len(audit.loss_events), 1)
        self.assertIn("154-168", audit.loss_events[0])

    def test_v11_allowables_upgrade_places_extension_after_item_153(self) -> None:
        values = [float(index) for index in range(1, 154)]
        rows = [mod._render_float_row(values[index:index + 6], 11) for index in range(0, 153, 6)]
        audit = _audit(11, 14)
        converted = mod._convert_allowables(rows, 11, 14, False, audit)
        self.assertEqual(len(converted), 28)
        flattened = [value for row in converted for value in _nums(row)]
        self.assertEqual(flattened[:153], values)
        self.assertTrue(all(abs(value) < 1e-12 for value in flattened[153:]))

    def test_nonzero_v14_reducer_extension_fails_closed(self) -> None:
        sections = [mod.Section(s.name, list(s.lines)) for s in mod.parse_sections(self.v14)]
        reducers = next(section for section in sections if section.name == "REDUCERS")
        reducers.lines[1] = mod._render_float_row([0, 0, 0, 2.0, 0], 14)
        bad = mod._serialize(sections, 14)
        with self.assertRaises(mod.CiiConversionError):
            mod.convert_bytes(bad, 11)

    def test_source_v14_structure_gate_rejects_truncated_sif_record(self) -> None:
        sections = [mod.Section(s.name, list(s.lines)) for s in mod.parse_sections(self.v14)]
        sif = next(section for section in sections if section.name == "SIF&TEES")
        if not sif.lines:
            self.skipTest("paired benchmark has no SIF records")
        sif.lines.pop()
        malformed = mod._serialize(sections, 14)
        with self.assertRaisesRegex(mod.CiiConversionError, r"SIF&TEES"):
            mod.convert_bytes(malformed, 11, allow_lossy=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)