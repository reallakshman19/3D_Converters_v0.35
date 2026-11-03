import { AIV_SOURCE_CSV_HEADER } from './source-csv.js';
import { AIV_ASSESSMENT_CSV_HEADER } from './assessment-csv.js';
import { AIV_SOURCE_ASSESSMENT_CSV_HEADER } from './source-assessment-csv.js';
import { resolveAivEitControlledSonicState } from './aiv-eit-controlled-sonic-state.js';

const DEVICE_FROM_VT = Object.freeze({
  relief: 'RELIEF_VALVE',
  recycle: 'CONTROL_VALVE',
  control: 'CONTROL_VALVE',
  'restriction orifice': 'RESTRICTION_ORIFICE',
  restriction: 'RESTRICTION_ORIFICE',
  'pressure reducing': 'PRESSURE_REDUCING_BRANCH_CONNECTION',
});

function finite(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function safeId(value) {
  return clean(value).replace(/[^A-Za-z0-9_.:-]+/gu, '-').replace(/^-+|-+$/gu, '') || 'UNRESOLVED';
}

function rowFrom(header, values) {
  return Object.freeze(header.map((column) => clean(values[column])));
}

function sourceDeviceType(detail) {
  const explicit = clean(detail.sourceDeviceType);
  if (explicit) return explicit;
  return DEVICE_FROM_VT[clean(detail.vt).toLowerCase()] ?? 'PRESSURE_REDUCING_BRANCH_CONNECTION';
}

function sourceState(detail, deviceType) {
  const explicit = clean(detail.sourceState);
  if (explicit) return explicit;
  return deviceType === 'RELIEF_VALVE' ? 'RELIEVING' : 'ACTIVE';
}

function phase(detail, stream) {
  const value = clean(detail.phase || stream?.phase).toUpperCase().replaceAll(' ', '_');
  if (value === 'GAS' || value === 'WET_GAS' || value === 'TWO_PHASE' || value === 'LIQUID') return value;
  return 'GAS';
}

function sonicState(document, line, detail, stream) {
  const explicit = clean(detail.sonicState).toUpperCase();
  if (explicit) return { state: explicit, resolution: null };
  const resolution = resolveAivEitControlledSonicState({ document, line, detail, stream });
  return { state: resolution?.state ?? 'UNRESOLVED', resolution };
}

function trim(detail, sourceName) {
  const reduction = finite(detail.lnt);
  const explicitState = clean(detail.lowNoiseTrimState).toUpperCase();
  if (explicitState) {
    return {
      state: explicitState,
      reduction: reduction === null ? '' : reduction,
      unit: reduction === null ? '' : 'dB',
      source: reduction === null ? '' : clean(detail.lowNoiseTrimSource) || sourceName,
      revision: reduction === null ? '' : clean(detail.lowNoiseTrimSourceRevision) || 'EIT_V5_IMPORT',
    };
  }
  if (reduction !== null && reduction > 0) {
    return {
      state: 'MANUFACTURER_REDUCTION', reduction, unit: 'dB',
      source: `${sourceName} · legacy aiv_data.lnt`, revision: 'UNVERIFIED_COMPATIBILITY_IMPORT',
    };
  }
  return { state: 'NONE', reduction: '', unit: '', source: '', revision: '' };
}

function caseIdFor(line, detail, stream) {
  return clean(detail.caseId || stream?.caseId || line.pnid) || `EIT-CASE-${safeId(line.rid)}`;
}

function sourceIdFor(line, detail, stream, detailIndex) {
  return clean(detail.sourceCanonicalId || stream?.sourceCanonicalId)
    || `EIT-SOURCE-${safeId(line.rid)}-${detailIndex + 1}`;
}

function assessmentIdFor(line) {
  return clean(line.aivAssessmentCanonicalId) || `EIT-ASSESS-${safeId(line.rid || line.lref)}`;
}

function decimalPlaces(value) {
  const raw = clean(value).toLowerCase();
  if (!raw) return 0;
  const [mantissa, exponentText = '0'] = raw.split('e');
  const fractionDigits = (mantissa.split('.')[1] ?? '').length;
  const exponent = Number(exponentText);
  return Number.isInteger(exponent) ? Math.max(0, fractionDigits - exponent) : fractionDigits;
}

function pipeInsideDiameter(pipe) {
  const explicit = finite(pipe?.id);
  if (explicit !== null) return { value: explicit, derived: false };
  const od = finite(pipe?.od);
  const wt = finite(pipe?.wt);
  if (od === null || wt === null) return { value: '', derived: false };
  const places = Math.max(decimalPlaces(pipe?.od), decimalPlaces(pipe?.wt));
  const scale = 10 ** Math.min(places, 12);
  const scaledOd = Math.round(od * scale);
  const scaledWt = Math.round(wt * scale);
  const value = Number.isSafeInteger(scaledOd) && Number.isSafeInteger(scaledWt)
    ? (scaledOd - (2 * scaledWt)) / scale
    : Number((od - (2 * wt)).toPrecision(15));
  return { value: value > 0 ? value : '', derived: true };
}

function duplexState(pipe) {
  const explicit = clean(pipe?.duplexState).toUpperCase();
  if (explicit) return explicit;
  return /carbon\s+steel/iu.test(clean(pipe?.mat)) ? 'NO' : 'UNRESOLVED';
}

function assessmentType(pipe) {
  return clean(pipe?.assessmentType).toUpperCase() || 'OTHER_WELDED_DISCONTINUITY';
}

function sourceRow({ document, line, detail, stream, detailIndex, sourceName }) {
  const sourceId = sourceIdFor(line, detail, stream, detailIndex);
  const caseId = caseIdFor(line, detail, stream);
  const deviceType = sourceDeviceType(detail);
  const trimEvidence = trim(detail, sourceName);
  const sonic = sonicState(document, line, detail, stream);
  return {
    key: `${sourceId}\u0000${caseId}`,
    sourceId,
    caseId,
    sonicStateResolution: sonic.resolution,
    row: rowFrom(AIV_SOURCE_CSV_HEADER, {
      'Source Canonical ID': sourceId,
      'Operating Case': caseId,
      'Source Device Type': deviceType,
      'Source State': sourceState(detail, deviceType),
      Phase: phase(detail, stream),
      'Mass Flow': finite(detail.mfr ?? stream?.mfr) ?? '',
      'Mass Flow Unit': 'kg/h',
      'Upstream Pressure': finite(detail.usp ?? stream?.p) ?? '',
      'Upstream Pressure Unit': 'bar',
      'Upstream Pressure Basis': 'ABSOLUTE',
      'Downstream Pressure': finite(detail.dsp) ?? '',
      'Downstream Pressure Unit': 'bar',
      'Downstream Pressure Basis': 'ABSOLUTE',
      'Upstream Temperature': finite(detail.ust ?? stream?.t) ?? '',
      'Upstream Temperature Unit': 'degC',
      'Molecular Weight': finite(detail.molecularWeight ?? stream?.mw) ?? '',
      'Molecular Weight Unit': 'g/mol',
      'Low Noise Trim State': trimEvidence.state,
      'Low Noise Trim Reduction': trimEvidence.reduction,
      'Low Noise Trim Unit': trimEvidence.unit,
      'Low Noise Trim Source': trimEvidence.source,
      'Low Noise Trim Source Revision': trimEvidence.revision,
      'Sonic State': sonic.state,
      Source: sourceName,
      'Source Revision': 'EnergyInstituteEit.v5 compatibility import',
      'Record ID': `EIT-SOURCE:${safeId(line.rid)}:${detailIndex + 1}`,
      Status: 'REVIEW_REQUIRED',
    }),
  };
}

function assessmentRow({ line, pipe, sourceName }) {
  const assessmentId = assessmentIdFor(line);
  const inside = pipeInsideDiameter(pipe);
  return {
    assessmentId,
    derivedInsideDiameter: inside.derived,
    row: rowFrom(AIV_ASSESSMENT_CSV_HEADER, {
      'Assessment Canonical ID': assessmentId,
      'Assessment Type': assessmentType(pipe),
      'Main Outside Diameter': finite(pipe?.od) ?? '',
      'Main Outside Diameter Unit': 'mm',
      'Main Inside Diameter': inside.value,
      'Main Inside Diameter Unit': 'mm',
      'Main Wall Thickness': finite(pipe?.wt) ?? '',
      'Main Wall Thickness Unit': 'mm',
      'Branch Outside Diameter': finite(pipe?.branchOd) ?? '',
      'Branch Outside Diameter Unit': finite(pipe?.branchOd) === null ? '' : 'mm',
      'Branch Wall Thickness': finite(pipe?.branchWt) ?? '',
      'Branch Wall Thickness Unit': finite(pipe?.branchWt) === null ? '' : 'mm',
      Material: clean(pipe?.mat),
      'Duplex State': duplexState(pipe),
      Source: sourceName,
      'Source Revision': inside.derived
        ? 'EnergyInstituteEit.v5 · ID derived from OD - 2×WT · REVIEW_REQUIRED'
        : 'EnergyInstituteEit.v5 compatibility import',
      'Record ID': `EIT-ASSESSMENT:${safeId(line.rid)}`,
      Status: 'REVIEW_REQUIRED',
    }),
  };
}

function relationshipRow({ line, detail, sourceId, assessmentId, caseId, sourceName, detailIndex }) {
  const distance = finite(detail.distance);
  return rowFrom(AIV_SOURCE_ASSESSMENT_CSV_HEADER, {
    'Source Canonical ID': sourceId,
    'Assessment Canonical ID': assessmentId,
    'Operating Case': caseId,
    'Physical Distance': distance ?? '',
    'Physical Distance Unit': distance === null ? '' : clean(detail.distanceUnit) || 'm',
    'Distance Source': distance === null ? '' : clean(detail.distanceAuthority) || `${sourceName} · aiv_data.distance`,
    'Distance Source Revision': distance === null ? '' : 'EnergyInstituteEit.v5 compatibility import',
    'Simultaneous Source Group': clean(detail.simultaneousSourceGroup),
    'Applicability Disposition': 'APPLICABLE',
    Source: sourceName,
    'Source Revision': 'EnergyInstituteEit.v5 compatibility import',
    'Record ID': `EIT-REL:${safeId(line.rid)}:${detailIndex + 1}`,
    Status: 'REVIEW_REQUIRED',
  });
}

export function parseAivEitLineDetails(line) {
  if (typeof line?.aiv_data !== 'string') return Object.freeze([]);
  const parsed = JSON.parse(line.aiv_data);
  if (!Array.isArray(parsed)) throw new TypeError('EI .eit aiv_data must decode to an array.');
  return Object.freeze(parsed.map((item) => Object.freeze({ ...(item ?? {}) })));
}

function streamMaps(document) {
  const byId = new Map();
  const bySourceCase = new Map();
  for (const stream of document.streams ?? []) {
    byId.set(String(stream.si), stream);
    const sourceId = clean(stream.sourceCanonicalId);
    const caseId = clean(stream.caseId);
    if (sourceId && caseId) bySourceCase.set(`${sourceId}\u0000${caseId}`, stream);
  }
  return { byId, bySourceCase };
}

function streamFor(line, detail, streams) {
  const sourceId = clean(detail.sourceCanonicalId);
  const caseId = clean(detail.caseId);
  if (sourceId && caseId) {
    const identified = streams.bySourceCase.get(`${sourceId}\u0000${caseId}`);
    if (identified) return identified;
  }
  return streams.byId.get(String(line.si));
}

export function buildAivEitImportedRecords(document, sourceName) {
  const streams = streamMaps(document);
  const pipes = new Map((document.pipes ?? []).map((pipe) => [String(pipe.pi), pipe]));
  const sourceRows = new Map();
  const assessmentRows = new Map();
  const relationships = [];
  const detailEvidence = [];

  document.lines.forEach((line, lineIndex) => {
    if (!String(line.modules ?? '').split(',').map((item) => item.trim()).includes('aiv')) return;
    const details = parseAivEitLineDetails(line);
    const assessment = assessmentRow({ line, pipe: pipes.get(String(line.pi)), sourceName });
    if (!assessmentRows.has(assessment.assessmentId)) assessmentRows.set(assessment.assessmentId, assessment);
    details.forEach((detail, detailIndex) => {
      const stream = streamFor(line, detail, streams);
      const source = sourceRow({ document, line, detail, stream, detailIndex, sourceName });
      if (!sourceRows.has(source.key)) sourceRows.set(source.key, source.row);
      relationships.push(relationshipRow({
        line, detail, sourceId: source.sourceId, assessmentId: assessment.assessmentId,
        caseId: source.caseId, sourceName, detailIndex,
      }));
      detailEvidence.push(Object.freeze({
        key: `${source.sourceId}\u0000${assessment.assessmentId}\u0000${source.caseId}`,
        lineIndex,
        detailIndex,
        lineRid: clean(line.rid),
        sourceCanonicalId: source.sourceId,
        assessmentCanonicalId: assessment.assessmentId,
        caseId: source.caseId,
        segmentIds: Object.freeze(Array.isArray(detail.segmentIds) ? detail.segmentIds.map(clean).filter(Boolean) : []),
        sonicStateResolution: source.sonicStateResolution,
        originalDetail: Object.freeze({ ...detail }),
      }));
    });
  });

  return Object.freeze({
    tables: Object.freeze({
      sources: Object.freeze([...sourceRows.values()]),
      assessments: Object.freeze([...assessmentRows.values()].map((item) => item.row)),
      relationships: Object.freeze(relationships),
    }),
    detailEvidence: Object.freeze(detailEvidence),
    derivedInsideDiameterCount: [...assessmentRows.values()].filter((item) => item.derivedInsideDiameter).length,
  });
}
