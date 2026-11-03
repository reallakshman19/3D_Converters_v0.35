export const SOURCE_AXIS_TRANSFORM_SCHEMA = 'source-axis-transform/v1';

const AXES = Object.freeze(['X', 'Y', 'Z']);
const STORAGE_KEYS = Object.freeze({
  verticalAxis: 'rvm.inputxml.verticalAxis',
  northAxis: 'rvm.inputxml.northAxis',
});

export function readSourceAxisTransformSettings(storage = globalThis?.localStorage) {
  const verticalAxis = normalizeAxis(readText(storage, STORAGE_KEYS.verticalAxis), 'Y');
  let northAxis = normalizeAxis(readText(storage, STORAGE_KEYS.northAxis), 'X');
  if (northAxis === verticalAxis) northAxis = AXES.find((axis) => axis !== verticalAxis) || 'X';
  const eastAxis = AXES.find((axis) => axis !== verticalAxis && axis !== northAxis) || 'Z';
  return {
    schema: SOURCE_AXIS_TRANSFORM_SCHEMA,
    sourceBasis: { east: 'X', north: 'Y', vertical: 'Z' },
    viewerBasis: { east: eastAxis, north: northAxis, vertical: verticalAxis },
    eastAxis,
    northAxis,
    verticalAxis,
    isDefault: eastAxis === 'X' && northAxis === 'Y' && verticalAxis === 'Z',
  };
}

export function writeSourceAxisTransformSettings(settings = {}, storage = globalThis?.localStorage) {
  if (!storage?.setItem) return readSourceAxisTransformSettings(storage);
  if ('verticalAxis' in settings) storage.setItem(STORAGE_KEYS.verticalAxis, normalizeAxis(settings.verticalAxis, 'Y'));
  if ('northAxis' in settings) storage.setItem(STORAGE_KEYS.northAxis, normalizeAxis(settings.northAxis, 'X'));
  return readSourceAxisTransformSettings(storage);
}

export function sourceAxisBasis3(settings = readSourceAxisTransformSettings()) {
  const east = axisVector(settings.eastAxis || settings.viewerBasis?.east || 'X');
  const north = axisVector(settings.northAxis || settings.viewerBasis?.north || 'Y');
  const vertical = axisVector(settings.verticalAxis || settings.viewerBasis?.vertical || 'Z');
  return [
    east.x, east.y, east.z,
    north.x, north.y, north.z,
    vertical.x, vertical.y, vertical.z,
  ];
}

export function transformSourcePoint(point, settings = readSourceAxisTransformSettings()) {
  return applyBasis(point, sourceAxisBasis3(settings));
}

export function transformSourceVector(vector, settings = readSourceAxisTransformSettings()) {
  const out = applyBasis(vector, sourceAxisBasis3(settings));
  const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
  return len > 1e-9 ? { x: out.x / len, y: out.y / len, z: out.z / len } : { x: 1, y: 0, z: 0 };
}

export function transformSourcePipeSegments(segments = [], settings = readSourceAxisTransformSettings()) {
  return (Array.isArray(segments) ? segments : []).map((segment) => ({
    ...segment,
    from: segment?.from ? transformSourcePoint(segment.from, settings) : segment?.from,
    to: segment?.to ? transformSourcePoint(segment.to, settings) : segment?.to,
    axis: segment?.axis ? transformSourceVector(segment.axis, settings) : segment?.axis,
    axisTransform: {
      schema: SOURCE_AXIS_TRANSFORM_SCHEMA,
      viewerBasis: { ...settings.viewerBasis },
    },
  }));
}

function applyBasis(point = {}, basis = sourceAxisBasis3()) {
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;
  const z = Number(point.z) || 0;
  return {
    x: x * basis[0] + y * basis[3] + z * basis[6],
    y: x * basis[1] + y * basis[4] + z * basis[7],
    z: x * basis[2] + y * basis[5] + z * basis[8],
  };
}

function axisVector(axis) {
  const value = normalizeAxis(axis, 'X');
  if (value === 'X') return { x: 1, y: 0, z: 0 };
  if (value === 'Y') return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}

function normalizeAxis(value, fallback) {
  const axis = String(value || '').trim().toUpperCase();
  return AXES.includes(axis) ? axis : fallback;
}

function readText(storage, key) {
  try { return storage?.getItem?.(key) || ''; } catch (_) { return ''; }
}
