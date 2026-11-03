import * as THREE from 'three';
import { applyEngineeringPalette } from './applyEngineeringPalette.js';
import { buildComponentObject } from './buildComponentObject.js';
import { buildNodeLabelObject } from './buildNodeLabelObject.js';
import { enhanceLocalizedBendProxy } from './enhanceLocalizedBendProxy.js';
import { enhanceSupportDirectionProxy } from './enhanceSupportDirectionProxyReferenceV2.js';
import { enhanceTeeBodyProxy } from './enhanceTeeBodyProxy.js';
import { hideGlbLabelAnchorMarkers } from './hideGlbLabelAnchorMarkers.js';
import { applyComponentGeometryTrace } from './GeometryTraceMetadata.js';
import { buildDefaultBmCiiLayerManifest } from './GeometryLayerMetadata.js';
import {
  LINE_NO_METADATA_KEYS,
  firstLineNoValue,
  lineNoFromMetadata,
  normalizeLineNoValue,
} from '../../../utils/line-no-metadata.js';

function text(value) {
  return String(value ?? '').trim();
}

function componentLineNo(component = {}) {
  const attrs = { ...(component.raw || {}), ...(component.attributes || {}) };
  return firstLineNoValue(
    component.lineNo,
    lineNoFromMetadata(attrs, LINE_NO_METADATA_KEYS),
    component.lineKey,
    component.pipelineRef,
  );
}

function collectLineNos(model = {}) {
  return Array.from(new Set([
    firstLineNoValue(model.lineNo, lineNoFromMetadata(model, LINE_NO_METADATA_KEYS)),
    ...((model.lineNos || []).map(text)),
    ...((model.components || []).map(componentLineNo)),
  ].map(normalizeLineNoValue).filter(Boolean))).sort();
}

function traceContextForComponent(component = {}, options = {}) {
  const supportRendering = options.supportRendering || {};
  return {
    supportSource: supportRendering.source || options.supportSource || component.supportSource || component.source || '',
    colorMode: options.colorMode || '',
  };
}

export function buildExportScene(model, log, options = {}) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'PCF_EXPORT_ROOT';
  scene.add(root);

  for (const comp of model.components) {
    try {
      let obj = comp.type === 'NODE_LABEL'
        ? buildNodeLabelObject(comp)
        : buildComponentObject(comp, log, options);
      if (obj && comp.type === 'TEE') obj = enhanceTeeBodyProxy(obj, comp);
      if (obj && comp.type === 'SUPPORT') obj = enhanceSupportDirectionProxy(obj, comp, options);
      if (obj) obj = enhanceLocalizedBendProxy(obj, comp);
      if (obj) {
        applyComponentGeometryTrace(obj, comp, traceContextForComponent(comp, options));
        root.add(obj);
      }
    } catch (err) {
      if (log) {
          log.error('COMPONENT_BUILD_FAILED', {
              id: comp.id,
              type: comp.type,
              message: String((err && err.message) || err),
          });
      }
    }
  }

  const colorMode = options.colorMode || (model.options && model.options.colorMode) || 'engineering';
  const supportSource = options.supportRendering?.source || options.supportSource || '';
  const glbVisualProfile = text(options.glbVisualProfile || '');
  const paletteStats = applyEngineeringPalette(root, { colorMode });
  const labelAnchorStats = hideGlbLabelAnchorMarkers(root);
  const lineNos = collectLineNos(model);
  root.userData = {
    ...root.userData,
    lineNo: lineNos[0] || '',
    lineNos,
    glbVisualProfile,
    engineeringPaletteStats: paletteStats,
    labelAnchorStats,
    bmCiiLayerManifest: buildDefaultBmCiiLayerManifest({ supportSource }),
  };

  scene.userData = {
    ...(scene.userData || {}),
    glbVisualProfile,
    bmCiiLayerManifest: root.userData.bmCiiLayerManifest,
  };

  return scene;
}
