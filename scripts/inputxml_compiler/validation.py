from .base import *
def _validate_xsd(root: ET._Element, xsd_path: Path) -> list[str]:
    schema = ET.XMLSchema(ET.parse(str(xsd_path)))
    document = ET.ElementTree(root)
    if schema.validate(document):
        return []
    return [str(entry) for entry in schema.error_log]


def _validate_schematron(root: ET._Element, sch_path: Path) -> list[str]:
    schema_doc = ET.parse(str(sch_path))
    schematron = isoschematron.Schematron(schema_doc, store_report=True)
    document = ET.ElementTree(root)
    if schematron.validate(document):
        return []
    report = schematron.validation_report
    ns = {"svrl": "http://purl.oclc.org/dsdl/svrl"}
    if report is None:
        return [str(entry) for entry in schematron.error_log]
    return [
        " ".join(node.xpath("string(svrl:text)", namespaces=ns).split())
        for node in report.xpath("//svrl:failed-assert", namespaces=ns)
    ]



__all__ = [name for name in globals() if not name.startswith("__")]
