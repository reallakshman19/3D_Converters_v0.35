/**
 * component-panel-model.js - Selection payload to UI model for 3D viewer component panel.
 */

const DEFAULT_PCF_MAPPING = Object.freeze({
  T1: 'COMPONENT-ATTRIBUTE2',
  P1: 'COMPONENT-ATTRIBUTE1',
  WALLTHK: 'COMPONENT-ATTRIBUTE4',
  WEIGHT: 'COMPONENT-ATTRIBUTE8',
  CORRALLW: 'COMPONENT-ATTRIBUTE7',
  INSULTHK: 'COMPONENT-ATTRIBUTE5',
  FLUIDDENS: 'COMPONENT-ATTRIBUTE9',
});

function getPcfMappingSafe() {
  try {
    const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem('pcfMapping');
    return saved ? { ...DEFAULT_PCF_MAPPING, ...JSON.parse(saved) } : { ...DEFAULT_PCF_MAPPING };
  } catch {
    return { ...DEFAULT_PCF_MAPPING };
  }
}

function fmtPoint(pt) {
  if (!pt) return '-';
  return `${Number(pt.x ?? 0).toFixed(2)}, ${Number(pt.y ?? 0).toFixed(2)}, ${Number(pt.z ?? 0).toFixed(2)}`;
}

function len(a, b) {
  if (!a || !b) return null;
  const dx = Number(b.x || 0) - Number(a.x || 0);
  const dy = Number(b.y || 0) - Number(a.y || 0);
  const dz = Number(b.z || 0) - Number(a.z || 0);
  return Math.hypot(dx, dy, dz);
}

function inferBlock(attrs) {
  const merged = `${attrs?.SUPPORT_NAME || ''} ${attrs?.SUPPORT_TAG || ''}`.toUpperCase();
  const m = merged.match(/\bCA\d+\b/);
  return m ? m[0] : '-';
}

function commonRows(comp) {
  return [
    ['Type', comp?.type || '-'],
    ['REF_NO', comp?.attributes?.['COMPONENT-ATTRIBUTE97'] || comp?.id || '-'],
    ['SEQ_NO', comp?.attributes?.['COMPONENT-ATTRIBUTE98'] || '-'],
    ['Pipeline Ref', comp?.attributes?.['PIPELINE-REFERENCE'] || '-'],
    ['Material', comp?.attributes?.MATERIAL || '-'],
    ['SKEY', comp?.attributes?.SKEY || '-'],
  ];
}

function geometryRows(comp) {
  const p1 = comp?.points?.[0] || null;
  const p2 = comp?.points?.[1] || null;
  const center = comp?.centrePoint || null;
  return [
    ['EP1', fmtPoint(p1)],
    ['EP2', fmtPoint(p2)],
    ['Centre Point', fmtPoint(center)],
    ['Length', len(p1, p2)?.toFixed(2) ?? '-'],
    ['Bore/OD', Number(comp?.bore || 0).toFixed(2)],
  ];
}

function processRows(comp) {
  const a = comp?.attributes || {};
  const mapping = getPcfMappingSafe();

  const getKey = (name) => {
      const caTag = mapping[name];
      if (!caTag) return null;
      return a[caTag] || null;
  };

  const rows = [
    ['T1', getKey('T1') || a['COMPONENT-ATTRIBUTE2'] || '-'],
    ['P1', getKey('P1') || a['COMPONENT-ATTRIBUTE1'] || '-'],
    ['Wall Thk', getKey('WALLTHK') || a['COMPONENT-ATTRIBUTE4'] || '-'],
    ['Weight', getKey('WEIGHT') || a['COMPONENT-ATTRIBUTE8'] || '-'],
    ['Corr. Allow.', getKey('CORRALLW') || a['CORROSION-ALLOWANCE'] || a['CORR'] || '-'],
    ['Rating', a['RATING'] || '-'],
    ['Insul. Thk', getKey('INSULTHK') || a['COMPONENT-ATTRIBUTE5'] || '-'],
    ['Fluid Dens.', getKey('FLUIDDENS') || a['COMPONENT-ATTRIBUTE9'] || '-'],
  ];

  // Conditionally add dynamically mapped process variables
  for (let i = 2; i <= 9; i++) {
     const tKey = getKey(`T${i}`);
     const pKey = getKey(`P${i}`);
     if (tKey && tKey !== '-') rows.push([`T${i}`, tKey]);
     if (pKey && pKey !== '-') rows.push([`P${i}`, pKey]);
  }

  return rows;
}

function supportRows(comp) {
  const a = comp?.attributes || {};
  return [
    ['Support Name', a.SUPPORT_NAME || a['<SUPPORT_NAME>'] || '-'],
    ['Support Kind', a.SUPPORT_KIND || '-'],
    ['Support Dir.', a.SUPPORT_TAG || a['SUPPORT-DIRECTION'] || '-'],
    ['Support GUID', a.SUPPORT_GUID || a['<SUPPORT_GUID>'] || '-'],
    ['Description', a.SUPPORT_DESC || a['ITEM-DESCRIPTION'] || '-'],
    ['DOFs', a.SUPPORT_DOFS || '-'],
    ['Axis Cosines', a.AXIS_COSINES || '-'],
    ['Pipe Axis', a.PIPE_AXIS_COSINES || '-'],
    ['Friction Coeff.', a['SUPPORT-FRICTION'] ?? a.SUPPORT_FRICTION ?? '-'],
    ['Gap', a['SUPPORT-GAP'] || a.SUPPORT_GAP || '-'],
    ['Inferred Block', inferBlock(a)],
    ['CO-ORDS', a.SUPPORT_COORDS || fmtPoint(comp?.coOrds || null)],
  ];
}

function rawRows(comp) {
  return Object.entries(comp?.attributes || {}).map(([k, v]) => [k, String(v ?? '-')]);
}

export function buildComponentPanelModel(comp, cfg) {
  if (!comp) {
    return {
      title: 'Select a component to inspect',
      sections: [],
    };
  }

  const show = {
    common: cfg?.showCommonSection !== false,
    geometry: cfg?.showGeometrySection !== false,
    process: cfg?.showProcessSection !== false,
    support: cfg?.showSupportSection !== false,
    raw: cfg?.showRawSection !== false && cfg?.showRawAttributes !== false,
  };

  const type = String(comp.type || '').toUpperCase();
  const sections = [];
  if (show.common) sections.push({ id: 'common', title: 'Common', rows: commonRows(comp) });
  if (show.geometry) sections.push({ id: 'geometry', title: 'Geometry', rows: geometryRows(comp) });
  if (show.process) sections.push({ id: 'process', title: 'Process', rows: processRows(comp) });
  if (type === 'SUPPORT' && show.support) sections.push({ id: 'support', title: 'Support', rows: supportRows(comp) });
  if (show.raw) sections.push({ id: 'raw', title: 'Raw Attributes', rows: rawRows(comp) });

  return {
    title: `${type || 'COMPONENT'} : ${comp?.id || '-'}`,
    sections,
  };
}

export const _test = Object.freeze({ getPcfMappingSafe });
