#!/usr/bin/env python3
"""Regression test for CleanXML wrapper support in XML -> CII conversion."""

from __future__ import annotations

from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "converters" / "scripts" / "xml_to_cii2019_direction.py"


def _cleanxml() -> str:
    return textwrap.dedent(
        """
        <CleanXML schema="inputxml-workspace-cleanxml/v1" sourceName="unit-cleanxml">
          <Branch>
            <Branchname>/CLEANXML/B1</Branchname>
            <Temperature><Temperature1>100</Temperature1></Temperature>
            <Pressure><Pressure1>10</Pressure1></Pressure>
            <Node>
              <NodeNumber>10</NodeNumber>
              <NodeName>N10</NodeName>
              <Endpoint>0</Endpoint>
              <ComponentType>PIPE</ComponentType>
              <OutsideDiameter>100</OutsideDiameter>
              <WallThickness>10</WallThickness>
              <Position>0 0 0</Position>
            </Node>
            <Node>
              <NodeNumber>20</NodeNumber>
              <NodeName>N20</NodeName>
              <Endpoint>0</Endpoint>
              <ComponentType>PIPE</ComponentType>
              <OutsideDiameter>100</OutsideDiameter>
              <WallThickness>10</WallThickness>
              <Position>100 0 0</Position>
            </Node>
          </Branch>
        </CleanXML>
        """
    ).strip()


def test_cleanxml_wrapper_runs_direction_converter() -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        input_path = Path(temp_dir) / "input.cleanxml"
        output_path = Path(temp_dir) / "output.cii"
        input_path.write_text(_cleanxml(), encoding="utf-8")
        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH), "--input", str(input_path), "--output", str(output_path)],
            cwd=str(REPO_ROOT),
            capture_output=True,
            text=True,
            check=False,
        )
        assert result.returncode == 0, result.stderr or result.stdout
        cii_text = output_path.read_text(encoding="utf-8")
        assert "#$ ELEMENTS" in cii_text
        assert "Unexpected root element 'CleanXML'" not in result.stderr


if __name__ == "__main__":
    test_cleanxml_wrapper_runs_direction_converter()
    print("xml_to_cii_cleanxml_wrapper_regression: PASS")
