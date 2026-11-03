function clean(value) { return String(value ?? '').trim(); }
function isObject(value) { return !!value && typeof value === 'object' && !Array.isArray(value); }
function safeId(value, fallback = 'id') {
  return (clean(value) || fallback).replace(/[\/\s]+/g, '-').replace(/[^A-Za-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
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
  const nums = clean(value).match(/-?\d+(?:\.\d+)?/g)?.map(Number).filter(Number.isFinite) || [];
  return nums.length >= 3 ? { x: nums[0], y: nums[1], z: nums[2] } : null;
}
function boreNumber(value) {
  const n = Number.parseFloat(clean(value).replace(/mm\b/gi, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function lengthBetween(a, b) {
  if (!a || !b) return null;
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  return Number.isFinite(len) ? Number(len.toFixed(6)) : null;
}
function normalizeType(type) {
  const t = clean(type).toUpperCase();
  if (t === 'BEND' || t === 'ELBO') return 'ELBOW';
  if (t === 'VALV') return 'VALVE';
  if (t === 'FLAN') return 'FLANGE';
  if (t === 'GASK') return 'GASKET';
  if (t === 'REDU') return 'REDUCER';
  if (t === 'ATTA' || t === 'SUPPORT') return 'SUPPORT';
  return t || 'UNKNOWN';
}
function portRole(key) {
  if (key === 'APOS') return 'START';
  if (key === 'LPOS') return 'END';
  if (key === 'POS') return 'CENTER';
  return key;
}
function firstBore(attrs = {}) {
  for (const key of ['ABORE', 'LBORE', 'BORE', 'HBORE', 'TBORE']) {
    const value = boreNumber(attrs[key]);
    if (value) return { value, field: key, raw: attrs[key] };
  }
  return null;
}

export function buildInputXmlManagedStageUxml(staged = {}, options = {}) {
  const stem = safeId(options.stem || staged.source || 'inputxml', 'inputxml');
  const hierarchy = Array.isArray(staged.hierarchy) ? staged.hierarchy : [];
  const doc = {
    schemaVersion: 'uxml-topology-v1',
    profile: 'UXML-TOPOLOGY-FULL',
    header: {
      projectId: clean(options.projectId || 'INPUTXML_DIRECT_MANAGED_STAGE'),
      modelId: stem,
      createdBy: '3D_Viewer_InputXML_ManagedStage',
      createdAt: new Date(0).toISOString(),
      purpose: 'inputxml-managed-stage-sidecar-uxml',
      notes: 'UXML sidecar generated from topology-rich InputXML managed_stage.json. Conventional XML and CII outputs remain unchanged.',
    },
    sources: [{ id: `src:${stem}:inputxml`, format: 'CAESARII_INPUTXML', path: clean(options.inputName || staged.source || ''), name: clean(options.inputName || staged.source || stem), role: 'PRIMARY' }],
    mappings: [{ id: 'mapping:inputxml-managed-stage-to-uxml', profile: 'SIDECAR', sourceFormat: 'INPUTXML_MANAGED_STAGE_JSON', sourceField: 'hierarchy[].children[].attributes.{APOS,LPOS,POS,TYPE,BORE}', targetField: 'pipelines/components/anchors/ports/segments/supports', confidence: 'DERIVED' }],
    units: { coordinates: 'MM', bore: 'MM', length: 'MM', weight: 'KG', pressure: 'kPa', temperature: 'C', rotation: 'DEGREES' },
    pipelines: [], components: [], anchors: [], ports: [], segments: [], supports: [], topologyHints: [], diagnostics: [],
  };

  let componentIndex = 0;
  let anchorIndex = 0;
  let portIndex = 0;
  let segmentIndex = 0;
  let supportIndex = 0;

  for (const branch of hierarchy) {
    const branchAttrs = branch?.attributes || {};
    if (!['BRAN', 'BRANCH'].includes(clean(branch.type || branchAttrs.TYPE).toUpperCase())) continue;
    const pipelineId = `pipe:${safeId(branch.name || branchAttrs.NAME || 'branch')}`;
    doc.pipelines.push({ id: pipelineId, pipelineRef: clean(branch.name || branchAttrs.NAME || ''), lineKey: clean(branchAttrs.NAME || branch.name || ''), lineNo: clean(branch.name || ''), rawAttributes: { ...branchAttrs }, diagnostics: [] });

    for (const child of Array.isArray(branch.children) ? branch.children : []) {
      const attrs = child?.attributes || {};
      const rawType = clean(child?.type || attrs.TYPE || 'UNKNOWN');
      const normalizedType = normalizeType(attrs.CANONICAL_TYPE || rawType);
      const name = clean(child?.name || attrs.NAME || `${normalizedType}-${componentIndex + 1}`);
      const componentId = `cmp:${safeId(name)}:${String(++componentIndex).padStart(5, '0')}`;
      const sourceRef = clean(attrs.REF || attrs.SOURCE_ELEMENT_ID || attrs.SOURCE_RESTRAINT_ID || name);
      const bore = firstBore(attrs);
      const component = {
        id: componentId,
        sourceRefs: [sourceRef].filter(Boolean),
        type: rawType,
        normalizedType,
        pipelineRef: pipelineId,
        lineKey: clean(branchAttrs.NAME || branch.name || ''),
        refNo: sourceRef,
        seqNo: String(componentIndex),
        name,
        bore: bore?.value ?? null,
        branchBore: null,
        boreUnit: 'MM',
        sizeRaw: clean(bore?.raw || ''),
        rawAttributes: { ...attrs },
        normalized: {},
        derived: { sourceAuthority: attrs.SOURCE_AUTHORITY || '', nodeRole: attrs.NODE_ROLE || '', sourceNodeNumbers: attrs.SOURCE_NODE_NUMBERS || [] },
        anchorIds: [], portIds: [], segmentIds: [], supportId: '',
        confidence: clean(attrs.TOPOLOGY_CONFIDENCE || 'DERIVED_FROM_INPUTXML_MANAGED_STAGE'),
        diagnostics: [],
      };

      const anchorByKey = {};
      for (const key of ['APOS', 'LPOS', 'POS']) {
        const point = pointFromValue(attrs[key]);
        if (!point) continue;
        const anchorId = `anc:${safeId(name)}:${key}:${String(++anchorIndex).padStart(5, '0')}`;
        const portId = `prt:${safeId(name)}:${key}:${String(++portIndex).padStart(5, '0')}`;
        anchorByKey[key] = { id: anchorId, point };
        doc.anchors.push({ id: anchorId, componentId, role: portRole(key), point, nodeNumber: clean(attrs[key === 'APOS' ? 'FROM_NODE' : key === 'LPOS' ? 'TO_NODE' : 'NODE'] || ''), nodeLabel: '', sourceRef: { field: key, value: attrs[key] }, sourceField: key, confidence: 'INPUTXML_MANAGED_STAGE_POINT', fallbackLevel: '', derivationMethod: clean(attrs.TOPOLOGY_METHOD || ''), diagnostics: [] });
        doc.ports.push({ id: portId, componentId, anchorId, role: portRole(key), point, bore: bore?.value ?? null, branchBore: null, fixed: true, futureMovable: false, mutableNow: false, connectsTo: normalizedType === 'SUPPORT' ? 'SUPPORT_ASSOCIATION' : 'ENDPOINT', maxDegree: normalizedType === 'SUPPORT' ? 0 : 1, diagnostics: [] });
        component.anchorIds.push(anchorId);
        component.portIds.push(portId);
      }

      if (anchorByKey.APOS && anchorByKey.LPOS) {
        const segmentId = `seg:${safeId(name)}:${String(++segmentIndex).padStart(5, '0')}`;
        doc.segments.push({ id: segmentId, componentId, type: normalizedType === 'ELBOW' ? 'BEND_CHORD' : 'CENTERLINE', startAnchorId: anchorByKey.APOS.id, endAnchorId: anchorByKey.LPOS.id, supportAnchorId: '', bore: bore?.value ?? null, length: lengthBetween(anchorByKey.APOS.point, anchorByKey.LPOS.point), lengthUnit: 'MM', diagnostics: [] });
        component.segmentIds.push(segmentId);
      }

      if (normalizedType === 'SUPPORT') {
        const supportId = `sup:${safeId(name)}:${String(++supportIndex).padStart(5, '0')}`;
        doc.supports.push({ id: supportId, componentId, type: clean(attrs.SUPPORT_KIND || attrs.SUPPORT_TYPE || 'SUPPORT'), skey: clean(attrs.SUPPORT_TAG || attrs.SOURCE_TAG || ''), supportAnchorId: anchorByKey.POS?.id || '', hostCandidates: [attrs.HOST_COMPONENT_ID].filter(Boolean), restraints: [{ type: attrs.SUPPORT_KIND || attrs.SUPPORT_TYPE || '', gapMm: attrs.SUPPORT_GAP_MM ?? '', sourceNodeNumber: attrs.NODE || '' }], diagnostics: [] });
        component.supportId = supportId;
      }

      if (!component.anchorIds.length) component.diagnostics.push({ id: `diag:${componentId}:no-anchors`, severity: 'WARN', code: 'NO_INPUTXML_STAGE_COORDINATES', message: `InputXML staged component ${name} has no APOS/LPOS/POS coordinates.`, componentId });
      doc.components.push(component);
    }
  }

  doc.diagnostics.push({ id: 'diag:inputxml-managed-stage-sidecar-summary', severity: 'INFO', code: 'INPUTXML_MANAGED_STAGE_UXML_SIDECAR', message: `Generated UXML sidecar from ${doc.pipelines.length} branch(es), ${doc.components.length} component(s), ${doc.anchors.length} anchor(s), ${doc.segments.length} segment(s), ${doc.supports.length} support(s).`, details: { pipelineCount: doc.pipelines.length, componentCount: doc.components.length, anchorCount: doc.anchors.length, segmentCount: doc.segments.length, supportCount: doc.supports.length, scopeStats: options.scopeStats || null } });
  return doc;
}

export function buildInputXmlManagedStageUxmlText(staged = {}, options = {}) {
  return `${JSON.stringify(buildInputXmlManagedStageUxml(staged, options), null, 2)}\n`;
}
