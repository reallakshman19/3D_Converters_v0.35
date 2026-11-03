import { validateFbxGeometryBundle } from '../geometry-bundle.js';
import { sha256Hex } from '../sha256.js';
import { GEOMETRY_BUFFER_ROLES, ZONE_GEOMETRY_STATUS } from './constants.js';
import { compareDecimalId } from './compare.js';
import { failZoneGeometry } from './errors.js';

function bufferMap(bundle) {
  return new Map(bundle.buffers.map((item) => [item.bufferId, item]));
}

function descriptorMap(bundle) {
  return new Map(bundle.manifest.buffers.map((item) => [item.bufferId, item]));
}

function selectedGeometry(bundle, geometryId, descriptors, buffers) {
  const geometry = bundle.manifest.geometries.find((item) => item.geometryObjectId === geometryId);
  if (!geometry) failZoneGeometry(ZONE_GEOMETRY_STATUS.SCOPE,
    `Selected geometry ${geometryId} is absent from the accepted bundle.`);
  const selectedBuffers = GEOMETRY_BUFFER_ROLES.map((role) => {
    const key = role === 'control-points-mm' ? 'controlPointsMm'
      : role === 'polygon-offsets' ? 'polygonOffsets' : 'polygonVertexIndices';
    const id = geometry.bufferIds[key], descriptor = descriptors.get(id), buffer = buffers.get(id);
    if (!descriptor || !buffer) failZoneGeometry(ZONE_GEOMETRY_STATUS.TOPOLOGY,
      `Selected topology buffer ${id} is unresolved.`);
    return { role, descriptor, buffer };
  });
  return { geometry, buffers: selectedBuffers };
}

async function recheckSelectedDigests(selections) {
  for (const selection of selections) {
    for (const item of selection.buffers) {
      if (await sha256Hex(item.buffer.bytes) !== item.descriptor.sha256) {
        failZoneGeometry(ZONE_GEOMETRY_STATUS.TOPOLOGY,
          `Selected topology buffer ${item.descriptor.bufferId} failed digest validation.`);
      }
    }
  }
}

export async function validateCompleteGeometryBundle(bundle) {
  try { await validateFbxGeometryBundle(bundle); }
  catch (error) {
    const resource = /LIMIT|overflow|resource/i.test(`${error?.code || ''} ${error?.message || ''}`);
    failZoneGeometry(resource ? ZONE_GEOMETRY_STATUS.RESOURCE : ZONE_GEOMETRY_STATUS.TOPOLOGY,
      'The complete FbxGeometryBundle.v1 failed validation.', error?.message || String(error));
  }
  return bundle;
}

export async function selectValidatedTopology(bundle, scope, options = {}) {
  if (!options.validated) await validateCompleteGeometryBundle(bundle);
  const descriptors = descriptorMap(bundle), buffers = bufferMap(bundle);
  const geometryIds = [...scope.selectedGeometryIds].sort(compareDecimalId);
  const selections = geometryIds.map((id) => selectedGeometry(bundle, id, descriptors, buffers));
  await recheckSelectedDigests(selections);
  return Object.freeze(selections);
}
