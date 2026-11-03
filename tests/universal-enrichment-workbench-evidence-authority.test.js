import assert from 'node:assert/strict';
import test from 'node:test';
import { createEvidenceLedgerController } from '../tabs/universal-enrichment-workbench/evidence-controller.js';
import { evidenceFixtures } from './universal-enrichment-workbench-evidence-fixtures.test.js';

class FakeElement {
  constructor(ownerDocument) { this.ownerDocument = ownerDocument; this.listeners = new Map(); this.dataset = {}; this.style = {}; this.value = ''; this.textContent = ''; this.disabled = false; this.hidden = false; }
  addEventListener(type, handler) { const handlers = this.listeners.get(type) || new Set(); handlers.add(handler); this.listeners.set(type, handlers); }
  removeEventListener(type, handler) { this.listeners.get(type)?.delete(handler); }
  replaceChildren() {}
}
class FakeDocument { createElement() { return new FakeElement(this); } }

function elements() {
  const documentRef = new FakeDocument();
  const ids = ['evidence-build','evidence-ledger-download','evidence-trace-download','evidence-candidate-csv','evidence-rejected-csv','evidence-status','evidence-ledger-id','evidence-trace-id','evidence-entry-count','evidence-candidate-count','evidence-rejected-count','evidence-entity-count','evidence-field-count','evidence-errors','evidence-warnings','evidence-view','evidence-entity-filter','evidence-field-filter','evidence-search','evidence-ledger-list','evidence-ledger-count','evidence-ledger-prev','evidence-ledger-next','evidence-trace-tree','evidence-trace-count','evidence-trace-more','evidence-entry-details','evidence-trace-details'];
  const result = Object.fromEntries(ids.map((id) => [id, new FakeElement(documentRef)]));
  result['evidence-view'].value = 'candidates';
  return result;
}

function dependencies() {
  return { BlobCtor: Blob, urlApi: { createObjectURL() { return 'blob:1'; }, revokeObjectURL() {} }, triggerDownload() {} };
}

test('evidence build stays disabled for stale entity references', () => {
  const upstream = evidenceFixtures();
  upstream.run.results[0].entityId = 'missing-entity';
  const ui = elements();
  const controller = createEvidenceLedgerController(ui, dependencies(), () => upstream);
  assert.equal(ui['evidence-build'].disabled, true);
  controller.cleanup();
});

test('evidence build stays disabled when stored result evidence disagrees with current rule or entity', () => {
  const upstream = evidenceFixtures();
  upstream.run.results[0].fieldKey = 'other-field';
  upstream.run.results[1].sourcePath = '/wrong/path';
  const ui = elements();
  const controller = createEvidenceLedgerController(ui, dependencies(), () => upstream);
  assert.equal(ui['evidence-build'].disabled, true);
  controller.cleanup();
});
