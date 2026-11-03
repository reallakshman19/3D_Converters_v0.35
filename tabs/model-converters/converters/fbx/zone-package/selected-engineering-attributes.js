import { canonicalJson, deepFreeze } from '../canonical-json.js';
import { sha256Hex } from '../sha256.js';
import { compareText } from '../zone-geometry/compare.js';

const SCHEMA = 'FbxSelectedZoneEngineeringAttributeLedger.v1';

function fail(message) {
  throw new TypeError(`FBX selected-zone engineering attributes: ${message}`);
}

function selectedMappingEntryIds(componentCrosswalk) {
  return [...new Set(componentCrosswalk.managedComponents.map((item) => item.mappingEntryId)
    .filter(Boolean))].sort(compareText);
}

function ledgerIndex(ledger) {
  const index = new Map();
  for (const component of ledger.components) {
    if (index.has(component.mappingEntryId)) fail(`duplicate engineering record ${component.mappingEntryId}.`);
    index.set(component.mappingEntryId, component);
  }
  return index;
}

function familyCounts(components) {
  const counts = new Map();
  for (const component of components) {
    const current = counts.get(component.componentType) || {
      componentCount: 0, passCount: 0, blockedCount: 0, fieldCount: 0,
    };
    current.componentCount += 1;
    current.passCount += component.status === 'PASS' ? 1 : 0;
    current.blockedCount += component.status === 'BLOCKED' ? 1 : 0;
    current.fieldCount += component.fields?.length || 0;
    counts.set(component.componentType, current);
  }
  return Object.fromEntries([...counts].sort(([left], [right]) => compareText(left, right)));
}

function countsOf(components, missingIds) {
  const fields = components.flatMap((item) => item.fields || []);
  return {
    componentCount: components.length,
    sourceComponentCount: components.filter((item) => !item.generated).length,
    generatedComponentCount: components.filter((item) => item.generated).length,
    fieldCount: fields.length,
    publishedFieldCount: fields.filter((item) => item.disposition === 'PUBLISHED').length,
    unresolvedOptionalFieldCount: fields.filter((item) => item.disposition === 'UNRESOLVED_OPTIONAL').length,
    blockedFieldCount: fields.filter((item) => item.blocking).length,
    blockedComponentCount: components.filter((item) => item.status === 'BLOCKED').length,
    missingEngineeringComponentCount: missingIds.length,
  };
}

function validateBuildInputs(ledger, crosswalk, zoneGeometry) {
  if (ledger?.schema !== 'FbxEngineeringAttributeLedger.v1') {
    fail('FbxEngineeringAttributeLedger.v1 is required.');
  }
  if (crosswalk?.schema !== 'FbxSelectedZoneComponentCrosswalk.v1') {
    fail('FbxSelectedZoneComponentCrosswalk.v1 is required.');
  }
  if (zoneGeometry?.schema !== 'FbxZoneGeometryEvidence.v1') {
    fail('FbxZoneGeometryEvidence.v1 is required.');
  }
  if (crosswalk.inputs?.zoneGeometryArtifactId !== zoneGeometry.artifactId) {
    fail('component crosswalk is not bound to the selected zone geometry evidence.');
  }
}

function diagnosticList(components, missingIds) {
  return [
    ...missingIds.map((id) => `ENGINEERING_COMPONENT_MISSING:${id}`),
    ...components.filter((item) => item.status === 'BLOCKED')
      .map((item) => `ENGINEERING_COMPONENT_BLOCKED:${item.mappingEntryId}`),
  ].sort(compareText);
}

function ledgerPayload(source, crosswalk, zoneGeometry, components, missingIds) {
  const diagnostics = diagnosticList(components, missingIds);
  return {
    schema: SCHEMA, status: diagnostics.length ? 'BLOCKED' : 'PASS',
    sourceEngineeringAttributeLedgerSchema: source.schema,
    sourceEngineeringAttributeLedgerStatus: source.status,
    sourceComponentCrosswalkArtifactId: crosswalk.artifactId,
    zoneGeometryArtifactId: zoneGeometry.artifactId,
    selectedZoneId: zoneGeometry.selectedZone?.zoneId || null,
    counts: countsOf(components, missingIds), familyCounts: familyCounts(components),
    components, missingMappingEntryIds: missingIds, diagnostics,
    authority: {
      engineeringValueAuthority: 'APPROVED_MAPPING',
      selectionAuthority: 'FbxSelectedZoneComponentCrosswalk.v1',
      geometryInference: false, sourceAttributeInference: false,
      unresolvedOptionalValuesDefaulted: false, writerAuthorityChanged: false,
    },
  };
}

export async function buildSelectedZoneEngineeringAttributeLedger({
  engineeringAttributeLedger, componentCrosswalk, zoneGeometryEvidence,
} = {}) {
  validateBuildInputs(engineeringAttributeLedger, componentCrosswalk, zoneGeometryEvidence);
  const ids = selectedMappingEntryIds(componentCrosswalk);
  const index = ledgerIndex(engineeringAttributeLedger);
  const missingIds = ids.filter((id) => !index.has(id));
  const components = ids.filter((id) => index.has(id))
    .map((id) => structuredClone(index.get(id)));
  const payload = ledgerPayload(engineeringAttributeLedger, componentCrosswalk,
    zoneGeometryEvidence, components, missingIds);
  const ledgerDigest = await sha256Hex(canonicalJson(payload));
  return deepFreeze({ ...payload, ledgerDigest, artifactId: `FBXZENG-${ledgerDigest.slice(0, 32)}` });
}

export async function validateSelectedZoneEngineeringAttributeLedger(value) {
  if (value?.schema !== SCHEMA || !Array.isArray(value.components)
      || !Array.isArray(value.missingMappingEntryIds) || !Array.isArray(value.diagnostics)) {
    fail(`${SCHEMA} structure is invalid.`);
  }
  const payload = structuredClone(value);
  const digest = payload.ledgerDigest;
  delete payload.ledgerDigest;
  delete payload.artifactId;
  const actual = await sha256Hex(canonicalJson(payload));
  if (digest !== actual || value.artifactId !== `FBXZENG-${actual.slice(0, 32)}`) {
    fail('selected-zone engineering ledger digest is invalid.');
  }
  return value;
}
