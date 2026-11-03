import {
  ENGINEERING_ATTRIBUTE_PROFILE,
  compareEngineeringText,
  engineeringFamilyOrder,
  engineeringFieldSpecs,
  equalEngineeringValues,
  nativeTypeForEngineeringFamily,
  normalizedEngineeringValue,
  validEngineeringFieldValue,
} from './field-specs.js';
import {
  indexPublishedEngineeringComponents,
  publicationIdentityDiagnostics,
} from './publication-reader.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function generated(entry, acceptedIds) {
  return !acceptedIds.has(entry.mappingEntryId) || entry.generation?.generated === true;
}

function fieldDisposition(spec, source, published) {
  const sourcePresent = source !== undefined, publishedPresent = published !== undefined;
  if (!sourcePresent && !publishedPresent) {
    return spec.required ? 'SOURCE_REQUIRED_FIELD_MISSING' : 'UNRESOLVED_OPTIONAL';
  }
  if (!sourcePresent) return 'UNAUTHORIZED_PUBLISHED_VALUE';
  if (!validEngineeringFieldValue(spec, source)) return 'SOURCE_FIELD_INVALID';
  if (!publishedPresent) return 'PUBLISHED_FIELD_MISSING';
  if (!validEngineeringFieldValue(spec, published)) return 'PUBLISHED_FIELD_INVALID';
  return equalEngineeringValues(source, published) ? 'PUBLISHED' : 'PUBLICATION_CONFLICT';
}

function blockingDisposition(disposition) {
  return !['PUBLISHED', 'UNRESOLVED_OPTIONAL'].includes(disposition);
}

function fieldRecord(spec, sourceEngineering, publishedEngineering) {
  const sourceValue = sourceEngineering[spec.name], publishedValue = publishedEngineering[spec.name];
  const disposition = fieldDisposition(spec, sourceValue, publishedValue);
  return {
    field: spec.name,
    valueType: spec.valueType,
    required: spec.required,
    authority: 'APPROVED_MAPPING',
    sourceValue: clone(sourceValue) ?? null,
    publishedValue: clone(publishedValue) ?? null,
    disposition,
    blocking: blockingDisposition(disposition),
  };
}

function undeclaredFields(componentType, publishedEngineering) {
  const declared = new Set(engineeringFieldSpecs(componentType).map((item) => item.name));
  return Object.keys(publishedEngineering).filter((key) => !declared.has(key))
    .sort(compareEngineeringText).map((field) => ({
      field,
      valueType: 'undeclared',
      required: false,
      authority: 'NONE',
      sourceValue: null,
      publishedValue: clone(publishedEngineering[field]) ?? null,
      disposition: 'UNDECLARED_PUBLISHED_FIELD',
      blocking: true,
    }));
}

function sourceComponentRecord(entry, published) {
  const sourceEngineering = normalizedEngineeringValue(entry.engineering || {});
  const publishedEngineering = normalizedEngineeringValue(published?.mappingEngineering || {});
  const fields = engineeringFieldSpecs(entry.componentType)
    .map((spec) => fieldRecord(spec, sourceEngineering, publishedEngineering));
  fields.push(...undeclaredFields(entry.componentType, publishedEngineering));
  const identityDiagnostics = publicationIdentityDiagnostics(entry, published);
  const blocked = identityDiagnostics.length > 0 || fields.some((item) => item.blocking);
  return {
    mappingEntryId: entry.mappingEntryId,
    logicalComponentId: entry.logicalComponentId,
    componentType: entry.componentType,
    nativeType: nativeTypeForEngineeringFamily(entry.componentType),
    sourceModelObjectId: entry.sourceModelObjectId,
    sourceOccurrenceId: entry.sourceOccurrenceId,
    generated: false,
    authorityDisposition: 'APPROVED_MAPPING',
    status: blocked ? 'BLOCKED' : 'PASS',
    identityDiagnostics,
    fields,
    generatedEngineeringPolicy: null,
  };
}

function generatedPolicy(entry, published) {
  const expected = normalizedEngineeringValue(entry.generation || null);
  const engineering = normalizedEngineeringValue(published?.mappingEngineering || {});
  const keys = Object.keys(engineering).sort(compareEngineeringText);
  const provenance = engineering.generationProvenance;
  const onlyProvenance = keys.length === 1 && keys[0] === 'generationProvenance';
  const matching = expected && equalEngineeringValues(expected, provenance);
  const identityDiagnostics = publicationIdentityDiagnostics(entry, published);
  const status = published && onlyProvenance && matching && !identityDiagnostics.length ? 'PASS' : 'BLOCKED';
  return {
    mappingEntryId: entry.mappingEntryId,
    logicalComponentId: entry.logicalComponentId,
    componentType: entry.componentType,
    nativeType: nativeTypeForEngineeringFamily(entry.componentType),
    sourceModelObjectId: null,
    sourceOccurrenceId: null,
    generated: true,
    authorityDisposition: 'GENERATED_COMPONENT_POLICY',
    status,
    identityDiagnostics,
    fields: [],
    generatedEngineeringPolicy: {
      policy: 'NO_ENGINEERING_INHERITANCE',
      generationMethod: entry.generation?.generationMethod || null,
      onlyGenerationProvenancePublished: onlyProvenance,
      generationProvenanceMatchesRelease: Boolean(matching),
      disposition: status === 'PASS' ? 'PASS' : 'BLOCKED',
    },
  };
}

function familyCounts(components) {
  return Object.fromEntries(engineeringFamilyOrder().map((family) => {
    const records = components.filter((item) => item.componentType === family);
    return [family, {
      componentCount: records.length,
      passCount: records.filter((item) => item.status === 'PASS').length,
      blockedCount: records.filter((item) => item.status === 'BLOCKED').length,
      fieldCount: records.reduce((sum, item) => sum + item.fields.length, 0),
    }];
  }));
}

function ledgerCounts(components, unexpectedCount, duplicateCount) {
  const fields = components.flatMap((item) => item.fields);
  return {
    componentCount: components.length,
    sourceComponentCount: components.filter((item) => !item.generated).length,
    generatedComponentCount: components.filter((item) => item.generated).length,
    fieldCount: fields.length,
    publishedFieldCount: fields.filter((item) => item.disposition === 'PUBLISHED').length,
    unresolvedOptionalFieldCount: fields.filter((item) => item.disposition === 'UNRESOLVED_OPTIONAL').length,
    blockedFieldCount: fields.filter((item) => item.blocking).length,
    blockedComponentCount: components.filter((item) => item.status === 'BLOCKED').length,
    unexpectedStagedComponentCount: unexpectedCount,
    duplicatePublishedMappingEntryCount: duplicateCount,
  };
}

function diagnosticsOf(components, unexpectedIds, duplicateIds) {
  const diagnostics = [];
  for (const id of duplicateIds) diagnostics.push(`DUPLICATE_PUBLISHED_MAPPING_ENTRY:${id}`);
  for (const id of unexpectedIds) diagnostics.push(`UNEXPECTED_STAGED_COMPONENT:${id}`);
  for (const component of components) {
    for (const code of component.identityDiagnostics) diagnostics.push(`${code}:${component.mappingEntryId}`);
    for (const field of component.fields) if (field.blocking) {
      diagnostics.push(`${field.disposition}:${component.mappingEntryId}:${field.field}`);
    }
    if (component.generatedEngineeringPolicy?.disposition === 'BLOCKED') {
      diagnostics.push(`GENERATED_ENGINEERING_POLICY_BLOCKED:${component.mappingEntryId}`);
    }
  }
  return diagnostics.sort(compareEngineeringText);
}

export class EngineeringAttributePublicationError extends Error {
  constructor(ledger) {
    const summary = ledger.diagnostics.slice(0, 8).join(', ') || 'engineering publication blocked';
    super(`BLOCKED_ENGINEERING_ATTRIBUTES ${summary}`);
    this.name = 'EngineeringAttributePublicationError';
    this.engineeringAttributeLedger = ledger;
  }
}

export function buildEngineeringAttributeLedger({ acceptedEntries, releasedEntries, stagedBranches } = {}) {
  if (!Array.isArray(acceptedEntries) || !Array.isArray(releasedEntries) || !Array.isArray(stagedBranches)) {
    throw new TypeError('FBX engineering attribute ledger requires accepted entries, released entries, and staged branches.');
  }
  const acceptedIds = new Set(acceptedEntries.map((entry) => entry.mappingEntryId));
  const publication = indexPublishedEngineeringComponents(stagedBranches);
  const releasedIds = new Set(releasedEntries.map((entry) => entry.mappingEntryId));
  const unexpectedIds = publication.records.map((item) => item.mappingEntryId)
    .filter((id) => !releasedIds.has(id)).sort(compareEngineeringText);
  const components = [...releasedEntries].sort((left, right) => (
    compareEngineeringText(left.mappingEntryId, right.mappingEntryId)
  )).map((entry) => {
    const published = publication.index.get(entry.mappingEntryId) || null;
    return generated(entry, acceptedIds)
      ? generatedPolicy(entry, published) : sourceComponentRecord(entry, published);
  });
  const diagnostics = diagnosticsOf(components, unexpectedIds, publication.duplicateMappingEntryIds);
  const counts = ledgerCounts(components, unexpectedIds.length, publication.duplicateMappingEntryIds.length);
  return deepFreeze({
    schema: 'FbxEngineeringAttributeLedger.v1',
    status: diagnostics.length ? 'BLOCKED' : 'PASS',
    profile: { ...ENGINEERING_ATTRIBUTE_PROFILE },
    counts,
    familyCounts: familyCounts(components),
    components,
    diagnostics,
    authority: {
      engineeringValueAuthority: 'APPROVED_MAPPING',
      publicationAuthority: 'NATIVE_STAGEDJSON_WRITER',
      exactFieldPublicationRequired: true,
      sourceAttributeInference: false,
      geometryAttributeInference: false,
      generatedComponentsInheritEngineeringValues: false,
      optionalUnresolvedValuesDefaulted: false,
      writerAuthorityChanged: false,
    },
  });
}

export function assertEngineeringAttributePublication(ledger) {
  if (ledger?.schema !== 'FbxEngineeringAttributeLedger.v1') {
    throw new TypeError('Expected FbxEngineeringAttributeLedger.v1.');
  }
  if (ledger.status !== 'PASS') throw new EngineeringAttributePublicationError(ledger);
  return ledger;
}
