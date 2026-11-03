/**
 * NativeXmlDirectBuilder.js
 *
 * Extracted native XML import route for the normal 3D Viewer.
 *
 * The builder preserves the existing XML direct-import behavior:
 * - solve XML graph geometry through xml-graph-builder
 * - build XML support components through xml-support-builder
 * - merge supports with name+coordinate dedupe
 * - keep support-debug diagnostics
 */

import { buildXmlGraphData } from '../../../parser/xml-graph-builder.js';
import { buildXmlSupportComponents } from '../../../parser/xml-support-builder.js';
import { debugSupport } from '../../../debug/support-debug.js';

function clean(value) {
  return String(value ?? '').trim();
}

function numberOrFallback(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pointSignature(point) {
  if (!point) return '';

  return [
    Number(point.x).toFixed(3),
    Number(point.y).toFixed(3),
    Number(point.z).toFixed(3),
  ].join(':');
}

function supportMergeKey(component) {
  const point = component?.coOrds || (Array.isArray(component?.points) && component.points[0]) || null;
  const name = clean(
    component?.attributes?.SUPPORT_NAME ||
    component?.attributes?.SKEY ||
    component?.source?.SUPPORT_NAME ||
    component?.source?.SKEY ||
    ''
  );

  return `${name}|${point ? pointSignature(point) : ''}`;
}

export function mergeNativeXmlGraphAndSupports(graphData, xmlSupports) {
  const components = Array.isArray(graphData?.components) ? graphData.components : [];
  const existingSupportKeys = new Set(
    components
      .filter((component) => String(component?.type || '').toUpperCase() === 'SUPPORT')
      .map((component) => supportMergeKey(component))
  );

  const appended = [];
  const supports = Array.isArray(xmlSupports) ? xmlSupports : [];
  const beforeCount = components.filter((component) => String(component?.type || '').toUpperCase() === 'SUPPORT').length;

  for (const support of supports) {
    const key = supportMergeKey(support);

    if (existingSupportKeys.has(key)) {
      debugSupport({
        stage: 'xml-support-merge',
        sourceId: support?.id,
        deduped: true,
        dedupeKey: key,
        resolvedKind: support?.attributes?.SUPPORT_KIND,
        resolvedDirection: support?.attributes?.SUPPORT_DIRECTION,
      });
      continue;
    }

    appended.push(support);
    existingSupportKeys.add(key);
  }

  debugSupport({
    stage: 'xml-support-merge',
    builtCount: supports.length,
    beforeCount,
    appendedCount: appended.length,
    dedupedCount: supports.length - appended.length,
  });

  return {
    ...graphData,
    components: [...components, ...appended],
  };
}

export function buildNativeXmlDirectData(parsed, fileName, defaults = {}) {
  const layout = defaults?.xmlLayout || {};
  const graphData = buildXmlGraphData(parsed, fileName, {
    syntheticGapMm: numberOrFallback(layout.syntheticGapMm, 3500),
    rootPlacements: layout.rootPlacements || null,
    componentPlacements: layout.componentPlacements || null,
    lineLabelText: clean(layout.lineLabelText || ''),
    lineLabelPrefix: clean(layout.lineLabelPrefix || 'ASSEMBLY') || 'ASSEMBLY',
  });

  const xmlSupports = buildXmlSupportComponents(parsed, {
    verticalAxis: 'Y',
    worldNorth: parsed?.north || { x: 0, y: 0, z: -1 },
    defaultBore: 100,
    nodePositions: graphData.solvedNodePositions || parsed?.nodes || {},
  });

  return mergeNativeXmlGraphAndSupports(graphData, xmlSupports);
}
