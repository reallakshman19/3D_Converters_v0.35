import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPrimaryFittingReviewModel,
  unavailablePrimaryFittingReview,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/primary-fitting/review-model.js';
import {
  installPrimaryFittingReviewUi,
  renderPrimaryFittingReviewUi,
  setPrimaryFittingDownloadAvailability,
} from '../../tabs/model-converters/converters/fbx/fitting-kernels/primary-fitting/review-ui.js';

class FakeNode {
  constructor(tag, ownerDocument) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.disabled = false;
    this.textContent = '';
    this.className = '';
    this.parentNode = null;
  }

  append(...nodes) { for (const node of nodes) this.appendChild(node); }
  appendChild(node) { this.children.push(node); node.parentNode = this; return node; }
  removeChild(node) { this.children.splice(this.children.indexOf(node), 1); return node; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener() {}
  get firstChild() { return this.children[0] || null; }
}

function fakeDocument() {
  const documentRef = { createElement: (tag) => new FakeNode(tag, documentRef) };
  return documentRef;
}

function commonRecord(id, disposition = 'ADMITTED') {
  return {
    managedRecordId: `BRANCH-1::${id}`,
    branchId: 'BRANCH-1',
    reference: id,
    displayName: id,
    sourceOccurrenceId: `occ:${id}`,
    disposition,
    blockingReasons: disposition === 'ADMITTED' ? [] : ['NO_EXACT_SOURCE_BINDING'],
    ports: [],
  };
}

function elbowEvidence() {
  return {
    schema: 'FbxElbowPortEvidence.v1',
    managedElbowCount: 2,
    admittedElbowCount: 1,
    blockedElbowCount: 1,
    elbowEvidence: [
      {
        ...commonRecord('ELBOW-1'),
        ports: [{ diameterMm: 100 }, { diameterMm: 100 }],
        bend: { method: 'TANGENT_INTERSECTION_CIRCULAR_ARC_V1', angleDeg: 90, radiusMm: 150 },
      },
      { ...commonRecord('ELBOW-2', 'BLOCKED'), bend: null },
    ],
  };
}

function teeEvidence() {
  return {
    schema: 'FbxTeePortEvidence.v1',
    managedTeeCount: 1,
    admittedTeeCount: 1,
    blockedTeeCount: 0,
    teeEvidence: [{
      ...commonRecord('TEE-1'),
      ports: [
        { role: 'RUN_NEGATIVE', diameterMm: 100 },
        { role: 'RUN_POSITIVE', diameterMm: 100 },
        { role: 'BRANCH', diameterMm: 50 },
      ],
      tee: { method: 'RUN_PAIR_INTERSECTION_V1', runSpanMm: 200, branchAngleDeg: 90 },
    }],
  };
}

function reducerEvidence() {
  return {
    schema: 'FbxReducerPortEvidence.v1',
    managedReducerCount: 1,
    admittedReducerCount: 1,
    blockedReducerCount: 0,
    reducerEvidence: [{
      ...commonRecord('REDUCER-1'),
      ports: [
        { role: 'LARGE_END', diameterMm: 100 },
        { role: 'SMALL_END', diameterMm: 50 },
      ],
      reducer: { method: 'AXIAL_RADIUS_TAPER_V1', axialLengthMm: 120, halfAngleDeg: 5.946863 },
    }],
  };
}

async function main() {
  const model = buildPrimaryFittingReviewModel({
    elbowEvidence: elbowEvidence(),
    teeEvidence: teeEvidence(),
    reducerEvidence: reducerEvidence(),
  });
  assert.equal(model.status, 'PARTIAL');
  assert.equal(model.managedCount, 4);
  assert.equal(model.admittedCount, 3);
  assert.equal(model.blockedCount, 1);
  assert.deepEqual(model.familySummary.map((item) => item.family), ['ELBOW', 'TEE', 'REDUCER']);
  assert.equal(model.rows[0].family, 'ELBOW');
  assert.equal(model.rows[0].angleDeg, 90);
  assert.equal(model.rows[2].family, 'TEE');
  assert.equal(model.rows[2].secondaryDiameterMm, 50);
  assert.equal(model.rows[3].family, 'REDUCER');
  assert.equal(model.rows[3].axialLengthMm, 120);
  assert.equal(unavailablePrimaryFittingReview().status, 'MAPPING_REQUIRED');

  const documentRef = fakeDocument(), wrap = new FakeNode('div', documentRef);
  const view = installPrimaryFittingReviewUi(wrap);
  renderPrimaryFittingReviewUi(view, model);
  assert.match(view.summary.textContent, /4 mapped, 3 admitted, 1 blocked/);
  assert.equal(view.tableHost.children[0].tagName, 'TABLE');
  setPrimaryFittingDownloadAvailability(view, { elbow: true, tee: false, reducer: true });
  assert.equal(view.downloads.elbow.disabled, false);
  assert.equal(view.downloads.tee.disabled, true);
  assert.equal(view.downloads.reducer.disabled, false);

  const root = new URL('../../', import.meta.url);
  const paths = [
    'tabs/model-converters/converters/fbx/zone-geometry/analyse-zone.js',
    'tabs/model-converters/converters/fbx/zone-geometry/analysis-controller.js',
    'tabs/model-converters/converters/fbx/zone-geometry/zone-review-panels.js',
    'tabs/model-converters/converters/fbx/zone-geometry/zone-artifact-actions.js',
    'tabs/model-converters/converters/fbx/zone-geometry/zone-downloads.js',
    'tabs/model-converters/converters/fbx/zone-geometry/mapped-stage-output.js',
  ];
  const files = await Promise.all(paths.map((path) => readFile(new URL(path, root), 'utf8')));
  for (const builder of ['buildElbowPortEvidence', 'buildTeePortEvidence', 'buildReducerPortEvidence']) {
    assert.match(files[0], new RegExp(builder));
  }
  assert.match(files[0], /buildPrimaryFittingReviewModel/);
  assert.match(files[0], /elbowJson: optionalJson/);
  assert.match(files[0], /teeJson: optionalJson/);
  assert.match(files[0], /reducerJson: optionalJson/);
  assert.match(files[1], /primaryFittingMessage/);
  assert.match(files[1], /elbowJson: result\.elbowJson/);
  assert.match(files[2], /installPrimaryFittingReviewUi/);
  assert.match(files[2], /onDownload\('elbow'\)/);
  assert.match(files[3], /elbow: 'elbowJson'/);
  assert.match(files[3], /buildFbxReducerDownloadName/);
  assert.match(files[4], /FbxElbowPortEvidence\.v1\.json/);
  assert.match(files[4], /FbxTeePortEvidence\.v1\.json/);
  assert.match(files[4], /FbxReducerPortEvidence\.v1\.json/);
  assert.match(files[5], /selected-zone component evidence review/);
  assert.doesNotMatch(files[0], /engineeringAttributesInferred\s*:\s*true/);
  console.log('PASS test-primary-fitting-production-capability');
}

await main();
