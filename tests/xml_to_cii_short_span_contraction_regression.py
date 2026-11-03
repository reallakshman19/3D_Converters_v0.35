#!/usr/bin/env python3
"""Regression tests for XML -> CII short-span contraction.

Run from repo root:

    python tests/xml_to_cii_short_span_contraction_regression.py
"""

from __future__ import annotations

from pathlib import Path
import sys
import tempfile
import textwrap

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = REPO_ROOT / "converters" / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import xml_to_cii2019 as base  # noqa: E402
import xml_to_cii2019_contracted_direction as contracted  # noqa: E402,F401


def _node(number: int, component: str = "PIPE", position: str = "0 0 0", endpoint: int = 0) -> str:
    return f"""
<Node>
  <NodeNumber>{number}</NodeNumber>
  <Endpoint>{endpoint}</Endpoint>
  <ComponentType>{component}</ComponentType>
  <Rigid>0</Rigid>
  <Weight>0</Weight>
  <OutsideDiameter>100</OutsideDiameter>
  <WallThickness>10</WallThickness>
  <CorrosionAllowance>0</CorrosionAllowance>
  <InsulationThickness>0</InsulationThickness>
  <BendRadius>0</BendRadius>
  <Position>{position}</Position>
</Node>
"""


def _xml(branches: str) -> str:
    return textwrap.dedent(
        f"""
        <PipeStressExport>
          <DateTime>2026-07-08</DateTime>
          <Source>unit-test</Source>
          <Version>test</Version>
          <UserName>test</UserName>
          <Purpose>test</Purpose>
          <ProjectName>test</ProjectName>
          <MDBName>test</MDBName>
          <RestrainOpenEnds>No</RestrainOpenEnds>
          <AmbientTemperature>21</AmbientTemperature>
          <Pipe>{branches}</Pipe>
        </PipeStressExport>
        """
    ).strip()


def _model_for(branches: str) -> base.ConversionModel:
    base.DROPPED_SHORT_ELEMENT_NODES.clear()
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "input.xml"
        path.write_text(_xml(branches), encoding="utf-8")
        document = base._parse_xml_document(path)
        return base._build_conversion_model(document)


def test_short_span_contracts_to_shared_junction_node() -> None:
    model = _model_for(
        f"""
<Branch>
  <Branchname>/MAIN</Branchname>
  {_node(477, "PIPE", "0 0 0")}
  {_node(479, "PIPE", "100 0 0")}
  {_node(480, "BRAN", "103 0 0")}
  {_node(490, "PIPE", "200 0 0")}
</Branch>
<Branch>
  <Branchname>/BRANCH</Branchname>
  {_node(480, "BRAN", "103 0 0")}
  {_node(500, "PIPE", "103 100 0")}
</Branch>
"""
    )
    edge_pairs = [(edge.from_node.node_number, edge.to_node.node_number) for edge in model.edges]
    assert (477, 480) in edge_pairs, edge_pairs
    assert (479, 480) not in edge_pairs, edge_pairs
    assert (480, 500) in edge_pairs, edge_pairs
    assert any("contracted into NodeNumber 480" in row for row in base.DROPPED_SHORT_ELEMENT_NODES)


def test_short_span_contracts_to_positive_tee_sif_owner() -> None:
    model = _model_for(
        f"""
<Branch>
  <Branchname>/TEE</Branchname>
  {_node(60, "PIPE", "0 0 0")}
  {_node(70, "TEE", "3 0 0", endpoint=0)}
  {_node(80, "PIPE", "100 0 0")}
</Branch>
"""
    )
    edge_pairs = [(edge.from_node.node_number, edge.to_node.node_number) for edge in model.edges]
    assert edge_pairs == [(70, 80)], edge_pairs
    assert len(model.sif_edges) == 1
    assert contracted._sif_owner_node(model.sif_edges[0]).node_number == 70
    assert any("contracted into NodeNumber 70" in row for row in base.DROPPED_SHORT_ELEMENT_NODES)


if __name__ == "__main__":
    test_short_span_contracts_to_shared_junction_node()
    test_short_span_contracts_to_positive_tee_sif_owner()
    print("xml_to_cii_short_span_contraction_regression: PASS")
