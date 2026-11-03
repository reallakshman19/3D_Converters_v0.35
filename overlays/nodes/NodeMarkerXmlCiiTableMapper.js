export const NODE_MARKER_XML_CII_TABLES_SCHEMA = 'non-primitive-node-marker-xml-cii-tables/v1';

export const XML_CII_NODE_MARKER_HEADERS = Object.freeze({
  branchRows: ['BranchName', 'NodeNumber', 'BoreMm', 'WallThickness', 'P1', 'T1', 'T2', 'T3', 'FluidDensity'],
  coordinateRows: ['BranchName', 'NodeNumber', 'X', 'Y', 'Z'],
  weightRows: ['BranchName', 'NodeNumber', 'ComponentType', 'Rigid', 'Endpoint', 'Weight', 'ComponentRefNo'],
  restraintRows: ['BranchName', 'NodeNumber', 'NodeName', 'RestraintType', 'Gap', 'Stiffness', 'Friction', 'Direction'],
  dtxrRows: ['BranchName', 'NodeNumber', 'DTXR'],
});

export function buildNodeMarkerXmlCiiTables(markers = [], options = {}) {
  const activeMarkers = markers.filter((marker) => marker?.status !== 'unresolved');
  const tables = {
    schema: NODE_MARKER_XML_CII_TABLES_SCHEMA,
    sourceKind: options.sourceKind || activeMarkers[0]?.sourceKind || '',
    sourceSubKind: options.sourceSubKind || activeMarkers[0]?.sourceSubKind || 'unknown',
    sourceFile: options.sourceFile || activeMarkers[0]?.sourceFile || '',
    headers: XML_CII_NODE_MARKER_HEADERS,
    branchRows: buildNodeMarkerBranchRows(activeMarkers),
    coordinateRows: buildNodeMarkerCoordinateRows(activeMarkers),
    weightRows: buildNodeMarkerWeightRows(activeMarkers),
    restraintRows: buildNodeMarkerRestraintRows(activeMarkers),
    dtxrRows: buildNodeMarkerDtxrRows(activeMarkers),
  };
  tables.tableHash = hashTableRows(tables);
  return tables;
}

export function buildNodeMarkerBranchRows(markers = []) {
  return markers.map((marker) => {
    const upstream = marker.upstreamProperties || {};
    return {
      BranchName: marker.branchName || valueOf(upstream, 'BranchName', 'branchName', 'NAME'),
      NodeNumber: marker.nodeNumber,
      BoreMm: valueOf(upstream, 'BoreMm', 'boreMm', 'BORE', 'Bore'),
      WallThickness: valueOf(upstream, 'WallThickness', 'wallThickness', 'WT', 'THK'),
      P1: valueOf(upstream, 'P1', 'Pressure1', 'pressure', 'DESIGN_PRESSURE'),
      T1: valueOf(upstream, 'T1', 'Temperature1', 'temperature1', 'DESIGN_TEMP'),
      T2: valueOf(upstream, 'T2', 'Temperature2', 'temperature2'),
      T3: valueOf(upstream, 'T3', 'Temperature3', 'temperature3'),
      FluidDensity: valueOf(upstream, 'FluidDensity', 'fluidDensity', 'DENSITY'),
    };
  });
}

export function buildNodeMarkerCoordinateRows(markers = []) {
  return markers.map((marker) => ({
    BranchName: marker.branchName,
    NodeNumber: marker.nodeNumber,
    X: marker.position?.x ?? '',
    Y: marker.position?.y ?? '',
    Z: marker.position?.z ?? '',
  }));
}

export function buildNodeMarkerWeightRows(markers = []) {
  return markers.filter((marker) => marker.componentType && !/SUPPORT|RESTRAINT/.test(marker.componentType)).map((marker) => {
    const upstream = marker.upstreamProperties || {};
    const downstream = marker.downstreamProperties || {};
    return {
      BranchName: marker.branchName,
      NodeNumber: marker.nodeNumber,
      ComponentType: marker.componentType,
      Rigid: valueOf(downstream, 'Rigid', 'rigid') || valueOf(upstream, 'Rigid', 'rigid') || '',
      Endpoint: valueOf(downstream, 'Endpoint', 'endpoint') || valueOf(upstream, 'Endpoint', 'endpoint') || marker.positionSource || '',
      Weight: valueOf(downstream, 'Weight', 'weight') || valueOf(upstream, 'Weight', 'weight') || '',
      ComponentRefNo: marker.componentRefNo || valueOf(upstream, 'ComponentRefNo', 'componentRefNo'),
    };
  });
}

export function buildNodeMarkerRestraintRows(markers = []) {
  return markers.filter((marker) => /SUPPORT|RESTRAINT|GUIDE|ANCHOR|LINE/.test(marker.markerKind)).map((marker) => {
    const props = marker.downstreamRef?.type === 'PIPE' ? marker.upstreamProperties || {} : marker.downstreamProperties || {};
    return {
      BranchName: marker.branchName,
      NodeNumber: marker.nodeNumber,
      NodeName: valueOf(props, 'NodeName', 'nodeName', 'supportNo', 'SupportNo', 'NAME') || marker.markerId,
      RestraintType: valueOf(props, 'RestraintType', 'restraintType', 'TYPE') || 'REST',
      Gap: valueOf(props, 'Gap', 'gap'),
      Stiffness: valueOf(props, 'Stiffness', 'stiffness'),
      Friction: valueOf(props, 'Friction', 'friction'),
      Direction: valueOf(props, 'Direction', 'direction'),
    };
  });
}

export function buildNodeMarkerDtxrRows(markers = []) {
  return markers.map((marker) => {
    const upstream = marker.upstreamProperties || {};
    const text = valueOf(upstream, 'DTXR', 'dtxr', 'Description', 'description', 'DESC');
    return text ? { BranchName: marker.branchName, NodeNumber: marker.nodeNumber, DTXR: text } : null;
  }).filter(Boolean);
}

export function buildNodeMarkerCsvForXmlCii(tablesOrMarkers = [], options = {}) {
  const tables = Array.isArray(tablesOrMarkers) ? buildNodeMarkerXmlCiiTables(tablesOrMarkers, options) : tablesOrMarkers;
  const sections = ['branchRows', 'coordinateRows', 'weightRows', 'restraintRows', 'dtxrRows'];
  return sections.map((section) => tableToTsv(section, tables.headers?.[section] || XML_CII_NODE_MARKER_HEADERS[section], tables[section] || [])).join('\n\n');
}

function tableToTsv(name, headers, rows) {
  return [`# ${name}`, headers.join('\t'), ...rows.map((row) => headers.map((header) => cleanCell(row[header])).join('\t'))].join('\n');
}

function cleanCell(value) { return String(value ?? '').replace(/[\t\r\n]+/g, ' ').trim(); }
function valueOf(obj, ...keys) { for (const key of keys) if (obj?.[key] !== undefined && obj?.[key] !== null && String(obj[key]) !== '') return obj[key]; return ''; }
function hashTableRows(tables) { return buildNodeMarkerCsvForXmlCii(tables).split('').reduce((hash, ch) => Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261).toString(16); }
