import { ZONE_GEOMETRY_STATUS } from './constants.js';

export class FbxZoneGeometryError extends Error {
  constructor(code, message, detail = null) {
    super(`${code} ${message}`);
    this.name = 'FbxZoneGeometryError';
    this.code = code;
    this.detail = detail;
  }
}

export function failZoneGeometry(code, message, detail = null) {
  throw new FbxZoneGeometryError(code, message, detail);
}

export function asZoneGeometryError(error, fallback = ZONE_GEOMETRY_STATUS.TOPOLOGY) {
  if (error instanceof FbxZoneGeometryError) return error;
  const code = typeof error?.code === 'string' && error.code.startsWith('BLOCKED_')
    ? error.code : fallback;
  return new FbxZoneGeometryError(code, error?.message || String(error), error?.detail || null);
}
