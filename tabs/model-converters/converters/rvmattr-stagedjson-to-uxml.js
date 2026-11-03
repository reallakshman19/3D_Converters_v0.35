import {
  createUxmlAnchor,
  createUxmlComponent,
  createUxmlDiagnostic,
  createUxmlDocument,
  createUxmlHeader,
  createUxmlMapping,
  createUxmlPipeline,
  createUxmlPort,
  createUxmlSegment,
  createUxmlSource,
  createUxmlSupport,
} from '../../../uxml/UxmlTypes.js';

const PORT_KEYS = Object.freeze(['APOS', 'LPOS', 'BPOS', 'HPOS', 'TPOS', 'POS']);
const SUPPORT_TYPES = new Set(['SUPPORT', 'SUPP', 'SUPC', 'ATTA', 'ANCI', 'PIPE_SUPPORT', 'PIPESUPPORT']);
const BRANCH_TYPES = new Set(['BRAN', 'BRANCH']);
const BORE_FIELDS = Object.freeze(['HBOR', 'TBOR', 'ABORE', 'LBORE', 'BBORE', 'BORE', 'NBORE', 'DBOR']);
const PORT_BORE_FIELD = Object.freeze({
  APOS: 'ABORE',
  LPOS: 'LBORE',
  BPOS: 'BBORE',
  HPOS: 'HBOR',
  TPOS: 'TBOR',
  POS: 'BORE',
});

function clean(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return clean(value).toUpperCase();
}

function safeId(value, fallback = 'id') {
  const raw = clean(value) || fallback;
  return raw.replace(/[\/\s]+/g, '-').replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointFromValue(value) {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 3) {
    const [x, y, z] = value.map(numberOrNull);
    return x == null || y == null || z == null ? null : { x, y, z };
  }
  if (isObject(value)) {
    const x = numberOrNull(value.x ?? value.X);
    const y = numberOrNull(value.y ?? value.Y);
    const z = numberOrNull(value.z ?? value.Z);
    return x == null || y == null || z == null ? null : { x, y, z };
  }
  const text = clean(value).replace(/mm\b/gi, '');
  const directional = { x: 0, y: 0, z: 0 };
  let sawAxis = false;
  const tokens = text.split(/\s+/).filter(Boolean);
  for (let i = 0; i < tokens.length - 1; i += 2) {
    const axis = tokens[i].toUpperCase();
    const val = numberOrNull(tokens[i + 1]);
    if (val == null) continue;
    if (axis === 'E') { directional.x = val; sawAxis = true; }
    if (axis === 'W') { directional.x = -val; sawAxis = true; }
    if (axis === 'N') { directional.y = val; sawAxis = true; }
    if (axis === 'S') { directional.y = -val; sawAxis = true; }
    if (axis === 'U') { directional.z = val; sawAxis = true; }
    if (axis === 'D') { directional.z = -val; sawAxis = true; }
  }
  if (sawAxis) return directional;
  const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return values.length >= 3 ? { x: values[0], y: values[1], z: values[2] } : null;
}

function parseBore(value) {
  const n = value == null ? NaN : Number.parseFloat(String(value).replace(/mm\b/gi, '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function boreInfo(attrs = {}, key = '') {
  const n = parseBore(attrs[key]);
  return n ? { value: n, field: key, raw: attrs[key] } : null;
}

function firstBore(attrs = {}) {
  for (const key of BORE_FIELDS) {
    const info = boreInfo(attrs, key);
    if (info) return info;
  }
  return null;
}

function parseSizePair(attrs = {}) {
  const text = [attrs.SPRE, attrs.DTXR, attrs.DESCRIPTION, attrs.DESC, attrs.NAME, attrs.TYPE]
    .map(clean)
    .filter(Boolean)
    .join(' ');
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:mm)?\s*[xX]\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const run = parseBore(match[1]);
  const branch = parseBore(match[2]);
  return run && branch ? { run, branch, raw: match[0] } : null;
}

function lineKeyFromBranch(branch = {}) {
  const name = clean(branch.name || branch.attributes?.NAME || branch.attributes?.OWNER || '');
  const match = name.match(/[A-Z]\d{7}/i);
  return match ? match[0].toUpperCase() : name;
}

function nodeType(node = {}) {
  return upper(node.type || node.attributes?.TYPE || '');
}

function isBranch(node = {}) {
  return BRANCH_TYPES.has(nodeType(node));
}

function isSupport(node = {}) {
  return SUPPORT_TYPES.has(nodeType(node));
}

function normalizedComponentType(type) {
  const t = upper(type);
  if (t === 'ELBO') return 'ELBOW';
  if (t === 'VALV') return 'VALVE';
  if (t === 'FLAN') return 'FLANGE';
  if (t === 'REDU') return 'REDUCER';
  if (t === 'GASK') return 'GASKET';
  if (t === 'BRAN') return 'BRANCH';
  if (t === 'SUPP' || t === 'SUPC' || t === 'ATTA' || t === 'ANCI') return 'SUPPORT';
  return t || 'COMPONENT';
}

function supportType(attrs = {}) {
  const text = [attrs.CMPSUPTYPE, attrs.MDSSUPPFUNC, attrs.DTXR, attrs.SKEY, attrs.NAME, attrs.TAG, attrs.DESCRIPTION, attrs.DESC]
    .map((value) => clean(value).toUpperCase()).join(' ');
  if (/GUIDE/.test(text)) return 'GUIDE';
  if (/LINE\s*STOP|LINESTOP|LIMIT|STOPPER|\bSTOP\b/.test(text)) return 'LINE_STOP';
  if (/ANCHOR|FIXED/.test(text)) return 'ANCHOR';
  if (/REST|SHOE|BASE\s*PLATE|\bBP\b/.test(text)) return 'REST';
  return 'SUPPORT';
}

function pointKey(point) {
  if (!point) return '';
  return [point.x, point.y, point.z].map((n) => Number(n).toFixed(3)).join('|');
}

function portRole(key) {
  if (key === 'APOS') return 'START';
  if (key === 'LPOS' || key === 'TPOS') return 'END';
  if (key === 'BPOS') return 'BRANCH';
  if (key === 'HPOS') return 'HEAD';
  if (key === 'POS') return 'CENTER';
  return key;
}

function chooseSegmentPairs(anchorByKey) {
  const pairs = [];
  if (anchorByKey.APOS && anchorByKey.LPOS) pairs.push(['APOS', 'LPOS', 'CENTERLINE']);
  if (anchorByKey.APOS && anchorByKey.TPOS && !anchorByKey.LPOS) pairs.push(['APOS', 'TPOS', 'CENTERLINE']);
  if (anchorByKey.APOS && anchorByKey.BPOS) pairs.push(['APOS', 'BPOS', 'BRANCH']);
  if (!pairs.length) {
    const keys = Object.keys(anchorByKey);
    if (keys.length >= 2) pairs.push([keys[0], keys[1], 'CENTERLINE']);
  }
  return pairs;
}

function lengthBetween(a, b) {
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Number.isFinite(len) ? len : null;
}

function makeBranchBoreIndex(branches = []) {
  const index = new Map();
  for (const branch of branches) {
    const attrs = branch.attributes || {};
    const bore = firstBore(attrs);
    for (const key of [branch.name, attrs.NAME, attrs.OWNER].map(clean).filter(Boolean)) {
      index.set(key, bore);
    }
  }
  return index;
}

function resolveChildBranchBore(attrs = {}, branchBoreByName = new Map()) {
  const cref = clean(attrs.CREF || attrs.BRANCH_REF || attrs.BRANCHREF || '');
  const fromCref = cref ? branchBoreByName.get(cref) : null;
  if (fromCref) return { ...fromCref, source: 'CREF_BRANCH_HBOR' };

  const pair = parseSizePair(attrs);
  if (pair?.branch) return { value: pair.branch, field: 'SIZE_PAIR_BRANCH', raw: pair.raw, source: 'SIZE_PAIR' };
  return null;
}

function endpointBoreMap(attrs = {}, componentBore = null, childBranchBore = null) {
  const map = {};
  for (const [portKey, field] of Object.entries(PORT_BORE_FIELD)) {
    const explicit = boreInfo(attrs, field);
    if (explicit) map[portKey] = explicit;
  }

  const pair = parseSizePair(attrs);
  if (pair?.run) {
    if (!map.APOS) map.APOS = { value: pair.run, field: 'SIZE_PAIR_RUN', raw: pair.raw, source: 'SIZE_PAIR' };
    if (!map.LPOS) map.LPOS = { value: pair.run, field: 'SIZE_PAIR_RUN', raw: pair.raw, source: 'SIZE_PAIR' };
  }
  if (childBranchBore?.value && !map.BPOS) {
    map.BPOS = { ...childBranchBore, field: childBranchBore.field || 'BRANCH_BORE' };
  } else if (pair?.branch && !map.BPOS) {
    map.BPOS = { value: pair.branch, field: 'SIZE_PAIR_BRANCH', raw: pair.raw, source: 'SIZE_PAIR' };
  }

  if (componentBore?.value) {
    for (const key of ['APOS', 'LPOS', 'HPOS', 'TPOS', 'POS']) {
      if (!map[key]) map[key] = { ...componentBore, source: componentBore.source || 'COMPONENT_BORE' };
    }
  }
  return map;
}

function serializeEndpointBores(map = {}) {
  return Object.fromEntries(Object.entries(map).map(([key, info]) => [key, {
    value: info?.value ?? null,
    field: info?.field || '',
    raw: clean(info?.raw ?? ''),
    source: clean(info?.source || 'STAGED_ATTRIBUTE'),
  }]));
}

export function buildUxmlFromStagedHierarchy(hierarchy = [], options = {}) {
  const stem = safeId(options.stem || options.inputName || 'RMSS_ATTRIBUTE', 'RMSS_ATTRIBUTE');
  const branches = Array.isArray(hierarchy) ? hierarchy.filter(isBranch) : [];
  const branchBoreByName = makeBranchBoreIndex(branches);
  const doc = createUxmlDocument({
    header: createUxmlHeader({
      projectId: clean(options.projectId || ''),
      modelId: stem,
      createdBy: '3D_Viewer_ATT_to_StagedJSON_AddOn',
      createdAt: new Date(0).toISOString(),
      purpose: 'att-stagedjson-sidecar-uxml',
      notes: 'Add-on UXML sidecar generated from existing ATT managed-stage hierarchy. Existing XML/managed_stage/STP outputs are unchanged.',
    }),
    sources: [createUxmlSource({
      id: `src:${stem}:att`,
      format: 'ATT/RMSS_ATTRIBUTE',
      path: clean(options.inputName || ''),
      name: clean(options.inputName || stem),
      role: 'PRIMARY',
    })],
    mappings: [createUxmlMapping({
      id: 'mapping:att-managed-stage-to-uxml',
      profile: 'ADD_ON_SIDECAR',
      sourceFormat: 'ATT_MANAGED_STAGE_JSON',
      sourceField: 'children[].attributes.{APOS,LPOS,BPOS,POS,TYPE,BORE}',
      targetField: 'components/anchors/ports/segments/supports',
      confidence: 'DERIVED',
      notes: 'Generated beside managed_stage.json without changing staged JSON schema.',
    })],
  });

  let pipelineIndex = 0;
  let componentIndex = 0;
  let anchorIndex = 0;
  let portIndex = 0;
  let segmentIndex = 0;
  let supportIndex = 0;

  const seenPointToAnchor = new Map();

  for (const branch of branches) {
    const attrs = branch.attributes || {};
    const pipelineId = `pipe:${safeId(branch.name || attrs.NAME || `branch-${++pipelineIndex}`)}`;
    const branchName = clean(branch.name || attrs.NAME || '');
    const lineKey = lineKeyFromBranch(branch);
    const branchBore = firstBore(attrs);
    doc.pipelines.push(createUxmlPipeline({
      id: pipelineId,
      pipelineRef: branchName,
      lineKey,
      lineNo: branchName,
      rawAttributes: { ...attrs },
      confidence: 'DERIVED_FROM_ATT_BRANCH',
    }));

    for (const child of Array.isArray(branch.children) ? branch.children : []) {
      if (!isObject(child)) continue;
      const cAttrs = child.attributes || {};
      const rawType = nodeType(child);
      const normType = normalizedComponentType(rawType);
      const name = clean(child.name || cAttrs.NAME || `${normType}-${componentIndex + 1}`);
      const sourceRef = clean(cAttrs.DBREF || cAttrs.REF || cAttrs.NAME || name);
      const componentBore = firstBore(cAttrs) || branchBore;
      const childBranchBore = resolveChildBranchBore(cAttrs, branchBoreByName);
      const endpointBores = endpointBoreMap(cAttrs, componentBore, childBranchBore);
      const componentId = `cmp:${safeId(name || sourceRef || `${normType}-${++componentIndex}`)}:${String(++componentIndex).padStart(5, '0')}`;

      const component = createUxmlComponent({
        id: componentId,
        sourceRefs: [sourceRef || name].filter(Boolean),
        type: rawType || normType,
        normalizedType: normType,
        pipelineRef: pipelineId,
        lineKey,
        refNo: sourceRef,
        name,
        bore: componentBore?.value ?? null,
        branchBore: childBranchBore?.value ?? null,
        boreUnit: 'MM',
        sizeRaw: componentBore?.raw ? clean(componentBore.raw) : '',
        rawAttributes: { ...cAttrs },
        derived: {
          endpointBores: serializeEndpointBores(endpointBores),
          branchBoreSource: childBranchBore?.source || '',
        },
        confidence: 'DERIVED_FROM_ATT_MANAGED_STAGE',
      });

      const anchorByKey = {};
      for (const key of PORT_KEYS) {
        const point = pointFromValue(cAttrs[key]);
        if (!point) continue;
        const anchorId = `anc:${safeId(name)}:${key}:${String(++anchorIndex).padStart(5, '0')}`;
        anchorByKey[key] = { id: anchorId, point };
        const globalPointKey = pointKey(point);
        if (seenPointToAnchor.has(globalPointKey)) {
          doc.topologyHints.push({
            id: `hint:coincident:${safeId(name)}:${key}:${anchorIndex}`,
            type: 'COINCIDENT_ANCHOR',
            componentId,
            sourcePortId: seenPointToAnchor.get(globalPointKey),
            targetPortId: anchorId,
            confidence: 'GEOMETRIC',
            reason: `ATT port ${key} is coincident with an existing UXML anchor.`,
            diagnostics: [],
          });
        } else {
          seenPointToAnchor.set(globalPointKey, anchorId);
        }
        doc.anchors.push(createUxmlAnchor({
          id: anchorId,
          componentId,
          role: portRole(key),
          point,
          sourceRef: { field: key, value: cAttrs[key] },
          sourceField: key,
          confidence: 'EXPLICIT_ATT_PORT',
        }));
        const portId = `prt:${safeId(name)}:${key}:${String(++portIndex).padStart(5, '0')}`;
        const portBore = endpointBores[key] || componentBore || null;
        doc.ports.push(createUxmlPort({
          id: portId,
          componentId,
          anchorId,
          role: portRole(key),
          point,
          bore: portBore?.value ?? null,
          boreField: portBore?.field || PORT_BORE_FIELD[key] || '',
          boreRaw: clean(portBore?.raw ?? ''),
          branchBore: key === 'BPOS' ? (childBranchBore?.value ?? portBore?.value ?? null) : (childBranchBore?.value ?? null),
          branchBoreField: key === 'BPOS' ? (childBranchBore?.field || 'BBORE') : '',
          connectsTo: key === 'BPOS' ? 'BRANCH' : 'ENDPOINT',
        }));
        component.anchorIds.push(anchorId);
        component.portIds.push(portId);
      }

      for (const [fromKey, toKey, segType] of chooseSegmentPairs(anchorByKey)) {
        const from = anchorByKey[fromKey];
        const to = anchorByKey[toKey];
        if (!from || !to) continue;
        const startBore = endpointBores[fromKey] || componentBore || null;
        const endBore = endpointBores[toKey] || startBore || null;
        const segmentId = `seg:${safeId(name)}:${String(++segmentIndex).padStart(5, '0')}`;
        doc.segments.push(createUxmlSegment({
          id: segmentId,
          componentId,
          type: segType,
          startAnchorId: from.id,
          endAnchorId: to.id,
          bore: startBore?.value ?? componentBore?.value ?? null,
          startBore: startBore?.value ?? null,
          startBoreField: startBore?.field || PORT_BORE_FIELD[fromKey] || '',
          endBore: endBore?.value ?? null,
          endBoreField: endBore?.field || PORT_BORE_FIELD[toKey] || '',
          branchBore: segType === 'BRANCH' ? (childBranchBore?.value ?? endBore?.value ?? null) : null,
          length: lengthBetween(from.point, to.point),
          lengthUnit: 'MM',
        }));
        component.segmentIds.push(segmentId);
      }

      if (isSupport(child)) {
        const anchorRef = anchorByKey.POS || anchorByKey.APOS || anchorByKey.BPOS || anchorByKey.LPOS || anchorByKey.HPOS || anchorByKey.TPOS || null;
        const supportId = `sup:${safeId(name)}:${String(++supportIndex).padStart(5, '0')}`;
        doc.supports.push(createUxmlSupport({
          id: supportId,
          componentId,
          type: supportType(cAttrs),
          skey: clean(cAttrs.SKEY || cAttrs.SPRE || ''),
          supportAnchorId: anchorRef?.id || '',
          hostCandidates: [],
          restraints: [],
          diagnostics: [],
        }));
        component.supportId = supportId;
      }

      if (!component.anchorIds.length) {
        component.diagnostics.push(createUxmlDiagnostic({
          id: `diag:${componentId}:no-ports`,
          severity: 'WARN',
          code: 'NO_ATT_PORT_COORDINATES',
          message: `ATT component ${name} has no APOS/LPOS/BPOS/HPOS/TPOS/POS coordinates.`,
          componentId,
        }));
      }

      doc.components.push(component);
    }
  }

  doc.diagnostics.push(createUxmlDiagnostic({
    id: 'diag:att-stagedjson-sidecar-summary',
    severity: 'INFO',
    code: 'ATT_STAGEDJSON_UXML_SIDECAR',
    message: `Generated UXML sidecar from ${doc.pipelines.length} branch(es), ${doc.components.length} component(s), ${doc.anchors.length} anchor(s), ${doc.segments.length} segment(s), ${doc.supports.length} support(s).`,
    details: {
      branchCount: doc.pipelines.length,
      componentCount: doc.components.length,
      anchorCount: doc.anchors.length,
      segmentCount: doc.segments.length,
      supportCount: doc.supports.length,
      scopeStats: options.scopeStats || null,
    },
  }));

  return doc;
}

export function buildUxmlTextFromStagedHierarchy(hierarchy = [], options = {}) {
  return `${JSON.stringify(buildUxmlFromStagedHierarchy(hierarchy, options), null, 2)}\n`;
}
