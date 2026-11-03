import { buildVibrationWorkspaceFitDetail } from './fit-detail.js';
import { vibrationWorkspaceRowKey } from './query.js';

function exactIdentity(row, target) {
  return row?.canonicalId === target.canonicalId
    && row?.line === target.line
    && row?.caseId === target.caseId;
}

function matchingOperatingCase(workflow, selectedRow) {
  return workflow.dataset?.operatingCases?.find((row) => (
    row.line === selectedRow.line && row.caseId === selectedRow.caseId
  )) ?? null;
}

function matchingEnrichment(workflow, selectedRow) {
  return (workflow.dataset?.enrichment ?? []).filter((row) => (
    row.canonicalId === selectedRow.canonicalId
    && (row.caseId === undefined || row.caseId === selectedRow.caseId)
  ));
}

function inputDetail(planItem) {
  if (!planItem?.request) return null;
  return {
    values: planItem.request.inputs,
    units: planItem.request.inputUnits,
    qualificationMode: planItem.request.options?.qualificationMode ?? null,
  };
}

function evidenceDetail(resultRow) {
  if (!resultRow?.centralResult) return null;
  return {
    qualification: resultRow.centralResult.qualification ?? null,
    qualificationCoverage: resultRow.qualificationCoverage ?? null,
    screeningCandidate: resultRow.screeningCandidate ?? null,
    evidence: resultRow.centralResult.evidence ?? null,
  };
}

export function buildVibrationWorkspaceDetail(workflow, selectedRow) {
  if (!selectedRow) return null;
  const planItem = workflow.plan?.items?.find((row) => exactIdentity(row, selectedRow)) ?? null;
  const resultRow = workflow.result?.rows?.find((row) => exactIdentity(row, selectedRow)) ?? null;

  return {
    rowKey: vibrationWorkspaceRowKey(selectedRow),
    summary: selectedRow,
    inputs: inputDetail(planItem),
    fitMechanism: buildVibrationWorkspaceFitDetail(resultRow),
    operatingCase: matchingOperatingCase(workflow, selectedRow),
    enrichment: matchingEnrichment(workflow, selectedRow),
    evidenceQualification: evidenceDetail(resultRow),
    sourceTrace: resultRow?.sourceTrace ?? planItem?.sourceTrace ?? null,
    diagnostics: {
      missing: [...(selectedRow.missing ?? [])],
      invalid: [...(selectedRow.invalid ?? [])],
      errorCodes: [...(selectedRow.errorCodes ?? [])],
      centralErrors: resultRow?.errors ?? [],
    },
  };
}
