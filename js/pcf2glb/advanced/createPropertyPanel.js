import {
  LINE_NO_METADATA_KEYS,
  firstLineNoValue,
  lineNoFromMetadata,
  normalizeLineNoValue,
} from '../../../utils/line-no-metadata.js';
import {
  bmCiiLineNoFromSideload,
  ensureBmCiiLineNoSideloadLoaded,
} from './bmCiiLineNoSideload.js';

const NA = 'N/A';

const SUPPORT_DISPLAY_FIELDS = [
  ['Type', ['TYPE', 'supportType', 'supportKind', 'kind', 'pcfType', 'type']],
  ['Axis', ['AXIS', 'axis', 'restraintAxis', 'supportAxis', 'supportAxisLabel', 'axisLabel']],
  ['Node', ['NODE', 'node', 'sourceNode', 'supportNode', 'fromNode']],
  ['Source', ['SOURCE', 'source', 'supportSource']],
  ['Stiffness', ['STIFFNESS', 'supportStiffness', 'stiffness', 'restraintStiffness']],
  ['Gap', ['GAP', 'supportGap', 'gap', 'gapMm', 'restraintGap']],
  ['Friction Coef.', ['FRIC_COEF', 'supportFricCoef', 'fricCoef', 'frictionCoefficient', 'mu']],
  ['Tag', ['TAG', 'supportTag', 'tag', 'labelText', 'name']],
  ['GUID', ['GUID', 'supportGuid', 'guid', 'componentGuid', 'supportRecordId', 'recordId']],
];

const IDENTITY_FIELDS = [
  ['ID', ['pcfId', 'id', 'name'], (item) => item?.id],
  ['Engineering Type', ['engineeringType', 'componentType', 'sourceComponentType', 'componentKind', 'pcfType', 'type'], (item) => item?.type],
  ['Mesh Role', ['meshRole', 'glbShape', 'shapeRole', 'pcfType', 'type'], (item) => item?.object3D?.name || item?.type],
  ['Ref No', ['refNo', 'REF_NO', 'pcfId', 'id'], (item) => item?.refNo || item?.id],
];

const LINE_NODE_FIELDS = [
  ['From Node', ['fromNode', 'FROM_NODE', 'From Node']],
  ['To Node', ['toNode', 'TO_NODE', 'To Node']],
];

const COMPONENT_FIELDS = [
  ['Bore / Diameter', ['bore', 'Bore', 'diameterMm', 'diameter', 'DIAMETER']],
  ['Wall Thickness', ['wallThickness', 'Wall Thickness', 'WALL_THICK']],
  ['Material Thickness', ['materialThickness', 'Material Thickness', 'WALL_THICK']],
  ['Material', ['materialName', 'material', 'Material', 'MATERIAL_NAME']],
];

const PROCESS_FIELDS = [
  ['Pressure', ['pressure', 'Pressure', 'PRESSURE1']],
  ['Hydro Pressure', ['hydroPressure', 'Hydro Pressure', 'HYDRO_PRESSURE']],
  ['Temp1', ['temp1', 'Temp1', 'TEMP_EXP_C1']],
  ['Temp2', ['temp2', 'Temp2', 'TEMP_EXP_C2']],
  ['Temp3', ['temp3', 'Temp3', 'TEMP_EXP_C3']],
];

const ISONOTE_FIELDS = [
  ['Node', ['NODE', 'node', 'sourceNode']],
  ['Source Note Name', ['SOURCE_NOTE_NAME', 'sourceNoteName', 'sourceInfo', 'isonote', 'displayText', 'labelDisplayText', 'labelText']],
  ['Source', ['SOURCE', 'source', 'annotationSource']],
  ['Related Restraints', ['relatedRestraints', 'expectedRestraints', 'parsedRestraints']],
];

const SOURCE_FIELDS = [
  ['Source XML', ['sourceXml', 'SOURCE_XML', 'xmlFile', 'inputXmlFile']],
  ['Source', ['SOURCE', 'source', 'supportSource']],
  ['Source Trace', ['provenanceTrace', 'sourceTrace', 'generationTrace', 'conversionTrace']],
  ['Benchmark', ['benchmarkName', 'benchmark', 'sourceRun']],
];

const BADGE_COLORS = Object.freeze({
  Explicit: '#86efac',
  Resolved: '#86efac',
  Sideloaded: '#fbbf24',
  Inherited: '#67e8f9',
  'Record scoped': '#fca5a5',
  Debug: '#c4b5fd',
  Unavailable: '#94a3b8',
  Rejected: '#f87171',
});

const DEFAULT_OPEN_SECTIONS = new Set(['Line / Node', 'Component Data', 'Process / Analysis']);

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function valueText(value) {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null && item !== '')
      .map(([key, item]) => `${key}:${valueText(item)}`);
    return entries.join(' ');
  }
  return String(value);
}

function isUnavailable(value) {
  const raw = valueText(value).trim();
  return raw === '' || raw.toUpperCase() === NA || /^(NULL|UNDEFINED|NAN)$/i.test(raw);
}

function first(data, keys, fallback = '') {
  for (const key of keys) {
    const value = valueText(data?.[key]);
    if (value !== '') return value;
  }
  return valueText(fallback);
}

function firstOrNA(data, keys, fallback = '') {
  return first(data, keys, fallback) || NA;
}

function statusChip(status) {
  const label = esc(status || 'Resolved');
  const color = BADGE_COLORS[status] || BADGE_COLORS.Resolved;
  return `<span style="display:inline-flex; align-items:center; justify-content:center; border:1px solid ${color}; color:${color}; border-radius:999px; padding:1px 6px; font-size:10px; line-height:1.35; white-space:nowrap;">${label}</span>`;
}

function normalizeNodeId(value) {
  const raw = valueText(value).trim();
  if (!raw) return '';
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? String(Math.trunc(numeric)) : raw;
}

function identityText(item = {}, meta = {}) {
  const parts = [
    item?.id,
    item?.type,
    item?.refNo,
    item?.name,
    item?.rawMeta?.id,
    item?.rawMeta?.name,
    meta?.id,
    meta?.pcfId,
    meta?.name,
    meta?.supportRecordId,
    meta?.recordId,
    meta?.labelText,
    meta?.labelDisplayText,
    meta?.sourceInfo,
  ];
  let current = item?.object3D || null;
  while (current) {
    parts.push(current.name, current.uuid);
    current = current.parent || null;
  }
  return parts.map(valueText).filter(Boolean).join(' ');
}

function nodeFromIdentity(item = {}, meta = {}) {
  const raw = identityText(item, meta);
  if (!raw) return '';
  const patterns = [
    /(?:^|[_\s:;-])node[_\s:;-]*([0-9]+(?:\.[0-9]+)?)/i,
    /(?:^|[_\s:;-])support[_\s:;-]*node[_\s:;-]*([0-9]+(?:\.[0-9]+)?)/i,
    /\bN(?:ODE)?\s*([0-9]+(?:\.[0-9]+)?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const node = normalizeNodeId(match?.[1]);
    if (node) return node;
  }
  return '';
}

function kindFromIdentity(item = {}, meta = {}) {
  const raw = identityText(item, meta).toUpperCase();
  if (raw.includes('FLAT-FLOW-BLOCKING') || raw.includes('ANCHOR') || raw.includes(':ANC') || raw.includes(' ANC')) return 'ANCHOR';
  if (raw.includes('LINESTOP') || raw.includes('LINE-STOP') || raw.includes('LINE STOP')) return 'LINESTOP';
  if (raw.includes('GUIDE')) return 'GUIDE';
  if (raw.includes('SPRING') || raw.includes('HANGER')) return 'SPRING';
  if (raw.includes('LIMIT')) return 'LIMIT';
  if (raw.includes('HOLDDOWN') || raw.includes('HOLD-DOWN')) return 'HOLDDOWN';
  if (raw.includes('REST')) return 'REST';
  return '';
}

function sourceFromIdentity(item = {}, meta = {}) {
  const raw = identityText(item, meta).toUpperCase();
  if (raw.includes('ISONOTE')) return 'isonote';
  if (raw.includes('INPUTXML') || raw.includes('BM_CII')) return 'inputxml';
  return '';
}

function mergedUserData(object3D) {
  const chain = [];
  const traceChain = [];
  let current = object3D || null;
  while (current) {
    if (current.userData && Object.keys(current.userData).length) {
      chain.unshift(current.userData);
      if (current.userData.bmCiiTrace && typeof current.userData.bmCiiTrace === 'object') {
        traceChain.unshift(current.userData.bmCiiTrace);
      }
    }
    current = current.parent || null;
  }
  const mergedTrace = Object.assign({}, ...traceChain);
  const merged = Object.assign({}, ...chain, object3D?.userData || {});
  const currentTrace = merged.bmCiiTrace && typeof merged.bmCiiTrace === 'object' ? merged.bmCiiTrace : {};
  return {
    ...mergedTrace,
    ...merged,
    bmCiiTrace: { ...mergedTrace, ...currentTrace },
  };
}

function isSupportLike(meta = {}, item = {}) {
  const trace = meta.bmCiiTrace && typeof meta.bmCiiTrace === 'object' ? meta.bmCiiTrace : {};
  const raw = identityText(item, meta).toUpperCase();
  return trace.entity === 'support'
    || trace.entity === 'supportPart'
    || trace.semanticCategory === 'support'
    || Boolean(meta.supportRecordId || meta.supportKind || meta.supportSource || meta.supportGlyphRole)
    || String(item?.type || '').toUpperCase().includes('SUPPORT')
    || raw.includes('SUPPORT')
    || raw.includes('RESTRAINT')
    || raw.includes('BM_CII_BAKED_SUPPORT');
}

function isIsonoteLike(meta = {}, item = {}) {
  const raw = identityText(item, meta).toUpperCase();
  const trace = meta.bmCiiTrace && typeof meta.bmCiiTrace === 'object' ? meta.bmCiiTrace : {};
  return raw.includes('ISONOTE')
    || String(meta.TYPE || meta.type || '').toUpperCase().includes('ISONOTE')
    || String(meta.annotationType || '').toUpperCase().includes('ISONOTE')
    || String(trace.annotationType || '').toUpperCase().includes('ISONOTE');
}

function promoteSupportMeta(item, meta) {
  const promoted = { ...meta };
  const kind = first(promoted, ['TYPE', 'supportType', 'supportKind', 'kind']) || kindFromIdentity(item, promoted);
  const node = normalizeNodeId(first(promoted, ['NODE', 'node', 'sourceNode', 'supportNode', 'fromNode'])) || nodeFromIdentity(item, promoted);
  const source = first(promoted, ['SOURCE', 'source', 'supportSource']) || sourceFromIdentity(item, promoted);
  const id = first(promoted, ['pcfId', 'id', 'name'], item?.id || item?.object3D?.name || '');

  if (kind) {
    promoted.TYPE = first(promoted, ['TYPE']) || kind;
    promoted.supportType = first(promoted, ['supportType']) || promoted.TYPE;
    promoted.supportKind = first(promoted, ['supportKind']) || kind;
    promoted.kind = first(promoted, ['kind']) || kind;
    if (!first(promoted, ['pcfType', 'type']) || first(promoted, ['pcfType', 'type']) === 'UNKNOWN') {
      promoted.pcfType = 'SUPPORT_SYMBOL';
      promoted.type = 'SUPPORT_SYMBOL';
    }
  }
  if (node) {
    promoted.NODE = first(promoted, ['NODE']) || node;
    promoted.node = first(promoted, ['node']) || node;
    promoted.supportNode = first(promoted, ['supportNode']) || node;
  }
  if (source) {
    promoted.SOURCE = first(promoted, ['SOURCE']) || source;
    promoted.supportSource = first(promoted, ['supportSource']) || source;
  }
  if (id) {
    promoted.id = first(promoted, ['id']) || id;
    promoted.name = first(promoted, ['name']) || id;
    promoted.supportGuid = first(promoted, ['supportGuid']) || first(promoted, ['supportRecordId', 'recordId'], id);
  }
  return promoted;
}

function clearInvalidLineNoFields(meta = {}) {
  for (const key of LINE_NO_METADATA_KEYS) {
    if (Object.prototype.hasOwnProperty.call(meta, key) && !normalizeLineNoValue(meta[key])) {
      meta[key] = '';
    }
  }
  if (Object.prototype.hasOwnProperty.call(meta, 'Line No') && !normalizeLineNoValue(meta['Line No'])) meta['Line No'] = '';
  if (Object.prototype.hasOwnProperty.call(meta, 'lineNo') && !normalizeLineNoValue(meta.lineNo)) meta.lineNo = '';
}

function classifyPanel(meta = {}, item = {}, supportLike = false, isonoteLike = false) {
  if (supportLike) return 'Support / Restraint';
  if (isonoteLike) return 'ISONOTE Annotation';
  const type = first(meta, ['engineeringType', 'componentType', 'sourceComponentType', 'componentKind', 'pcfType', 'type'], item?.type || 'Component');
  return type || 'Component';
}

function renderHeader(item, meta, supportLike, isonoteLike) {
  const title = classifyPanel(meta, item, supportLike, isonoteLike);
  const id = first(meta, ['pcfId', 'id', 'name'], item?.id || item?.object3D?.name || 'Selected item') || 'Selected item';
  const node = normalizeNodeId(first(meta, ['NODE', 'node', 'sourceNode', 'supportNode', 'fromNode']));
  const from = first(meta, ['fromNode', 'FROM_NODE']);
  const to = first(meta, ['toNode', 'TO_NODE']);
  const sub = node ? `Node ${node}` : from && to ? `Nodes ${from} → ${to}` : '';
  return `
    <div style="margin:0 0 10px 0; padding:10px 10px; border:1px solid rgba(148,163,184,.22); border-radius:10px; background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(30,41,59,.86));">
      <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
        <div style="min-width:0;">
          <div style="font-size:13px; font-weight:800; color:#f8fafc; word-break:break-word;">${esc(title)}</div>
          <div style="font-size:11px; color:#cbd5e1; word-break:break-word; margin-top:2px;">${esc(id)}</div>
          ${sub ? `<div style="font-size:11px; color:#93c5fd; margin-top:2px;">${esc(sub)}</div>` : ''}
        </div>
        ${supportLike ? statusChip('Record scoped') : isonoteLike ? statusChip('Sideloaded') : statusChip('Resolved')}
      </div>
    </div>`;
}

function renderSection(title, rows, options = {}) {
  const filtered = rows.filter((row) => options.showEmpty || !isUnavailable(row.value));
  if (!filtered.length && options.hideIfEmpty) return '';
  const accent = options.accent || '#38bdf8';
  const defaultOpen = options.defaultOpen ?? DEFAULT_OPEN_SECTIONS.has(title);
  let html = `<details ${defaultOpen ? 'open' : ''} style="margin:0 0 10px 0; border:1px solid rgba(148,163,184,.22); border-radius:10px; overflow:hidden; background:rgba(2,6,23,.28);">`;
  html += `<summary style="display:flex; align-items:center; gap:7px; background:rgba(15,23,42,.92); color:#e2e8f0; padding:7px 9px; font-weight:800; letter-spacing:.01em; cursor:pointer; user-select:none;"><span style="width:3px;height:14px;background:${accent};border-radius:999px;display:inline-block;"></span>${esc(title)}</summary>`;
  html += '<div style="padding:6px 8px;">';
  for (const row of filtered) {
    const value = isUnavailable(row.value) ? NA : row.value;
    html += `<div style="display:grid; grid-template-columns:minmax(104px,38%) 1fr auto; column-gap:8px; align-items:start; padding:5px 0; border-bottom:1px solid rgba(148,163,184,.10);">`;
    html += `<div style="color:#cbd5e1; font-weight:700;">${esc(row.label)}</div>`;
    html += `<div style="color:#f8fafc; word-break:break-word; white-space:normal;">${esc(value)}</div>`;
    html += `<div>${row.status ? statusChip(row.status) : ''}</div>`;
    html += '</div>';
  }
  html += '</div></details>';
  return html;
}

function fieldSourceStatus(meta, keys, value, defaultStatus = '') {
  if (isUnavailable(value)) return 'Unavailable';
  const sourceKeys = [];
  for (const key of keys || []) {
    sourceKeys.push(`${key}Source`, `${key}_SOURCE`, `${String(key).toUpperCase()}_SOURCE`);
  }
  const sourceValue = first(meta, sourceKeys);
  if (/inherit/i.test(sourceValue)) return 'Inherited';
  if (/sideload/i.test(sourceValue)) return 'Sideloaded';
  if (/explicit/i.test(sourceValue)) return 'Explicit';
  return defaultStatus || 'Resolved';
}

function rowsFromFields(meta, item, fields, status = '') {
  return fields.map(([label, keys, fallback]) => {
    const fallbackValue = typeof fallback === 'function' ? fallback(item, meta) : fallback;
    const value = firstOrNA(meta, keys, fallbackValue || '');
    return { label, value, status: fieldSourceStatus(meta, keys, value, status) };
  });
}

function debugRows(meta) {
  return Object.entries(meta)
    .map(([key, value]) => ({ key, value: valueText(value) }))
    .filter((row) => row.value !== '');
}

function renderDebug(meta) {
  const rows = debugRows(meta);
  if (!rows.length) return '';
  let html = '<details style="margin-top:8px;"><summary style="cursor:pointer; color:#c4b5fd; font-weight:800; padding:6px 0;">Raw / Debug Metadata</summary>';
  html += '<div style="background: rgba(0,0,0,0.46); padding: 5px; border-radius: 8px; margin-top: 5px; max-height: 260px; overflow-y: auto;"><table style="width: 100%; text-align: left; border-collapse: collapse;">';
  for (const row of rows) {
    html += `<tr><td style="padding: 4px; border-bottom: 1px solid #444; color: #aaa; width: 40%; word-break: break-word;">${esc(row.key)}</td><td style="padding: 4px; border-bottom: 1px solid #444; color: #fff; word-break: break-word; white-space:normal;">${esc(row.value)}</td></tr>`;
  }
  html += '</table></div></details>';
  return html;
}

function renderRuleNote(supportLike) {
  const body = supportLike
    ? 'Carry-forward is not applicable to supports/restraints. Each restraint row is record-scoped.'
    : 'Component/process properties may use InputXML resolved values. Restraint properties never inherit from component context.';
  const accent = supportLike ? '#fca5a5' : '#67e8f9';
  const color = supportLike ? '#fecaca' : '#bae6fd';
  return `<details style="margin:-4px 0 10px 0; border-left:3px solid ${accent}; background:rgba(15,23,42,.46); color:${color}; font-size:11px;"><summary style="cursor:pointer; padding:6px 8px; font-weight:800;">Rules / Notes</summary><div style="padding:0 8px 8px 8px;">${esc(body)}</div></details>`;
}

function configureResizablePanel(propPanel, propContent) {
  if (propPanel?.dataset?.bmCiiResizable === '1') return;
  if (propPanel?.style) {
    propPanel.dataset.bmCiiResizable = '1';
    propPanel.style.resize = 'both';
    propPanel.style.overflow = 'auto';
    propPanel.style.minWidth = propPanel.style.minWidth || '280px';
    propPanel.style.minHeight = propPanel.style.minHeight || '220px';
    propPanel.style.maxWidth = propPanel.style.maxWidth || 'min(720px, 76vw)';
    propPanel.style.maxHeight = propPanel.style.maxHeight || 'min(720px, 82vh)';
  }
  if (propContent?.style) {
    propContent.style.maxHeight = 'none';
    propContent.style.overflow = 'visible';
  }
}

export function createPropertyPanel(propPanel, propContent) {
  let activeItem = null;
  configureResizablePanel(propPanel, propContent);

  function lineNoForItem(item, meta, supportLike) {
    const explicit = firstLineNoValue(
      lineNoFromMetadata(meta, LINE_NO_METADATA_KEYS),
      meta?.lineNo,
      meta?.['Line No'],
      item?.lineNo,
      item?.object3D?.userData?.lineNo
    );
    if (explicit) return { value: explicit, source: 'explicit component metadata', scope: 'component metadata' };
    return bmCiiLineNoFromSideload(item, meta, supportLike);
  }

  function show(item) {
    activeItem = item || null;
    if (!item) {
      propPanel.style.display = 'none';
      return;
    }

    let meta = { ...(item.rawMeta || {}), ...mergedUserData(item.object3D) };
    const supportLike = isSupportLike(meta, item);
    const isonoteLike = isIsonoteLike(meta, item);
    if (supportLike) meta = promoteSupportMeta(item, meta);

    clearInvalidLineNoFields(meta);
    const lineNo = lineNoForItem(item, meta, supportLike);
    if (lineNo?.pending) {
      ensureBmCiiLineNoSideloadLoaded()?.then?.(() => {
        if (activeItem === item) show(item);
      });
    }
    if (lineNo?.value) {
      meta.lineNo = lineNo.value;
      meta.LINE_NO_SOURCE = lineNo.source;
      meta.LINE_NO_SCOPE = lineNo.scope;
      if (lineNo.anchorNode) meta.LINE_NO_ANCHOR_NODE = lineNo.anchorNode;
    } else {
      meta.lineNo = '';
      meta['Line No'] = '';
      meta.LINE_NO = '';
    }

    let html = '<div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; margin-bottom: 10px; line-height: 1.42; color:#e5e7eb;">';
    html += renderHeader(item, meta, supportLike, isonoteLike);
    html += renderRuleNote(supportLike);

    if (supportLike) {
      html += renderSection('Support / Restraint', rowsFromFields(meta, item, SUPPORT_DISPLAY_FIELDS, 'Record scoped'), { showEmpty: true, accent: '#fca5a5', defaultOpen: false });
    }

    html += renderSection('Identity', rowsFromFields(meta, item, IDENTITY_FIELDS), { showEmpty: true, accent: '#38bdf8', defaultOpen: false });

    const lineStatus = lineNo?.value
      ? (/sideload/i.test(lineNo.source || '') ? 'Sideloaded' : 'Explicit')
      : 'Unavailable';
    const lineRows = [
      { label: 'Line No.', value: lineNo?.value || NA, status: lineStatus },
      { label: 'Line No Source', value: meta.LINE_NO_SOURCE || NA, status: meta.LINE_NO_SOURCE ? 'Debug' : 'Unavailable' },
      { label: 'Line No Anchor Node', value: meta.LINE_NO_ANCHOR_NODE || NA, status: meta.LINE_NO_ANCHOR_NODE ? 'Debug' : 'Unavailable' },
      { label: 'Line No Scope', value: meta.LINE_NO_SCOPE || NA, status: meta.LINE_NO_SCOPE ? 'Debug' : 'Unavailable' },
      ...rowsFromFields(meta, item, LINE_NODE_FIELDS),
    ];
    html += renderSection('Line / Node', lineRows, { showEmpty: true, accent: '#fbbf24', defaultOpen: true });

    if (isonoteLike) {
      html += renderSection('ISONOTE Annotation', rowsFromFields(meta, item, ISONOTE_FIELDS, 'Sideloaded'), { showEmpty: true, accent: '#f59e0b', defaultOpen: false });
    }

    if (!supportLike && !isonoteLike) {
      html += renderSection('Component Data', rowsFromFields(meta, item, COMPONENT_FIELDS), { showEmpty: true, accent: '#22c55e', defaultOpen: true });
      html += renderSection('Process / Analysis', rowsFromFields(meta, item, PROCESS_FIELDS), { showEmpty: true, accent: '#a78bfa', defaultOpen: true });
    }

    html += renderSection('Source / Debug Summary', rowsFromFields(meta, item, SOURCE_FIELDS, 'Debug'), { hideIfEmpty: true, accent: '#94a3b8', defaultOpen: false });
    html += renderDebug(meta);
    html += '</div>';

    propContent.innerHTML = html;
    propPanel.style.display = 'block';
  }

  ensureBmCiiLineNoSideloadLoaded();

  return {
    show,
    hide: () => {
      activeItem = null;
      propPanel.style.display = 'none';
    }
  };
}
