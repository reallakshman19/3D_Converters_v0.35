#!/usr/bin/env python3
"""Generate deterministic binary FBX fixtures with attributes and non-fatal warnings."""

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
    fmt = {"d": "d", "f": "f", "i": "i", "l": "q"}[kind]
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
    return struct.pack("<IIIB", end, len(properties), len(props), len(name_bytes)) \
        + name_bytes + props + bytes(child_data)


def p_int(name, value):
    return node("P", (name, "int", "Integer", "", int(value)))


def p_double(name, value):
    return node("P", (name, "double", "Number", "", float(value)))


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


def layer_reference(kind, index):
    return node("LayerElement", children=(
        node("Type", (kind,)), node("TypedIndex", (index,)),
    ))


def normal_layer():
    return node("LayerElementNormal", (0,), (
        node("Version", (101,)), node("Name", ("",)),
        node("MappingInformationType", ("ByPolygonVertex",)),
        node("ReferenceInformationType", ("Direct",)),
        node("Normals", (("d", [0.0, 0.0, 1.0] * 4),)),
    ))


def uv_layer(index, name):
    offset = index * 0.125
    values = [0.0 + offset, 0.0, 1.0 - offset, 0.0,
              1.0 - offset, 1.0, 0.0 + offset, 1.0]
    return node("LayerElementUV", (index,), (
        node("Version", (101,)), node("Name", (name,)),
        node("MappingInformationType", ("ByPolygonVertex",)),
        node("ReferenceInformationType", ("IndexToDirect",)),
        node("UV", (("d", values),)), node("UVIndex", (("i", [0, 1, 2, 3]),)),
    ))


def color_layer():
    colors = [1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 0.0, 1.0,
              0.0, 0.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0]
    return node("LayerElementColor", (0,), (
        node("Version", (101,)), node("Name", ("",)),
        node("MappingInformationType", ("ByPolygonVertex",)),
        node("ReferenceInformationType", ("Direct",)),
        node("Colors", (("d", colors),)),
    ))


def material_layer():
    return node("LayerElementMaterial", (0,), (
        node("Version", (101,)), node("Name", ("",)),
        node("MappingInformationType", ("AllSame",)),
        node("ReferenceInformationType", ("IndexToDirect",)),
        node("Materials", (("i", [0]),)),
    ))


def mesh(object_id, name, uv_names, with_color=True):
    vertices = [0.0, 0.0, 0.0, 100.0, 0.0, 0.0,
                100.0, 100.0, 0.0, 0.0, 100.0, 0.0]
    polygon = [0, 1, 2, -4]
    layers = [normal_layer(), *(uv_layer(i, value) for i, value in enumerate(uv_names))]
    references = [layer_reference("LayerElementNormal", 0)]
    references.extend(layer_reference("LayerElementUV", i) for i in range(len(uv_names)))
    if with_color:
        layers.append(color_layer())
        references.append(layer_reference("LayerElementColor", 0))
    layers.append(material_layer())
    references.append(layer_reference("LayerElementMaterial", 0))
    return node("Geometry", (object_id, f"Geometry::{name}", "Mesh"), (
        node("GeometryVersion", (124,)), node("Vertices", (("d", vertices),)),
        node("PolygonVertexIndex", (("i", polygon),)), *layers,
        node("Layer", (0,), (node("Version", (100,)), *references)),
    ))


def model(object_id, name):
    return node("Model", (object_id, f"Model::{name}", "Mesh"), (
        node("Version", (232,)), node("Properties70"),
    ))


def material(object_id):
    return node("Material", (object_id, "Material::Runtime004", ""), (
        node("Version", (102,)), node("ShadingModel", ("phong",)),
        node("MultiLayer", (0,)),
    ))


def connection(source, destination):
    return node("C", ("OO", source, destination))


def binary_document(specs, creator):
    header = b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", VERSION)
    extension = node("FBXHeaderExtension", children=(
        node("FBXHeaderVersion", (1003,)), node("FBXVersion", (VERSION,)),
        node("Creator", (creator,)),
    ))
    body = bytearray()
    for spec in (extension, *specs):
        body.extend(encode_node(spec, len(header) + len(body)))
    body.extend(NULL_RECORD)
    footer = FOOTER_MAGIC_1 + b"\0" * 4 + struct.pack("<I", VERSION) \
        + b"\0" * 120 + FOOTER_MAGIC_2
    return header + bytes(body) + footer


def fixture(uv_names, duplicate_connection, object_base, creator):
    geometry_id = object_base + 1
    model_id = object_base + 2
    material_id = object_base + 3
    objects = node("Objects", children=(
        model(model_id, "Runtime004"),
        mesh(geometry_id, "Runtime004", uv_names),
        material(material_id),
    ))
    connection_nodes = [
        connection(geometry_id, model_id), connection(material_id, model_id),
        connection(model_id, 0),
    ]
    if duplicate_connection:
        connection_nodes.append(connection(geometry_id, model_id))
    connections = node("Connections", children=connection_nodes)
    return binary_document((global_settings(), objects, connections), creator)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2] / "tests/fixtures/fbx"
    root.mkdir(parents=True, exist_ok=True)
    outputs = {
        "runtime-004-attributes.fbx": fixture(
            ["", "shared", "shared"], True, 9007199254740992,
            "FBX-RUNTIME-004 attribute and warning fixture"),
        "runtime-004-attribute-limit.fbx": fixture(
            [f"uv-{index}" for index in range(9)], False, 9100000000000000,
            "FBX-RUNTIME-004 attribute limit fixture"),
    }
    for name, data in outputs.items():
        target = root / name
        target.write_bytes(data)
        print(target)
