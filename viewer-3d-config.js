/**
 * viewer-3d-config.js - Resolver and validator for viewer3DConfig.
 */

import { DEFAULT_VIEWER3D_CONFIG, VIEWER_ACTION_IDS } from './viewer-3d-defaults.js';

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(base, patch) {
  if (!isObj(base)) return deepClone(patch);
  const out = deepClone(base);
  if (!isObj(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v)) out[k] = v.slice();
    else if (isObj(v) && isObj(out[k])) out[k] = deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

function clampNum(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function normalizeVerticalAxis(value) {
  const axis = String(value || 'Z').toUpperCase();
  return axis === 'Y' ? 'Y' : 'Z';
}

function normalizeColorHex(value, fallback) {
  const s = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s;
  return fallback;
}

function deepFreeze(obj) {
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return obj;
}

function normalizeCommon(cfg) {
  const c = deepMerge(DEFAULT_VIEWER3D_CONFIG, cfg || {});

  c.coordinateMap.verticalAxis = normalizeVerticalAxis(c.coordinateMap.verticalAxis);
  c.coordinateMap.axisConvention = c.coordinateMap.verticalAxis === 'Y' ? 'Y-up' : 'Z-up';
  if (String(c.coordinateMap.gridPlane || '').toLowerCase() === 'auto') {
    c.coordinateMap.gridPlane = c.coordinateMap.verticalAxis === 'Y' ? 'XZ' : 'XY';
  }

  c.camera.fov = clampNum(c.camera.fov, 20, 120, DEFAULT_VIEWER3D_CONFIG.camera.fov);
  c.camera.orthographicFrustum = clampNum(c.camera.orthographicFrustum, 100, 200000, DEFAULT_VIEWER3D_CONFIG.camera.orthographicFrustum);
  c.camera.fitPadding = clampNum(c.camera.fitPadding, 0.2, 4, DEFAULT_VIEWER3D_CONFIG.camera.fitPadding);
  c.controls.dampingFactor = clampNum(c.controls.dampingFactor, 0, 1, DEFAULT_VIEWER3D_CONFIG.controls.dampingFactor);
  c.controls.rotateSpeed = clampNum(c.controls.rotateSpeed, -10, 10, DEFAULT_VIEWER3D_CONFIG.controls.rotateSpeed);
  c.controls.panSpeed = clampNum(c.controls.panSpeed, 0.01, 10, DEFAULT_VIEWER3D_CONFIG.controls.panSpeed);
  c.controls.zoomSpeed = clampNum(c.controls.zoomSpeed, 0.01, 10, DEFAULT_VIEWER3D_CONFIG.controls.zoomSpeed);
  c.overlay.viewCubeSize = clampNum(c.overlay.viewCubeSize, 60, 240, DEFAULT_VIEWER3D_CONFIG.overlay.viewCubeSize);
  c.overlay.viewCubeOpacity = clampNum(c.overlay.viewCubeOpacity, 0.1, 1, DEFAULT_VIEWER3D_CONFIG.overlay.viewCubeOpacity);
  c.overlay.smartScale.enabled = c.overlay.smartScale.enabled !== false;
  c.overlay.smartScale.multiplier = clampNum(c.overlay.smartScale.multiplier, 0.2, 4, DEFAULT_VIEWER3D_CONFIG.overlay.smartScale.multiplier);
  c.overlay.smartScale.scrollSensitivity = clampNum(c.overlay.smartScale.scrollSensitivity, 0.05, 2.5, DEFAULT_VIEWER3D_CONFIG.overlay.smartScale.scrollSensitivity);
  c.overlay.smartScale.min = clampNum(c.overlay.smartScale.min, 0.2, 3, DEFAULT_VIEWER3D_CONFIG.overlay.smartScale.min);
  c.overlay.smartScale.max = clampNum(c.overlay.smartScale.max, c.overlay.smartScale.min, 6, DEFAULT_VIEWER3D_CONFIG.overlay.smartScale.max);
  c.overlay.annotations.messageSquareEnabled = c.overlay.annotations.messageSquareEnabled !== false;
  c.helpers.axisGizmoSize = clampNum(c.helpers.axisGizmoSize, 48, 200, DEFAULT_VIEWER3D_CONFIG.helpers.axisGizmoSize);
  c.supportGeometry.symbolScale = clampNum(c.supportGeometry.symbolScale, 0.5, 4, DEFAULT_VIEWER3D_CONFIG.supportGeometry.symbolScale);
  // Legend is intentionally retired from the active UI; force it off in runtime
  // config so persisted legacy settings cannot re-enable legend labels.
  c.legend.enabled = false;
  c.legend.mode = 'none';
  c.legend.canvasLabels.enabled = false;
  c.featureFlags.legend = false;

  c.componentPanel.selectionColor = normalizeColorHex(c.componentPanel.selectionColor, DEFAULT_VIEWER3D_CONFIG.componentPanel.selectionColor);
  c.componentPanel.hoverColor = normalizeColorHex(c.componentPanel.hoverColor, DEFAULT_VIEWER3D_CONFIG.componentPanel.hoverColor);
  c.heatmap.nullColor = normalizeColorHex(c.heatmap.nullColor, DEFAULT_VIEWER3D_CONFIG.heatmap.nullColor);
  c.legend.canvasLabels.fontSize = clampNum(c.legend.canvasLabels.fontSize, 8, 64, DEFAULT_VIEWER3D_CONFIG.legend.canvasLabels.fontSize);
  c.legend.canvasLabels.maxPerLabel = clampNum(c.legend.canvasLabels.maxPerLabel, 1, 10, DEFAULT_VIEWER3D_CONFIG.legend.canvasLabels.maxPerLabel);
  c.legend.canvasLabels.maxLegendLabels = clampNum(c.legend.canvasLabels.maxLegendLabels, 1, 300, DEFAULT_VIEWER3D_CONFIG.legend.canvasLabels.maxLegendLabels);
  c.legend.canvasLabels.maxNodeLabels = clampNum(c.legend.canvasLabels.maxNodeLabels, 0, 200, DEFAULT_VIEWER3D_CONFIG.legend.canvasLabels.maxNodeLabels);
  c.lengthLabels.precision = clampNum(c.lengthLabels.precision, 0, 3, DEFAULT_VIEWER3D_CONFIG.lengthLabels.precision);
  c.lengthLabels.maxLabels = clampNum(c.lengthLabels.maxLabels, 0, 2000, DEFAULT_VIEWER3D_CONFIG.lengthLabels.maxLabels);
  c.lengthLabels.minWorldGap = clampNum(c.lengthLabels.minWorldGap, 10, 1000, DEFAULT_VIEWER3D_CONFIG.lengthLabels.minWorldGap);
  c.lengthLabels.offsetScale = clampNum(c.lengthLabels.offsetScale, 0.2, 4, DEFAULT_VIEWER3D_CONFIG.lengthLabels.offsetScale);
  c.spareOverlays.snapToNearest = c.spareOverlays.snapToNearest !== false;
  c.spareOverlays.snapToleranceMm = clampNum(c.spareOverlays.snapToleranceMm, 1, 20000, DEFAULT_VIEWER3D_CONFIG.spareOverlays.snapToleranceMm);
  c.spareOverlays.spare1.enabled = !!c.spareOverlays.spare1.enabled;
  c.spareOverlays.spare2.enabled = !!c.spareOverlays.spare2.enabled;
  c.spareOverlays.spare1.selectedField = String(c.spareOverlays.spare1.selectedField || '');
  c.spareOverlays.spare2.selectedField = String(c.spareOverlays.spare2.selectedField || '');
  c.heatmap.bucketCount = clampNum(c.heatmap.bucketCount, 2, 24, DEFAULT_VIEWER3D_CONFIG.heatmap.bucketCount);

  if (!Array.isArray(c.toolbar.order) || !c.toolbar.order.length) c.toolbar.order = [...VIEWER_ACTION_IDS];
  if (!Array.isArray(c.toolbar.visibleActions) || !c.toolbar.visibleActions.length) c.toolbar.visibleActions = [...VIEWER_ACTION_IDS];

  // order: filter out unknown IDs, then backfill any new ones from VIEWER_ACTION_IDS
  c.toolbar.order = c.toolbar.order.filter((id) => VIEWER_ACTION_IDS.includes(id));
  for (const id of VIEWER_ACTION_IDS) {
    if (!c.toolbar.order.includes(id)) c.toolbar.order.push(id);
  }

  // visibleActions: same pattern — filter invalids, backfill newly-added IDs so they
  // appear automatically even when loading a config saved before they existed.
  c.toolbar.visibleActions = c.toolbar.visibleActions.filter((id) => VIEWER_ACTION_IDS.includes(id));
  for (const id of VIEWER_ACTION_IDS) {
    if (!c.toolbar.visibleActions.includes(id)) c.toolbar.visibleActions.push(id);
  }

  return c;
}

export function getBaselineViewer3DConfig() {
  const baseline = normalizeCommon(DEFAULT_VIEWER3D_CONFIG);
  baseline.disableAllSettings = true;
  return deepFreeze(baseline);
}

export function getResolvedViewer3DConfig(config) {
  const source = config?.viewer3DConfig ? config.viewer3DConfig : config;
  const normalized = normalizeCommon(source || DEFAULT_VIEWER3D_CONFIG);
  if (normalized.disableAllSettings) {
    return getBaselineViewer3DConfig();
  }
  return deepFreeze(normalized);
}

export function updateViewer3DConfig(currentConfig, patch) {
  // Run normalizeCommon so callers always receive a validated, clamped config.
  return normalizeCommon(deepMerge(currentConfig || DEFAULT_VIEWER3D_CONFIG, patch || {}));
}
