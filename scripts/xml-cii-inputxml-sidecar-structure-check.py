from __future__ import annotations

import ast
import re
from pathlib import Path

NEW_JS = (
    Path("converters/xml-cii-inputxml-sidecar-worker.js"),
    Path("tabs/model-converters/xml-cii-inputxml-sidecar-diagnostics-panel.js"),
    Path("tests/xml-cii-inputxml-sidecar-workpack.test.js"),
    Path("scripts/xml-cii-inputxml-sidecar-baseline-gate.mjs"),
)
NEW_PYTHON = (
    Path("converters/scripts/xml_to_cii_inputxml_sidecar_diagnostics.py"),
    Path("converters/scripts/test_xml_to_cii_inputxml_sidecar_workpack.py"),
    Path("scripts/xml-cii-inputxml-sidecar-structure-check.py"),
)
TEMPORARY_PATHS = (
    Path("scripts/xml-cii-inputxml-sidecar-workpack-patch.py"),
    Path(".github/workflows/xml-cii-inputxml-sidecar-patch.yml"),
)
JS_FUNCTION = re.compile(r"^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(")


def _fail(message: str) -> None:
    raise SystemExit(message)


def _js_function_span(lines: list[str], start_index: int) -> int:
    depth = 0
    opened = False
    for index in range(start_index, len(lines)):
        depth += lines[index].count("{") - lines[index].count("}")
        opened = opened or "{" in lines[index]
        if opened and depth <= 0:
            return index - start_index + 1
    return len(lines) - start_index


def _check_js(path: Path) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    if len(lines) >= 300:
        _fail(f"{path}: {len(lines)} lines; new JavaScript modules must remain below 300")
    if any(re.search(r"\bexport\s+default\b", line) for line in lines):
        _fail(f"{path}: default export is forbidden")
    for index, line in enumerate(lines):
        match = JS_FUNCTION.match(line.strip())
        if not match:
            continue
        span = _js_function_span(lines, index)
        if span > 40:
            _fail(f"{path}:{index + 1} function {match.group(1)} spans {span} lines")


def _check_python(path: Path) -> None:
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        span = int(node.end_lineno or node.lineno) - node.lineno + 1
        if span > 40:
            _fail(f"{path}:{node.lineno} function {node.name} spans {span} lines")


def main() -> None:
    for path in TEMPORARY_PATHS:
        if path.exists():
            _fail(f"temporary Work Pack file remains: {path}")
    for path in NEW_JS:
        _check_js(path)
    for path in NEW_PYTHON:
        _check_python(path)
    print("XML CII InputXML sidecar structure checks passed")


if __name__ == "__main__":
    main()
