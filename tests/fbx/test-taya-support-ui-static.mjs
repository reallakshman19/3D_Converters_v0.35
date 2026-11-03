import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [source, report, session, ui, exporter, tab] = await Promise.all([
  read('tabs/model-converters/converters/fbx/taya-qualification/source-profile.js'),
  read('tabs/model-converters/converters/fbx/taya-qualification/report.js'),
  read('tabs/model-converters/converters/fbx/taya-qualification/session.js'),
  read('tabs/model-converters/converters/fbx/taya-qualification/ui.js'),
  read('tabs/model-converters/fbx-zone-package-export.js'),
  read('tabs/model-converters/ModelConvertersTab.js'),
]);
assert.match(source, /71_486_048/);
assert.match(source, /0c2c0600a1232541a497aea05832b728569fefcf62ea86e71dea520247fe9ca8/);
assert.match(source, /fileNameUsedAsAuthority: false/);
assert.match(source, /SOURCE_GRAPH_COUNT_MISMATCH/);
assert.match(report, /FbxTayaSupportQualification\.v1/);
assert.match(report, /SUPPORT_EVIDENCE_BINDING/);
assert.match(report, /SUPPORT_HOST_ASSOCIATION_BINDING/);
assert.match(report, /SUPPORT_ASSEMBLY_BINDING/);
assert.match(report, /packageBlockedChecks/);
assert.match(report, /toleranceProfileChanged: false/);
assert.match(report, /restraintSubtypeEvaluated: false/);
assert.match(session, /Run 1/);
assert.match(session, /Run 2/);
assert.equal((session.match(/analyseOnce\(analyse, selection/g) || []).length, 2,
  'the production session must execute two fresh analyses');
assert.doesNotMatch(session, /reuse|currentInputs/);
assert.match(ui, /data-fbx-taya-support-qualify/);
assert.match(ui, /Qualify TAY-A support/);
assert.match(ui, /600_000/);
assert.match(ui, /model-converters:fbx-zone-geometry-run/);
assert.match(ui, /model-converters:preview-project-rendered/);
assert.match(ui, /model-converters:fbx-zone-package-inputs/);
assert.match(ui, /FbxTayaSupportQualification\.v1\.json/);
assert.match(ui, /does not change tolerances, infer restraint subtypes, or publish SUPPORT to StagedJSON/i);
assert.match(exporter, /installFbxTayaSupportQualification/);
assert.match(exporter, /installFbxTayaSupportQualification\(container\)/);
assert.match(tab, /fbx-zone-package-export\.js\?v=20260731-fbx-taya-support-qualification-1/);
assert.doesNotMatch([source, report, session, ui].join('\n'),
  /Math\.random|Date\.now|localeCompare|nearest[- ]pipe|restraintSubtypeEvaluated: true/);
console.log('test-taya-support-ui-static: PASS');
