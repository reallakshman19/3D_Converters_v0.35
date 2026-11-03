from .base import *
from .xml import *
from .extension import *
from .counts import *
from .children import *
from .elements import *
from .family import *
def _set_model_count_assertions(model: ET._Element) -> None:
    counts = _source_counts(model)
    for field in COUNT_FIELDS:
        model.set(field, str(counts[field]))


def _ledger_direct_canonical(root: ET._Element, ledger: DecisionLedger) -> None:
    def visit(element: ET._Element, path: str) -> None:
        local = _local(element.tag)
        ns = _namespace(element.tag)
        if ns == EXT_NS and local == "Record":
            disposition = element.get("disposition") or "UNSUPPORTED_BLOCKING"
        else:
            disposition = "EMIT_1_TO_1"
        ledger.add(
            source_entity_id=path,
            source_type=f"ELEMENT:{local}",
            source_fields={"attributes": dict(element.attrib), "text": (element.text or "").strip()},
            disposition=disposition,
            evidence=["direct canonical document retained after XSD and Schematron validation"],
        )
        for attr, value in element.attrib.items():
            ledger.add(
                source_entity_id=f"{path}@{attr}",
                source_type="ATTRIBUTE",
                source_fields={attr: value},
                disposition=disposition if ns == EXT_NS else "EMIT_1_TO_1",
                evidence=["direct canonical field retained"],
            )
        counts: dict[str, int] = {}
        for child in element:
            name = _local(child.tag)
            counts[name] = counts.get(name, 0) + 1
            visit(child, f"{path}/{name}[{counts[name]}]")
    visit(root, "/CAESARII")


def _fragment_document(root: ET._Element, context: dict[str, Any]) -> ET._Element:
    if _local(root.tag) == "PIPINGELEMENT":
        elements = [root]
    else:
        elements = [child for child in root if _local(child.tag) == "PIPINGELEMENT" and _namespace(child.tag) == ""]
    if not elements:
        raise CompileBlocked("Fragment contains no direct PIPINGELEMENT records.")
    version = str(context.get("version") or "").strip()
    job_name = str(context.get("jobName") or "").strip()
    north = context.get("north")
    if not version or not job_name or not isinstance(north, list) or len(north) != 3:
        raise CompileBlocked("Fragment compilation requires explicit context: version, jobName, and north[3].")
    wrapper, model = _new_root(version)
    model.set("JOBNAME", job_name)
    if context.get("time"):
        model.set("TIME", str(context["time"]))
    model.set("ISSUE_NO", str(context.get("issueNo") or ""))
    for field, value in zip(("NORTH_X", "NORTH_Y", "NORTH_Z"), north):
        model.set(field, str(value))
    for field in COUNT_FIELDS:
        model.set(field, "0")
    for element in elements:
        model.append(copy.deepcopy(element))
    _set_model_count_assertions(model)
    return wrapper



__all__ = [name for name in globals() if not name.startswith("__")]
