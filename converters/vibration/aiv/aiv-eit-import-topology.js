function finite(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function segmentId(item, index) {
  if (item.segmentIds.length === 1) return item.segmentIds[0];
  return `EIT-PATH-${item.lineRid || index + 1}-${item.detailIndex + 1}`;
}

export function buildAivEitImportedTopology(document, detailEvidence, sourceName) {
  const elements = new Map();
  const segments = [];

  detailEvidence.forEach((item, index) => {
    const line = document.lines[item.lineIndex] ?? {};
    const lineId = clean(line.lref || line.ldesc || line.pnid);
    if (!elements.has(item.sourceCanonicalId)) {
      elements.set(item.sourceCanonicalId, Object.freeze({
        canonicalId: item.sourceCanonicalId,
        tag: item.sourceCanonicalId,
        type: 'SOURCE',
        line: lineId,
      }));
    }
    if (!elements.has(item.assessmentCanonicalId)) {
      elements.set(item.assessmentCanonicalId, Object.freeze({
        canonicalId: item.assessmentCanonicalId,
        tag: item.assessmentCanonicalId,
        type: 'WELD',
        line: lineId,
      }));
    }
    const distance = finite(item.originalDetail.distance);
    segments.push(Object.freeze({
      segmentId: segmentId(item, index),
      fromNodeId: item.sourceCanonicalId,
      toNodeId: item.assessmentCanonicalId,
      line: lineId,
      physicalLength: distance === null ? null : Object.freeze({
        value: distance,
        unit: clean(item.originalDetail.distanceUnit) || 'm',
      }),
    }));
  });

  return Object.freeze({
    schema: 'AivFlareNetworkTopologyExchange.v1',
    sourceFileName: sourceName,
    networkId: `EIT:${clean(document.options?.id) || 'UNSPECIFIED'}`,
    revision: 'EnergyInstituteEit.v5 compatibility import',
    elements: Object.freeze([...elements.values()]),
    segments: Object.freeze(segments),
    authority: Object.freeze({
      connectivitySource: 'EnergyInstituteEit.v5 aiv_data relationship projection',
      physicalDistanceSource: 'EXPLICIT_EIT_AIV_DATA_DISTANCE_ONLY',
      syntheticDirectPathProjection: true,
      svgPixelsAuthoritativeForDistance: false,
      designAuthority: false,
    }),
  });
}
