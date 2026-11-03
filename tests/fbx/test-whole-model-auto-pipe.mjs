import assert from 'node:assert/strict';
import { runFbxWholeModelAutoPipe } from '../../tabs/model-converters/converters/fbx/zone-geometry/whole-model-auto-pipe.js';

function branch(ref, childId = `${ref}-PIPE`, cref = null) {
  return { type: 'BRANCH', id: ref, name: 'FBX Mapping Branch 1',
    attributes: { REF: ref }, children: [{ type: 'PIPE', id: childId, name: childId,
      attributes: { REF: childId, ...(cref ? { CREF: cref } : {}) }, children: [] }] };
}
function fakeAnalyse(byZone, activity = null) {
  return async ({ zoneId }) => {
    const entry = byZone[zoneId] || {};
    if (activity) {
      activity.active += 1;
      activity.maximum = Math.max(activity.maximum, activity.active);
      await new Promise((resolve) => setTimeout(resolve, entry.delay || 2));
      activity.active -= 1;
    }
    if (entry.throws) throw new Error(entry.throws);
    return { autoPipe: {
      status: entry.status || 'BLOCKED_AUTO_PIPE_CLASSIFICATION',
      stagedJsonText: entry.status === 'STAGEDJSON_PASS'
        ? JSON.stringify(entry.branches) : null,
    }, counts: { admittedPipes: entry.admittedPipes || 0 } };
  };
}

{
  const analyse = fakeAnalyse({
    'occ:2': { status: 'STAGEDJSON_PASS', branches: [branch('FBX-BRANCH-0001', 'PIPE-2')], admittedPipes: 1 },
    'occ:1': { status: 'STAGEDJSON_PASS', branches: [branch('FBX-BRANCH-0001', 'PIPE-1')], admittedPipes: 1 },
  });
  const result = await runFbxWholeModelAutoPipe({
    zoneIds: ['occ:2', 'occ:1'], analyse,
  });
  assert.equal(result.conversionStatus, 'STAGEDJSON_PASS');
  assert.equal(result.counts.totalZones, 2);
  assert.equal(result.counts.passedZones, 2);
  assert.equal(result.counts.branches, 2);
  const output = JSON.parse(result.stagedJsonText);
  assert.equal(new Set(output.map((item) => item.attributes.REF)).size, 2,
    'per-zone local branch identities must be namespaced');
  assert.deepEqual(output.map((item) => item.attributes.sourceZoneId),
    ['occ:1', 'occ:2'], 'branches merge in zoneId order');
  assert.deepEqual(result.duplicateIdentifiers, []);
  assert.deepEqual(result.unresolvedCrefs, []);
}

{
  const analyse = fakeAnalyse({
    'occ:1': { status: 'STAGEDJSON_PASS', branches: [branch('B-1', 'PIPE-1')] },
    'occ:2': { status: 'BLOCKED_AUTO_PIPE_CLASSIFICATION' },
  });
  const result = await runFbxWholeModelAutoPipe({
    zoneIds: ['occ:1', 'occ:2'], analyse,
  });
  assert.equal(result.conversionStatus, 'STAGEDJSON_PARTIAL_PASS');
  assert.equal(result.counts.branches, 1);
  assert.equal(result.counts.blockedZones, 1);
  const blockedReport = result.zoneReports.find((item) => item.zoneId === 'occ:2');
  assert.equal(blockedReport.status, 'BLOCKED_AUTO_PIPE_CLASSIFICATION');
}

{
  const analyse = fakeAnalyse({
    'occ:1': { status: 'BLOCKED_AUTO_PIPE_CLASSIFICATION' },
    'occ:2': { status: 'BLOCKED_AUTO_PIPE_CLASSIFICATION' },
  });
  const result = await runFbxWholeModelAutoPipe({
    zoneIds: ['occ:1', 'occ:2'], analyse,
  });
  assert.equal(result.conversionStatus, 'BLOCKED_WHOLE_MODEL_AUTO_PIPE');
  assert.equal(result.stagedJsonText, null);
  assert.equal(result.counts.branches, 0);
}

{
  const analyse = fakeAnalyse({
    'occ:1': { status: 'STAGEDJSON_PASS', branches: [branch('B-1', 'PIPE-COLLIDE')] },
    'occ:2': { status: 'STAGEDJSON_PASS', branches: [branch('B-2', 'PIPE-COLLIDE')] },
  });
  const result = await runFbxWholeModelAutoPipe({
    zoneIds: ['occ:1', 'occ:2'], analyse,
  });
  assert.equal(result.conversionStatus, 'BLOCKED_WHOLE_MODEL_AUTO_PIPE');
  assert.deepEqual(result.duplicateIdentifiers, ['PIPE-COLLIDE']);
}

{
  const analyse = fakeAnalyse({
    'occ:1': { status: 'STAGEDJSON_PASS', branches: [branch('B-1', 'PIPE-1')] },
    'occ:2': { throws: 'geometry worker exploded' },
  });
  const result = await runFbxWholeModelAutoPipe({
    zoneIds: ['occ:1', 'occ:2'], analyse,
  });
  assert.equal(result.conversionStatus, 'STAGEDJSON_PARTIAL_PASS');
  assert.equal(result.counts.errorZones, 1);
  const errored = result.zoneReports.find((item) => item.zoneId === 'occ:2');
  assert.equal(errored.status, 'ERROR');
  assert.equal(errored.error, 'geometry worker exploded');
}

{
  const result = await runFbxWholeModelAutoPipe({
    zoneIds: ['occ:1', 'occ:1'], analyse: fakeAnalyse({}),
  });
  assert.equal(result.conversionStatus, 'BLOCKED_WHOLE_MODEL_AUTO_PIPE');
  assert.match(result.blockingReasons[0], /duplicate zone identity/);
}

{
  const activity = { active: 0, maximum: 0 };
  const zones = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
    `occ:${index + 1}`, { status: 'BLOCKED_AUTO_PIPE_CLASSIFICATION', delay: 4 },
  ]));
  await runFbxWholeModelAutoPipe({
    zoneIds: Object.keys(zones), analyse: fakeAnalyse(zones, activity), concurrency: 3,
  });
  assert.ok(activity.maximum <= 3,
    `bounded concurrency exceeded: ${activity.maximum}`);
}

{
  let includeZonePackageInputs = null;
  await runFbxWholeModelAutoPipe({
    zoneIds: ['occ:1'],
    analyse: async (input) => {
      includeZonePackageInputs = input.includeZonePackageInputs;
      return { autoPipe: { status: 'BLOCKED_AUTO_PIPE_CLASSIFICATION' },
        counts: { admittedPipes: 0 } };
    },
  });
  assert.equal(includeZonePackageInputs, false,
    'whole-model orchestration must not prepare an export package for every zone');
}

{
  const result = await runFbxWholeModelAutoPipe({
    zoneIds: [], analyse: fakeAnalyse({}),
  });
  assert.equal(result.conversionStatus, 'BLOCKED_WHOLE_MODEL_AUTO_PIPE');
  assert.equal(result.counts.totalZones, 0);
}

console.log('test-whole-model-auto-pipe: PASS');
