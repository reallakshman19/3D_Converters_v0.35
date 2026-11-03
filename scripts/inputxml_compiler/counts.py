from .base import *
from .xml import *
from .extension import *
def _new_root(version: str) -> tuple[ET._Element, ET._Element]:
    root = ET.Element(ET.QName(COADE_NS, "CAESARII"), nsmap=NSMAP, VERSION=version, XML_TYPE="Input")
    model = ET.SubElement(root, "PIPINGMODEL", nsmap={None: ""})
    return root, model


def _source_counts(model: ET._Element) -> dict[str, int]:
    elements = [child for child in model if _local(child.tag) == "PIPINGELEMENT" and _namespace(child.tag) == ""]
    return {
        "NUMELT": len(elements),
        "NUMNOZ": sum(1 for child in model if _local(child.tag) in NOZZLE_NAMES),
        "NOHGRS": sum(len([c for c in element if _local(c.tag) == "HANGER"]) for element in elements),
        "NUMBEND": sum(1 for element in elements if any(_local(c.tag) == "BEND" for c in element)),
        "NUMRIGID": sum(1 for element in elements if any(_local(c.tag) == "RIGID" for c in element)),
        "NUMREST": sum(1 for element in elements if any(_local(c.tag) == "RESTRAINT" for c in element)),
        "NUMISECT": sum(1 for element in elements if any(_local(c.tag) == "SIF" for c in element)),
        "NUMEXPJNT": sum(1 for element in elements for c in element if _local(c.tag) in {"EXPANSION_JOINT", "EXPANSIONJOINT"}),
        "NUMFORCMNT": sum(1 for element in elements for c in element if _local(c.tag) == "FORCESMOMENTS"),
        "NUMUNFLOAD": sum(1 for element in elements for c in element if _local(c.tag) == "UNIFORM"),
        "NUMWIND": sum(1 for element in elements for c in element if _local(c.tag) == "WIND"),
        "NUMELEOFF": sum(1 for element in elements for c in element if _local(c.tag) == "OFFSETS"),
        "NUMALLOW": sum(1 for element in elements for c in element if _local(c.tag) == "ALLOWABLESTRESS"),
    }


def _verify_source_counts(model: ET._Element, ledger: DecisionLedger) -> None:
    actual = _source_counts(model)
    for field, count in actual.items():
        raw = model.get(field)
        if raw is None:
            continue
        asserted = int(_integer_text(raw, f"PIPINGMODEL@{field}", nonnegative=True))
        if asserted != count:
            ledger.add(
                source_entity_id=f"PIPINGMODEL@{field}",
                source_type="CONTROL_ASSERTION",
                source_fields={"asserted": asserted, "actual": count},
                disposition="REJECT_INVALID",
                diagnostics=["source CONTROL count mismatch"],
            )
            raise CompileBlocked(f"Source {field}={asserted} does not match actual source count {count}.")
        ledger.add(
            source_entity_id=f"PIPINGMODEL@{field}",
            source_type="CONTROL_ASSERTION",
            source_fields={field: asserted},
            disposition="EMIT_1_TO_1",
            evidence=["verified against source children; canonical value will be recomputed"],
            cii_section="CONTROL",
        )


def _canonical_counts(model: ET._Element) -> dict[str, int]:
    elements = model.findall("PIPINGELEMENT")
    return {
        "NUMELT": len(elements),
        "NUMNOZ": sum(1 for child in model if _local(child.tag) in NOZZLE_NAMES),
        "NOHGRS": sum(len(element.findall("HANGER")) for element in elements),
        "NUMBEND": sum(1 for element in elements if element.find("BEND") is not None),
        "NUMRIGID": sum(1 for element in elements if element.find("RIGID") is not None),
        "NUMEXPJNT": 0,
        "NUMREST": sum(1 for element in elements if element.find("RESTRAINT") is not None),
        "NUMFORCMNT": 0,
        "NUMUNFLOAD": 0,
        "NUMWIND": 0,
        "NUMELEOFF": 0,
        "NUMALLOW": 0,
        "NUMISECT": sum(1 for element in elements if element.find("SIF") is not None),
    }

__all__ = [name for name in globals() if not name.startswith("__")]
