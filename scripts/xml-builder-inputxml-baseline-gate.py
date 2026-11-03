#!/usr/bin/env python3
"""Compare base/head JS and Python test outcomes by test identity."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

JS_SUFFIXES = (".test.js", ".test.mjs", ".test.cjs")
SKIP_PARTS = {"node_modules", ".git", ".venv", "__pycache__"}


def tail(value: str, limit: int = 3000) -> str:
    value = value.strip()
    return value[-limit:] if len(value) > limit else value


def discover_js(root: Path) -> list[str]:
    tests = []
    test_root = root / "tests"
    if not test_root.exists():
        return tests
    for path in test_root.rglob("*"):
        if not path.is_file() or any(part in SKIP_PARTS for part in path.parts):
            continue
        if path.name.endswith(JS_SUFFIXES):
            tests.append(path.relative_to(root).as_posix())
    return sorted(tests)


def run_command(command: list[str], cwd: Path, timeout: int) -> tuple[str, int | None, str]:
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=timeout,
            env={**os.environ, "CI": "1"},
            check=False,
        )
        return ("PASS" if completed.returncode == 0 else "FAIL", completed.returncode, tail(completed.stdout))
    except subprocess.TimeoutExpired as error:
        output = (error.stdout or "") + (error.stderr or "")
        return "TIMEOUT", None, tail(output)
    except OSError as error:
        return "ERROR", None, str(error)


def run_js(root: Path, timeout: int) -> dict[str, dict[str, Any]]:
    results: dict[str, dict[str, Any]] = {}
    for relative in discover_js(root):
        status, returncode, output = run_command(["node", relative], root, timeout)
        results[relative] = {"status": status, "returncode": returncode, "output": output}
    return results


def pytest_identity(testcase: ET.Element) -> str:
    classname = testcase.attrib.get("classname", "")
    name = testcase.attrib.get("name", "")
    return f"{classname}::{name}" if classname else name


def run_pytest(root: Path, timeout: int) -> dict[str, dict[str, Any]]:
    with tempfile.TemporaryDirectory(prefix="xml-builder-pytest-") as temp_dir:
        junit = Path(temp_dir) / "pytest.xml"
        status, returncode, output = run_command(
            [sys.executable, "-m", "pytest", "-q", f"--junitxml={junit}"], root, timeout
        )
        results: dict[str, dict[str, Any]] = {}
        if junit.exists():
            try:
                document = ET.parse(junit)
                for testcase in document.iter("testcase"):
                    identity = pytest_identity(testcase)
                    state = "PASS"
                    detail = ""
                    for child_name in ("failure", "error", "skipped"):
                        child = testcase.find(child_name)
                        if child is not None:
                            state = "SKIP" if child_name == "skipped" else "FAIL"
                            detail = tail((child.attrib.get("message", "") + "\n" + (child.text or "")).strip())
                            break
                    results[identity] = {"status": state, "output": detail}
            except ET.ParseError as error:
                results["__pytest_junit_parse__"] = {"status": "ERROR", "output": str(error)}
        if not results:
            synthetic_status = "PASS" if status == "PASS" or returncode == 5 else status
            results["__pytest_process__"] = {
                "status": synthetic_status,
                "returncode": returncode,
                "output": output,
            }
        elif returncode not in (0, 1, 5):
            results["__pytest_process__"] = {
                "status": status,
                "returncode": returncode,
                "output": output,
            }
        return results


def compare_family(name: str, base: dict[str, dict[str, Any]], head: dict[str, dict[str, Any]]) -> dict[str, Any]:
    regressions = []
    improvements = []
    retained_failures = []
    removed = []
    for identity in sorted(set(base) | set(head)):
        base_status = base.get(identity, {}).get("status", "MISSING")
        head_status = head.get(identity, {}).get("status", "MISSING")
        row = {"test": identity, "base": base_status, "head": head_status}
        if head_status == "MISSING":
            removed.append(row)
            regressions.append({**row, "reason": "test removed from head"})
        elif base_status == "MISSING" and head_status != "PASS":
            regressions.append({**row, "reason": "new test does not pass"})
        elif base_status == "PASS" and head_status != "PASS":
            regressions.append({**row, "reason": "previously passing test regressed"})
        elif base_status not in ("PASS", "MISSING") and head_status == "PASS":
            improvements.append(row)
        elif base_status not in ("PASS", "MISSING") and head_status not in ("PASS", "MISSING"):
            retained_failures.append(row)
    return {
        "family": name,
        "baseCount": len(base),
        "headCount": len(head),
        "baseFailures": sorted(key for key, value in base.items() if value.get("status") not in ("PASS", "SKIP")),
        "headFailures": sorted(key for key, value in head.items() if value.get("status") not in ("PASS", "SKIP")),
        "regressions": regressions,
        "improvements": improvements,
        "retainedFailures": retained_failures,
        "removed": removed,
    }


def markdown(report: dict[str, Any]) -> str:
    lines = ["# XML Builder InputXML baseline gate", ""]
    for family in report["families"]:
        lines.extend([
            f"## {family['family']}",
            "",
            f"- Base tests: {family['baseCount']}",
            f"- Head tests: {family['headCount']}",
            f"- Base failing names: {len(family['baseFailures'])}",
            f"- Head failing names: {len(family['headFailures'])}",
            f"- New regressions: {len(family['regressions'])}",
            "",
        ])
        if family["regressions"]:
            lines.append("### Regressions")
            for row in family["regressions"]:
                lines.append(f"- `{row['test']}`: {row['base']} → {row['head']} ({row['reason']})")
            lines.append("")
        if family["headFailures"]:
            lines.append("### Head failing test names")
            lines.extend(f"- `{name}`" for name in family["headFailures"])
            lines.append("")
    lines.append(f"**Result:** {'PASS' if report['ok'] else 'FAIL'}")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, type=Path)
    parser.add_argument("--head", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--js-timeout", type=int, default=120)
    parser.add_argument("--pytest-timeout", type=int, default=1200)
    args = parser.parse_args()

    base = args.base.resolve()
    head = args.head.resolve()
    families = [
        compare_family("JavaScript", run_js(base, args.js_timeout), run_js(head, args.js_timeout)),
        compare_family("Python pytest", run_pytest(base, args.pytest_timeout), run_pytest(head, args.pytest_timeout)),
    ]
    report = {"schema": "xml-builder-inputxml-baseline-gate/v1", "families": families}
    report["ok"] = not any(family["regressions"] for family in families)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    summary = markdown(report)
    print(summary)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        Path(step_summary).write_text(summary, encoding="utf-8")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
