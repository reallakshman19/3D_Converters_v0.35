import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '../../tabs/model-converters/converters/fbx/canonical-json.js';
import { sha256Hex } from '../../tabs/model-converters/converters/fbx/sha256.js';
import { enforceSourceGraphPolicy } from '../../tabs/model-converters/converters/fbx/source-graph.js';
import { analyseFbxZoneGeometry } from '../../tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js';
import { ZONE_GEOMETRY_STATUS } from '../../tabs/model-converters/converters/fbx/zone-geometry/constants.js';

const transform = { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] };
export const identityMatrix = [1,0,0,0,1,0,0,0,1,0,0,0];

function source(id, name, type, subtype, order) {
  return { sourceObjectId: id, ufbxElementId: order, ufbxTypedId: order,
    ufbxElementType: type, ufbxElementTypeValue: type === 'NODE' ? 1 : 2,
    domClass: type === 'NODE' ? 'Model' : 'Geometry', domSubtype: subtype,
    domSourceName: `${type === 'NODE' ? 'Model' : 'Geometry'}::${name}`,
    displayName: `${type === 'NODE' ? 'Model' : 'Geometry'}::${name}`,
    customProperties: [], sourceRecordDisposition: type === 'NODE'
      ? 'supported-occurrence' : 'supported-geometry', nodeAttributeType: null,
    nodeAttributeTypeValue: null, objectPropertyPath: null,
    connectionPropertyNames: [], sourceDocumentOrder: order };
}

function occurrence(id, model, parent, geometryObjectIds, matrix) {
  return { sourceOccurrenceId: id, sourceModelObjectId: model, parentOccurrenceId: parent,
    geometryObjectIds, inheritMode: 0, originalInheritMode: 0, hasGeometryTransform: false,
    localTransformSource: transform, geometryTransformSource: transform,
    worldMatrixSource: matrix, geometryMatrixSource: matrix,
    worldMatrixMm: matrix, geometryMatrixMm: matrix };
}

export function diskGeometry(segments = 8, radius = 10) {
  const points = [[0, 0, 0]];
  for (let index = 0; index < segments; index += 1) {
    const angle = 2 * Math.PI * index / segments;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), 0]);
  }
  const faces = [];
  for (let index = 0; index < segments; index += 1) faces.push([0, index + 1,
    ((index + 1) % segments) + 1]);
  return { points, faces };
}

export function cylinderGeometry(segments = 8, radius = 10, height = 20) {
  const points = [];
  for (const z of [0, height]) for (let index = 0; index < segments; index += 1) {
    const angle = 2 * Math.PI * index / segments;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle), z]);
  }
  const faces = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    faces.push([index, next, segments + next, segments + index]);
  }
  return { points, faces };
}

function writePoints(points) {
  const buffer = new ArrayBuffer(points.length * 24), view = new DataView(buffer);
  points.flat().forEach((value, index) => view.setFloat64(index * 8, value === 0 ? 0 : value, true));
  return buffer;
}

function writeOffsets(faces) {
  const buffer = new ArrayBuffer((faces.length + 1) * 4), view = new DataView(buffer);
  let offset = 0; view.setUint32(0, 0, true);
  faces.forEach((face, index) => { offset += face.length; view.setUint32((index + 1) * 4, offset, true); });
  return buffer;
}

function writeIndices(faces) {
  const values = faces.flat(), buffer = new ArrayBuffer(values.length * 4), view = new DataView(buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return buffer;
}

async function geometryBundleRecord(id, geometry) {
  const roles = [['control-points-mm', writePoints(geometry.points), 'Float64', 3, 8],
    ['polygon-offsets', writeOffsets(geometry.faces), 'Uint32', 1, 4],
    ['polygon-vertex-indices', writeIndices(geometry.faces), 'Uint32', 1, 4]];
  const bufferIds = { controlPointsMm: `geometry/${id}/control-points-mm`,
    polygonOffsets: `geometry/${id}/polygon-offsets`,
    polygonVertexIndices: `geometry/${id}/polygon-vertex-indices` };
  const descriptor = { geometryObjectId: id, sourceObjectId: id,
    controlPointCount: geometry.points.length, polygonCount: geometry.faces.length,
    polygonVertexCount: geometry.faces.flat().length, emptyPolygonCount: 0,
    pointPolygonCount: 0, linePolygonCount: 0, reversedWinding: false, bufferIds };
  const buffers = [], descriptors = [];
  for (const [role, bytes, scalarType, componentCount, alignment] of roles) {
    const bufferId = `geometry/${id}/${role}`;
    const count = role === 'control-points-mm' ? geometry.points.length
      : role === 'polygon-offsets' ? geometry.faces.length + 1 : geometry.faces.flat().length;
    descriptors.push({ bufferId, geometryObjectId: id, role, scalarType, componentCount,
      count, alignment, byteLength: bytes.byteLength, sha256: await sha256Hex(bytes) });
    buffers.push({ bufferId, bytes });
  }
  return { descriptor, descriptors, buffers };
}

function ownersFor(id, selectedIds, siblingIds) {
  const owners = [];
  if (selectedIds.includes(id)) owners.push('occ:5');
  if (siblingIds.includes(id)) owners.push('occ:6');
  return owners;
}

function maybeReverse(values, reverse) {
  return reverse ? [...values].reverse() : values;
}

export async function buildFixture(options = {}) {
  const geometryAId = options.geometryAId || '10', geometryBId = options.geometryBId || '11';
  const geometryA = options.geometryA || options.geometry10 || diskGeometry();
  const geometryB = options.geometryB || options.geometry11
    || { points: [[0,0,0],[1,0,0],[0,1,0]], faces: [[0,1,2]] };
  const selectedIds = options.selectedGeometryIds || [geometryAId];
  const siblingIds = options.siblingGeometryIds || [geometryAId, geometryBId];
  const matrixA = options.matrixA || identityMatrix;
  const matrixB = options.matrixB || [1,0,0,0,1,0,0,0,1,100,0,0];
  const sourceObjects = [source('101','Scene','NODE',options.sceneSubtype || 'Null',1),
    source('102','Project','NODE',options.projectSubtype || 'Null',2),
    source('103',options.zoneAName || 'Zone A','NODE',options.zoneASubtype || 'Null',3),
    source('104',options.zoneBName || 'Zone B','NODE',options.zoneBSubtype || 'Null',4),
    source('105','A item','NODE','Mesh',5), source('106','B item','NODE','Mesh',6)];
  const geometrySpecs = [{ id: geometryAId, name: 'Geometry A', geometry: geometryA },
    { id: geometryBId, name: 'Geometry B', geometry: geometryB }]
    .sort((left, right) => BigInt(left.id) < BigInt(right.id) ? -1 : 1);
  geometrySpecs.forEach((item, index) => sourceObjects.push(
    source(item.id, item.name, 'MESH', 'Mesh', 10 + index)));
  const occurrences = [occurrence('occ:1','101',null,[],identityMatrix),
    occurrence('occ:2','102','occ:1',[],identityMatrix),
    occurrence('occ:3','103','occ:2',[],identityMatrix),
    occurrence('occ:4','104','occ:2',[],identityMatrix),
    occurrence('occ:5','105','occ:3',selectedIds,matrixA),
    occurrence('occ:6','106','occ:4',siblingIds,matrixB)];
  const geometries = geometrySpecs.map((item) => ({ geometryObjectId: item.id,
    sourceObjectId: item.id, kind: 'MESH', verticesSource: item.geometry.points,
    verticesMm: item.geometry.points, ownerOccurrenceIds: ownersFor(item.id, selectedIds, siblingIds) }));
  const hierarchyEdges = [{ parentOccurrenceId:'occ:1', childOccurrenceId:'occ:2' },
    { parentOccurrenceId:'occ:2', childOccurrenceId:'occ:3' },
    { parentOccurrenceId:'occ:2', childOccurrenceId:'occ:4' },
    { parentOccurrenceId:'occ:3', childOccurrenceId:'occ:5' },
    { parentOccurrenceId:'occ:4', childOccurrenceId:'occ:6' }];
  const graph = enforceSourceGraphPolicy({ schema: 'FbxSourceGraph.v2',
    file: { version: 7500, ascii: false, creator: 'test' },
    documentMetadata: { originalApplication: 'test', latestApplication: 'test' },
    globalSettings: { unitMeters: 1, axes: { right: 1, up: 2, front: -3 } },
    sourceObjects: maybeReverse(sourceObjects, options.reverseInput),
    occurrences: maybeReverse(occurrences, options.reverseInput),
    geometries: maybeReverse(geometries, options.reverseInput),
    hierarchyEdges: maybeReverse(hierarchyEdges, options.reverseInput),
    connectionEdges: [], warnings: [], unsupportedRecords: [], unresolvedReferences: [],
    duplicateSourceObjectIds: [] });
  const records = [];
  for (const item of geometrySpecs) records.push(await geometryBundleRecord(item.id, item.geometry));
  const sourceBytes = new TextEncoder().encode('synthetic-fbx-auto-001');
  const manifest = { schema: 'FbxGeometryBundle.v1', sourceGraphSchema: 'FbxSourceGraph.v2',
    sourceGraphSha256: await sha256Hex(canonicalJson(graph)),
    sourceIdentity: { sha256: await sha256Hex(sourceBytes), byteLength: sourceBytes.byteLength, fbxVersion: 7500 },
    parserIdentity: { provenanceSchema: 'UfbxWasmProvenance.v1', upstreamRevision: 'a'.repeat(40),
      sourceSha256: 'b'.repeat(64), wasmSha256: 'c'.repeat(64) }, coordinateUnit: 'millimetre',
    byteOrder: 'little-endian', triangleDerivation: { status: 'not-derived', rule: null },
    limitsVersion: 'FbxGeometryLimits.v1', geometries: records.map((item) => item.descriptor),
    buffers: records.flatMap((item) => item.descriptors), bundleDigest: '' };
  const body = structuredClone(manifest); delete body.bundleDigest;
  manifest.bundleDigest = await sha256Hex(`FbxGeometryBundle.v1\0${canonicalJson(body)}`);
  return { graph, bundle: { manifest, buffers: records.flatMap((item) => item.buffers) }, sourceBytes };
}

async function analyse(fixture, zoneId = 'occ:3') {
  return analyseFbxZoneGeometry({ sourceGraph: fixture.graph,
    geometryBundle: fixture.bundle, zoneId });
}

async function main() {
  const fixture = await buildFixture();
  const graphBefore = canonicalJson(fixture.graph), manifestBefore = canonicalJson(fixture.bundle.manifest);
  const bufferBefore = await Promise.all(fixture.bundle.buffers.map((item) => sha256Hex(item.bytes)));
  const first = await analyse(fixture), second = await analyse(fixture);
  assert.equal(first.zoneGeometryJson, second.zoneGeometryJson);
  assert.equal(first.derivedPortJson, second.derivedPortJson);
  assert.deepEqual(first.zoneGeometryEvidence.selectedOccurrenceIds, ['occ:5']);
  assert.deepEqual(first.zoneGeometryEvidence.ancestorOccurrenceIds, ['occ:1','occ:2','occ:3']);
  assert.deepEqual(first.zoneGeometryEvidence.selectedGeometryIds, ['10']);
  assert.equal(first.zoneGeometryJson.includes('"geometryObjectId": "11"'), false);
  assert.deepEqual(first.zoneGeometryEvidence.sharedGeometryEvidence[0].siblingOwnerOccurrenceIds, ['occ:6']);
  assert.equal(first.zoneGeometryEvidence.conservation.siblingExclusiveGeometryIncludedCount, 0);
  assert.equal(first.derivedPortEvidence.sourceZoneGeometryArtifactId, first.zoneGeometryEvidence.artifactId);
  assert.equal(first.derivedPortEvidence.admittedPortCount, 1);
  assert.equal(canonicalJson(fixture.graph), graphBefore);
  assert.equal(canonicalJson(fixture.bundle.manifest), manifestBefore);
  assert.deepEqual(await Promise.all(fixture.bundle.buffers.map((item) => sha256Hex(item.bytes))), bufferBefore);

  const duplicate = await buildFixture({ zoneAName: 'Duplicate', zoneBName: 'Duplicate' });
  const duplicatePermuted = await buildFixture({ zoneAName: 'Duplicate', zoneBName: 'Duplicate', reverseInput: true });
  const duplicateResult = await analyse(duplicate), permutedResult = await analyse(duplicatePermuted);
  assert.equal(duplicateResult.zoneGeometryEvidence.selectedZone.label, 'Duplicate · occ:3');
  assert.equal(permutedResult.zoneGeometryEvidence.selectedZone.label, 'Duplicate · occ:3');
  assert.equal(duplicateResult.zoneGeometryJson, permutedResult.zoneGeometryJson);
  assert.equal(duplicateResult.derivedPortJson, permutedResult.derivedPortJson);

  for (const malformed of ['NULL', 'null', ' Null ', 'NULL ']) {
    const malformedFixture = await buildFixture({ zoneASubtype: malformed, projectSubtype: 'Null' });
    await assert.rejects(() => analyse(malformedFixture),
      (error) => error?.code === ZONE_GEOMETRY_STATUS.SCOPE);
  }
  console.log('test-zone-geometry-evidence: PASS');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
