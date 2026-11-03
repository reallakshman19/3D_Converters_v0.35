import { classifyCaesarRestraint } from './CaesarRestraintClassifier.js';
import { bendMetadataFromComponentRaw } from './InputXmlBendMetadata.js';
import {
  LINE_NO_METADATA_KEYS,
  firstLineNoValue,
  metadataValueFromKeys,
  normalizeLineNoValue,
} from '../../utils/line-no-metadata.js';

function text(value) {
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function wordsFrom(...values) {
  return values.map(upper).filter(Boolean).join(' ');
}

function parseSelectedBranches(selectedBranches) {
  if (!selectedBranches) return new Set();
  if (selectedBranches instanceof Set) return new Set([...selectedBranches].map(text).filter(Boolean));
  if (Array.isArray(selectedBranches)) return new Set(selectedBranches.map(text).filter(Boolean));
  return new Set(String(selectedBranches).split(/[\s,;]+/).map(text).filter(Boolean));
}

function classifyComponentLayer(component = {}, segment = {}) {
  const raw = component.rawAttributes || {};
  const haystack = wordsFrom(
    component.normalizedType,
    component.type,
    component.skey,
    component.name,
    component.id,
    segment.type,
    raw.COMPONENT_TYPE,
    raw.componentType,
    raw.SKEY,
    raw.TYPE,
  );
  if (/SUPPORT|RESTRAINT|ANCHOR|GUIDE|LINE\s*STOP|LINESTOP|HANGER|SPRING|LIMIT/.test(haystack)) return 'SUPPORTS';
  if (/VALVE|GATE|BALL|CHECK|GLOBE/.test(haystack)) return 'VALVES';
  if (/FLANGE|WELD\s*NECK|WELDNECK|BLIND/.test(haystack)) return 'FLANGES';
  if (/REDUCER|REDUCING|ECC|CONC/.test(haystack)) return 'REDUCERS';
  if (/TEE|BRANCH/.test(haystack)) return 'TEES';
  if (/OLET|WELDOLET|SOCKOLET|THREDOLET/.test(haystack)) return 'OLETS';
  if (/BEND|ELBOW/.test(haystack)) return 'ELBOWS';
  if (/NOZZLE|CAP|CLOSURE/.test(haystack)) return 'NOZZLES';
  return 'PIPES';
}

function classifySupportType(support = {}, component = {}) {
  const raw = { ...(component.rawAttributes || {}), ...(support.rawAttributes || {}) };
  const haystack = wordsFrom(
    support.type,
    support.skey,
    support.id,
    component.normalizedType,
    component.type,
    component.skey,
    component.id,
    raw.CAESAR_SUPPORT_KIND,
    raw.INPUTXML_SUPPORT_KIND,
    raw.SUPPORT_KIND,
    raw.CMPSUPTYPE,
    raw.SUPPORT_TYPE,
    raw.TYPE,
    raw.SKEY,
  );
  if (/GUIDE/.test(haystack)) return 'GUIDE';
  if (/LINE\s*STOP|LINESTOP/.test(haystack)) return 'LINESTOP';
  if (/LIMIT|\bLIM\b/.test(haystack)) return 'LIMIT';
  if (/ANCHOR|\bANC\b/.test(haystack)) return 'ANCHOR';
  if (/HANGER|SPRING/.test(haystack)) return 'SPRING';
  if (/REST|RESTRAINT|\+Y|\bY\b/.test(haystack)) return 'REST';
  return 'REST';
}

function point3(point, bore = null) {
  const x = Number(point?.x);
  const y = Number(point?.y);
  const z = Number(point?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  const out = { x, y, z };
  const numericBore = Number(bore);
  if (Number.isFinite(numericBore) && numericBore > 0) out.bore = numericBore;
  return out;
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

function expectedBendChord(radius, angleDeg) {
  const r = Number(radius);
  const a = Number(angleDeg);
  if (!Number.isFinite(r) || r <= 0 || !Number.isFinite(a) || a <= 0) return null;
  return 2 * r * Math.sin((Math.min(Math.abs(a), 180) * Math.PI / 180) / 2);
}

function shouldRenderBendAsStraightPipe({ p1, p2, bendMetadata, bore }) {
  const chord = distance(p1, p2);
  const expected = expectedBendChord(bendMetadata?.radius, bendMetadata?.angleDeg);
  if (expected != null) return chord > Math.max(expected * 2.25, expected + Math.max(Number(bore) || 0, 50));
  const r = Number(bendMetadata?.radius);
  if (Number.isFinite(r) && r > 0) return chord > r * 3;
  return false;
}

function componentAliases(component) {
  return [
    component?.pipelineRef,
    component?.lineKey,
    component?.rawAttributes?.pipelineRef,
  ].map(text).filter(Boolean);
}

const LINE_NO_KEYS = LINE_NO_METADATA_KEYS;

function lineNoForComponent(component = {}, context = {}) {
  const raw = component.rawAttributes || {};
  const normalized = component.normalized || {};
  const pipelineById = context.pipelineById || new Map();
  const pipelineByRef = context.pipelineByRef || new Map();
  const pipeline = pipelineById.get(component.pipelineId) || pipelineByRef.get(component.pipelineRef) || null;

  return firstLineNoValue(
    metadataValueFromKeys(component, LINE_NO_KEYS),
    metadataValueFromKeys(raw, LINE_NO_KEYS),
    metadataValueFromKeys(normalized, LINE_NO_KEYS),
    metadataValueFromKeys(pipeline || {}, LINE_NO_KEYS),
    component.lineKey,
    component.pipelineRef
  );
}

function componentSelected(component, selectedIds) {
  if (!selectedIds.size) return true;
  return componentAliases(component).some((alias) => selectedIds.has(alias));
}

function isSupportComponent(component, segment = {}) {
  const type = upper(component?.normalizedType || component?.type || segment?.type);
  return type.includes('SUPPORT') || upper(segment?.type) === 'SUPPORT_ASSOCIATION';
}

function glbTypeForLayer(layer, component = {}) {
  const rawType = upper(component?.normalizedType || component?.type || '');
  if (rawType.includes('SUPPORT')) return 'SUPPORT';
  switch (layer) {
    case 'VALVES': return 'VALVE';
    case 'FLANGES': return 'FLANGE';
    case 'REDUCERS': return rawType.includes('ECC') ? 'REDUCER-ECCENTRIC' : 'REDUCER';
    case 'TEES': return 'TEE';
    case 'OLETS': return 'OLET';
    case 'ELBOWS': return rawType.includes('BEND') ? 'BEND' : 'ELBOW';
    case 'NOZZLES': return 'CAP';
    default: return 'PIPE';
  }
}

function supportKindForGlb(supportType, component = {}, support = {}) {
  const raw = { ...(support.rawAttributes || {}), ...(component.rawAttributes || {}) };
  const caesarKind = upper(raw.caesarSupportKind || raw.CAESAR_SUPPORT_KIND || raw.INPUTXML_SUPPORT_KIND);
  const resolved = caesarKind || upper(classifyCaesarRestraint(raw, { tagName: raw.sourceTagName }));
  const kind = resolved || upper(supportType);
  if (kind === 'GUIDE') return 'GUIDE';
  if (kind === 'LINESTOP' || kind === 'LINE_STOP') return 'LINESTOP';
  if (kind === 'LIMIT') return 'LIMIT';
  if (kind === 'ANCHOR') return 'ANCHOR';
  if (kind === 'HANGER' || kind === 'SPRING') return 'SPRING';
  return 'REST';
}

function makeAttributes(component = {}, extra = {}, context = {}) {
  return {
    ...(component.rawAttributes || {}),
    ...(component.normalized || {}),
    pipelineRef: text(component.pipelineRef),
    lineKey: text(component.lineKey),
    lineNo: lineNoForComponent(component, context),
    COMPONENT_IDENTIFIER: text(component.name || component.id),
    COMPONENT_TYPE: text(component.normalizedType || component.type),
    SKEY: text(component.skey),
    ...extra,
  };
}

function bendExtraForComponent(component = {}) {
  const metadata = bendMetadataFromComponentRaw(component.rawAttributes || {});
  const extra = {};
  if (metadata.radius != null) extra.BEND_RADIUS = String(metadata.radius);
  if (metadata.angleDeg != null) extra.BEND_ANGLE_DEG = String(metadata.angleDeg);
  if (metadata.node) extra.BEND_NODE = metadata.node;
  if (metadata.source) extra.BEND_METADATA_SOURCE = metadata.source;
  return { metadata, extra };
}

function makeSegmentComponent(segment, component, anchors, diagnostics, context = {}) {
  const p1 = point3(anchors.get(segment.startAnchorId)?.point, segment.bore || component?.bore);
  const p2 = point3(anchors.get(segment.endAnchorId)?.point, segment.bore || component?.bore);
  if (!p1 || !p2) {
    diagnostics.push({
      type: 'inputxml-glb-segment-missing-anchor',
      severity: 'WARN',
      componentId: segment.componentId,
      segmentId: segment.id,
    });
    return null;
  }

  const layer = classifyComponentLayer(component, segment);
  const originalType = glbTypeForLayer(layer, component);
  const bore = Number(component?.bore ?? segment.bore ?? p1.bore ?? p2.bore ?? 20);
  const id = text(segment.id || component?.id || `segment-${diagnostics.length}`);
  const { metadata: bendMetadata, extra: bendExtra } = bendExtraForComponent(component);
  const suppressFullCurve = ['BEND', 'ELBOW'].includes(originalType) && shouldRenderBendAsStraightPipe({
    p1,
    p2,
    bendMetadata,
    bore,
  });
  const type = suppressFullCurve ? 'PIPE' : originalType;
  const attributes = makeAttributes(component, {
    layer,
    uxmlSegmentId: text(segment.id),
    ...bendExtra,
    ...(suppressFullCurve ? {
      CAESAR_BEND_DISPLAY_MODE: 'STRAIGHT_PIPE_WITH_LOCAL_BEND_METADATA',
      CAESAR_BEND_SUPPRESSED_FULL_CURVE: 'true',
      CAESAR_BEND_ORIGINAL_GLB_TYPE: originalType,
    } : {}),
  }, context);
  const lineNo = lineNoForComponent(component, context);

  return {
    id,
    type,
    ep1: p1,
    ep2: p2,
    centrePoint: p1,
    branch1Point: p2,
    bore: Number.isFinite(bore) && bore > 0 ? bore : 20,
    refNo: text(component?.refNo || component?.seqNo || component?.id || id),
    attributes,
    raw: component?.rawAttributes || {},
    bendRadius: bendMetadata.radius,
    bendAngleDeg: bendMetadata.angleDeg,
    bendMetadataSource: bendMetadata.source,
    bendNode: bendMetadata.node,
    bendDisplayMode: suppressFullCurve ? 'straight-pipe-with-local-bend-metadata' : '',
    pipelineRef: text(component?.pipelineRef),
    lineKey: text(component?.lineKey),
    lineNo,
    uxmlComponentId: text(component?.id),
    uxmlSegmentId: text(segment.id),
  };
}

function makeSupportComponent(support, component, anchors, diagnostics, context = {}) {
  const point = point3(anchors.get(support.supportAnchorId)?.point, component?.bore);
  if (!point) {
    diagnostics.push({
      type: 'inputxml-glb-support-missing-anchor',
      severity: 'WARN',
      supportId: support.id,
      componentId: support.componentId,
    });
    return null;
  }

  const supportType = classifySupportType(support, component);
  const supportKind = supportKindForGlb(supportType, component, support);
  const raw = { ...(support.rawAttributes || {}), ...(component?.rawAttributes || {}) };
  const label = text(raw.caesarSupportLabel || component?.name || support?.id || component?.id || 'SUPPORT');
  const attrs = makeAttributes(component, {
    SUPPORT_TAG: label,
    SUPPORT_NAME: label,
    SKEY: text(support.skey || component?.skey || supportKind),
    CMPSUPTYPE: supportKind,
    SUPPORT_KIND: supportKind,
    INPUTXML_SUPPORT_TYPE: supportType,
    CAESAR_SUPPORT_KIND: text(raw.caesarSupportKind || ''),
    CAESAR_SUPPORT_LABEL: label,
    uxmlSupportId: text(support.id),
  }, context);
  const lineNo = lineNoForComponent(component, context);

  return {
    id: text(support.id || component?.id || `support-${diagnostics.length}`),
    type: 'SUPPORT',
    coOrds: point,
    ep1: point,
    bore: Number(component?.bore) > 0 ? Number(component.bore) : 20,
    refNo: text(component?.refNo || support.id),
    attributes: attrs,
    raw,
    supportType,
    supportKind,
    pipelineRef: text(component?.pipelineRef),
    lineKey: text(component?.lineKey),
    lineNo,
    uxmlComponentId: text(component?.id),
    uxmlSupportId: text(support.id),
  };
}

export function adaptUxmlToGlbModel(doc, options = {}) {
  const selectedIds = parseSelectedBranches(options.selectedBranches);
  const componentsById = new Map((doc.components || []).map((component) => [component.id, component]));
  const anchors = new Map((doc.anchors || []).map((anchor) => [anchor.id, anchor]));
  const pipelineById = new Map((doc.pipelines || []).map((pipeline) => [pipeline.id, pipeline]));
  const pipelineByRef = new Map((doc.pipelines || []).map((pipeline) => [pipeline.pipelineRef, pipeline]));
  const context = { pipelineById, pipelineByRef };
  const components = [];
  const diagnostics = [];
  const typeCounts = {};
  const supportKindCounts = {};
  let bendRadiusCount = 0;
  let suppressedFullBendCurveCount = 0;

  for (const segment of doc.segments || []) {
    const component = componentsById.get(segment.componentId);
    if (!component || !componentSelected(component, selectedIds)) continue;
    if (isSupportComponent(component, segment)) continue;
    const glbComponent = makeSegmentComponent(segment, component, anchors, diagnostics, context);
    if (!glbComponent) continue;
    if (glbComponent.bendRadius != null) bendRadiusCount += 1;
    if (glbComponent.bendDisplayMode === 'straight-pipe-with-local-bend-metadata') suppressedFullBendCurveCount += 1;
    components.push(glbComponent);
    typeCounts[glbComponent.type] = (typeCounts[glbComponent.type] || 0) + 1;
  }

  for (const support of doc.supports || []) {
    const component = componentsById.get(support.componentId);
    if (component && !componentSelected(component, selectedIds)) continue;
    if (!component && selectedIds.size) continue;
    const glbSupport = makeSupportComponent(support, component, anchors, diagnostics, context);
    if (!glbSupport) continue;
    components.push(glbSupport);
    typeCounts.SUPPORT = (typeCounts.SUPPORT || 0) + 1;
    supportKindCounts[glbSupport.supportKind] = (supportKindCounts[glbSupport.supportKind] || 0) + 1;
  }

  const lineNos = Array.from(new Set([
    ...components.map((component) => text(component.lineNo)),
    ...(doc.pipelines || []).map((pipeline) => firstLineNoValue(
      metadataValueFromKeys(pipeline, LINE_NO_KEYS),
      pipeline.lineNo,
      pipeline.lineKey,
      pipeline.pipelineRef,
    )),
  ].map(normalizeLineNoValue).filter(Boolean))).sort();

  return {
    model: {
      schema: 'inputxml-glb-model/v1',
      source: 'InputXML->UXML->GLB',
      units: doc.units || {},
      lineNo: lineNos[0] || '',
      lineNos,
      components,
    },
    stats: {
      componentCount: components.length,
      typeCounts,
      supportKindCounts,
      selectedBranchIds: [...selectedIds],
      lineNo: lineNos[0] || '',
      lineNos,
      bendRadiusCount,
      suppressedFullBendCurveCount,
    },
    diagnostics,
  };
}
