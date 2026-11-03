#!/usr/bin/env python3
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
    header = struct.pack("<IIIB", end, len(properties), len(props), len(name_bytes))
    return header + name_bytes + props + bytes(child_data)


def p_vec(name, values):
    return node("P", (name, "Lcl Translation", "", "A", *map(float, values)))


def p_geometric_translation(values):
    return node("P", ("GeometricTranslation", "Vector3D", "Vector", "", *map(float, values)))


def p_int(name, value):
    return node("P", (name, "int", "Integer", "", int(value)))


def p_double(name, value):
    return node("P", (name, "double", "Number", "", float(value)))


def model(object_id, name, subtype, translation=(0, 0, 0), geometric_translation=None):
    properties = [p_vec("Lcl Translation", translation)]
    if geometric_translation is not None:
        properties.append(p_geometric_translation(geometric_translation))
    return node("Model", (object_id, f"Model::{name}", subtype), (
        node("Version", (232,)), node("Properties70", children=properties),
    ))


def mesh(object_id, name, vertices=None):
    values = vertices or [0, 0, 0, 10, 0, 0]
    return node("Geometry", (object_id, f"Geometry::{name}", "Mesh"), (
        node("GeometryVersion", (124,)),
        node("Vertices", (("d", values),)),
        node("PolygonVertexIndex", (("i", [0, -2]),)),
    ))


def nurbs_curve(object_id, name):
    return node("Geometry", (object_id, f"Geometry::{name}", "NurbsCurve"), (
        node("GeometryVersion", (124,)), node("Type", ("NurbsCurve",)),
        node("NurbsCurveVersion", (100,)), node("Order", (2,)),
        node("Dimension", (3,)), node("Form", ("Open",)), node("Rational", (0,)),
        node("Points", (("d", [0, 0, 0, 1, 10, 0, 0, 1]),)),
        node("KnotVector", (("d", [0, 0, 1, 1]),)),
    ))


def source_object(dom_class, object_id, source_name, subtype, children=()):
    return node(dom_class, (object_id, source_name, subtype), children)


def animation_curve(object_id):
    return source_object("AnimationCurve", object_id, "AnimCurve::EvidenceCurve", "", (
        node("Default", (0.0,)),
        node("KeyVer", (4008,)),
        node("KeyTime", (("l", [0, 46186158000]),)),
        node("KeyValueFloat", (("f", [0.0, 1.0]),)),
        node("KeyAttrFlags", (("i", [0]),)),
        node("KeyAttrDataFloat", (("f", [0.0, 0.0, 0.0, 0.0]),)),
        node("KeyAttrRefCount", (("i", [2]),)),
    ))


def connection(source, destination, source_property=None, destination_property=None):
    values = ["OO", source, destination]
    if source_property is not None:
        values[0] = "OP"
        values.append(source_property)
    if destination_property is not None:
        values.append(destination_property)
    return node("C", values)


def global_settings(up_axis=1, front_axis=2):
    properties = (
        p_int("UpAxis", up_axis), p_int("UpAxisSign", 1),
        p_int("FrontAxis", front_axis), p_int("FrontAxisSign", -1),
        p_int("CoordAxis", 0), p_int("CoordAxisSign", 1),
        p_double("UnitScaleFactor", 1.0), p_double("OriginalUnitScaleFactor", 1.0),
    )
    return node("GlobalSettings", children=(
        node("Version", (1000,)), node("Properties70", children=properties),
    ))


def binary_document(top_specs, creator):
    header = b"Kaydara FBX Binary  \x00\x1a\x00" + struct.pack("<I", VERSION)
    body = bytearray()
    header_extension = node("FBXHeaderExtension", children=(
        node("FBXHeaderVersion", (1003,)), node("FBXVersion", (VERSION,)),
        node("Creator", (creator,)),
    ))
    for spec in (header_extension, *top_specs):
        body.extend(encode_node(spec, len(header) + len(body)))
    body.extend(NULL_RECORD)
    footer = FOOTER_MAGIC_1 + b"\0" * 4 + struct.pack("<I", VERSION) + b"\0" * 120 + FOOTER_MAGIC_2
    return header + bytes(body) + footer


def assemble_two_pipes():
    objects = node("Objects", children=(
        model(200, "Parent", "Null", (10, 0, 0)),
        model(201, "PipeOne", "Mesh", (20, 0, 0)), mesh(101, "PipeOne"),
        model(202, "PipeTwo", "Mesh", (40, 0, 0)), mesh(102, "PipeTwo"),
    ))
    connections = node("Connections", children=(
        connection(101, 201), connection(201, 200), connection(200, 0),
        connection(102, 202), connection(202, 0),
    ))
    return binary_document((global_settings(), objects, connections), "F2S-001 deterministic fixture")


def assemble_axis_geometric():
    objects = node("Objects", children=(
        model(300, "ZUpParent", "Null", (0, 0, 10)),
        model(301, "ZUpPipe", "Mesh", (0, 0, 20), geometric_translation=(0, 0, 5)),
        mesh(103, "ZUpPipe", [0, 0, 0, 0, 0, 10]),
    ))
    connections = node("Connections", children=(
        connection(103, 301), connection(301, 300), connection(300, 0),
    ))
    return binary_document((global_settings(up_axis=2, front_axis=1), objects, connections),
                           "F2S-001 axis and geometric transform fixture")


def assemble_all_categories():
    objects = node("Objects", children=(
        model(400, "EvidenceNull", "Null"),
        model(401, "EvidenceMesh", "Mesh"), mesh(402, "EvidenceMesh"),
        model(403, "EvidenceCurve", "NurbsCurve"), nurbs_curve(404, "EvidenceCurve"),
        source_object("Material", 405, "Material::EvidenceMaterial", ""),
        source_object("NodeAttribute", 406, "NodeAttribute::EvidenceCamera", "Camera"),
        source_object("NodeAttribute", 407, "NodeAttribute::EvidenceLight", "Light"),
        source_object("Texture", 408, "Texture::EvidenceTexture", "TextureVideoClip"),
        source_object("Video", 409, "Video::EvidenceVideo", "Clip"),
        source_object("Deformer", 410, "Deformer::EvidenceSkin", "Skin"),
        source_object("AnimationStack", 411, "AnimStack::EvidenceTake", ""),
        source_object("AnimationLayer", 412, "AnimLayer::EvidenceLayer", ""),
        animation_curve(413),
        source_object("MysteryObject", 414, "Mystery::EvidenceUnknown", "FutureSubtype"),
    ))
    connections = node("Connections", children=(
        connection(402, 401), connection(401, 400), connection(400, 0),
        connection(404, 403), connection(403, 0),
        connection(405, 401), connection(406, 400), connection(407, 400),
        connection(408, 405, "DiffuseColor"), connection(409, 408),
        connection(410, 402), connection(412, 411), connection(413, 412),
        connection(414, 0),
    ))
    return binary_document((global_settings(), objects, connections), "F2S-002 all-category fixture")


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    fixture_root = root / "tests/fixtures/fbx"
    fixture_root.mkdir(parents=True, exist_ok=True)
    outputs = {
        fixture_root / "two-pipes.fbx": assemble_two_pipes(),
        fixture_root / "axis-geometric.fbx": assemble_axis_geometric(),
        fixture_root / "all-categories.fbx": assemble_all_categories(),
    }
    for target, data in outputs.items():
        target.write_bytes(data)
        print(target)
