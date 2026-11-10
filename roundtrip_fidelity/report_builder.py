"""R3 reproducible JSON, CSV and Markdown reports. No synthetic test claims."""
from __future__ import annotations
import csv
import json
from collections import Counter
from pathlib import Path

ARTIFACTS=("field-lineage.json","field-reversibility.json",
           "field-value-verification.json","field-coverage-summary.json",
           "field-coverage.csv","reversibility-audit.md","test-results.md")


def _json(path, data):
    path.write_text(json.dumps(data,indent=2,sort_keys=True,
                               ensure_ascii=False,default=str)+"\n",encoding="utf-8")


def write_artifacts(directory, *, fidelity_ledger, classifier, verification,
                    coverage, test_receipt=None):
    out=Path(directory);out.mkdir(parents=True,exist_ok=True)
    for name,data in (
        ("field-lineage.json",fidelity_ledger),
        ("field-reversibility.json",classifier),
        ("field-value-verification.json",verification),
        ("field-coverage-summary.json",coverage)):
        _json(out/name,data)
    columns=["fieldRelationshipId","relationshipDirection","sourceFieldIds",
             "sourceFieldPath","originalSourceToken","ciiFieldId","ciiField",
             "emittedToken","sourceUnit","emittedUnit","reversibility","valueStatus",
             "editTechnicalEligibility","physicalAuthority","inverseMappingUnique",
             "valueSourceAuthority","masterRowOrdinal","masterFieldHeader",
             "configurationSha256","reasonCodes"]
    with (out/"field-coverage.csv").open("w",newline="",encoding="utf-8") as stream:
        writer=csv.DictWriter(stream,fieldnames=columns);writer.writeheader()
        for row in classifier["relationships"]:
            provenance=row.get("processProvenance") or {}
            master=provenance.get("winningMaster") or {}
            flat={**row,
                  "masterRowOrdinal":master.get("rowOrdinal"),
                  "masterFieldHeader":master.get("selectedHeader"),
                  "configurationSha256":provenance.get("configurationSha256")}
            writer.writerow({key:(";".join(map(str,flat[key])) if isinstance(flat.get(key),list)
                                  else flat.get(key)) for key in columns})
    counts=classifier["counts"]
    groups=counts["propertyGroups"]
    details=coverage["evidence"]
    doc=["# R3 — Field-Level Reversibility Audit","",
         f"Evidence class: {fidelity_ledger['evidenceClass']}",
         f"Status: {fidelity_ledger['status']}",
         f"Authentic historical replay: {details['authenticReplay']}","",
         "## Frozen conversion identity","",
         f"- Original input XML: {details.get('originalInputSha256') or 'NOT_AVAILABLE'}",
         f"- Effective EnrichedXML: {details['engineInputSha256']}",
         f"- Python preprocessed XML: {details['pythonPreprocessedXmlSha256']}",
         f"- CII SHA256: {details['originalCiiSha256']}",
         f"- Configuration SHA256: {details['effectiveConfigSha256']}",
         f"- No-edit replay: {details['noEditReplayStatus']}","",
         "A current-writer CII is not independent historical Owner evidence.","",
         "## Per-field coverage","",
         "| Metric | Count |","|---|---:|",
         f"| Original XML fields | {counts['originalInputFieldsInventoried']} |",
         f"| Effective XML source fields | {counts['sourceFieldsInventoried']} |",
         f"| Actual serialized CII field locations | {counts['outputFieldsInventoried']} |",
         f"| Output-side field relationships | {counts['outputFieldRelationships']} |",
         f"| Matched source field identities | {counts['sourceFieldsWithEmittedRelationships']} |",
         f"| Source fields without verified output | {counts['unemittedOrUnresolvedSourceFields']} |",
         f"| All relationship records | {counts['allRelationshipRecords']} |",
         f"| Master-controlled CII fields | {counts['masterControlledOutputFields']} |",
         f"| Unresolved process authority fields | {counts['unresolvedProcessAuthorityFields']} |",
         f"| False unique master inverse claims | {counts['masterControlledUniqueInverseClaims']} |"]
    for name in ("LOSSLESS","LOSSLESS_WITH_PROVENANCE","LOSSY","UNRESOLVED"):
        doc.append(f"| {name} | {counts['classifications'][name]} |")
    doc+=["","## Engineering property groups","",
          "| Group | LOSSLESS | WITH PROVENANCE | LOSSY | UNRESOLVED |",
          "|---|---:|---:|---:|---:|"]
    for group,v in sorted(groups.items()):
        doc.append(f"| {group} | {v.get('LOSSLESS',0)} | "+
                   f"{v.get('LOSSLESS_WITH_PROVENANCE',0)} | "+
                   f"{v.get('LOSSY',0)} | {v.get('UNRESOLVED',0)} |")
    doc+=["","## Independent field verification","",
          f"- Verified writer serialization: {verification['exactWriterValueFields']}",
          f"- Unverified output fields: {verification['unverifiedFields']}",
          f"- Discrepant engineering values: {verification['discrepancyCount']}",
          f"- Complete IEL pointer slots: {coverage['ciiPointerValidation']['pointerFieldsValidated']}",
          "","## Engineering release boundary","",
          "- Lineage and technical eligibility do not authorize engineering edits.",
          "- Master-controlled process fields retain winning row/config custody, not an XML inverse.",
          "- Source-selected mass is not necessarily physical component mass authority.",
          "- Source-only Bore, Rating, DTXR and ComponentRefNo cannot be reverse-inferred from CII.",
          "- Generated CII auxiliary pointer numbers are not stable source identities.",
          "- No source XML modification, converter rewrite or editing UI change was made.",
          "","## Historical Owner GLRD 433/144","",
          f"AUTHENTIC_REPLAY: {details['authenticReplay']}"]
    for missing in details.get("missingDependencies",[]):
        doc.append("- Missing: "+missing)
    (out/"reversibility-audit.md").write_text("\n".join(doc)+"\n",encoding="utf-8")
    if test_receipt is None:
        test_receipt={"status":"NOT_RUN","commands":[],
                      "reason":"No command execution receipt supplied to artifact generator."}
    lines=["# R3 Executed Test Results","",f"Status: {test_receipt['status']}","",
           test_receipt.get("reason","")]
    for t in test_receipt.get("commands",[]):
        lines.append("- "+t.get("command","UNKNOWN")+" — "+
                     t.get("status","NOT_RUN")+" — "+str(t.get("counts","")))
    (out/"test-results.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    return [str(out/name) for name in ARTIFACTS]


def write_source_only(directory, source_inventory):
    """Missing output is NOT_RUN, never zero unresolved or fabricated links."""
    out=Path(directory);out.mkdir(parents=True,exist_ok=True)
    groups=dict(Counter(f["propertyGroup"] for f in source_inventory["fields"]))
    coverage={
        "schema":"xml-cii-field-coverage-summary/r3",
        "evidenceClass":"SOURCE_ONLY_INPUT_NO_ARCHIVED_CII",
        "status":"PARTIAL_SOURCE_ONLY_OUTPUT_NOT_RUN",
        "authenticReplay":"NOT_RUN",
        "sourceInventory":{
            "sha256":source_inventory["sourceXmlSha256"],
            "branches":source_inventory["branches"],
            "nodes":len(source_inventory["nodes"]),
            "fields":len(source_inventory["fields"]),
            "propertyGroups":dict(sorted(groups.items()))},
        "outputFieldsInventoried":None,
        "relationshipCounts":None,"reversibilityCounts":None,
        "missingDependencies":[
            "Frozen effective converter-input EnrichedXML",
            "Complete effective configuration and master selections",
            "Archived original 433/144 CII output",
            "Historical converter/runtime identity"],
    }
    _json(out/"field-lineage.json",{
        "status":"SOURCE_ONLY_NO_OUTPUT_PROOF",
        "sourceFields":source_inventory["fields"],"outputFields":None})
    _json(out/"field-reversibility.json",{"status":"NOT_RUN","relationships":None})
    _json(out/"field-value-verification.json",{"status":"NOT_RUN","outputFields":None})
    _json(out/"field-coverage-summary.json",coverage)
    with (out/"field-coverage.csv").open("w",newline="",encoding="utf-8") as stream:
        writer=csv.writer(stream)
        writer.writerow(["sourceFieldId","sourceFieldPath","originalSourceToken",
                         "ciiFieldId","classification","reasonCode"])
        for f in source_inventory["fields"]:
            writer.writerow([f["fieldId"],f["sourceFieldPath"],f["originalSourceToken"],
                             "NOT_RUN","UNRESOLVED","OUTPUT_CUSTODY_MISSING"])
    (out/"reversibility-audit.md").write_text(
        "# R3 Source-Only Audit\n\nSource fields were enumerated. "
        "Output field counts, lineage and authentic replay remain NOT_RUN. "
        "No original CII was reconstructed.\n\n"+
        json.dumps(coverage,indent=2)+"\n",encoding="utf-8")
    (out/"test-results.md").write_text(
        "# R3 Test Results\n\nNOT_RUN for this source-only audit.\n",encoding="utf-8")
    return coverage
