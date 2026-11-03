import { deriveLineKeyFromBranchName } from '../converters/xml-cii2019-core/regex-line-key.js';
import { resolveBranchProcessData } from '../converters/xml-cii2019-core/branch-process-resolver.js';
import {
  buildDtxrContext,
  resolveDtxrForXmlNode,
} from '../converters/xml-cii2019-core/dtxr-resolver.js';
import { rankXmlCiiWeightCandidates } from '../converters/xml-cii2019-core/weight-valve-hints.js';
import { buildStagedSupportIndex } from '../converters/xml-cii2019-core/support-mapping.js';
import { resolveSupportMatchForPcfRow } from '../converters/xml-cii2019-core/support-pcf-row-matcher.js';
import { prepareXmlCiiMasterContext } from '../converters/xml-cii2019-core/master-context.js';
import { toFiniteNumber, toText } from '../converters/xml-cii2019-core/config.js';

function clean(value) { return toText(value).trim(); }
function upper(value) { return clean(value).toUpperCase(); }
function firstText(...values) {
  for (const value of values) {
    const text = clean(value);
    if (text) return text;
  }
  return '';
}
function firstNumber(...values) {
  for (const value of values) {
    const numeric = toFiniteNumber(value, null);
    if (numeric != null) return numeric;
  }
  return null;
}

function normalizePoint(point) {
  if (!point) return null;
  if (Array.isArray(point) && point.length >= 3) {
    const x = Number(point[0]);
    const y = Number(point[1]);
    const z = Number(point[2]);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }
  if (typeof point === 'object') {
    const x = Number(point.x ?? point.X);
    const y = Number(point.y ?? point.Y);
    const z = Number(point.z ?? point.Z);
    return [x, y, z].every(Number.isFinite) ? { x, y, z } : null;
  }
  const values = clean(point).match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function distanceMm(a, b) {
  const p1 = normalizePoint(a);
  const p2 = normalizePoint(b);
  if (!p1 || !p2) return null;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dz = p2.z - p1.z;
  const distance = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
  return Number.isFinite(distance) && distance > 0 ? distance : null;
}

function rowLengthMm(row = {}) {
  return firstNumber(row.lengthMm, row.length, row.brlen, row.faceToFace, row.attributes?.LENGTH, row.attributes?.BRLEN, distanceMm(row.ep1, row.ep2));
}

function rowBoreMm(row = {}) {
  return firstNumber(row.convertedBore, row.boreMm, row.p1bore, row.bore, row.nominalBore, row.attributes?.BORE, row.attributes?.P1BORE);
}

function lineRowText(row, keys = []) {
  for (const key of keys) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (clean(value)) return clean(value);
  }
  return '';
}

function normalizeLineKey(value) {
  return upper(value).replace(/^=/, '').replace(/\s+/g, '');
}

function findLineRow(lineRows = [], lineKey = '', row = {}) {
  const wanted = normalizeLineKey(lineKey);
  const fallbacks = [row.lineNoKey, row.lineKey, row.finalLineNoKey, row.pipelineRef, row.branchName].map(normalizeLineKey).filter(Boolean);
  const keys = wanted ? [wanted, ...fallbacks.filter((key) => key !== wanted)] : fallbacks;
  if (!keys.length) return null;

  return (Array.isArray(lineRows) ? lineRows : []).find((lineRow) => {
    const candidates = [
      lineRowText(lineRow, ['lineNoKey', 'Line No. Key', 'Final Line No. Key', 'finalLineNoKey']),
      lineRowText(lineRow, ['lineKey', 'Line Key']),
      lineRowText(lineRow, ['lineNo', 'Line No', 'LINE_NO', 'LineNumber']),
      lineRowText(lineRow, ['Branchname', 'branchName', 'pipelineRef']),
    ].map(normalizeLineKey).filter(Boolean);
    return candidates.some((candidate) => keys.includes(candidate));
  }) || null;
}

function pushRowDiagnostic(out, diagnostics, diagnostic) {
  if (!diagnostic || !diagnostic.type) return;
  const entry = {
    severity: 'WARN',
    refNo: firstText(out?.refNo, out?.componentRefNo, out?.sourceCanonicalId),
    nodeName: firstText(out?.nodeName, out?.name, out?.supportName),
    pipelineRef: firstText(out?.pipelineRef, out?.branchName),
    ...diagnostic,
  };
  if (Array.isArray(diagnostics)) diagnostics.push(entry);
  if (out) {
    if (!Array.isArray(out.enrichmentDiagnostics)) out.enrichmentDiagnostics = [];
    out.enrichmentDiagnostics.push(entry);
  }
}

function applyTopologyEvidence(out, topologyHandoff) {
  if (!topologyHandoff) return;
  const rowKey = firstText(out.sourceCanonicalId, out.refNo, out.componentRefNo, out.rowNo, out.seqNo);
  const entries = topologyHandoff.rows || topologyHandoff.enrichedRows || topologyHandoff.rowEvidence || null;

  if (Array.isArray(entries)) {
    const match = entries.find((entry) => {
      const key = firstText(entry.sourceCanonicalId, entry.refNo, entry.componentRefNo, entry.rowNo, entry.seqNo);
      return key && rowKey && key === rowKey;
    });
    if (match) Object.assign(out, { topologyEvidence: match.topologyEvidence || match.topology || match });
    return;
  }

  if (topologyHandoff.rowMap instanceof Map && rowKey && topologyHandoff.rowMap.has(rowKey)) {
    out.topologyEvidence = topologyHandoff.rowMap.get(rowKey);
  }
}

function applyLineRatingMaterial(out, { context, lineRows, rowIndex, diagnostics }) {
  const config = context.config || {};
  const branchName = firstText(out.branchName, out.pipelineRef, out.ownerBranch, out.lineName);
  const derivedLineKey = firstText(out.lineNoKey, out.lineKey, out.finalLineNoKey, deriveLineKeyFromBranchName(branchName, config));
  const lineRow = findLineRow(lineRows, derivedLineKey, out);
  const boreMm = rowBoreMm(out);
  const componentType = upper(out.type || out.componentType);
  const rating = firstText(out.rating, out.pressureClass, out.attributes?.RATING, lineRowText(lineRow, ['rating', 'Rating', 'RATING']));

  const process = resolveBranchProcessData({
    branchName,
    lineKey: derivedLineKey,
    lineRow,
    boreMm,
    componentType,
    rating,
    schedule: firstText(out.schedule, out.attributes?.SCHEDULE),
    materialMap: context.materialMapRows,
    pipingClassIndex: context.pipingClassIndex,
    overrides: config.overrides || {},
    xmlNode: null,
    xmlBranch: null,
    config,
  });

  out.lineNoKey = derivedLineKey || out.lineNoKey || '';
  out.lineRow = lineRow || out.lineRow || null;
  out.resolvedPipingClass = firstText(process.resolvedPipingClass, process.pipingClass, out.resolvedPipingClass, out.pipingClass);
  out.pipingClass = out.resolvedPipingClass || out.pipingClass || '';
  out.rating = firstText(process.rating, out.rating, rating);
  out.material = firstText(process.material, out.material);
  out.materialCode = firstText(process.materialCode, out.materialCode, out.attributes?.MATERIAL_CODE);

  if (process.wallThicknessMm != null) out.wallThicknessMm = process.wallThicknessMm;
  if (process.corrosionAllowanceMm != null) out.corrosionAllowanceMm = process.corrosionAllowanceMm;
  out.pipingClassMatchedRow = process.pipingClassMatchedRow || out.pipingClassMatchedRow || null;
  out.pipingClassNeedsReview = Boolean(process.pipingClassNeedsReview);
  out.pipingClassCandidates = process.pipingClassCandidates || [];

  if (!lineRow && derivedLineKey) {
    diagnostics.push({ type: 'json-pcf-line-row-miss', severity: 'WARN', rowIndex, lineKey: derivedLineKey, pipelineRef: out.pipelineRef || '' });
  }
}

function makePseudoXmlNode(out) {
  return {
    NodeName: firstText(out.nodeName, out.name, out.supportName),
    ComponentRefNo: firstText(out.refNo, out.componentRefNo, out.sourceCanonicalId),
    NodeNumber: firstText(out.nodeNumber, out.seqNo, out.rowNo),
    Position: firstText(out.position, out.supportCoor, out.cp, out.ep1),
    ComponentType: firstText(out.type, out.componentType),
    DTXR_POS: firstText(out.dtxr, out.typeDesc, out.attributes?.DTXR_POS, out.attributes?.DTXR),
    DTXR_PS: firstText(out.dtxrPs, out.attributes?.DTXR_PS),
  };
}

function isSupportRow(out) {
  const type = upper(out.type || out.componentType);
  const text = upper(`${out.nodeName || ''} ${out.name || ''} ${out.dtxr || ''} ${out.typeDesc || ''} ${out.supportName || ''}`);
  return type === 'SUPPORT' || type === 'ATTA' || /^PS-\d+/.test(text) || /SUPPORT|GUIDE|REST|SHOE|LIMIT|LINESTOP|LINE\s*STOP/.test(text);
}

function isDtxrImportantRow(out) {
  const type = upper(out.type || out.componentType);
  const text = upper(`${type} ${out.nodeName || ''} ${out.name || ''} ${out.typeDesc || ''} ${out.supportName || ''}`);
  return isSupportRow(out) || ['VALVE', 'FLANGE', 'TEE', 'OLET', 'ATTA', 'SUPPORT'].includes(type) || /VALVE|FLANGE|TEE|OLET|WELDOLET|SWEEPOLET|SUPPORT|PS-\d+/.test(text);
}

function applyDtxr(out, { dtxrContext, config, diagnostics, rowIndex }) {
  const purpose = isSupportRow(out) ? 'support-restraint' : 'component-description';
  const resolved = resolveDtxrForXmlNode({
    xmlNode: makePseudoXmlNode(out),
    context: dtxrContext,
    purpose,
    config,
    trustExistingXmlDtxr: false,
  });

  if (resolved?.suppressed) {
    out.dtxrSuppressed = true;
    out.dtxrSuppressionReason = resolved.suppressionReason || '';
    return;
  }

  if (resolved) {
    const dtxr = firstText(resolved.canonicalText, resolved.value, out.dtxr, out.typeDesc);
    if (dtxr) out.dtxr = dtxr;
    out.dtxrSource = resolved.source || out.dtxrSource || '';
    out.dtxrMatchedBy = resolved.matchedBy || out.dtxrMatchedBy || '';
  }

  if (!clean(out.dtxr) && isDtxrImportantRow(out)) {
    pushRowDiagnostic(out, diagnostics, {
      type: 'pcf-row-dtxr-missing',
      severity: 'WARN',
      rowIndex,
      rowType: firstText(out.type, out.componentType),
      purpose,
    });
  }
}

function shouldRankWeight(out) {
  const type = upper(out.type || out.componentType);
  const name = firstText(out.nodeName, out.name, out.typeDesc, out.dtxr);
  return type === 'VALVE' || type === 'FLANGE' || /^FLAN/.test(type) || /VGT|VCH|VBL|VCV|VGL|VBF|VBV/i.test(name);
}

function applyWeightRanking(out, { config, diagnostics, mode, rowIndex }) {
  if (!shouldRankWeight(out)) return;
  const lengthMm = rowLengthMm(out);
  const boreMm = rowBoreMm(out);
  if (!Number.isFinite(lengthMm) || lengthMm <= 0 || !Number.isFinite(boreMm) || boreMm <= 0) return;

  const nodeName = [
    firstText(out.nodeName, out.name),
    firstText(out.dtxr, out.typeDesc),
  ].filter(Boolean).join(' ') || firstText(out.nodeName, out.name, out.typeDesc, out.dtxr);
  const includeRejected = clean(mode).toLowerCase() === 'preview' || config?.weight?.showLengthRejectedSemanticMatches === true;
  const ranked = rankXmlCiiWeightCandidates({
    boreMm,
    rating: out.rating,
    lengthMm,
    nodeName,
    componentType: firstText(out.type, out.componentType),
    componentRefNo: firstText(out.refNo, out.componentRefNo, out.sourceCanonicalId),
    dtxr: firstText(out.dtxr, out.typeDesc),
  }, config, { includeRejected });
  out.weightCandidates = ranked.candidates || [];
  out.weightRejectedCandidates = ranked.rejectedCandidates || [];
  out.weightNodeHint = ranked.nodeHint?.code || '';

  const best = ranked.best;
  if (best?.preferred && best.lengthQualified) {
    out.weight = best.selectedWeight;
    out.masterWeight = best.masterWeight;
    out.suggestedWeight = best.suggestedWeight;
    out.weightMethod = best.weightMethod;
    out.weightTypeDesc = best.typeDesc || '';
    out.weightLengthDelta = best.lengthDelta;
    out.weightExtrapolationRatio = best.extrapolationRatio;
    out.weightWarning = best.weightWarning || '';
    return;
  }

  const candidateCount = (out.weightCandidates?.length || 0) + (out.weightRejectedCandidates?.length || 0);
  if (candidateCount > 0) {
    pushRowDiagnostic(out, diagnostics, {
      type: 'pcf-row-weight-unselected',
      severity: 'WARN',
      rowIndex,
      rowType: firstText(out.type, out.componentType),
      nodeHint: out.weightNodeHint,
      candidateCount,
    });
  }
}

function applySupportMapping(out, { supportIndex, config, diagnostics, rowIndex }) {
  if (!isSupportRow(out)) return;
  const match = resolveSupportMatchForPcfRow(out, supportIndex, config);
  if (!match) {
    pushRowDiagnostic(out, diagnostics, {
      type: 'pcf-row-support-unmatched',
      severity: 'WARN',
      rowIndex,
      rowType: firstText(out.type, out.componentType),
    });
    return;
  }
  out.type = 'SUPPORT';
  out.supportCoor = match.point || out.supportCoor || out.cp || out.ep1;
  out.supportName = firstText(match.supportName, match.primaryKind, out.supportName, 'SUPPORT');
  out.supportGuid = firstText(match.supportGuid, out.supportGuid, out.refNo, out.sourceCanonicalId, 'UCI:UNKNOWN');
  out.supportKind = firstText(match.primaryKind, match.kind, out.supportKind);
  out.supportKinds = Array.isArray(match.kinds) && match.kinds.length ? [...match.kinds] : (out.supportKind ? [out.supportKind] : []);
  out.supportDofs = match.dofs || out.supportDofs || {};
  out.supportSource = firstText(match.supportDescriptorSource, match.source, out.supportSource);
}

function setCa(ca, key, value) {
  if (value === undefined || value === null) return;
  const text = clean(value);
  if (!text) return;
  ca[String(key)] = text;
}

function setCaIfBlank(ca, key, value) {
  if (value === undefined || value === null) return;
  const text = clean(value);
  if (!text) return;
  const k = String(key);
  if (clean(ca[k])) return;
  ca[k] = text;
}

function applyFinalCaMapping(out, config = {}) {
  const ca = { ...(out.ca || {}) };
  const setter = config?.pcf?.overwriteCaFromEnrichment === true ? setCa : setCaIfBlank;
  setter(ca, 1, out.resolvedPipingClass || out.pipingClass);
  setter(ca, 2, out.rating);
  setter(ca, 3, out.materialCode || out.material);
  setter(ca, 4, out.wallThicknessMm);
  setter(ca, 5, out.corrosionAllowanceMm);
  setter(ca, 6, out.weight);
  setter(ca, 7, out.weightMethod);
  setter(ca, 8, out.weightTypeDesc || out.weightNodeHint);
  setter(ca, 9, out.supportKind);
  setter(ca, 10, out.dtxr || out.supportSource);
  setter(ca, 97, out.refNo || out.componentRefNo || out.sourceCanonicalId);
  setter(ca, 98, out.seqNo || out.rowNo);
  out.ca = ca;
}

export async function enrichRowsForFinalPcf({
  rows = [],
  topologyHandoff = null,
  masterContext = null,
  config = {},
  stagedJsonText = '',
  lineRows = null,
  diagnostics = [],
  mode = 'run',
  commit = true,
} = {}) {
  const context = masterContext || await prepareXmlCiiMasterContext({ rawConfig: config, diagnostics });
  const effectiveConfig = context.config || config || {};
  const effectiveLineRows = Array.isArray(lineRows) ? lineRows : (context.lineRows || []);
  const dtxrContext = buildDtxrContext(stagedJsonText, effectiveConfig);
  const supportIndex = buildStagedSupportIndex(stagedJsonText, effectiveConfig, diagnostics);

  const enrichedRows = (Array.isArray(rows) ? rows : []).map((row, rowIndex) => {
    const out = { ...row, ca: { ...(row?.ca || {}) }, enrichmentDiagnostics: [...(row?.enrichmentDiagnostics || [])] };
    applyTopologyEvidence(out, topologyHandoff);
    applyLineRatingMaterial(out, { context: { ...context, config: effectiveConfig }, lineRows: effectiveLineRows, rowIndex, diagnostics });
    applyDtxr(out, { dtxrContext, config: effectiveConfig, diagnostics, rowIndex });
    applyWeightRanking(out, { config: effectiveConfig, diagnostics, mode, rowIndex });
    applySupportMapping(out, { supportIndex, config: effectiveConfig, diagnostics, rowIndex });
    applyFinalCaMapping(out, effectiveConfig);
    if (mode === 'preview' || commit === false) out.previewOnly = true;
    return out;
  });

  return { rows: enrichedRows, diagnostics, context: { ...context, config: effectiveConfig }, mode, commit: commit !== false };
}

export const __RVM_PCF_ROW_ENRICHER_TESTS__ = Object.freeze({
  findLineRow,
  rowLengthMm,
  shouldRankWeight,
});