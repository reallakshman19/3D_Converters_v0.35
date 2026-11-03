import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const parser = await readFile(new URL('third_party/ufbx/fbx_parser.c', root), 'utf8');
const build = await readFile(new URL('scripts/fbx/build-ufbx-wasm.sh', root), 'utf8');

for (const symbol of [
  'fbx_geometry_parse',
  'fbx_geometry_result_ptr',
  'fbx_geometry_result_len',
  'fbx_geometry_buffer_count',
  'fbx_geometry_buffer_ptr',
  'fbx_geometry_buffer_len',
]) {
  assert.match(parser, new RegExp(`\\b${symbol}\\b`), `parser lacks ${symbol}`);
  assert.match(build, new RegExp(`--export=${symbol}\\b`), `build lacks ${symbol}`);
}

assert.match(parser, /FbxRawMeshTopology\.v1/);
assert.match(parser, /sourceGraph/);
assert.match(parser, /bufferIndices/);
for (const field of [
  'geometryObjectId', 'sourceObjectId', 'controlPointCount', 'polygonCount',
  'polygonVertexCount', 'emptyPolygonCount', 'pointPolygonCount',
  'linePolygonCount', 'reversedWinding', 'controlPointsMm',
  'polygonOffsets', 'polygonVertexIndices',
]) assert.match(parser, new RegExp(field), `raw topology lacks ${field}`);

assert.match(parser, /face\.index_begin!=cursor/);
assert.match(parser, /index>=m->num_vertices/);
assert.match(parser, /m->subdivision_evaluated\|\|m->from_tessellated_nurbs/);
assert.match(parser, /m->num_vertices>8388608/);
assert.match(parser, /m->num_faces>16777215/);
assert.match(parser, /m->num_indices>67108864/);
assert.match(parser, /cp_bytes>268435456/);
assert.match(parser, /x==0\.0\?0\.0:x/);
assert.match(parser, /isfinite\(x\).*isfinite\(y\).*isfinite\(z\)/);
assert.doesNotMatch(parser, /ufbx_triangulate_face|fan.?triang/i);
assert.match(parser, /int fbx_parse\(/, 'legacy parser export must remain');
assert.match(parser, /FbxSourceGraph\.v2/, 'legacy source graph must remain');

console.log('test-mesh-topology-parser: PASS');
