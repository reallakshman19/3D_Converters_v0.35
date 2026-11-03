import {
  normalizeRestraintAxisLabel,
  normalizeRestraintKind,
  layerIdsForRestraintSupport,
  RESTRAINT_VISUAL_PROFILE,
  visualProfileMetadata,
} from './RestraintVisualProfile.js';

export const BM_CII_LAYER_SCHEMA = 'bm-cii-layer/v1';
export const BM_CII_LAYER_MANIFEST_SCHEMA = 'bm-cii-layer-manifest/v1';

function text(value) {
  return String(value ?? '').trim();
}

function lower(value) {
  return text(value).toLowerCase();
}

function cleanLayerId(value) {
  return lower(value)
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function unique(values) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

export function normalizeSupportKind(value) {
  return normalizeRestraintKind(value);
}

function categoryFromTrace(trace = {}, extra = {}) {
  return lower(trace.semanticCategory || trace.category || extra.category || 'other');
}

function annotationKindFromTrace(trace = {}, extra = {}) {
  return lower(trace.annotationKind || trace.annotationType || extra.annotationKind || extra.annotationType || '');
}

function annotationRoleFromTrace(trace = {}, extra = {}) {
  return lower(trace.annotationRole || trace.nodeAnnotationPart || extra.annotationRole || extra.nodeAnnotationPart || '');
}

function sourceForLayer(trace = {}, extra = {}) {
  const entity = lower(trace.entity || extra.entity);
  const category = categoryFromTrace(trace, extra);

  if (entity === 'annotation' || category === 'annotation') {
    return lower(trace.source || extra.source || 'inputxml');
  }

  if (category === 'support') {
    return lower(trace.supportSource || trace.source || extra.source || 'generated');
  }

  // Plant geometry in the InputXML pipeline originates from InputXML, even when the
  // selected restraint source is ISONOTE. Do not let supportSource leak into pipe,
  // valve, flange, bend, or tee/olet layers.
  return lower(trace.source || trace.componentSource || extra.source || 'inputxml');
}

function supportAxisFromTrace(trace = {}, extra = {}) {
  return normalizeRestraintAxisLabel(trace.axis || trace.direction || trace.restraintAxis || extra.axis || extra.direction || '');
}

function supportKindFromTrace(trace = {}, extra = {}) {
  return normalizeSupportKind(trace.supportKind || trace.kind || extra.supportKind || extra.kind) || 'UNKNOWN';
}

export function restraintVisualProfileForTrace(trace = {}, extra = {}) {
  const category = categoryFromTrace(trace, extra);
  if (category !== 'support') return null;
  return visualProfileMetadata({
    kind: supportKindFromTrace(trace, extra),
    source: sourceForLayer(trace, extra),
    axisLabel: supportAxisFromTrace(trace, extra),
    scale: trace.renderScale || extra.renderScale,
    role: trace.renderGlyph || extra.role || 'exported-support',
  });
}

export function layerIdsForTrace(trace = {}, extra = {}) {
  const entity = lower(trace.entity || extra.entity);
  const category = categoryFromTrace(trace, extra);
  const source = sourceForLayer(trace, extra);
  const kind = supportKindFromTrace(trace, extra);
  const ids = [];

  if (entity === 'annotation' || category === 'annotation') {
    ids.push('plant.annotations', 'annotation.all');
    const annotationKind = annotationKindFromTrace(trace, extra);
    const annotationRole = annotationRoleFromTrace(trace, extra);
    if (annotationKind.includes('node')) {
      ids.push('annotation.node');
      if (annotationRole.includes('marker')) ids.push('annotation.node_marker');
      else if (annotationRole.includes('leader')) ids.push('annotation.node_leader');
      else if (annotationRole.includes('label')) ids.push('annotation.node_label');
    } else {
      ids.push('annotation.callout');
    }
    if (source) ids.push(`annotation.${cleanLayerId(source)}`);
    if (source) ids.push(`source.${cleanLayerId(source)}`);
    return unique(ids);
  }

  if (category === 'support') {
    const axis = supportAxisFromTrace(trace, extra);
    return unique([
      ...layerIdsForRestraintSupport({ source, kind, axisLabel: axis }),
      source ? `source.${cleanLayerId(source)}` : '',
    ]);
  }

  if (category === 'pipe') ids.push('plant.pipe');
  else if (category === 'bend') ids.push('plant.bend');
  else if (category === 'valve') ids.push('plant.valve');
  else if (category === 'flange') ids.push('plant.flange');
  else if (category === 'teeolet' || category === 'tee_olet') ids.push('plant.tee_olet');
  else if (category === 'axis') ids.push('plant.axis');
  else ids.push('plant.other');

  if (source) ids.push(`source.${cleanLayerId(source)}`);
  return unique(ids);
}

export function layerMetadataFromTrace(trace = {}, extra = {}) {
  const category = categoryFromTrace(trace, extra);
  const source = sourceForLayer(trace, extra);
  const supportKind = category === 'support' ? supportKindFromTrace(trace, extra) : '';
  const axis = category === 'support' ? supportAxisFromTrace(trace, extra) : '';
  const visibleDefault = category === 'annotation'
    ? false
    : extra.visibleDefault !== false && supportKind !== 'UNKNOWN' && supportKind !== 'TYPE0';
  return {
    schema: BM_CII_LAYER_SCHEMA,
    category,
    source,
    supportKind,
    axis,
    annotationKind: category === 'annotation' ? annotationKindFromTrace(trace, extra) : '',
    annotationRole: category === 'annotation' ? annotationRoleFromTrace(trace, extra) : '',
    gap: text(trace.gap || trace.restraintGap || extra.gap || ''),
    visibleDefault,
    layerIds: layerIdsForTrace(trace, extra),
    restraintVisualProfile: category === 'support' ? RESTRAINT_VISUAL_PROFILE.id : '',
  };
}

export function withGeometryLayer(userData = {}, trace = {}, extra = {}) {
  const layer = layerMetadataFromTrace(trace, extra);
  const visualProfile = restraintVisualProfileForTrace(trace, extra);
  return {
    ...(userData || {}),
    bmCiiLayerSchema: BM_CII_LAYER_SCHEMA,
    bmCiiLayer: layer,
    bmCiiLayerIds: layer.layerIds,
    bmCiiLayerCategory: layer.category,
    bmCiiLayerSource: layer.source,
    ...(visualProfile ? {
      bmCiiRestraintVisualProfile: visualProfile,
      glbSupportVisualProfile: visualProfile.profile,
    } : {}),
  };
}

export function applyGeometryLayer(object, trace = {}, extra = {}, { includeChildren = true } = {}) {
  if (!object) return object;
  const apply = (target) => {
    target.userData = withGeometryLayer(target.userData || {}, trace, extra);
  };
  apply(object);
  if (includeChildren && object.traverse) object.traverse((child) => apply(child));
  return object;
}

function layer(id, label, group, defaultVisible = true) {
  return { id, label, group, defaultVisible };
}

export function buildDefaultBmCiiLayerManifest({ supportSource = '' } = {}) {
  const selectedSupportSource = lower(supportSource);
  return {
    schema: BM_CII_LAYER_MANIFEST_SCHEMA,
    restraintVisualProfile: RESTRAINT_VISUAL_PROFILE.id,
    restraintVisualProfileSchema: RESTRAINT_VISUAL_PROFILE.schema,
    restraintVisualProfileMinimums: RESTRAINT_VISUAL_PROFILE.minimums,
    layers: [
      layer('plant.pipe', 'Pipe', 'Plant Geometry'),
      layer('plant.bend', 'Bends', 'Plant Geometry'),
      layer('plant.valve', 'Valves', 'Plant Geometry'),
      layer('plant.flange', 'Flanges', 'Plant Geometry'),
      layer('plant.tee_olet', 'Tee / Olet', 'Plant Geometry'),
      layer('plant.restraints', 'Restraints', 'Supports / Restraints'),
      layer('plant.axis', 'Axis / Triad', 'Plant Geometry'),
      layer('plant.other', 'Other Geometry', 'Plant Geometry'),

      layer('restraints.inputxml', 'InputXML Restraints', 'Supports / Restraints', selectedSupportSource !== 'isonote'),
      layer('restraints.isonote', 'ISONOTE Restraints', 'Supports / Restraints', selectedSupportSource === 'isonote'),
      layer('restraints.rest', 'REST', 'Supports / Restraints'),
      layer('restraints.guide', 'GUIDE', 'Supports / Restraints'),
      layer('restraints.linestop', 'LINESTOP', 'Supports / Restraints'),
      layer('restraints.limit', 'LIMIT', 'Supports / Restraints'),
      layer('restraints.anchor', 'ANCHOR', 'Supports / Restraints'),
      layer('restraints.hanger', 'HANGER', 'Supports / Restraints'),
      layer('restraints.spring', 'SPRING', 'Supports / Restraints'),
      layer('restraints.unknown', 'UNKNOWN / TYPE0', 'Supports / Restraints', false),

      layer('axis.x', 'X Axis', 'Direction / Axis'),
      layer('axis.y', 'Y Axis', 'Direction / Axis'),
      layer('axis.z', 'Z Axis', 'Direction / Axis'),

      layer('plant.annotations', 'Annotations', 'Annotations', false),
      layer('annotation.all', 'All Annotations', 'Annotations', false),
      layer('annotation.node', 'Node Annotations', 'Annotations', false),
      layer('annotation.node_marker', 'Node Markers', 'Annotations', false),
      layer('annotation.node_leader', 'Node Leaders', 'Annotations', false),
      layer('annotation.node_label', 'Node Labels', 'Annotations', false),
      layer('annotation.callout', 'Callouts', 'Annotations', false),
      layer('annotation.isonote', 'ISONOTE Callouts', 'Annotations', false),
      layer('annotation.inputxml', 'InputXML Annotations', 'Annotations', false),

      layer('source.inputxml', 'Source: InputXML', 'Source'),
      layer('source.isonote', 'Source: ISONOTE', 'Source'),
      layer('source.generated', 'Source: Generated', 'Source', false),
      layer('debug.qc', 'QC / Debug', 'Debug / QC', false),
    ],
  };
}
