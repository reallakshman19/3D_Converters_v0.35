import * as core from './dtxr-resolver-core.js';

export * from './dtxr-resolver-core.js';

function resultShape(xmlNode, evidence, source, matchedBy, matchedKey, confidence, stagedType = '') {
  if (!evidence?.effectiveDtxr) return null;
  return {
    canonicalText: evidence.effectiveDtxr,
    value: evidence.effectiveDtxr,
    ...evidence,
    teeDesc: '',
    cmpSupGap: '',
    supportTags: core.xmlNodeSupportTags(xmlNode),
    source,
    matchedBy,
    matchedKey,
    stagedType,
    componentRefNo: core.getXmlNodeProperty(xmlNode, 'ComponentRefNo'),
    confidence,
    suppressed: false,
    suppressionReason: '',
    candidates: [],
  };
}

function explicitXmlEvidence(xmlNode) {
  const evidence = core.selectEffectiveDtxrEvidence(
    core.getXmlNodeProperty(xmlNode, 'DTXR_POS') || core.getXmlNodeProperty(xmlNode, 'DtxrPos'),
    core.getXmlNodeProperty(xmlNode, 'DTXR_PS') || core.getXmlNodeProperty(xmlNode, 'DtxrPs'),
  );
  const source = evidence.effectiveSource === 'DTXR_POS' ? 'xml-dtxr-pos' : 'xml-dtxr-ps-fallback';
  const nodeNumber = core.getXmlNodeProperty(xmlNode, 'NodeNumber');
  return resultShape(xmlNode, evidence, source, source, `NodeNumber:${nodeNumber}`, 0.75);
}

function parsePoint(value) {
  const values = String(value ?? '').match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function itemPoint(item) {
  if (item?.coord && [item.coord.x, item.coord.y, item.coord.z].every(Number.isFinite)) return item.coord;
  const attrs = item?.attrs || {};
  for (const key of ['SUPPORTCOORD', 'POS', 'POSI', 'BPOS', 'APOS', 'LPOS', 'CPOS', 'HPOS', 'TPOS']) {
    const point = parsePoint(attrs[key]);
    if (point) return point;
  }
  return null;
}

function branchlessCoordinateEvidence(args) {
  const target = parsePoint(core.getXmlNodeProperty(args.xmlNode, 'Position'));
  const stagedIndex = args.context?.stagedIndex || args.context;
  if (!target || !Array.isArray(stagedIndex?.items)) return null;
  const tolerance = Number(args.config?.dtxrCoordinateToleranceMm ?? args.config?.coordinateToleranceMm ?? args.config?.coordinateTolerance ?? 6);
  const limit = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : 6;
  const matches = stagedIndex.items
    .map((item) => ({ item, point: itemPoint(item) }))
    .filter((entry) => entry.point && core.euclideanDistance(target, entry.point) <= limit)
    .sort((left, right) => core.euclideanDistance(target, left.point) - core.euclideanDistance(target, right.point));
  if (!matches.length) return null;

  const dtxrPos = [...new Set(matches.map(({ item }) => String(item?.dtxr || item?.attrs?.DTXR_POS || '').trim()).filter(Boolean))].join('+');
  const dtxrPs = matches.map(({ item }) => String(item?.dtxrPs || item?.attrs?.DTXR_PS || '').trim()).find(Boolean) || '';
  const evidence = core.selectEffectiveDtxrEvidence(dtxrPos, dtxrPs);
  const nearest = matches[0];
  const distance = core.euclideanDistance(target, nearest.point);
  return resultShape(
    args.xmlNode,
    evidence,
    'staged-coordinate-fallback',
    'nearest-coordinate',
    `${distance.toFixed(3)} mm`,
    0.65,
    String(nearest.item?.type || ''),
  );
}

/**
 * Public DTXR resolver boundary.
 *
 * Support/restraint precedence is:
 * explicit XML DTXR_POS → core branch-aware resolver → branchless staged
 * coordinate evidence → explicit XML DTXR_PS fallback.
 */
export function resolveDtxrForXmlNode(args = {}) {
  const purpose = args?.purpose || 'component-description';
  const trustExisting = args?.trustExistingXmlDtxr !== false;
  if (purpose !== 'support-restraint' || !trustExisting) {
    return core.resolveDtxrForXmlNode(args);
  }

  const explicit = explicitXmlEvidence(args.xmlNode);
  if (explicit?.dtxrPos) return explicit;

  const resolved = core.resolveDtxrForXmlNode(args);
  if (resolved && (resolved.canonicalText || resolved.effectiveDtxr || resolved.dtxrPos || resolved.dtxrPs)) {
    return resolved;
  }

  const coordinate = branchlessCoordinateEvidence(args);
  if (coordinate) return coordinate;
  return explicit?.dtxrPs ? explicit : resolved;
}
