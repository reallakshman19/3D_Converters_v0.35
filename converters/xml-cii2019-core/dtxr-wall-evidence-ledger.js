import {
  resolveXmlCiiWallThicknessFromDtxr,
  xmlCiiDtxrDirectWallText,
  xmlCiiDtxrScheduleText,
} from './dtxr-wall-thickness-resolver.js';

const EVIDENCE_SCHEMA = 'xml-cii-dtxr-wall-evidence/v1';
const BLOCKED_CARRIER_TYPES = new Set([
  'OLET', 'TEE', 'GASK', 'ATTA', 'SUPPORT', 'RESTRAINT',
]);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function norm(value) {
  return text(value).toUpperCase().replace(/\s+/g, ' ');
}

function normalizeEvidence(value, sequence) {
  if (typeof value === 'string') {
    return {
      sequence,
      dtxr: text(value),
      componentType: '',
      componentRefNo: '',
      boreMm: null,
      source: 'legacy-string',
    };
  }
  if (!value || typeof value !== 'object') return null;
  const bore = Number(value.boreMm ?? value.bore ?? value.dn);
  return {
    sequence,
    dtxr: text(value.dtxr ?? value.text ?? value.value),
    componentType: norm(value.componentType ?? value.type),
    componentRefNo: text(value.componentRefNo ?? value.ref),
    boreMm: Number.isFinite(bore) && bore > 0 ? bore : null,
    source: text(value.source) || 'structured-evidence',
  };
}

function sameBore(candidateBore, targetBore) {
  if (!Number.isFinite(candidateBore)) return true;
  return Math.abs(candidateBore - targetBore) <= Math.max(1, targetBore * 0.01);
}

function selectedRecord(records, resolution) {
  if (!resolution) return null;
  return records.find((record) => (
    record.dtxr === text(resolution.dtxr)
    && record.componentType === norm(resolution.componentType)
    && record.componentRefNo === text(resolution.componentRefNo)
    && record.source === text(resolution.evidenceSource)
    && (
      record.boreMm === null
      || resolution.evidenceBoreMm === null
      || Number(record.boreMm) === Number(resolution.evidenceBoreMm)
    )
  )) || records.find((record) => (
    record.dtxr === text(resolution.dtxr)
    && record.componentType === norm(resolution.componentType)
  )) || null;
}

function candidateResolution(record, targetBore, config) {
  if (!record.dtxr || !sameBore(record.boreMm, targetBore)) return null;
  if (BLOCKED_CARRIER_TYPES.has(record.componentType)) return null;
  return resolveXmlCiiWallThicknessFromDtxr({
    boreMm: targetBore,
    dtxrValues: [record],
    config,
  });
}

function dispositionFor(record, targetBore, selectedSequence, candidate) {
  if (!record.dtxr) return 'REJECTED_EMPTY_DTXR';
  if (!sameBore(record.boreMm, targetBore)) return 'REJECTED_BORE_MISMATCH';
  if (BLOCKED_CARRIER_TYPES.has(record.componentType)) return 'REJECTED_BLOCKED_CARRIER_TYPE';
  if (record.sequence === selectedSequence) return 'SELECTED';
  const directWallMm = xmlCiiDtxrDirectWallText(record.dtxr);
  const schedule = xmlCiiDtxrScheduleText(record.dtxr);
  if (!candidate && (directWallMm !== null || schedule)) return 'REJECTED_UNRESOLVED_WALL_EVIDENCE';
  if (candidate?.evidenceKind === 'DIRECT_WALL') return 'ELIGIBLE_DIRECT_WALL';
  if (candidate?.evidenceKind === 'SCHEDULE') return 'ELIGIBLE_SCHEDULE';
  return 'REJECTED_NO_WALL_EVIDENCE';
}

function evidenceRecord(record, targetBore, selectedSequence, config) {
  const directWallMm = xmlCiiDtxrDirectWallText(record.dtxr);
  const schedule = xmlCiiDtxrScheduleText(record.dtxr);
  const candidate = candidateResolution(record, targetBore, config);
  return {
    sequence: record.sequence,
    disposition: dispositionFor(record, targetBore, selectedSequence, candidate),
    selected: record.sequence === selectedSequence,
    dtxr: record.dtxr,
    componentType: record.componentType,
    componentRefNo: record.componentRefNo,
    boreMm: record.boreMm,
    targetBoreMm: targetBore,
    source: record.source,
    directWallMm,
    schedule,
    candidateWallThicknessMm: candidate?.wallThicknessMm ?? null,
    candidateSource: candidate?.source || '',
    candidateProvenance: candidate?.provenance || null,
  };
}

export function resolveXmlCiiWallThicknessWithEvidence({
  boreMm,
  dtxrValues = [],
  config = {},
} = {}) {
  const targetBore = Number(boreMm);
  const inputValues = Array.isArray(dtxrValues) ? dtxrValues : [dtxrValues];
  const normalized = inputValues
    .map(normalizeEvidence)
    .filter(Boolean);
  const resolution = resolveXmlCiiWallThicknessFromDtxr({
    boreMm: targetBore,
    dtxrValues: inputValues,
    config,
  });
  if (!resolution) return null;

  const selected = selectedRecord(normalized, resolution);
  const records = normalized.map((record) => evidenceRecord(
    record,
    targetBore,
    selected?.sequence,
    config,
  ));
  const rejectedCount = records.filter((record) => record.disposition.startsWith('REJECTED_')).length;
  const eligibleCount = records.length - rejectedCount;

  const selectedEvidence = selected ? {
    sequence: selected.sequence,
    dtxr: selected.dtxr,
    componentType: selected.componentType,
    componentRefNo: selected.componentRefNo,
    boreMm: selected.boreMm,
    source: selected.source,
    evidenceKind: resolution.evidenceKind,
    schedule: resolution.schedule,
    wallThicknessMm: resolution.wallThicknessMm,
    nps: resolution.nps,
    resolvedSource: resolution.source,
    provenance: resolution.provenance || null,
  } : null;

  return {
    ...resolution,
    evidenceSchema: EVIDENCE_SCHEMA,
    selectionPolicy: 'existing-resolver-rank-then-source-sequence',
    selectedEvidence,
    evidenceRecords: records,
    evidenceCount: records.length,
    eligibleEvidenceCount: eligibleCount,
    rejectedEvidenceCount: rejectedCount,
  };
}

export { EVIDENCE_SCHEMA as XML_CII_DTXR_WALL_EVIDENCE_SCHEMA };
