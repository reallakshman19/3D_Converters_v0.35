from .base import *


def _local(tag: str) -> str:
    return ET.QName(tag).localname if tag.startswith("{") else tag


def _namespace(tag: str) -> str:
    return ET.QName(tag).namespace or "" if tag.startswith("{") else ""


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _xml_bytes(root: ET._Element) -> bytes:
    return ET.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=True)


def _decimal(value: Any, field: str) -> Decimal:
    text = str(value).strip()
    if not text:
        raise CompileBlocked(f"Missing numeric field {field}.")
    try:
        result = Decimal(text)
    except InvalidOperation as exc:
        raise CompileBlocked(f"Invalid numeric field {field}: {text!r}.") from exc
    if not result.is_finite():
        raise CompileBlocked(f"Non-finite numeric field {field}: {text!r}.")
    return result


def _decimal_text(value: Any, field: str) -> str:
    number = _decimal(value, field)
    if number == 0:
        return "0"
    text = format(number, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text


def _integer_text(
    value: Any,
    field: str,
    *,
    positive: bool = False,
    nonnegative: bool = False,
) -> str:
    number = _decimal(value, field)
    integral = number.to_integral_value()
    if number != integral:
        raise CompileBlocked(f"Field {field} must be integer-like, got {value!r}.")
    integer = int(integral)
    if positive and integer <= 0:
        raise CompileBlocked(f"Field {field} must be positive, got {integer}.")
    if nonnegative and integer < 0:
        raise CompileBlocked(f"Field {field} must be non-negative, got {integer}.")
    return str(integer)


def _is_sentinel(value: Any) -> bool:
    try:
        return abs(_decimal(value, "sentinel-check") - SENTINEL) <= Decimal("0.000001")
    except CompileBlocked:
        return False


def _same_numeric(left: str, right: str) -> bool:
    try:
        return _decimal(left, "left") == _decimal(right, "right")
    except CompileBlocked:
        return left.strip() == right.strip()


def _safe_ncname(value: str, prefix: str = "X") -> str:
    text = re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value).strip())
    if not text or not re.match(r"[A-Za-z_]", text[0]):
        text = f"{prefix}_{text}"
    return text


def _parse_xml(source: bytes, source_name: str) -> ET._Element:
    if re.search(br"<!\s*(DOCTYPE|ENTITY)\b", source, flags=re.IGNORECASE):
        raise CompileBlocked(
            f"XML parse failed for {source_name}: DTD and entity declarations are prohibited."
        )
    parser = ET.XMLParser(
        resolve_entities=False,
        no_network=True,
        load_dtd=False,
        dtd_validation=False,
        recover=False,
        remove_blank_text=True,
        huge_tree=False,
    )
    try:
        return ET.fromstring(source, parser=parser)
    except ET.XMLSyntaxError as exc:
        raise CompileBlocked(f"XML parse failed for {source_name}: {exc}") from exc


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _registered_dialects(registry: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {entry["dialectId"]: entry for entry in registry["dialects"]}


def detect_dialect(root: ET._Element, registry: dict[str, Any]) -> str:
    del registry
    local = _local(root.tag)
    ns = _namespace(root.tag)
    if local == "CategorizedInputXML" and ns == "":
        return "categorized-inputxml-v3"
    if local == "PIPINGELEMENT" and ns == "":
        return "inputxml-fragment"
    if local.lower() == "fragment" and ns == "":
        return "inputxml-fragment"
    if local == "NodeSet":
        return "nodeset-v1"
    if local == "Root" and ns == "":
        return "xml-builder-root-branch-node"
    if local == "PipeStressExport" and ns == "http://aveva.com/pipeStress116.xsd":
        return "pipesstressexport-psi116-xml"
    if local != "CAESARII" or ns != COADE_NS:
        raise CompileBlocked(f"No registered dialect matches root {{{ns}}}{local}.")
    if root.get("XML_TYPE") != "Input":
        raise CompileBlocked("CAESARII XML_TYPE must be exactly 'Input'.")
    models = [
        child
        for child in root
        if _local(child.tag) == "PIPINGMODEL" and _namespace(child.tag) == ""
    ]
    if len(models) != 1:
        raise CompileBlocked(
            "Exactly one direct unqualified PIPINGMODEL is required for InputXML-family intake."
        )
    model = models[0]
    elements = [
        element
        for element in model
        if _local(element.tag) == "PIPINGELEMENT" and _namespace(element.tag) == ""
    ]
    version = (root.get("VERSION") or "").strip()
    if version.split(".", 1)[0] == "14":
        return "cii14-inputxml"
    child_names = {
        _local(child.tag)
        for element in elements
        for child in element
        if _namespace(child.tag) == ""
    }
    if child_names & KNOWN_ENRICHMENT_CHILDREN:
        return "enriched-inputxml-app"
    attrs = {name for element in elements for name in element.attrib}
    if any(re.fullmatch(r"PRESSURE[1-9]", name) for name in attrs) or "LINE_ID" in attrs:
        return "caesar-inputxml-pressure1"
    unsupported_children = any(
        _namespace(child.tag) == "" and _local(child.tag) not in ELEMENT_CHILD_ORDER
        for element in elements
        for child in element
    )
    if (
        elements
        and all(element.get("ID") and element.get("LINE") for element in elements)
        and not unsupported_children
    ):
        return "canonical-inputxml-v1"
    return "caesar-inputxml-pressure-c"


def _resolve_aliases(
    alias_registry: dict[str, Any],
) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for row in alias_registry.get("aliases", []):
        if row.get("aliasKind") != "FIELD_NAME":
            continue
        result.setdefault(row["parentElement"], {})[
            row["alias"]
        ] = row["canonicalName"]
    for row in alias_registry.get("patternAliases", []):
        if row.get("aliasKind") != "FIELD_NAME":
            continue
        for index in row["indexes"]:
            result.setdefault(row["parentElement"], {})[
                row["aliasPattern"].replace("{n}", str(index))
            ] = row["canonicalPattern"].replace("{n}", str(index))
    return result


def _source_field(
    element: ET._Element,
    canonical: str,
    aliases: dict[str, str],
    ledger: DecisionLedger,
    entity_id: str,
    *,
    canonical_element_id: str | None = None,
    canonical_path: str | None = None,
) -> tuple[str | None, str | None]:
    candidates = [canonical] + [
        alias for alias, target in aliases.items() if target == canonical
    ]
    present = [
        (name, element.get(name))
        for name in candidates
        if element.get(name) is not None
    ]
    if not present:
        return None, None
    canonical_entries = [
        (name, value) for name, value in present if name == canonical
    ]
    chosen_name, chosen_value = canonical_entries[0] if canonical_entries else present[0]
    for name, value in present:
        if name == chosen_name:
            continue
        equal = (
            _same_numeric(chosen_value or "", value or "")
            if canonical not in {"LINE", "FROM_NAME", "TO_NAME"}
            else (chosen_value or "").strip() == (value or "").strip()
        )
        if not equal:
            ledger.add(
                source_entity_id=entity_id,
                source_type="FIELD_ALIAS_CONFLICT",
                source_fields={chosen_name: chosen_value, name: value},
                disposition="REJECT_INVALID",
                diagnostics=[f"Alias collision for {canonical}"],
            )
            raise CompileBlocked(
                f"Alias collision for {canonical}: {chosen_name}={chosen_value!r}, {name}={value!r}."
            )
    if chosen_name != canonical:
        canonical_identity = (
            f"{canonical_path}@{canonical}"
            if canonical_path
            else f"{entity_id}@{canonical}"
        )
        ledger.add(
            source_entity_id=canonical_identity,
            source_type="ATTRIBUTE_ALIAS",
            source_fields={
                "sourceEntityId": entity_id,
                "sourceAlias": chosen_name,
                "canonicalField": canonical,
                "value": chosen_value,
            },
            canonical_element_ids=[canonical_element_id]
            if canonical_element_id
            else [],
            inputxml_element_ids=[canonical_element_id]
            if canonical_element_id
            else [],
            disposition="EMIT_1_TO_1",
            evidence=[f"renamed {chosen_name} to {canonical}"],
            confidence={
                "identity": 1.0,
                "topology": 1.0,
                "geometry": 1.0,
                "dimensions": 1.0,
                "attributes": 1.0,
                "ciiProjection": 1.0,
            },
        )
    return chosen_value, chosen_name


__all__ = [name for name in globals() if not name.startswith("__")]
