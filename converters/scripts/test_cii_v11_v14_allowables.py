from __future__ import annotations

import unittest

import cii_v11_v14 as mod
from cii_v11_v14_format import Audit, CiiConversionError, _extract_numbers


def _audit(source: int, target: int) -> Audit:
    return Audit(source_version=source, target_version=target, source_sha256="allowbls-fixture")


def _rows(values: list[float | None], version: int) -> list[str]:
    return [
        mod._render_allowable_g13_6_row(values[index:index + 6], version)
        for index in range(0, len(values), 6)
    ]


class AllowablesFixedFieldTests(unittest.TestCase):
    def test_blank_v14_g13_field_does_not_shift_following_items(self) -> None:
        values: list[float | None] = [0.0] * mod.ALLOWABLE_VALUES_V14
        values[0] = 111.0
        values[1] = 222.0
        values[2] = None  # item 3 is a physical blank G13.6 slot
        values[3] = 444.0
        values[4] = 555.0
        values[5] = 666.0
        rows = _rows(values, 14)

        # This is the production failure mode: regex token counting sees five
        # values although the fixed record still contains six logical item slots.
        parsed_regex = _extract_numbers(rows[0])
        self.assertIsNotNone(parsed_regex)
        self.assertEqual(len(parsed_regex[0]), 5)

        audit = _audit(14, 11)
        converted = mod._convert_allowables(rows, 14, 11, False, audit)
        self.assertEqual(len(converted), 26)

        legacy, blanks = mod._parse_allowable_record(converted, source=11, record_index=1)
        self.assertEqual(len(legacy), mod.ALLOWABLE_VALUES_V11)
        self.assertEqual(legacy[0], 111.0)
        self.assertEqual(legacy[1], 222.0)
        self.assertIsNone(legacy[2])
        self.assertEqual(legacy[3], 444.0)
        self.assertEqual(legacy[4], 555.0)
        self.assertEqual(legacy[5], 666.0)
        self.assertIn(3, blanks)
        self.assertTrue(any("blank fixed field" in warning for warning in audit.warnings))

    def test_internal_blank_slot_parser_returns_six_positions(self) -> None:
        line = mod._render_allowable_g13_6_row([1.0, None, 3.0, 4.0, 5.0, 6.0], 14)
        slots = mod._parse_allowable_g13_6_row(line, record_index=1, row_index=1)
        self.assertEqual(len(slots), 6)
        self.assertEqual(slots[0], 1.0)
        self.assertIsNone(slots[1])
        self.assertEqual(slots[2], 3.0)

    def test_nonzero_v14_extension_remains_fail_closed(self) -> None:
        values: list[float | None] = [0.0] * mod.ALLOWABLE_VALUES_V14
        values[153] = 7.0  # item 154 has no v11 storage
        rows = _rows(values, 14)
        with self.assertRaisesRegex(CiiConversionError, r"154"):
            mod._convert_allowables(rows, 14, 11, False, _audit(14, 11))

        audit = _audit(14, 11)
        converted = mod._convert_allowables(rows, 14, 11, True, audit)
        self.assertEqual(len(converted), 26)
        self.assertEqual(len(audit.loss_events), 1)
        self.assertIn("154", audit.loss_events[0])

    def test_blank_v14_extension_is_not_reported_as_data_loss(self) -> None:
        values: list[float | None] = [0.0] * mod.ALLOWABLE_VALUES_V14
        values[153] = None
        rows = _rows(values, 14)
        audit = _audit(14, 11)
        converted = mod._convert_allowables(rows, 14, 11, False, audit)
        self.assertEqual(len(converted), 26)
        self.assertEqual(audit.loss_events, [])

    def test_v11_blank_common_item_survives_upgrade(self) -> None:
        values: list[float | None] = [0.0] * mod.ALLOWABLE_VALUES_V11
        values[17] = None
        values[18] = 19.0
        rows = _rows(values, 11)
        self.assertEqual(len(rows), 26)

        audit = _audit(11, 14)
        converted = mod._convert_allowables(rows, 11, 14, False, audit)
        self.assertEqual(len(converted), 28)
        upgraded, blanks = mod._parse_allowable_record(converted, source=14, record_index=1)
        self.assertIsNone(upgraded[17])
        self.assertEqual(upgraded[18], 19.0)
        self.assertIn(18, blanks)
        self.assertTrue(all(value == 0.0 for value in upgraded[153:]))

    def test_nonzero_v11_padding_after_item_153_is_rejected(self) -> None:
        values: list[float | None] = [0.0] * mod.ALLOWABLE_VALUES_V11
        rows = _rows(values, 11)
        rows[-1] = mod._render_allowable_g13_6_row([0.0, 0.0, 0.0, 9.0, None, None], 11)
        with self.assertRaisesRegex(CiiConversionError, r"padding"):
            mod._convert_allowables(rows, 11, 14, False, _audit(11, 14))

    def test_nonblank_data_beyond_six_fields_is_rejected(self) -> None:
        line = mod._render_allowable_g13_6_row([1.0] * 6, 14) + "X"
        with self.assertRaisesRegex(CiiConversionError, r"beyond six G13.6"):
            mod._parse_allowable_g13_6_row(line, record_index=1, row_index=1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
