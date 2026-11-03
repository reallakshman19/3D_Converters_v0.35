#!/usr/bin/env python3
"""Regression coverage for PSI116 component-occurrence topology projection.

Run from repository root:

    python tests/xml_to_cii_psi116_component_topology_regression.py
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
import xml_to_cii2019_contracted_direction as topology  # noqa: E402,F401


def _node(
    number: int,
    component: str,
    position: str,
    *,
    endpoint: int,
    ref: str,
    connection: str = "",
    bend_radius: float = 0.0,
    bend_type: int | None = None,
    alpha_angle: float | None = None,
    outside_diameter: float = 219.1,
) -> str:
    bend_type_xml = "" if bend_type is None else f"<BendType>{bend_type}</BendType>"
    alpha_xml = "" if alpha_angle is None else f"<AlphaAngle>{alpha_angle}</AlphaAngle>"
    return f"""
<Node>
  <NodeNumber>{number}</NodeNumber>
  <NodeName></NodeName>
  <Endpoint>{endpoint}</Endpoint>
  <Rigid>0</Rigid>
  <ComponentType>{component}</ComponentType>
  <Weight>0</Weight>
  <ComponentRefNo>{ref}</ComponentRefNo>
  <ConnectionType>{connection}</ConnectionType>
  <OutsideDiameter>{outside_diameter}</OutsideDiameter>
  <WallThickness>10</WallThickness>
  <CorrosionAllowance>1</CorrosionAllowance>
  {alpha_xml}
  <InsulationThickness>0</InsulationThickness>
  <Position>{position}</Position>
  <BendRadius>{bend_radius}</BendRadius>
  {bend_type_xml}
  <SIF>0</SIF>
</Node>
"""


def _xml(branches: str, restrain_open_ends: str = "No") -> str:
    return textwrap.dedent(
        f"""
        <PipeStressExport>
          <DateTime>2026-07-15</DateTime>
          <Source>component-topology-test</Source>
          <Version>test</Version>
          <UserName>test</UserName>
          <Purpose>test</Purpose>
          <ProjectName>test</ProjectName>
          <MDBName>/test</MDBName>
          <RestrainOpenEnds>{restrain_open_ends}</RestrainOpenEnds>
          <AmbientTemperature>21</AmbientTemperature>
          <Pipe>{branches}</Pipe>
        </PipeStressExport>
        """
    ).strip()


def _model_for(branches: str, restrain_open_ends: str = "No") -> base.ConversionModel:
    base.DROPPED_SHORT_ELEMENT_NODES.clear()
    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir) / "input.xml"
        path.write_text(_xml(branches, restrain_open_ends), encoding="utf-8")
        document = base._parse_xml_document(path)
        return base._build_conversion_model(document)


def _bend_owner_numbers(model: base.ConversionModel) -> list[int]:
    owners = [topology._bend_owner_node(edge) for edge in model.bend_edges]
    return [owner.node_number for owner in owners if owner is not None]


def test_full_component_occurrence_keeps_negative_elbow_ports() -> None:
    model = _model_for(
        f"""
<Branch>
  <Branchname>/ELBOW-PORTS</Branchname>
  {_node(10, 'PIPE', '0 0 0', endpoint=2, ref='P-1')}
  {_node(-1, 'ELBO', '100 0 0', endpoint=1, ref='E-1', bend_radius=305)}
  {_node(20, 'ELBO', '100 100 0', endpoint=0, ref='E-1', bend_radius=305, bend_type=0)}
  {_node(-1, 'ELBO', '200 100 0', endpoint=2, ref='E-1', bend_radius=305)}
  {_node(30, 'PIPE', '200 100 0', endpoint=1, ref='P-2')}
</Branch>
"""
    )
    occurrence = topology._occurrence_for_node(20, "/ELBOW-PORTS")
    assert occurrence is not None
    assert occurrence.semantic_type == "ELBO"
    assert [record.endpoint for record in occurrence.records] == [1, 0, 2]
    assert _bend_owner_numbers(model) == [20]


def test_branch_head_alias_and_coincident_elbows_preserve_topology() -> None:
    model = _model_for(
        f"""
<Branch>
  <Branchname>/LARGE</Branchname>
  {_node(2250, 'PIPE', '0 0 0', endpoint=1, ref='P-LARGE', outside_diameter=273)}
  {_node(2260, 'REDU', '100 0 0', endpoint=2, ref='R-1', alpha_angle=16.389, outside_diameter=219.1)}
</Branch>
<Branch>
  <Branchname>/SMALL</Branchname>
  {_node(1570, 'ELBO', '100 0 0', endpoint=0, ref='E-HEAD', bend_radius=305, bend_type=0)}
  {_node(1590, 'PIPE', '100 100 0', endpoint=1, ref='P-SMALL-1')}
  {_node(1600, 'PIPE', '200 100 0', endpoint=2, ref='P-SMALL-1')}
  {_node(1610, 'ELBO', '200 100 0', endpoint=0, ref='E-INLINE', bend_radius=305, bend_type=0)}
  {_node(1630, 'PIPE', '200 200 0', endpoint=1, ref='P-SMALL-2')}
</Branch>
""",
        restrain_open_ends="Yes",
    )
    edge_pairs = [(edge.from_node.node_number, edge.to_node.node_number) for edge in model.edges]
    assert (2250, 1570) in edge_pairs
    assert (1570, 1590) in edge_pairs
    assert (1590, 1610) in edge_pairs
    assert not any(2260 in pair for pair in edge_pairs)
    assert (1600, 1610) not in edge_pairs
    assert _bend_owner_numbers(model) == [1570, 1610]
    assert model.degrees[1570] == 2
    assert 1570 not in [item.node_number for item in model.restraints]
    radii = [float(line.split()[0]) for line in base._build_bend_payload(model)[::3]]
    assert radii == [305.0, 305.0]
    assert any("contracted into NodeNumber 1610" in row for row in base.DROPPED_SHORT_ELEMENT_NODES)
    audit = topology._audit_summary()
    assert audit["nodeAliases"]["2260"] == 1570
    assert {"fromNode": 2260, "toNode": 1570} in audit["topologyLinks"]


def test_bran_connection_type_tee_is_a_sif_owner() -> None:
    model = _model_for(
        f"""
<Branch>
  <Branchname>/TEE</Branchname>
  {_node(2270, 'PIPE', '0 0 0', endpoint=2, ref='P-TEE')}
  {_node(2280, 'BRAN', '100 0 0', endpoint=1, ref='T-1', connection='TEE', outside_diameter=273)}
  {_node(2290, 'PIPE', '200 0 0', endpoint=1, ref='P-TEE-2', outside_diameter=273)}
</Branch>
"""
    )
    assert len(model.sif_edges) == 1
    owner = topology._sif_owner_node(model.sif_edges[0])
    assert owner is not None and owner.node_number == 2280


def test_real_1885_firstpass_restores_elbows_and_connected_node_identity() -> None:
    xml_path = REPO_ROOT / "Benchmarks" / "1885Sjson" / "FirstpassXML"
    assert xml_path.exists(), xml_path
    base.DROPPED_SHORT_ELEMENT_NODES.clear()
    document = base._parse_xml_document(xml_path)
    model = base._build_conversion_model(document)
    owners = _bend_owner_numbers(model)
    assert 1570 in owners, owners
    assert 1610 in owners, owners
    radii = [float(line.split()[0]) for line in base._build_bend_payload(model)[::3]]
    assert radii.count(305.0) >= 2, radii
    edge_pairs = [(edge.from_node.node_number, edge.to_node.node_number) for edge in model.edges]
    assert (2240, 1570) in edge_pairs, edge_pairs
    assert (1570, 2280) in edge_pairs, edge_pairs
    assert (1570, 1590) in edge_pairs, edge_pairs
    assert not any(2260 in pair for pair in edge_pairs), edge_pairs
    assert model.degrees[1570] >= 3
    assert not any(
        item.node_number == 1570 and any(spec.is_open_end for spec in item.specs)
        for item in model.restraints
    )
    audit = topology._audit_summary()
    assert audit["nodeAliases"]["2260"] == 1570
    assert {"fromNode": 2260, "toNode": 1570} in audit["topologyLinks"]


if __name__ == "__main__":
    test_full_component_occurrence_keeps_negative_elbow_ports()
    test_branch_head_alias_and_coincident_elbows_preserve_topology()
    test_bran_connection_type_tee_is_a_sif_owner()
    test_real_1885_firstpass_restores_elbows_and_connected_node_identity()
    print("xml_to_cii_psi116_component_topology_regression: PASS")
