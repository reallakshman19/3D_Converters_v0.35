#!/usr/bin/env python3
"""
Convert RVM input to REV output for the browser converter runtime.

Functionality:
- Accepts `--input` (RVM or REV-like text), `--output`, and optional `--attributes`.
- If input already contains REV text structure, it is normalized and written as `.rev`.
- Binary RVM parsing is not performed in-browser; a clear actionable error is raised.

Parameters expected:
- `--input`: primary source path.
- `--output`: target REV file path.
- `--attributes`: optional ATT/TXT path (reserved for native conversion parity).

Outputs passed:
- REV text written to `--output` when input is already REV-like text.

Fallback:
- Prints a native `rvmparser` command hint and exits with code 1 for real binary RVM input.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _looks_like_rev_text(text: str) -> bool:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return False
    head = set(lines[:80])
    return "HEAD" in head and "MODL" in head and any(line.startswith("END:") for line in lines)


def _normalize_newlines(text: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    if not normalized.endswith("\n"):
        normalized = f"{normalized}\n"
    return normalized


def _native_rvmparser_message(input_path: Path, output_path: Path, attributes: Path | None, reason: str) -> str:
    att_hint = f" \"{attributes}\"" if attributes is not None else " [optional-attributes.att]"
    return (
        f"{reason}\n"
        "Use native rvmparser instead:\n"
        f"  rvmparser-windows-bin.exe --output-rev=\"{output_path}\" \"{input_path}\"{att_hint}"
    )


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Convert RVM to REV in browser runtime (REV pass-through supported)."
    )
    parser.add_argument("--input", required=True, type=Path, help="Input RVM/REV file path.")
    parser.add_argument("--output", required=True, type=Path, help="Output REV file path.")
    parser.add_argument(
        "--attributes",
        required=False,
        type=Path,
        help="Optional ATT/TXT attribute file path (used by native rvmparser).",
    )
    return parser


def main() -> int:
    parser = _build_parser()
    args = parser.parse_args()

    input_bytes = args.input.read_bytes()
    try:
        text = input_bytes.decode("utf-8")
    except UnicodeDecodeError:
        message = _native_rvmparser_message(
            input_path=args.input,
            output_path=args.output,
            attributes=args.attributes,
            reason="Binary RVM -> REV conversion is not available in the in-browser Pyodide runtime.",
        )
        print(message, file=sys.stderr)
        return 1

    if not _looks_like_rev_text(text):
        message = _native_rvmparser_message(
            input_path=args.input,
            output_path=args.output,
            attributes=args.attributes,
            reason=(
                "Input is text, but does not match REV structure (HEAD/MODL/END blocks). "
                "Binary RVM conversion is not available in the in-browser runtime."
            ),
        )
        print(message, file=sys.stderr)
        return 1

    args.output.write_text(_normalize_newlines(text), encoding="utf-8")
    print(f"Wrote REV output {args.output} (text pass-through mode).")
    if args.attributes is not None:
        print(f"Note: --attributes was provided ({args.attributes}) but is not used in pass-through mode.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
