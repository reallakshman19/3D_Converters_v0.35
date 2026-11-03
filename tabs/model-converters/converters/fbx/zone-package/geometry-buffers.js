import { sha256Hex } from '../sha256.js';
import {
  FBX_ZONE_PACKAGE_LIMITS, FBX_ZONE_PACKAGE_ROLE_SPECS, fail,
} from './constants.js';

const UINT32_MAX = 0xffffffff;

function numericValues(value, label) {
  if (!Array.isArray(value) && !ArrayBuffer.isView(value)) {
    fail('ZONE_PACKAGE_INVALID_BUFFER', `${label} must be an array.`);
  }
  const values = Array.from(value);
  if (values.some((item) => !Number.isFinite(item))) {
    fail('ZONE_PACKAGE_INVALID_BUFFER', `${label} must contain only finite numbers.`);
  }
  return values;
}

function uint32Values(value, label) {
  const values = numericValues(value, label);
  if (values.some((item) => !Number.isSafeInteger(item) || item < 0 || item > UINT32_MAX)) {
    fail('ZONE_PACKAGE_INVALID_BUFFER', `${label} must contain unsigned 32-bit integers.`);
  }
  return values;
}

function littleEndianBytes(role, values) {
  const spec = FBX_ZONE_PACKAGE_ROLE_SPECS[role];
  const buffer = new ArrayBuffer(values.length * spec.bytesPerValue);
  const view = new DataView(buffer);
  values.forEach((value, index) => {
    const offset = index * spec.bytesPerValue;
    if (spec.scalarType === 'Float64') view.setFloat64(offset, value, true);
    else view.setUint32(offset, value, true);
  });
  return new Uint8Array(buffer);
}

async function encodeRole(role, values) {
  const spec = FBX_ZONE_PACKAGE_ROLE_SPECS[role];
  const bytes = littleEndianBytes(role, values);
  if (bytes.byteLength > FBX_ZONE_PACKAGE_LIMITS.maxGeometryBufferBytes) {
    fail('ZONE_PACKAGE_LIMIT_EXCEEDED', `${role} exceeds ${FBX_ZONE_PACKAGE_LIMITS.maxGeometryBufferBytes} bytes.`);
  }
  return {
    role, scalarType: spec.scalarType, componentCount: spec.componentCount,
    count: values.length / spec.componentCount, byteLength: bytes.byteLength,
    sha256: await sha256Hex(bytes), bytes,
  };
}

export async function encodeSelectedGeometryBuffers(geometry) {
  const controlPointsMm = numericValues(geometry.controlPointsMm, 'controlPointsMm');
  const polygonOffsets = uint32Values(geometry.polygonOffsets, 'polygonOffsets');
  const polygonVertexIndices = uint32Values(geometry.polygonVertexIndices, 'polygonVertexIndices');
  if (controlPointsMm.length % 3 !== 0) fail('ZONE_PACKAGE_INVALID_BUFFER', 'controlPointsMm length must be a multiple of 3.');
  if (polygonOffsets.length < 1 || polygonOffsets[0] !== 0) fail('ZONE_PACKAGE_INVALID_BUFFER', 'polygonOffsets must start at 0.');
  for (let index = 1; index < polygonOffsets.length; index += 1) {
    if (polygonOffsets[index] < polygonOffsets[index - 1]) fail('ZONE_PACKAGE_INVALID_BUFFER', 'polygonOffsets must be non-decreasing.');
  }
  if (polygonOffsets.at(-1) !== polygonVertexIndices.length) {
    fail('ZONE_PACKAGE_INVALID_BUFFER', 'polygonOffsets must terminate at polygonVertexIndices length.');
  }
  const controlPointCount = controlPointsMm.length / 3;
  for (const index of polygonVertexIndices) {
    if (index >= controlPointCount) fail('ZONE_PACKAGE_INVALID_BUFFER', 'polygonVertexIndices references an out-of-range control point.');
  }
  const [controlPoints, offsets, indices] = await Promise.all([
    encodeRole('control-points-mm', controlPointsMm),
    encodeRole('polygon-offsets', polygonOffsets),
    encodeRole('polygon-vertex-indices', polygonVertexIndices),
  ]);
  return { byteOrder: 'little-endian', controlPointCount,
    polygonCount: polygonOffsets.length - 1,
    buffers: { 'control-points-mm': controlPoints, 'polygon-offsets': offsets, 'polygon-vertex-indices': indices } };
}
