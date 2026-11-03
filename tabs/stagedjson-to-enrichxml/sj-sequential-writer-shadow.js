/**
 * Generates source-branch PSI XML beside the canonical XML and selects the
 * production XML plus matching trace records through a fail-closed policy.
 */

import { buildEnrichedXml } from './sj-xml-writer.js?v=4';
import { comparePsiWriterOutputs } from './sj-xml-writer-parity.js?v=1';

export const PSI_SEQUENTIAL_WRITER_SHADOW_SCHEMA = 'stagedjson-psi-sequential-writer-shadow/v1';
export const PSI_XML_WRITER_SELECTION_SCHEMA = 'stagedjson-psi-xml-writer-selection/v1';
export const PSI_WRITER_MODE_CANONICAL = 'canonical';
export const PSI_WRITER_MODE_SEQUENTIAL = 'sequential';

export function buildSequentialWriterShadow({ sequencePlan, canonicalXmlText, config = {} }) {
  if (!sequencePlan || sequencePlan.validation?.ok !== true) {
    return failedShadow(['A valid PSI sequence plan is required.']);
  }

  try {
    const branchMap = new Map();
    const records = [];
    for (const branch of sequencePlan.branches) {
      const branchRecords = branch.components.map((component) => ({
        ...component.record,
        canonicalBranchName: component.record?.branchName || branch.canonicalBranchName,
        branchName: branch.sourceBranchName,
        sourceBranchName: branch.sourceBranchName,
      }));
      branchMap.set(branch.sourceBranchName, branchRecords);
      records.push(...branchRecords);
    }

    const xmlText = buildEnrichedXml(branchMap, config);
    const parity = comparePsiWriterOutputs({ canonicalXmlText, sequentialXmlText: xmlText, sequencePlan });
    return Object.freeze({
      schema: PSI_SEQUENTIAL_WRITER_SHADOW_SCHEMA,
      generated: true,
      xmlText,
      records: Object.freeze(records),
      parity,
      validation: Object.freeze({ ok: parity.validation.ok, errors: parity.validation.errors }),
    });
  } catch (error) {
    return failedShadow([error instanceof Error ? error.message : String(error)]);
  }
}

export function selectPsiWriterOutput({
  canonicalXmlText,
  canonicalRecords = [],
  writerShadow,
  config = {},
}) {
  const requestedMode = normalizeMode(config.psiWriterMode);
  const blockers = requestedMode === PSI_WRITER_MODE_SEQUENTIAL
    ? sequentialBlockers(writerShadow, canonicalRecords)
    : [];
  const effectiveMode = requestedMode === PSI_WRITER_MODE_SEQUENTIAL && blockers.length === 0
    ? PSI_WRITER_MODE_SEQUENTIAL
    : PSI_WRITER_MODE_CANONICAL;
  const useSequential = effectiveMode === PSI_WRITER_MODE_SEQUENTIAL;
  const records = useSequential ? writerShadow.records : canonicalRecords;

  return Object.freeze({
    schema: PSI_XML_WRITER_SELECTION_SCHEMA,
    requestedMode,
    effectiveMode,
    fallbackApplied: requestedMode !== effectiveMode,
    xmlText: useSequential ? writerShadow.xmlText : canonicalXmlText,
    records: Object.freeze([...records]),
    gate: Object.freeze({
      allowed: blockers.length === 0,
      reason: blockers.length === 0
        ? (useSequential ? 'SEQUENTIAL_PARITY_PROVEN' : 'CANONICAL_DEFAULT')
        : 'SEQUENTIAL_BLOCKED',
      blockers: Object.freeze(blockers),
    }),
  });
}

function sequentialBlockers(writerShadow, canonicalRecords) {
  const blockers = [];
  if (!writerShadow?.generated) blockers.push('SHADOW_NOT_GENERATED');
  if (writerShadow?.validation?.ok !== true) blockers.push('SHADOW_VALIDATION_FAILED');
  if (writerShadow?.parity?.selectionGate?.allowed !== true) {
    blockers.push(...(writerShadow?.parity?.selectionGate?.blockers || ['PARITY_GATE_BLOCKED']));
  }
  if (!Array.isArray(writerShadow?.records)) blockers.push('SEQUENTIAL_TRACE_MISSING');
  if ((writerShadow?.records?.length ?? -1) !== canonicalRecords.length) {
    blockers.push('TRACE_CARDINALITY_MISMATCH');
  }
  if (writerShadow?.records?.some((record) => record.xmlNodeNum === null || record.xmlNodeNum === undefined)) {
    blockers.push('SEQUENTIAL_NODE_ALLOCATION_MISSING');
  }
  return [...new Set(blockers)];
}

function normalizeMode(value) {
  return String(value ?? '').trim().toLowerCase() === PSI_WRITER_MODE_SEQUENTIAL
    ? PSI_WRITER_MODE_SEQUENTIAL
    : PSI_WRITER_MODE_CANONICAL;
}

function failedShadow(errors) {
  return Object.freeze({
    schema: PSI_SEQUENTIAL_WRITER_SHADOW_SCHEMA,
    generated: false,
    xmlText: '',
    records: Object.freeze([]),
    parity: null,
    validation: Object.freeze({ ok: false, errors: Object.freeze([...new Set(errors)]) }),
  });
}
