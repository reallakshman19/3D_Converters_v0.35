#!/usr/bin/env python3
import json
import struct
from pathlib import Path

VERSION = 7400
NULL_RECORD = b"\0" * 13
FOOTER_MAGIC_1 = bytes.fromhex("fabcab09d0c8d466b176fb831cf7267e")
FOOTER_MAGIC_2 = bytes.fromhex("f85a8c6adef5d97eece90ce3758f290b")


def property_bytes(value):
    if isinstance(value, str):
        data = value.encode("utf-8")
        return b"S" + struct.pack("<I", len(data)) + data
    if isinstance(value, int):
        return b"L" + struct.pack("<q", value)
    if isinstance(value, float):
        return b"D" + struct.pack("<d", value)
    kind, values = value
    fmt = {"d": "d", "i": "i"}[kind]
    raw = struct.pack("<" + fmt * len(values), *values)
    return kind.encode() + struct.pack("<III", len(values), 0, len(raw)) + raw


def node(name, properties=(), children=()):
    return name, tuple(properties), tuple(children)


def encode_node(spec, start):
    name, properties, children = spec
    name_bytes = name.encode("utf-8")
    props = b"".join(property_bytes(value) for value in properties)
    child_offset = start + 13 + len(name_bytes) + len(props)
    child_data = bytearray()
    for child in children:
        child_data.extend(encode_node(child, child_offset + len(child_data)))
    if children:
        child_data.extend(NULL_RECORD)
    end = start + 13 + len(name_bytes) + len(props) + len(child_data)
    return struct.pack("<IIIB", end, len(properties), len(props), len(name_bytes)) + name_bytes + props + bytes(child_data)


def p_vector(name, values):
    return node("P", (name, "Lcl Translation", "", "A", *map(float, values)))


def p_int(name, value):
    return node("P", (name, "int", "Integer", "", int(value)))


def p_double(name, value):
    return node("P", (name, "double", "Number", "", float(value)))


def model(object_id, name):
    return node("Model", (object_id, f"Model::{name}", "Mesh"), (
        node("Version", (232,)),
        node("Properties70", children=(p_vector("Lcl Translation", (0, 0, 0)),)),
    ))


def mesh(object_id, name, points):
    vertices = [coordinate / 10.0 for point in points for coordinate in point]
    indices = list(range(len(points)))
    indices[-1] = -indices[-1] - 1
    return node("Geometry", (object_id, f"Geometry::{name}", "Mesh"), (
        node("GeometryVersion", (124,)),
        node("Vertices", (("d", vertices),)),
        node("PolygonVertexIndex", (("i", indices),)),
    ))


def connection(source, destination):
    return node("C", ("OO", source, destination))


def global_settings():
    properties = (
        p_int("UpAxis", 1), p_int("UpAxisSign", 1),
        p_int("FrontAxis", 2), p_int("FrontAxisSign", -1),
        p_int("CoordAxis", 0), p_int("CoordAxisSign", 1),
        p_double("UnitScaleFactor", 1.0), p_double("OriginalUnitScaleFactor", 1.0),
    )
    return node("GlobalSettings", children=(
        node("Version", (1000,)), node("Properties70", children=properties),
    ))


def binary_document(top_specs):
    header = b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", VERSION)
    extension = node("FBXHeaderExtension", children=(
        node("FBXHeaderVersion", (1003,)), node("FBXVersion", (VERSION,)),
        node("Creator", ("F2S-003 deterministic family fixture",)),
    ))
    body = bytearray()
    for spec in (extension, *top_specs):
        body.extend(encode_node(spec, len(header) + len(body)))
    body.extend(NULL_RECORD)
    footer = FOOTER_MAGIC_1 + b"\0" * 4 + struct.pack("<I", VERSION) + b"\0" * 120 + FOOTER_MAGIC_2
    return header + bytes(body) + footer


def family_fixture():
    specs = (
        (500, 600, "MainPipe", ((0, 0, 0), (100, 0, 0))),
        (501, 601, "Elbow", ((100, 0, 0), (200, 100, 0))),
        (502, 602, "Tee", ((200, 100, 0), (200, 200, 0), (200, 150, 0))),
        (503, 603, "Reducer", ((200, 200, 0), (200, 300, 0))),
        (504, 604, "Flange", ((200, 300, 0), (200, 320, 0))),
        (505, 605, "Valve", ((200, 320, 0), (200, 420, 0))),
        (506, 606, "BranchPipe", ((200, 150, 0), (300, 150, 0))),
        (507, 607, "DisconnectedPipe", ((200, 420, 0), (200, 520, 0))),
    )
    objects = []
    connections = []
    for model_id, geometry_id, name, points in specs:
        objects.extend((model(model_id, name), mesh(geometry_id, name, points)))
        connections.extend((connection(geometry_id, model_id), connection(model_id, 0)))
    return binary_document((
        global_settings(), node("Objects", children=objects), node("Connections", children=connections),
    ))


def direction(vector):
    return {"authority": "world-vector", "vector": vector}


def connection_ref(mapping_entry_id, port_id):
    return {"mappingEntryId": mapping_entry_id, "portId": port_id}


def mapped_port(port_id, role, geometry_id, vertex_index, vector, connections=()):
    return {
        "portId": port_id, "role": role, "authority": "mesh-vertex",
        "geometryObjectId": str(geometry_id), "vertexIndex": vertex_index,
        "direction": direction(vector), "connections": list(connections),
    }


def mapping_entry(number, component_type, ports, engineering):
    return {
        "mappingEntryId": f"map-{number}", "logicalComponentId": f"{component_type}-{number}",
        "sourceModelObjectId": str(499 + number), "sourceOccurrenceId": f"occ:{499 + number}",
        "sourceGeometryObjectIds": [str(599 + number)], "componentType": component_type,
        "scopeDisposition": "promote", "ports": ports, "engineering": engineering,
    }


def family_mapping():
    ref = connection_ref
    port = mapped_port
    return {
        "schema": "FbxStagedMapping.v2",
        "inScopeSourceObjectIds": [str(value) for value in range(500, 508)],
        "entries": [
            mapping_entry(1, "PIPE", {
                "A": port("A", "A", 600, 0, [-1, 0, 0]),
                "L": port("L", "L", 600, 1, [1, 0, 0], [ref("map-2", "A")]),
            }, {}),
            mapping_entry(2, "ELBOW", {
                "A": port("A", "A", 601, 0, [-1, 0, 0], [ref("map-1", "L")]),
                "L": port("L", "L", 601, 1, [0, -1, 0], [ref("map-3", "A")]),
            }, {"bendRadiusMm": 100, "bendAngleDeg": 90, "bendPlaneNormal": direction([0, 0, 1])}),
            mapping_entry(3, "TEE", {
                "A": port("A", "A", 602, 0, [0, 1, 0], [ref("map-2", "L")]),
                "L": port("L", "L", 602, 1, [0, -1, 0], [ref("map-4", "A")]),
                "P": port("P", "P", 602, 2, [1, 0, 0], [ref("map-7", "A")]),
            }, {"runDiameterMm": 100, "branchDiameterMm": 50}),
            mapping_entry(4, "REDUCER", {
                "A": port("A", "A", 603, 0, [0, 1, 0], [ref("map-3", "L")]),
                "L": port("L", "L", 603, 1, [0, -1, 0], [ref("map-5", "A")]),
            }, {
                "largeEndDiameterMm": 100, "smallEndDiameterMm": 80,
                "largeEndPortId": "A", "smallEndPortId": "L", "reducerType": "CONCENTRIC",
            }),
            mapping_entry(5, "FLANGE", {
                "A": port("A", "A", 604, 0, [0, 1, 0], [ref("map-4", "L")]),
                "L": port("L", "L", 604, 1, [0, -1, 0], [ref("map-6", "A")]),
            }, {"nominalDiameterMm": 80, "thicknessMm": 20, "flangeType": "WELD_NECK"}),
            mapping_entry(6, "VALVE", {
                "A": port("A", "A", 605, 0, [0, 1, 0], [ref("map-5", "L")]),
                "L": port("L", "L", 605, 1, [0, -1, 0]),
            }, {"nominalDiameterMm": 80, "faceToFaceMm": 100, "valveType": "GATE"}),
            mapping_entry(7, "PIPE", {
                "A": port("A", "A", 606, 0, [-1, 0, 0], [ref("map-3", "P")]),
                "L": port("L", "L", 606, 1, [1, 0, 0]),
            }, {}),
            mapping_entry(8, "PIPE", {
                "A": port("A", "A", 607, 0, [0, 1, 0]),
                "L": port("L", "L", 607, 1, [0, -1, 0]),
            }, {}),
        ],
        "exclusions": [],
    }


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    fixture_root = root / "tests/fixtures/fbx"
    fixture_root.mkdir(parents=True, exist_ok=True)
    binary_target = fixture_root / "component-families.fbx"
    mapping_target = fixture_root / "component-families.fbxmap.json"
    binary_target.write_bytes(family_fixture())
    mapping_target.write_text(json.dumps(family_mapping(), separators=(",", ":")) + "\n", encoding="utf-8")
    print(binary_target)
    print(mapping_target)
