import assert from 'node:assert/strict';
import {
  buildSelectedZoneGeometryManifest, validateSelectedZoneGeometryManifest,
} from '../../tabs/model-converters/converters/fbx/zone-package/geometry-manifest.js';
import {
  buildSelectedZonePackage, validateSelectedZonePackage,
} from '../../tabs/model-converters/converters/fbx/zone-package/package-builder.js';
import { FbxZonePackageError } from '../../tabs/model-converters/converters/fbx/zone-package/constants.js';
import {
  COMPLETE_SOURCE_GRAPH_SHA256, quadGeometry, sourceIdentityFixture,
} from './zone-package-fixtures.mjs';

async function buildManifest(geometries) {
  return buildSelectedZoneGeometryManifest({
    completeSourceGraphSha256: COMPLETE_SOURCE_GRAPH_SHA256,
    sourceIdentity: sourceIdentityFixture(),
    geometries,
  });
}

{
  const shared = quadGeometry('10', 'occ:2', '1', 20);
  shared.occurrenceIds = ['occ:2', 'occ:1'];
  delete shared.occurrenceId;
  const { manifest, buffersByGeometryId } = await buildManifest([
    quadGeometry('20', 'occ:3', '2'), shared,
  ]);
  assert.equal(manifest.schema, 'FbxSelectedZoneGeometryManifest.v1');
  assert.equal(manifest.byteOrder, 'little-endian');
  assert.deepEqual(manifest.geometries.map((item) => item.geometryId), ['10', '20'],
    'geometries must sort by decimal geometryId');
  assert.deepEqual(manifest.geometries[0].occurrenceIds, ['occ:1', 'occ:2'],
    'shared geometry ownership must be preserved and sorted');
  assert.equal(manifest.geometries[0].controlPointCount, 4);
  assert.equal(manifest.geometries[0].polygonCount, 1);
  for (const entry of manifest.geometries) {
    assert.equal(entry.buffers.length, 3);
    for (const buffer of entry.buffers) assert.match(buffer.sha256, /^[0-9a-f]{64}$/);
  }
  assert.match(manifest.selectedZoneDigest, /^[0-9a-f]{64}$/);
  assert.match(manifest.manifestDigest, /^[0-9a-f]{64}$/);
  assert.ok(Object.isFrozen(manifest));
  await validateSelectedZoneGeometryManifest(manifest);

  const controlBytes = buffersByGeometryId.get('10')['control-points-mm'].bytes;
  assert.equal(new DataView(controlBytes.buffer, controlBytes.byteOffset, controlBytes.byteLength)
    .getFloat64(0, true), 20, 'control points must use explicit little-endian Float64 bytes');

  const first = await buildSelectedZonePackage({ manifest, buffersByGeometryId });
  const second = await buildSelectedZonePackage({ manifest, buffersByGeometryId });
  assert.deepEqual(first.audit, second.audit, 'repeated package builds must be byte-identical');
  assert.equal(first.files.length, second.files.length);
  for (let index = 0; index < first.files.length; index += 1) {
    assert.equal(first.files[index].path, second.files[index].path);
    assert.deepEqual([...first.files[index].bytes], [...second.files[index].bytes]);
  }
  const nonAuditPaths = first.files.slice(0, -1).map((file) => file.path);
  assert.deepEqual(nonAuditPaths, [...nonAuditPaths].sort(),
    'file order must be deterministic path order');
  assert.equal(first.files.at(-1).path, 'audit.json',
    'audit.json must be emitted last since it digests the rest of the package');
  assert.equal(first.audit.supportSemantics, 'NOT_AUTHORIZED');
  const stagedRole = first.audit.files.find((role) => role.role === 'STAGEDJSON');
  assert.equal(stagedRole.disposition, 'OMITTED_BLOCKED');
  assert.equal(stagedRole.sha256, null);
  const supportRole = first.audit.files.find((role) => role.role === 'SUPPORT_EVIDENCE');
  assert.equal(supportRole.disposition, 'OMITTED_BLOCKED');
  assert.equal(first.audit.files.filter((role) => role.role === 'GEOMETRY_DESCRIPTOR').length, 2);
  assert.equal(first.audit.files.filter((role) => role.role === 'GEOMETRY_BUFFER').length, 6);
  assert.match(first.audit.packageDigest, /^[0-9a-f]{64}$/);
  assert.equal(first.audit.geometryCount, 2);
  await validateSelectedZonePackage(first);

  const tampered = {
    files: first.files.map((file) => ({ path: file.path, bytes: file.bytes.slice() })),
    audit: structuredClone(first.audit),
  };
  tampered.files.find((file) => file.path.endsWith('control-points-mm.bin')).bytes[0] ^= 1;
  await assert.rejects(() => validateSelectedZonePackage(tampered),
    (error) => error instanceof FbxZonePackageError && error.code === 'ZONE_PACKAGE_INVALID_FILE');
}

{
  const { manifest, buffersByGeometryId } = await buildManifest([
    quadGeometry('1', 'occ:1', '1'),
  ]);
  const withStaged = await buildSelectedZonePackage({
    manifest, buffersByGeometryId, stagedJsonText: '[]\n',
  });
  const stagedRole = withStaged.audit.files.find((role) => role.role === 'STAGEDJSON');
  assert.equal(stagedRole.disposition, 'PRESENT');
  assert.match(stagedRole.sha256, /^[0-9a-f]{64}$/);
  assert.ok(withStaged.files.some((file) => file.path === 'stagedjson.json'));
  await assert.rejects(() => buildSelectedZonePackage({
    manifest, buffersByGeometryId, stagedJsonText: '{broken',
  }), (error) => error instanceof FbxZonePackageError
    && error.code === 'ZONE_PACKAGE_INVALID_STAGEDJSON');
}

{
  await assert.rejects(() => buildManifest([
    quadGeometry('1', 'occ:1', '1'), quadGeometry('1', 'occ:2', '2'),
  ]), (error) => error instanceof FbxZonePackageError
    && error.code === 'ZONE_PACKAGE_DUPLICATE_GEOMETRY');
}

{
  const bad = quadGeometry('1', 'occ:1', '1');
  bad.polygonVertexIndices = [0, 1, 2, 99];
  await assert.rejects(() => buildManifest([bad]),
    (error) => error instanceof FbxZonePackageError
      && error.code === 'ZONE_PACKAGE_INVALID_BUFFER');
}

{
  const bad = quadGeometry('1', 'occ:1', '1');
  bad.polygonOffsets = [0, 1.5];
  await assert.rejects(() => buildManifest([bad]),
    (error) => error instanceof FbxZonePackageError
      && error.code === 'ZONE_PACKAGE_INVALID_BUFFER');
}

{
  await assert.rejects(() => buildManifest([]),
    (error) => error instanceof FbxZonePackageError
      && error.code === 'ZONE_PACKAGE_EMPTY_SELECTION');
}

{
  const { manifest } = await buildManifest([quadGeometry('1', 'occ:1', '1')]);
  await assert.rejects(() => buildSelectedZonePackage({
    manifest, buffersByGeometryId: new Map(),
  }), (error) => error instanceof FbxZonePackageError
    && error.code === 'ZONE_PACKAGE_MISSING_BUFFERS');
}

console.log('test-zone-package-core: PASS');
