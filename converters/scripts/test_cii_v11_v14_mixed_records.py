from __future__ import annotations

from pathlib import Path
import re
import unittest
import zipfile

import cii_v11_v14 as mod
import cii_v11_v14_validate as structure
from cii_v11_v14_format import _generic_numeric_convert, _render_float_row


REPO_ROOT = Path(__file__).resolve().parents[2]
BENCHMARK_ZIP = REPO_ROOT / "Benchmarks" / "v11-v14.zip"
_INT_TOKEN = re.compile(r"[+-]?\d+")

# Confirmed I13 slots in the four MISCEL_1 execution-option records.  These
# are intentionally the same slots enforced by the independent validator.
_EXEC_INTEGER_SLOTS = (
    (1, 2, 3, 4, 6),
    (1, 5, 6),
    (1, 2, 3, 4, 6),
    (1,),
)


def _benchmark_pair() -> tuple[bytes, bytes]:
    with zipfile.ZipFile(BENCHMARK_ZIP) as archive:
        names = archive.namelist()
        v14_name = next(name for name in names if name.lower().endswith("v14.cii"))
        v11_name = next(name for name in names if name.lower().endswith("v11.cii"))
        return archive.read(v14_name), archive.read(v11_name)


def _section_map(data: bytes) -> dict[str, list[str]]:
    return {section.name: section.lines for section in mod.parse_sections(data)}


def _field(line: str, slot: int) -> str:
    start = 2 + (slot - 1) * 13
    return line[start:start + 13].strip()


def _mixed_row(tokens: list[str]) -> str:
    if len(tokens) != 6:
        raise AssertionError("fixture requires six fixed fields")
    return "  " + "".join(token.rjust(13) for token in tokens)


class MixedFixedRecordTests(unittest.TestCase):
    def test_generic_converter_preserves_mixed_integer_real_record(self) -> None:
        # MISCEL_1 execution-option grammar: integer fields must remain lexical
        # integers.  The pre-fix generic formatter changed them to 0.000000.
        line = _mixed_row(["0", "0", "0", "2", "0.000000E+00", "0"])
        self.assertEqual(_generic_numeric_convert(line, 11), line)

    def test_generic_converter_preserves_hanger_mixed_record(self) -> None:
        # Hanger defaults likewise begin with an I13 followed by real fields.
        line = _mixed_row([
            "1", "2.500000E+01", "0.000000E+00",
            "9.999990E+03", "0.000000E+00", "1.000000E+00",
        ])
        self.assertEqual(_generic_numeric_convert(line, 11), line)

    def test_generic_converter_still_renders_pure_real_rows(self) -> None:
        line = _render_float_row([1.0, 2.0, 3.0, 4.0, 5.0, 6.0], 14)
        converted = _generic_numeric_convert(line, 11)
        self.assertNotEqual(converted, line)
        self.assertNotIn("E+00", converted)

    def test_paired_v14_to_v11_keeps_execution_integer_grammar(self) -> None:
        v14, _native_v11 = _benchmark_pair()
        generated = mod.convert_bytes(v14, 11).data
        tail = _section_map(generated)["MISCEL_1"][-4:]
        self.assertEqual(len(tail), 4)

        for row, integer_slots in zip(tail, _EXEC_INTEGER_SLOTS):
            for slot in integer_slots:
                token = _field(row, slot)
                self.assertRegex(
                    token,
                    _INT_TOKEN,
                    msg=f"MISCEL execution I13 slot {slot} was emitted as {token!r}",
                )
                self.assertNotIn(".", token)
                self.assertNotRegex(token.lower(), r"[ed]")

        # The independent target validator now checks the same field grammar.
        structure.validate_text_for_version(
            generated.decode("utf-8"), 11, phase="mixed-record-regression"
        )

    def test_validator_rejects_all_real_execution_record(self) -> None:
        bad = _render_float_row([0.0, 0.0, 0.0, 2.0, 0.0, 0.0], 11)
        sections = {
            "MISCEL_1": [
                bad,
                _mixed_row(["0", "0.000000", "21.0000", "21.5000", "0", "0"]),
                _mixed_row(["0", "0", "0", "0", "0.250000", "3"]),
                "              0",
            ]
        }
        with self.assertRaisesRegex(structure.CiiStructureError, r"I13 integer field"):
            structure._validate_miscel_execution_tail(sections, phase="fixture")


if __name__ == "__main__":
    unittest.main(verbosity=2)
