import assert from 'node:assert/strict';
import { getConverterById } from '../../tabs/model-converters/converter-registry.js?v=20260617-basic-glb-3';
import { promoteNoMappingJsonOutput } from '../../tabs/model-converters/converters/fbx-to-stagedjson.js';
import {
  FBX_CONVERT_OPERATION,
  FBX_REVIEW_OPERATION,
  installFbxReviewUiAddon,
  runFbxWithReviewUi,
} from '../../tabs/model-converters/fbx-review-ui-addon.js';

const converter = getConverterById('fbx_to_stagedjson');
assert.ok(converter);
assert.equal(installFbxReviewUiAddon(), true);
assert.equal(installFbxReviewUiAddon(), false);
assert.equal(converter.defaults.fbxOperation, FBX_CONVERT_OPERATION);
assert.equal(converter.defaults.reviewMaxItemsPerShard, 500);
assert.deepEqual(
  converter.options.find((option) => option.key === 'fbxOperation')?.options,
  [FBX_CONVERT_OPERATION, FBX_REVIEW_OPERATION],
);
assert.equal(converter.options.find((option) => option.key === 'reviewMaxItemsPerShard')?.type, 'number');
assert.match(converter.description, /bounded-memory review execution remains available through the Node CLI/i);

const graphText = '{"schema":"FbxSourceGraph.v2"}\n';
const reportText = JSON.stringify({
  schema: 'FbxConversionReport.v1',
  status: 'BLOCKED_MAPPING',
  diagnostics: ['Mapping manifest is absent.'],
  counts: { sourceObjects: 1 },
});
const promoted = promoteNoMappingJsonOutput({
  ok: false,
  blocked: true,
  conversionStatus: 'BLOCKED_MAPPING',
  outputs: [
    { name: 'TAY-A.fbx-source-graph.json', text: graphText, mime: 'application/json;charset=utf-8' },
    { name: 'TAY-A.fbx-conversion-report.json', text: reportText, mime: 'application/json;charset=utf-8' },
  ],
  logs: { stdout: ['WORKLIST_GENERATED'], stderr: ['Mapping manifest is absent.'] },
}, 'TAY-A.fbx');
assert.equal(promoted.ok, true);
assert.equal(promoted.blocked, false);
assert.equal(promoted.conversionStatus, 'SOURCE_GRAPH_JSON_PASS');
assert.equal(promoted.outputs[0].name, 'TAY-A.json');
assert.equal(promoted.outputs[0].text, graphText);
assert.equal(promoted.outputs[1].name, 'TAY-A.fbx-source-graph.json');
assert.equal(JSON.parse(promoted.outputs.at(-1).text).status, 'SOURCE_GRAPH_JSON_PASS');
assert.ok(JSON.parse(promoted.outputs.at(-1).text).diagnostics.includes('OPTIONAL_MAPPING_ABSENT'));
assert.deepEqual(promoted.logs.stderr, ['Mapping manifest is absent.']);
assert.ok(promoted.logs.stdout.includes('SOURCE_GRAPH_JSON_PASS'));
assert.ok(!promoted.logs.stdout.includes('Mapping manifest is absent.'));
assert.equal(promoteNoMappingJsonOutput({ outputs: [] }, 'TAY-A.fbx').outputs.length, 0);

let delegated = false;
const delegatedResult = await runFbxWithReviewUi(
  { options: { fbxOperation: FBX_CONVERT_OPERATION } },
  async () => {
    delegated = true;
    return { ok: true, conversionStatus: 'BASE_RUN' };
  },
);
assert.equal(delegated, true);
assert.equal(delegatedResult.conversionStatus, 'BASE_RUN');
await assert.rejects(
  () => runFbxWithReviewUi({ options: { fbxOperation: 'UNKNOWN' } }),
  /Unsupported FBX operation/,
);

console.log('test-review-ui-addon: PASS');
