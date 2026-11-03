import { withGeometryLayer } from './GeometryLayerMetadata.js';

export const BM_CII_GEOMETRY_TRACE_SCHEMA = 'bm-cii-geometry-trace/v1';

function text(value) {
  String(value ?? '').trim();
  return String(value ?? '').trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const out = text(value);
    if (out) return out;
  }
  return '';
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function attrsOf(component = {}) {
  return { ...(component.raw || {}), ...(component.attributes || {}) };
}

function nodeValue(component = {}, attrs = {}) {
  return firstNonEmpty(
    component.node,
    component.nodeNumber,
    component.fromNode,
    component.toNode,
    attrs.NODE,
    attrs.Node,
    attrs.NODE_NO,
    attrs.NodeNumber,
    attrs.NODE_NUMBER,
    attrs.FROM_NODE,
    attrs.TO_NODE,
  );
}

function fromNodeValue(component = {}, attrs = {}) {
  return firstNonEmpty(component.fromNode, component.from, component.node1, attrs.FROM_NODE, attrs.FromNode, attrs.NODE1);
}

function toNodeValue(component = {}, attrs = {}) {
  return firstNonEmpty(component.toNode, component.to, component.node2, attrs.TO_NODE, attrs.ToNode, attrs.NODE2, component.node);
}

function axisValue(component = {}, attrs = {}, extra = {}) {
  return firstNonEmpty(
    extra.axis,
    extra.direction,
    extra.restraintAxis,
    component.axis,
    component.direction,
    component.restraintAxis,
    attrs.AXIS,
    attrs.Axis,
    attrs.DIRECTION,
    attrs.Direction,
    attrs.RESTRAINT_AXIS,
    attrs['RESTRAINT-AXIS'],
  );
}

function gapValue(component = {}, attrs = {}, extra = {}) {
  return firstNonEmpty(
    extra.gap,
    component.gap,
    component.gapMm,
    component.restraintGap,
    attrs.GAP,
    attrs.Gap,
    attrs.GAP_MM,
    attrs['GAP-MM'],
    attrs.RESTRAINT_GAP,
  );
}

function renderGlyphValue(component = {}, attrs = {}, extra = {}) {
  return firstNonEmpty(
    extra.renderGlyph,
    extra.bmCiiTrace?.renderGlyph,
    component.renderGlyph,
    attrs.RENDER_GLYPH,
    attrs.renderGlyph,
  );
}

function renderScaleValue(component = {}, attrs = {}, extra = {}) {
  return firstFiniteNumber(
    extra.renderScale,
    extra.supportSymbolScale,
    extra.bmCiiTrace?.renderScale,
    component.renderScale,
    attrs.RENDER_SCALE,
    attrs.renderScale,
  );
}

function visualProfileValue(component = {}, attrs = {}, extra = {}) {
  return firstNonEmpty(
    extra.visualProfile,
    extra.glbSupportVisualProfile,
    extra.bmCiiTrace?.visualProfile,
    extra.bmCiiRestraintVisualProfile?.profile,
    component.visualProfile,
    attrs.VISUAL_PROFILE,
    attrs.visualProfile,
  );
}

export function semanticCategoryFromComponent(component = {}, extra = {}) {
  const attrs = attrsOf(component);
  const raw = upper([
    component.type,
    component.elementType,
    component.componentType,
    component.typeDesc,
    component.description,
    component.name,
    component.id,
    extra.glbShape,
    extra.supportKind,
    attrs.TYPE,
    attrs.Type,
    attrs.COMPONENT_TYPE,
    attrs.ComponentType,
    attrs.SKEY,
    attrs.SUPPORT_TAG,
    attrs.ANNOTATION_TYPE,
    attrs.ANNOTATION_KIND,
    attrs.NODE_LABEL,
  ].join(' '));

  if (component.type === 'NODE_LABEL' || raw.includes('NODE_LABEL') || raw.includes('NODE ANNOTATION')) return 'annotation';
  if (raw.includes('SUPPORT') || raw.includes('RESTRAINT') || raw.includes('GUIDE') || raw.includes('LINESTOP') || raw.includes('LINE STOP') || raw.includes('HANGER') || raw.includes('SPRING') || raw.includes('ANCHOR') || raw.includes('SHOE') || raw.includes('REST')) return 'support';
  if (/VALVE|\bVGT\b|\bVGL\b|\bVBA\b|\bVCH\b/.test(raw)) return 'valve';
  if (/FLANGE|\bFLG\b/.test(raw)) return 'flange';
  if (/TEE|OLET|WELDOLET|SOCKOLET/.test(raw)) return 'teeOlet';
  if (/BEND|ELBOW|ELB/.test(raw)) return 'bend';
  if (/PIPE|RIGID|TRIM/.test(raw)) return 'pipe';
  return 'other';
}

export function componentTraceKey(component = {}, extra = {}) {
  const attrs = attrsOf(component);
  const id = firstNonEmpty(component.id, component.refNo, attrs.COMPONENT_IDENTIFIER, attrs['COMPONENT-IDENTIFIER'], attrs['COMPONENT-ATTRIBUTE97']);
  const category = semanticCategoryFromComponent(component, extra);
  const fromNode = fromNodeValue(component, attrs);
  const toNode = toNodeValue(component, attrs);
  const node = nodeValue(component, attrs);
  return [
    category === 'annotation' ? 'annotation' : 'component',
    category,
    id || 'NO_ID',
    fromNode || node || '',
    toNode || node || '',
  ].join('|');
}

export function supportTraceKey(record = {}, supportSource = '') {
  const node = firstNonEmpty(record.node, record.nodeNumber, record.psNode, record.supportNode, record.NODE, record.Node);
  const kind = upper(firstNonEmpty(record.kind, record.type, record.restraintType, record.rawType, record.supportKind, 'UNKNOWN'));
  const source = upper(supportSource || record.source || record.supportSource || record.SOURCE || '');
  const id = firstNonEmpty(record.id, record.supportId, record.refNo, record.name, record.tag, record.SUPPORT_TAG);
  return ['support', source || 'UNKNOWN_SOURCE', kind || 'UNKNOWN', node || 'NO_NODE', id || 'NO_ID'].join('|');
}

export function calloutTraceKey(callout = {}) {
  const no = firstNonEmpty(callout.no, callout.calloutNo, callout.label);
  const node = firstNonEmpty(callout.node, callout.nodeNumber, callout.NODE);
  return ['annotation', 'ISONOTE_CALLOUT', no || 'NO_NO', node || 'NO_NODE'].join('|');
}

export function componentGeometryTrace(component = {}, extra = {}, context = {}) {
  const attrs = attrsOf(component);
  const category = semanticCategoryFromComponent(component, extra);
  const supportSource = firstNonEmpty(
    context.supportSource,
    component.supportSource,
    component.source,
    attrs.SUPPORT_SOURCE,
    attrs['SUPPORT-SOURCE'],
  );
  const supportKind = firstNonEmpty(extra.supportKind, component.supportKind, attrs.SUPPORT_KIND, attrs.SKEY, attrs.SUPPORT_TAG);
  const sourceComponentId = firstNonEmpty(component.id, attrs.COMPONENT_IDENTIFIER, attrs['COMPONENT-IDENTIFIER'], attrs['COMPONENT-ATTRIBUTE97'], component.refNo);
  const annotationKind = category === 'annotation'
    ? firstNonEmpty(extra.annotationKind, extra.annotationType, attrs.ANNOTATION_KIND, attrs.ANNOTATION_TYPE, 'NODE_LABEL')
    : '';
  const source = category === 'annotation'
    ? firstNonEmpty(component.source, attrs.SOURCE, attrs.Source, 'inputxml')
    : firstNonEmpty(component.source, attrs.SOURCE, attrs.Source, 'inputxml');

  return {
    schema: BM_CII_GEOMETRY_TRACE_SCHEMA,
    entity: category === 'annotation' ? 'annotation' : 'component',
    traceKey: componentTraceKey(component, extra),
    sourceComponentId,
    sourceRefNo: firstNonEmpty(component.refNo, attrs['COMPONENT-ATTRIBUTE97'], attrs.REF_NO, attrs.RefNo),
    semanticCategory: category,
    annotationKind,
    annotationType: annotationKind,
    source,
    componentType: firstNonEmpty(component.type, component.componentType, attrs.COMPONENT_TYPE, attrs.ComponentType),
    glbShape: firstNonEmpty(extra.glbShape, attrs.glbShape),
    fromNode: fromNodeValue(component, attrs),
    toNode: toNodeValue(component, attrs),
    node: nodeValue(component, attrs),
    lineNo: firstNonEmpty(context.lineNo, extra.lineNo, component.lineNo, attrs.LINE_NO, attrs.LineNo, attrs.Pipeline, component.pipelineRef),
    supportSource,
    supportKind: supportKind ? upper(supportKind) : '',
    axis: axisValue(component, attrs, extra),
    gap: gapValue(component, attrs, extra),
    renderGlyph: renderGlyphValue(component, attrs, extra),
    renderScale: renderScaleValue(component, attrs, extra),
    visualProfile: visualProfileValue(component, attrs, extra),
  };
}

export function annotationGeometryTrace({ callouts = [], nodeCalloutMap = {}, markerCount = 0, source = 'ISONOTE' } = {}) {
  const normalizedCallouts = (callouts || []).map((callout) => ({
    traceKey: calloutTraceKey(callout),
    no: Number(callout.no || callout.calloutNo || 0) || null,
    node: firstNonEmpty(callout.node, callout.nodeNumber, callout.NODE),
    source,
    text: firstNonEmpty(callout.text, callout.caesarCalloutText),
  }));

  return {
    schema: BM_CII_GEOMETRY_TRACE_SCHEMA,
    entity: 'annotation',
    traceKey: 'annotation|CAESAR_ANNOTATION|MERGED',
    semanticCategory: 'annotation',
    annotationKind: 'CAESAR_ANNOTATION_MERGED_CALLOUTS',
    source,
    markerCount: Number(markerCount) || normalizedCallouts.length,
    calloutCount: normalizedCallouts.length,
    calloutNodes: normalizedCallouts.map((callout) => callout.node).filter(Boolean),
    callouts: normalizedCallouts,
    nodeCalloutMap,
  };
}

export function withGeometryTrace(userData = {}, trace = {}) {
  if (!trace || typeof trace !== 'object') return { ...(userData || {}) };
  return withGeometryLayer({
    ...(userData || {}),
    bmCiiTraceSchema: BM_CII_GEOMETRY_TRACE_SCHEMA,
    bmCiiTrace: trace,
    bmCiiTraceKey: trace.traceKey || '',
    bmCiiTraceEntity: trace.entity || '',
    bmCiiTraceCategory: trace.semanticCategory || '',
    sourceComponentId: trace.sourceComponentId || userData.sourceComponentId || '',
    sourceNode: trace.node || userData.sourceNode || '',
    sourceFromNode: trace.fromNode || userData.sourceFromNode || '',
    sourceToNode: trace.toNode || userData.sourceToNode || '',
    supportSource: trace.supportSource || userData.supportSource || '',
    supportKind: trace.supportKind || userData.supportKind || '',
    annotationKind: trace.annotationKind || userData.annotationKind || '',
    annotationType: trace.annotationType || userData.annotationType || '',
    restraintAxis: trace.axis || userData.restraintAxis || '',
    restraintGap: trace.gap || userData.restraintGap || '',
    renderGlyph: trace.renderGlyph || userData.renderGlyph || '',
    renderScale: trace.renderScale ?? userData.renderScale,
    visualProfile: trace.visualProfile || userData.visualProfile || userData.glbSupportVisualProfile || '',
  }, trace);
}

export function applyGeometryTrace(object, trace, { includeChildren = true } = {}) {
  if (!object) return object;
  const apply = (target) => {
    target.userData = withGeometryTrace(target.userData || {}, trace);
  };
  apply(object);
  if (includeChildren && object.traverse) object.traverse((child) => apply(child));
  return object;
}

export function applyComponentGeometryTrace(object, component, context = {}) {
  const trace = componentGeometryTrace(component, object?.userData || {}, context);
  const includeChildren = component?.type !== 'NODE_LABEL';
  return applyGeometryTrace(object, trace, { includeChildren });
}

export function applyAnnotationGeometryTrace(object, annotation = {}) {
  const trace = annotationGeometryTrace(annotation);
  return applyGeometryTrace(object, trace, { includeChildren: true });
}
