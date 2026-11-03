import { readFile } from 'node:fs/promises';

export const ROOT = new URL('../../', import.meta.url);
export const FIXTURE_URL = new URL('../fixtures/fbx/two-pipes.fbx', import.meta.url);
export const ALL_CATEGORY_URL = new URL('../fixtures/fbx/all-categories.fbx', import.meta.url);
export const MAPPING_URL = new URL('../fixtures/fbx/two-pipes.fbxmap.json', import.meta.url);

export async function fixtureBytes(url = FIXTURE_URL) {
  return new Uint8Array(await readFile(url));
}

export async function fixtureMapping() {
  return JSON.parse(await readFile(MAPPING_URL, 'utf8'));
}

export function syntheticGraph() {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  return {
    schema: 'FbxSourceGraph.v1',
    file: { version: 7400, ascii: false },
    globalSettings: { unitMeters: 0.01, axes: { right: 0, up: 2, front: 5 } },
    sourceObjects: [
      { sourceObjectId: '201', class: 'NODE', name: 'anything' },
      { sourceObjectId: '202', class: 'NODE', name: 'anything' },
    ],
    occurrences: [
      { sourceOccurrenceId: 'occ:201', sourceModelObjectId: '201', geometryObjectIds: ['101'], inheritMode: 0, geometryMatrixMm: identity },
      { sourceOccurrenceId: 'occ:202', sourceModelObjectId: '202', geometryObjectIds: ['102'], inheritMode: 0, geometryMatrixMm: identity },
    ],
    geometries: [
      { geometryObjectId: '101', kind: 'MESH', verticesMm: [[0, 0, 0], [100, 0, 0]], ownerOccurrenceIds: ['occ:201'] },
      { geometryObjectId: '102', kind: 'MESH', verticesMm: [[100, 0, 0], [200, 0, 0]], ownerOccurrenceIds: ['occ:202'] },
    ],
    hierarchyEdges: [], connectionEdges: [], unsupportedRecords: [], unresolvedReferences: [], warnings: [],
  };
}

function sourceObject(id, type, value, domClass, domSubtype, sourceName, displayName, options = {}) {
  return {
    sourceObjectId: id,
    ufbxElementId: options.elementId ?? value,
    ufbxTypedId: options.typedId ?? 0,
    ufbxElementType: type,
    ufbxElementTypeValue: value,
    domClass,
    domSubtype,
    domSourceName: sourceName,
    displayName,
    customProperties: options.customProperties || [],
    sourceRecordDisposition: options.disposition || 'retained-evidence',
    nodeAttributeType: options.nodeAttributeType ?? null,
    nodeAttributeTypeValue: options.nodeAttributeTypeValue ?? null,
    objectPropertyPath: options.objectPropertyPath ?? null,
    connectionPropertyNames: options.connectionPropertyNames || [],
    sourceDocumentOrder: options.sourceDocumentOrder ?? value,
  };
}

export function syntheticGraphV2() {
  const legacy = syntheticGraph();
  return {
    ...legacy,
    schema: 'FbxSourceGraph.v2',
    documentMetadata: { originalApplication: '', latestApplication: '' },
    sourceObjects: [
      sourceObject('201', 'NODE', 1, 'Model', 'Mesh', 'Model::PipeOne', 'PipeOne', {
        disposition: 'supported-occurrence', nodeAttributeType: 'MESH', nodeAttributeTypeValue: 2,
      }),
      sourceObject('202', 'NODE', 1, 'Model', 'Mesh', 'Model::PipeTwo', 'PipeTwo', {
        typedId: 1, disposition: 'supported-occurrence', nodeAttributeType: 'MESH', nodeAttributeTypeValue: 2,
      }),
      sourceObject('101', 'MESH', 2, 'Geometry', 'Mesh', 'Geometry::PipeOne', 'PipeOne', {
        disposition: 'supported-geometry', sourceDocumentOrder: 2,
      }),
      sourceObject('102', 'MESH', 2, 'Geometry', 'Mesh', 'Geometry::PipeTwo', 'PipeTwo', {
        typedId: 1, disposition: 'supported-geometry', sourceDocumentOrder: 3,
      }),
      sourceObject('405', 'MATERIAL', 24, 'Material', '', 'Material::Evidence', 'Evidence', {
        connectionPropertyNames: ['DiffuseColor', 'DiffuseColor'], sourceDocumentOrder: 4,
      }),
    ],
  };
}
