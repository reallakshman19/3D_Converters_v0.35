export const XML_COMPARE_ENRICHMENT_APPLY_SCHEMA = 'xml-compare-enrichment-apply/v1';

function normalizeNode(v) {
  const n = Number(v);
  return Number.isFinite(n) ? String(Math.round(n)) : String(v ?? '').trim();
}

function isSentinel(n) {
  return Number.isFinite(n) && n <= -1.0 && n >= -2.0;
}

function attrVal(attrsStr, name) {
  const m = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, 'i').exec(attrsStr);
  return m ? m[1] : '';
}

function xmlEsc(v) {
  return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function childEl(name, value) {
  if (value == null || value === '') return '';
  return `<${name}>${xmlEsc(String(value))}</${name}>`;
}

function emptyReport() {
  return { restraintTypeConverted: 0, pipingClassApplied: 0, ratingApplied: 0, componentTypeApplied: 0, positionApplied: 0, dtxrApplied: 0, pointBasisApplied: 0 };
}

function buildRestraintTypeConvertMap(cfg) {
  const map = new Map();
  if (!cfg?.enabled || !Array.isArray(cfg.rows)) return map;
  for (const row of cfg.rows) {
    const from = String(row.from ?? '').trim();
    const to = String(row.to ?? '').trim();
    if (from && to && from !== to) map.set(from, to);
  }
  return map;
}

function buildAnalysisMap(xmlText) {
  if (typeof DOMParser === 'undefined') return new Map();
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.querySelector('parsererror')) return new Map();
    const map = new Map();
    for (const el of doc.documentElement.children) {
      if (el.tagName !== 'PIPINGELEMENT') continue;
      const from = normalizeNode(el.getAttribute('FROM_NODE'));
      const to = normalizeNode(el.getAttribute('TO_NODE'));
      const restraintTypes = [];
      for (const r of el.querySelectorAll('RESTRAINT')) {
        const t = Number(r.getAttribute('TYPE'));
        if (Number.isFinite(t) && !isSentinel(t)) restraintTypes.push(Math.round(t));
      }
      map.set(`${from}->${to}`, {
        hasBend: !!el.querySelector('BEND'),
        hasSif: !!el.querySelector('SIF'),
        hasRigid: !!el.querySelector('RIGID'),
        restraintTypes,
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

function parseTypeMap(text) {
  const map = new Map();
  for (const row of String(text || '').trim().split(/\r?\n/)) {
    const [type, kind, dtxrPos] = row.split('\t').map(s => s.trim());
    if (!type || /^type$/i.test(type)) continue;
    map.set(type, { kind: kind || '', dtxrPos: dtxrPos || kind || '' });
  }
  return map;
}

function parseRatingTable(text) {
  const map = new Map();
  for (const row of String(text || '').trim().split(/\r?\n/)) {
    const [cls, rating] = row.split('\t').map(s => s.trim());
    if (!cls || !rating || /^piping/i.test(cls)) continue;
    map.set(cls.toUpperCase(), rating);
  }
  return map;
}

function extractPipingClass(lineId, cfg) {
  const text = String(lineId || '').trim();
  if (!text) return '';
  if (cfg.regex) {
    try {
      const g = Math.max(0, Number(cfg.group) || 1);
      const m = new RegExp(cfg.regex, 'i').exec(text);
      if (m?.[g]) return m[g].trim();
    } catch {}
  }
  const pos = Math.max(0, (Number(cfg.tokenPosition) || 4) - 1);
  const delim = cfg.tokenDelimiter || '-';
  const cleaned = text.replace(/^\/+/, '').replace(/\/B\d+$/i, '');
  const tokens = cleaned.split(delim).map(s => s.trim()).filter(Boolean);
  return tokens[pos] || '';
}

export function applyXmlCompareEnrichment(xmlText, config = {}) {
  const { pipingClass: pcCfg, rating: rtCfg, componentType: ctCfg, position: posCfg, dtxr: dtxrCfg, pointPropertiesBasis: ppbCfg, restraintTypeConvert: rtcCfg } = config || {};
  const anyEnabled = [pcCfg, rtCfg, ctCfg, posCfg, dtxrCfg, ppbCfg, rtcCfg].some(c => c?.enabled);
  if (!anyEnabled) return { xmlText, report: emptyReport() };

  const report = emptyReport();

  // Apply RESTRAINT TYPE conversion first so downstream analysis uses corrected types
  const rtcMap = buildRestraintTypeConvertMap(rtcCfg);
  let workingText = xmlText;
  if (rtcMap.size > 0) {
    workingText = workingText.replace(/<RESTRAINT\b([^>]*)>/gi, (match, attrs) => {
      const typeMatch = /\bTYPE\s*=\s*"([^"]*)"/.exec(attrs);
      if (!typeMatch) return match;
      const fromType = typeMatch[1].trim();
      const toType = rtcMap.get(fromType);
      if (toType == null) return match;
      report.restraintTypeConverted += 1;
      const newAttrs = attrs.replace(/\bTYPE\s*=\s*"[^"]*"/, `TYPE="${xmlEsc(toType)}"`);
      return `<RESTRAINT${newAttrs}>`;
    });
  }

  const analysisMap = buildAnalysisMap(workingText);
  const typeMap = dtxrCfg?.enabled ? parseTypeMap(dtxrCfg.typeMapText) : new Map();
  const ratingMap = (rtCfg?.enabled && rtCfg.method !== 'fixed') ? parseRatingTable(rtCfg.tableText) : new Map();
  const nodeCoords = new Map();

  if (posCfg?.enabled) {
    const firstTag = /<PIPINGELEMENT\b([^>]*)>/i.exec(workingText);
    if (firstTag) {
      const fn = normalizeNode(attrVal(firstTag[1], 'FROM_NODE'));
      if (fn) nodeCoords.set(fn, { x: Number(posCfg.startX) || 0, y: Number(posCfg.startY) || 0, z: Number(posCfg.startZ) || 0 });
    }
  }

  const output = workingText.replace(/<PIPINGELEMENT\b([^>]*)>/gi, (match, attrs) => {
    const fromNode = normalizeNode(attrVal(attrs, 'FROM_NODE'));
    const toNode = normalizeNode(attrVal(attrs, 'TO_NODE'));
    const key = `${fromNode}->${toNode}`;

    if (analysisMap.size > 0 && !analysisMap.has(key)) return match;

    const analysis = analysisMap.get(key) || {};
    const lineId = attrVal(attrs, 'LINE_ID').replaceAll('&quot;', '"');
    const deltaX = Number(attrVal(attrs, 'DELTA_X'));
    const deltaY = Number(attrVal(attrs, 'DELTA_Y'));
    const deltaZ = Number(attrVal(attrs, 'DELTA_Z'));
    const children = [];

    if (ppbCfg?.enabled) {
      const v = childEl('Point_properties_basis', ppbCfg.value || 'TO');
      if (v) { children.push(v); report.pointBasisApplied += 1; }
    }

    if (ctCfg?.enabled) {
      const type = analysis.hasBend ? (ctCfg.bendType || 'ELBO')
                 : analysis.hasSif  ? (ctCfg.sifType || 'BRAN')
                 : analysis.hasRigid ? (ctCfg.rigidType || 'ATTA')
                 : (ctCfg.defaultType || 'ATTA');
      const v = childEl('ComponentType', type);
      if (v) { children.push(v); report.componentTypeApplied += 1; }
    }

    if (dtxrCfg?.enabled && analysis.restraintTypes?.length) {
      const entry = typeMap.get(String(analysis.restraintTypes[0]));
      if (entry?.dtxrPos) {
        children.push(childEl('DTXR_POS', entry.dtxrPos));
        children.push(childEl('DTXR_PS', entry.dtxrPos));
        report.dtxrApplied += 1;
      }
    }

    if (pcCfg?.enabled && lineId) {
      const cls = extractPipingClass(lineId, pcCfg);
      if (cls) {
        children.push(childEl('PipingClass', cls));
        report.pipingClassApplied += 1;
        if (rtCfg?.enabled) {
          const rating = rtCfg.method === 'fixed' ? (rtCfg.fixedValue || '') : (ratingMap.get(cls.toUpperCase()) || '');
          if (rating) { children.push(childEl('Rating', rating)); report.ratingApplied += 1; }
        }
      }
    }

    if (posCfg?.enabled) {
      const fromCoords = nodeCoords.get(fromNode);
      if (fromCoords) {
        const dx = !isSentinel(deltaX) ? deltaX : 0;
        const dy = !isSentinel(deltaY) ? deltaY : 0;
        const dz = !isSentinel(deltaZ) ? deltaZ : 0;
        const toCoords = { x: fromCoords.x + dx, y: fromCoords.y + dy, z: fromCoords.z + dz };
        nodeCoords.set(toNode, toCoords);
        children.push(childEl('Position', `${toCoords.x.toFixed(2)} ${toCoords.y.toFixed(2)} ${toCoords.z.toFixed(2)}`));
        report.positionApplied += 1;
      }
    }

    if (!children.length) return match;
    return match + '\n    ' + children.join('\n    ');
  });

  return { xmlText: output, report };
}

export const _test = Object.freeze({ normalizeNode, isSentinel, attrVal, extractPipingClass, parseTypeMap, parseRatingTable, buildAnalysisMap, buildRestraintTypeConvertMap, emptyReport });
