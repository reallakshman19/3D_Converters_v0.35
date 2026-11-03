import assert from 'node:assert/strict';
import {
  buildFbxPreviewZoneDownloadName,
  buildFbxStagedZoneDownloadName,
  extractFbxStagedRun,
} from '../../tabs/model-converters/fbx-preview-zone-selector.js';

assert.equal(
  buildFbxPreviewZoneDownloadName('TAY-A.json', 'TWGA-1000-CU-PI-P'),
  'TAY-A.TWGA-1000-CU-PI-P.FbxSourceGraph.v2.json',
);
assert.equal(
  buildFbxStagedZoneDownloadName('TAY-A.json', 'TWGA-1000-CU-PI-P'),
  'TAY-A.TWGA-1000-CU-PI-P.staged.json',
);

const branches = [{ type:'BRANCH', children:[] }];
assert.deepEqual(
  extractFbxStagedRun({
    conversionStatus:'STAGEDJSON_PASS',
    outputs:[{ name:'TAY-A.staged.json', text:JSON.stringify(branches) }],
  }),
  { branches, outputName:'TAY-A.staged.json' },
);
assert.equal(extractFbxStagedRun({
  conversionStatus:'SOURCE_GRAPH_JSON_PASS',
  outputs:[{ name:'TAY-A.staged.json', text:JSON.stringify(branches) }],
}), null);
assert.equal(extractFbxStagedRun({
  conversionStatus:'STAGEDJSON_PASS',
  outputs:[{ name:'TAY-A.staged.json', text:'{' }],
}), null);
assert.equal(extractFbxStagedRun({
  conversionStatus:'STAGEDJSON_PASS',
  outputs:[{ name:'TAY-A.json', text:'[]' }],
}), null);

console.log('test-fbx-preview-zone-staged-run: PASS');
