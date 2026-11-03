import { readFile } from 'node:fs/promises';

export const FAMILY_FIXTURE_URL = new URL('../fixtures/fbx/component-families.fbx', import.meta.url);
export const FAMILY_MAPPING_URL = new URL('../fixtures/fbx/component-families.fbxmap.json', import.meta.url);

export async function familyFixtureBytes() {
  return new Uint8Array(await readFile(FAMILY_FIXTURE_URL));
}

export async function familyFixtureMapping() {
  return JSON.parse(await readFile(FAMILY_MAPPING_URL, 'utf8'));
}

export function syntheticFamilyGraphV2() {
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  const specs = [
    ['500', '600', [[0, 0, 0], [100, 0, 0]]],
    ['501', '601', [[100, 0, 0], [200, -100, 0]]],
    ['502', '602', [[200, -100, 0], [200, -200, 0], [200, -150, 0]]],
    ['503', '603', [[200, -200, 0], [200, -300, 0]]],
    ['504', '604', [[200, -300, 0], [200, -320, 0]]],
    ['505', '605', [[200, -320, 0], [200, -420, 0]]],
    ['506', '606', [[200, -150, 0], [300, -150, 0]]],
    ['507', '607', [[200, -420, 0], [200, -520, 0]]],
  ];
  return {
    schema: 'FbxSourceGraph.v2',
    sourceObjects: specs.flatMap(([model, geometry]) => [
      { sourceObjectId: model, ufbxElementType: 'NODE' },
      { sourceObjectId: geometry, ufbxElementType: 'MESH' },
    ]),
    occurrences: specs.map(([model, geometry]) => ({
      sourceOccurrenceId: `occ:${model}`, sourceModelObjectId: model,
      geometryObjectIds: [geometry], inheritMode: 0, geometryMatrixMm: identity,
    })),
    geometries: specs.map(([model, geometry, verticesMm]) => ({
      geometryObjectId: geometry, kind: 'MESH', verticesMm,
      ownerOccurrenceIds: [`occ:${model}`],
    })),
  };
}
