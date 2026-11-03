import { selectedZonePackageArtifactRoles } from './artifact-roles.js';

export const FBX_ZONE_PACKAGE_SCHEMAS = Object.freeze({
  geometryManifest: 'FbxSelectedZoneGeometryManifest.v1',
  packageAudit: 'FbxSelectedZonePackageAudit.v1',
  supportEvidence: 'FbxSupportEvidence.v1',
  hostAuthorityBinding: 'FbxHostAuthorityBinding.v1',
  diagnosticLedger: 'FbxSelectedZoneDiagnosticLedger.v1',
  selectedSourceGraph: 'FbxSelectedZoneSourceGraph.v1',
  selectedEngineeringAttributes: 'FbxSelectedZoneEngineeringAttributeLedger.v1',
  qualificationRoot: 'FbxSelectedZoneQualificationRoot.v1',
});

export const FBX_ZONE_PACKAGE_BUFFER_ROLES = Object.freeze([
  'control-points-mm', 'polygon-offsets', 'polygon-vertex-indices',
]);

export const FBX_ZONE_PACKAGE_ROLE_SPECS = Object.freeze({
  'control-points-mm': { scalarType: 'Float64', componentCount: 3, bytesPerValue: 8 },
  'polygon-offsets': { scalarType: 'Uint32', componentCount: 1, bytesPerValue: 4 },
  'polygon-vertex-indices': { scalarType: 'Uint32', componentCount: 1, bytesPerValue: 4 },
});

export const FBX_ZONE_PACKAGE_FILE_ROLES = Object.freeze([
  'MANIFEST', 'GEOMETRY_DESCRIPTOR', 'GEOMETRY_BUFFER', 'STAGEDJSON',
  'SUPPORT_EVIDENCE', ...selectedZonePackageArtifactRoles(),
]);

export const FBX_ZONE_PACKAGE_LIMITS = Object.freeze({
  maxSelectedGeometries: 20000,
  maxGeometryBufferBytes: 64 * 1024 * 1024,
  maxPackageFiles: 200000,
  maxArchiveBytes: 512 * 1024 * 1024,
  maxArchiveHeaderBytes: 16 * 1024 * 1024,
});

export class FbxZonePackageError extends Error {
  constructor(code, message) {
    super(`${code} ${message}`);
    this.name = 'FbxZonePackageError';
    this.code = code;
  }
}

export function fail(code, message) {
  throw new FbxZonePackageError(code, message);
}
