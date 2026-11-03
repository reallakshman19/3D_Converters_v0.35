import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createAivAssumptionAcceptance,
  isAivAssumptionAcceptanceCurrent,
} from '../tabs/vibration-aiv-assumption-acceptance.js';
import { buildLoadedAivD23Benchmark } from '../tabs/vibration-aiv-benchmarks.js';
import { renderAivFlareNetworkAuthoringHtml } from '../tabs/vibration-aiv-flare-network-view.js';
import { renderAivInputWorkspaceHtml } from '../tabs/vibration-aiv-input-view.js';
import { renderAivQualificationWorkspaceHtml } from '../tabs/vibration-aiv-qualification-view.js';
import { renderAivReadinessPanelHtml } from '../tabs/vibration-aiv-readiness-view.js';
import { isAivScreeningReady } from '../tabs/vibration-aiv-screening-gate.js';
import { createInitialAivQualificationState } from '../tabs/vibration-aiv-state.js';
import {
  aivUiFocusKey,
  captureAivUiContext,
  restoreAivUiContext,
} from '../tabs/vibration-aiv-ui-context.js';
import { loadAivSmallFlareMock } from '../tabs/vibration-aiv-workspace-loaders.js';

function benchmarkState() {
  const state = createInitialAivQualificationState();
  const loaded = buildLoadedAivD23Benchmark();
  state.benchmark.loaded = loaded.benchmark;
  state.tables = { ...loaded.tables };
  state.topology = loaded.topology;
  state.topologyInput = {
    format: 'PARSED_EXCHANGE',
    data: loaded.topology,
    sourceFileName: loaded.topology.sourceFileName,
  };
  return state;
}

function assumptionResolution(value = '10') {
  return {
    assumptionCount: 1,
    assumptions: [{
      tableKind: 'sources', rowIndex: 0, column: 'Mass Flow', assumedValue: value,
      profilePath: 'source.massFlow', reason: 'MISSING_INPUT_DEFAULTED',
    }],
  };
}

function readinessState(counts) {
  return {
    readinessEnvelope: { readiness: { counts, rows: [] } },
    assumptionResolution: { assumptionCount: 0, assumptions: [] },
    assumptionAcceptance: null,
  };
}

function fakeContainer(groups, members = []) {
  return {
    querySelectorAll: (selector) => groups[selector] ?? [],
    contains: (element) => members.includes(element),
  };
}

function fakeTab(id, selected = false) {
  const attrs = new Map([['aria-selected', selected ? 'true' : 'false']]);
  return {
    dataset: { aivDetailTab: id },
    getAttribute: (name) => attrs.get(name) ?? null,
    setAttribute: (name, value) => attrs.set(name, value),
  };
}

function fakeDetail(key, tabs = [], panels = []) {
  return {
    hidden: false,
    dataset: { aivCanvasAssumptionDetail: key },
    querySelectorAll: (selector) => selector === '[data-aiv-detail-tab]' ? tabs : panels,
  };
}

test('AIV workbench presents bounded screening authority before secondary qualification evidence', () => {
  const html = renderAivQualificationWorkspaceHtml(createInitialAivQualificationState());
  assert.match(html, /EI AVIFF · screening workbench/);
  assert.match(html, /SCREENING QUALIFIED/);
  assert.match(html, /Authority scope: Assessment LOF only/);
  assert.match(html, /bounded release envelope/);
  assert.match(html, /not design approval/);
  assert.match(html, /aivq-banner is-qualified/);
  assert.match(html, /data-aiv-file="eit"/);
  assert.match(html, /Import EI \.eit/);
  assert.match(html, /Qualification evidence & method trace/);
  assert.doesNotMatch(html, /TABLE\/IMPORT MODE ACTIVE/);
  assert.ok(html.indexOf('Start an AIV assessment') < html.indexOf('AIV result scopes'));
  assert.ok(html.indexOf('AIV result scopes') < html.indexOf('Qualification evidence & method trace'));
});

test('mock flare entry point is wired and EIT export remains fail-closed until screening succeeds', () => {
  const state = createInitialAivQualificationState();
  let html = renderAivInputWorkspaceHtml(state);
  assert.match(html, /data-aiv-action="load-mock-flare-network"/u);
  assert.match(html, />Load mock flare network</u);
  assert.match(html, /2 RVs → 4 in subheader → 8 in header/u);
  assert.match(html, /data-aiv-action="export-eit" disabled/u);

  let loadedNetwork = null;
  state.assumptionProfileModified = true;
  loadAivSmallFlareMock(state, (network) => { loadedNetwork = network; });
  assert.equal(state.assumptionProfileModified, false);
  assert.equal(loadedNetwork.networkId, 'SMALL-FLARE-2RV-SUBHEADER-001');
  assert.equal(loadedNetwork.nodes.filter((node) => node.kind === 'SOURCE').length, 2);

  state.screeningResult = { ok: true };
  html = renderAivInputWorkspaceHtml(state);
  assert.match(html, /data-aiv-action="export-eit">Export current EI \.eit/u);
  const controllerSource = readFileSync(new URL('../tabs/vibration-aiv-qualification-tab.js', import.meta.url), 'utf8');
  assert.match(controllerSource, /action === 'load-mock-flare-network'\) loadAivSmallFlareMock\(state, applyFlareNetwork\)/u);
  assert.match(controllerSource, /action === 'export-eit'\) execution\.exportEit\(\)/u);
});

test('relationship canvas is first-class for non-flare benchmark inputs', () => {
  const html = renderAivQualificationWorkspaceHtml(benchmarkState());
  const canvasIndex = html.indexOf('AIV relationship canvas');
  const flareIndex = html.indexOf('Flare network authoring');
  assert.ok(canvasIndex >= 0, 'benchmark input should render relationship canvas');
  assert.ok(flareIndex >= 0, 'optional flare authoring disclosure should remain available');
  assert.ok(canvasIndex < flareIndex, 'relationship canvas must not be nested under flare authoring');
  assert.match(html, /data-aiv-disclosure-key="flare-network-authoring"/);
});

test('secondary engineering tools are progressive disclosures rather than equal-weight page sections', () => {
  const html = renderAivQualificationWorkspaceHtml(createInitialAivQualificationState());
  assert.match(html, /data-aiv-disclosure-key="flare-network-authoring"/);
  assert.match(html, /data-aiv-disclosure-key="benchmark-assumptions"/);
  assert.match(html, /data-aiv-disclosure-key="working-data-tables"/);
  assert.match(html, /data-aiv-disclosure-key="advanced-imports"/);
  assert.match(html, /data-aiv-disclosure-key="qualification-evidence"/);
});

test('assumption acceptance is bound to the exact resolved assumption set', () => {
  const resolution = assumptionResolution('10');
  const acceptance = createAivAssumptionAcceptance(resolution);
  assert.equal(acceptance.assumptionCount, 1);
  assert.match(acceptance.fingerprint, /^fnv1a32:/u);
  assert.equal(isAivAssumptionAcceptanceCurrent(resolution, acceptance), true);
  assert.equal(isAivAssumptionAcceptanceCurrent(assumptionResolution('11'), acceptance), false);
  assert.equal(isAivAssumptionAcceptanceCurrent({ assumptionCount: 0, assumptions: [] }, null), true);
});

test('screening gate requires at least one READY relationship and rejects empty or all-N/A envelopes', () => {
  assert.equal(isAivScreeningReady(readinessState({
    rows: 0, readyForQualification: 0, methodGap: 0, notReady: 0, notApplicable: 0,
  })), false);
  assert.equal(isAivScreeningReady(readinessState({
    rows: 2, readyForQualification: 0, methodGap: 0, notReady: 0, notApplicable: 2,
  })), false);
  assert.equal(isAivScreeningReady(readinessState({
    rows: 3, readyForQualification: 1, methodGap: 0, notReady: 0, notApplicable: 2,
  })), true);
  assert.equal(isAivScreeningReady(readinessState({
    rows: 2, readyForQualification: 1, methodGap: 0, notReady: 1, notApplicable: 0,
  })), false);
});

test('readiness UI keeps Run AIV screening disabled for all-N/A relationships', () => {
  const state = createInitialAivQualificationState();
  state.readinessEnvelope = {
    readiness: {
      counts: { rows: 2, readyForQualification: 0, methodGap: 0, notReady: 0, notApplicable: 2 },
      rows: [
        { status: 'NOT_APPLICABLE', rowKey: 'R1' },
        { status: 'NOT_APPLICABLE', rowKey: 'R2' },
      ],
    },
  };
  const html = renderAivReadinessPanelHtml(state);
  assert.match(html, /data-aiv-action="run-screening" disabled/u);
});

test('screening stays disabled until current resolved assumptions are explicitly accepted', () => {
  const state = createInitialAivQualificationState();
  state.readinessEnvelope = {
    readiness: { counts: { rows: 1, readyForQualification: 1, methodGap: 0, notReady: 0, notApplicable: 0 }, rows: [] },
  };
  state.assumptionResolution = assumptionResolution();
  let html = renderAivReadinessPanelHtml(state);
  assert.match(html, /Assumption review required before screening/u);
  assert.match(html, /data-aiv-action="accept-assumptions"/u);
  assert.match(html, /data-aiv-action="run-screening" disabled/u);

  state.assumptionAcceptance = createAivAssumptionAcceptance(state.assumptionResolution);
  html = renderAivReadinessPanelHtml(state);
  assert.match(html, /Assumptions accepted for this run/u);
  assert.match(html, /ACCEPTED/u);
  assert.match(html, /data-aiv-action="run-screening">Run AIV screening/u);
});

test('UI context preserves disclosure, table scroll, detail tab and edit focus', () => {
  const oldDisclosure = { dataset: { aivDisclosureKey: 'working-data-tables' }, open: true };
  const oldScroll = { dataset: { aivScrollKey: 'table-sources' }, scrollTop: 17, scrollLeft: 420 };
  const oldFocus = { dataset: { aivTableCell: 'sources', aivEditRow: '2', aivEditColumn: '5' } };
  const oldTabs = [fakeTab('summary'), fakeTab('calculation', true)];
  const oldDetail = fakeDetail('SOURCE:SRC-1:CASE-1', oldTabs, []);
  const oldContainer = fakeContainer({
    '[data-aiv-disclosure-key]': [oldDisclosure],
    '[data-aiv-scroll-key]': [oldScroll],
    '[data-aiv-canvas-assumption-detail]': [oldDetail],
  }, [oldFocus]);
  const context = captureAivUiContext(oldContainer, oldFocus);

  const newDisclosure = { dataset: { aivDisclosureKey: 'working-data-tables' }, open: false };
  const newScroll = { dataset: { aivScrollKey: 'table-sources' }, scrollTop: 0, scrollLeft: 0 };
  const newFocus = {
    dataset: { aivTableCell: 'sources', aivEditRow: '2', aivEditColumn: '5' },
    focusOptions: null,
    focus(options) { this.focusOptions = options ?? {}; },
  };
  const newTabs = [fakeTab('summary', true), fakeTab('calculation')];
  const newPanels = [
    { dataset: { aivDetailPanel: 'summary' }, hidden: false },
    { dataset: { aivDetailPanel: 'calculation' }, hidden: true },
  ];
  const newDetail = fakeDetail('SOURCE:SRC-1:CASE-1', newTabs, newPanels);
  const newContainer = fakeContainer({
    '[data-aiv-disclosure-key]': [newDisclosure],
    '[data-aiv-scroll-key]': [newScroll],
    '[data-aiv-canvas-assumption-detail]': [newDetail],
    '[data-aiv-table-cell],[data-aiv-assumption]': [newFocus],
  });

  restoreAivUiContext(newContainer, context);
  assert.equal(newDisclosure.open, true);
  assert.equal(newScroll.scrollTop, 17);
  assert.equal(newScroll.scrollLeft, 420);
  assert.deepEqual(newFocus.focusOptions, { preventScroll: true });
  assert.equal(newTabs[0].getAttribute('aria-selected'), 'false');
  assert.equal(newTabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(newPanels[0].hidden, true);
  assert.equal(newPanels[1].hidden, false);
  assert.equal(aivUiFocusKey(newFocus), 'table:sources:2:5');
});

test('flare authoring no longer injects a competing local style block', () => {
  const state = createInitialAivQualificationState();
  const html = renderAivFlareNetworkAuthoringHtml(state);
  assert.doesNotMatch(html, /<style>/);
  assert.match(html, /Working-table mode/);
  assert.match(html, /connectivity from graph/);
  assert.match(html, /explicit engineering length/);
});
