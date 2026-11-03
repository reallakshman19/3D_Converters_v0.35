import { bboxDimensions } from './RvmPrimitiveTransformMath.js';

export const RVM_PRIMITIVE_PARAM_SUPPORTED_CODES = Object.freeze([2, 4, 8, 9, 11]);

export function isSupportedPrimitiveCode(code) {
  return RVM_PRIMITIVE_PARAM_SUPPORTED_CODES.includes(Number(code));
}

export function decodeRvmPrimitiveParams(code, values = [], context = {}) {
  const nativeCode = Number(code);
  if (nativeCode === 8) return decodeCylinder(values);
  if (nativeCode === 4) return decodeCircularTorus(values);
  if (nativeCode === 2) return decodeBox(context.localBbox);
  if (nativeCode === 9) return decodeSphere(values);
  if (nativeCode === 11) return { decoded: false, reason: 'code11-routed-to-facet-group-decoder' };
  return { decoded: false, reason: 'unsupported-native-code' };
}

function decodeCylinder(values) {
  if (values.length < 2) return { decoded: false, reason: 'code8-requires-radius-height' };
  const radius = finite(values[0]);
  const height = finite(values[1]);
  if (!Number.isFinite(radius) || !Number.isFinite(height)) return { decoded: false, reason: 'code8-invalid-radius-height' };
  return { decoded: true, radius, height, localAxis: 'z' };
}

function decodeCircularTorus(values) {
  if (values.length < 3) return { decoded: false, reason: 'code4-requires-offset-radius-angle' };
  const offset = finite(values[0]);
  const radius = finite(values[1]);
  const angleRad = finite(values[2]);
  if (![offset, radius, angleRad].every(Number.isFinite)) return { decoded: false, reason: 'code4-invalid-offset-radius-angle' };
  return { decoded: true, offset, radius, angleRad, angleDeg: angleRad * 180 / Math.PI, basis: 'circular-torus' };
}

function decodeBox(localBbox) {
  const size = bboxDimensions(localBbox);
  if (![size.x, size.y, size.z].every(Number.isFinite)) return { decoded: false, reason: 'code2-invalid-local-bbox' };
  return { decoded: true, sizeFromLocalBbox: size };
}

function decodeSphere(values) {
  if (values.length < 1) return { decoded: false, reason: 'code9-requires-diameter' };
  const diameter = finite(values[0]);
  if (!Number.isFinite(diameter)) return { decoded: false, reason: 'code9-invalid-diameter' };
  return { decoded: true, diameter, radius: diameter / 2, radiusSource: 'derived-from-native-diameter' };
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}
