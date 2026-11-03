import { analyzeSourceText } from './source-structure.js';
import { createSourceEnvelope, serializeSourceEnvelope, summarizeSourceEnvelope } from './source-envelope.js';
import { acceptAuthoritativeText, clearWorkbenchState, createWorkbenchState, readSourceFile, selectSourceKind } from './source-authority.js';
import { collectSourceGraphElements, createSourceGraphController } from './graph-controller.js';
import { collectMasterRegistryElements, createMasterRegistryController } from './master-controller.js';
import { collectExtractionTesterElements, createExtractionTesterController } from './extraction-controller.js';
import { collectEvidenceLedgerElements, createEvidenceLedgerController } from './evidence-controller.js';
import { collectMasterCandidateComparisonElements, createMasterCandidateComparisonController } from './comparison-controller.js';
import { collectComparisonReviewElements, createComparisonReviewController } from './review-controller.js';
import { collectEnrichmentProposalElements, createEnrichmentProposalController } from './proposal-controller.js';
import { renderWorkbenchMarkup } from './workbench-template.js';
import { renderEvidenceLedgerMarkup } from './evidence-template.js';
import { renderMasterCandidateComparisonMarkup } from './comparison-template.js';
import { renderComparisonReviewMarkup } from './review-template.js';
import { renderEnrichmentProposalMarkup } from './proposal-template.js';

const IDS = [
  'file','kind','source-text','generate','download','clear','effective-kind','detected-kind',
  'source-name','origin','revision','byte-length','root-shape','status','content-hash',
  'source-file-id','errors','warnings',
];

function collectElements(container) {
  return Object.fromEntries(IDS.map((id) => [id, container.querySelector(`#uew-${id}`)]));
}

function setText(element, value) {
  if (element) element.textContent = value === '' || value == null ? '—' : String(value);
}

function renderFindings(list, findings) {
  if (!list) return;
  const documentRef = list.ownerDocument; const values = findings.length ? findings : ['None'];
  list.replaceChildren(...values.map((text) => {
    const item = documentRef.createElement('li'); item.textContent = text; return item;
  }));
}

function sourceSnapshot(state, ParserCtor) {
  const analysis = analyzeSourceText(state.sourceText, state.selectedKind, ParserCtor);
  return {
    effectiveKind: analysis.effectiveKind, detectedKind: analysis.detectedKind,
    sourceName: state.sourceName, origin: state.origin, revision: state.revision,
    byteLength: new TextEncoder().encode(state.normalizedText).byteLength,
    rootShape: analysis.rootName || analysis.rootShape || '', validation: analysis,
  };
}

function renderSummary(context) {
  const summary = context.state.envelope
    ? summarizeSourceEnvelope(context.state.envelope, context.ParserCtor)
    : sourceSnapshot(context.state, context.ParserCtor);
  const validation = summary.validation || { ok: false, errors: [], warnings: [] };
  const fields = [
    ['effectiveKind','effective-kind'],['detectedKind','detected-kind'],['sourceName','source-name'],
    ['origin','origin'],['revision','revision'],['byteLength','byte-length'],['rootShape','root-shape'],
    ['contentHash','content-hash'],['sourceFileId','source-file-id'],
  ];
  fields.forEach(([key, id]) => setText(context.elements[id], summary[key]));
  setText(context.elements.status, context.state.envelope ? (validation.ok ? 'Valid' : 'Invalid') : 'Not generated');
  renderFindings(context.elements.errors, validation.errors || []); renderFindings(context.elements.warnings, validation.warnings || []);
  context.elements.download.disabled = !context.state.envelope?.validation?.ok; context.graph?.syncAvailability();
}

function addListener(context, element, type, handler) {
  element.addEventListener(type, handler); context.listeners.push([element, type, handler]);
}

function revokeUrls(context) {
  context.objectUrls.forEach((url) => context.dependencies.urlApi.revokeObjectURL(url)); context.objectUrls.clear();
}

function invalidateGraph(context) {
  context.graph.invalidate(); context.comparison?.syncUpstream(); context.review?.syncUpstream();
}

async function handleFileChange(context) {
  const file = context.elements.file.files?.[0]; if (!file) return;
  invalidateGraph(context); const requestId = ++context.fileRequestId;
  const loaded = await readSourceFile(file, context.dependencies.readFile);
  if (context.disposed || requestId !== context.fileRequestId) return;
  context.state = acceptAuthoritativeText(context.state, { ...loaded, origin: 'file' });
  context.elements['source-text'].value = context.state.sourceText; renderSummary(context);
}

function handleSourceInput(context) {
  invalidateGraph(context);
  context.state = acceptAuthoritativeText(context.state, {
    sourceText: context.elements['source-text'].value,
    origin: context.state.pendingPaste ? 'paste' : 'editor',
  });
  renderSummary(context);
}

function handleKindChange(context) {
  invalidateGraph(context); context.state = selectSourceKind(context.state, context.elements.kind.value); renderSummary(context);
}

async function handleGenerate(context) {
  const snapshot = context.state; const requestId = ++context.generationRequestId;
  const analysis = analyzeSourceText(snapshot.sourceText, snapshot.selectedKind, context.ParserCtor);
  const envelope = await createSourceEnvelope({ ...snapshot, sourceKind: analysis.effectiveKind, analysis }, context.dependencies);
  const stale = requestId !== context.generationRequestId
    || snapshot.normalizedText !== context.state.normalizedText || snapshot.selectedKind !== context.state.selectedKind;
  if (context.disposed || stale) return;
  context.state = { ...context.state, envelope }; renderSummary(context);
}

function handleDownload(context) {
  if (!context.state.envelope?.validation?.ok) return;
  const blob = new context.dependencies.BlobCtor([serializeSourceEnvelope(context.state.envelope)], { type: 'application/json' });
  const url = context.dependencies.urlApi.createObjectURL(blob); context.objectUrls.add(url);
  const stem = String(context.state.sourceName || 'source').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-');
  context.dependencies.triggerDownload(url, `${stem || 'source'}.source-envelope.json`);
}

function handleClear(context) {
  revokeUrls(context); invalidateGraph(context); context.state = clearWorkbenchState();
  context.elements.file.value = ''; context.elements.kind.value = 'auto';
  context.elements['source-text'].value = ''; renderSummary(context);
}

function evidenceUpstream(context) {
  const extraction = context.extraction?.getState() || {};
  return { graph: context.graph?.getState().graph || null, config: extraction.config || null, run: extraction.run || null };
}

function comparisonUpstream(context) {
  const master = context.master?.getState() || {}; const evidence = context.evidence?.getState() || {};
  return {
    graph: context.graph?.getState().graph || null, ledger: evidence.ledger || null,
    attachmentSet: master.attachmentSet || null, registry: master.registry || { datasets: [] },
  };
}

function reviewUpstream(context) {
  const comparison = context.comparison?.getState() || {}; const upstream = comparisonUpstream(context);
  return { ...upstream, config: comparison.config || null, run: comparison.run || null };
}
function proposalUpstream(context) {
  const review = context.review?.getState() || {};
  return { ...reviewUpstream(context), reviewLedger: review.ledger || null };
}
function createMasterBridge(context, dependencies) {
  if (dependencies.masterElements?.['master-import']) {
    return createMasterRegistryController(dependencies.masterElements, dependencies, () => context.graph?.getState().graph || null);
  }
  const empty = { registry: { datasets: [] }, attachmentSet: null };
  return { getState: () => empty, syncGraph() {}, cleanup() {} };
}

function createExtractionBridge(context, dependencies) {
  if (!dependencies.extractionElements?.['extract-config-build']) {
    const empty = { config: null, run: null, ruleDrafts: [] };
    return { getState: () => empty, syncGraph() {}, cleanup() {} };
  }
  const scoped = {
    ...dependencies,
    onExtractionChange: (state) => {
      dependencies.onExtractionChange?.(state); context.evidence?.syncUpstream();
      context.comparison?.syncUpstream(); context.review?.syncUpstream();
    },
  };
  return createExtractionTesterController(dependencies.extractionElements, scoped, () => context.graph?.getState() || null);
}

function createEvidenceBridge(context, dependencies) {
  if (dependencies.evidenceElements?.['evidence-build']) {
    const scoped = {
      ...dependencies,
      onEvidenceChange: (state) => {
        dependencies.onEvidenceChange?.(state); context.comparison?.syncUpstream(); context.review?.syncUpstream();
      },
    };
    return createEvidenceLedgerController(dependencies.evidenceElements, scoped, () => evidenceUpstream(context));
  }
  const empty = { ledger: null, trace: null, status: 'Not built' };
  return { getState: () => empty, syncUpstream() {}, cleanup() {} };
}

function createGraphBridge(context, dependencies) {
  if (!dependencies.graphElements?.['graph-build']) {
    const empty = { graph: null, status: 'Not built', expandedIds: new Set(), selectedEntityId: '', filter: '' };
    return {
      getState: () => empty, syncAvailability() {},
      invalidate() {
        context.master?.syncGraph(null); context.extraction?.syncGraph(null);
        context.evidence?.syncUpstream(); context.comparison?.syncUpstream(); context.review?.syncUpstream();
      },
      cleanup() {},
    };
  }
  const scoped = {
    ...dependencies,
    onGraphChange: (graph) => {
      context.master?.syncGraph(graph); context.extraction?.syncGraph(graph);
      context.evidence?.syncUpstream(); context.comparison?.syncUpstream(); context.review?.syncUpstream();
    },
  };
  return createSourceGraphController(dependencies.graphElements, scoped, () => context.state.envelope);
}

function createComparisonBridge(context, dependencies) {
  if (dependencies.comparisonElements?.['comparison-add-binding']) {
    const scoped = {
      ...dependencies,
      onComparisonChange: (state) => {
        dependencies.onComparisonChange?.(state); void context.review?.syncUpstream();
      },
    };
    return createMasterCandidateComparisonController(
      dependencies.comparisonElements, scoped, () => comparisonUpstream(context),
    );
  }
  const empty = { config: null, run: null, bindingDrafts: [] };
  return { getState: () => empty, syncUpstream() {}, cleanup() {} };
}

function createReviewBridge(context, dependencies) {
  if (dependencies.reviewElements?.['review-build']) {
    const scoped = { ...dependencies, onReviewChange: (state) => {
      dependencies.onReviewChange?.(state); void context.proposal?.syncUpstream();
    } };
    return createComparisonReviewController(dependencies.reviewElements, scoped, () => reviewUpstream(context));
  }
  const empty = { ledger: null, drafts: new Map(), status: 'Not ready' };
  return { getState: () => empty, syncUpstream() {}, cleanup() {} };
}
function createProposalBridge(context, dependencies) {
  if (dependencies.proposalElements?.['proposal-build']) return createEnrichmentProposalController(
    dependencies.proposalElements, dependencies, () => proposalUpstream(context),
  );
  const empty = { proposalSet: null, status: 'Not ready' };
  return { getState: () => empty, syncUpstream() {}, cleanup() {} };
}

function bindListeners(context) {
  const e = context.elements;
  addListener(context, e.file, 'change', () => handleFileChange(context));
  addListener(context, e['source-text'], 'paste', () => { context.state = { ...context.state, pendingPaste: true }; });
  addListener(context, e['source-text'], 'input', () => handleSourceInput(context));
  addListener(context, e.kind, 'change', () => handleKindChange(context));
  addListener(context, e.generate, 'click', () => handleGenerate(context));
  addListener(context, e.download, 'click', () => handleDownload(context));
  addListener(context, e.clear, 'click', () => handleClear(context));
}

export function createWorkbenchController(elements, dependencies = {}) {
  const context = {
    elements, dependencies, ParserCtor: dependencies.ParserCtor || globalThis.DOMParser,
    state: createWorkbenchState(), listeners: [], objectUrls: new Set(), disposed: false,
    fileRequestId: 0, generationRequestId: 0, graph: null, master: null,
    extraction: null, evidence: null, comparison: null, review: null, proposal: null,
  };
  context.master = createMasterBridge(context, dependencies); context.evidence = createEvidenceBridge(context, dependencies);
  context.extraction = createExtractionBridge(context, dependencies); context.graph = createGraphBridge(context, dependencies);
  context.comparison = createComparisonBridge(context, dependencies); context.review = createReviewBridge(context, dependencies);
  context.proposal = createProposalBridge(context, dependencies);
  const graph = context.graph.getState().graph;
  context.master.syncGraph(graph); context.extraction.syncGraph(graph); context.evidence.syncUpstream();
  context.comparison.syncUpstream(); void context.review.syncUpstream(); void context.proposal.syncUpstream(); bindListeners(context); renderSummary(context);
  return {
    getState: () => context.state, getGraphState: () => context.graph.getState(),
    getMasterState: () => context.master.getState(), getExtractionState: () => context.extraction.getState(),
    getEvidenceState: () => context.evidence.getState(), getComparisonState: () => context.comparison.getState(),
    getReviewState: () => context.review.getState(), getProposalState: () => context.proposal.getState(),
    clear: () => handleClear(context),
    cleanup() {
      if (context.disposed) return; context.disposed = true;
      context.fileRequestId += 1; context.generationRequestId += 1;
      context.listeners.splice(0).forEach(([element, type, handler]) => element.removeEventListener(type, handler));
      revokeUrls(context); context.graph.cleanup(); context.master.cleanup(); context.extraction.cleanup();
      context.evidence.cleanup(); context.comparison.cleanup(); context.review.cleanup(); context.proposal.cleanup();
    },
  };
}
function browserDependencies(options = {}) {
  const documentRef = options.document || globalThis.document;
  return {
    ...options, document: documentRef, BlobCtor: options.BlobCtor || globalThis.Blob,
    urlApi: options.urlApi || globalThis.URL,
    triggerDownload: options.triggerDownload || ((url, name) => {
      const anchor = documentRef.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
    }),
  };
}

export function renderUniversalEnrichmentWorkbench(container, options = {}) {
  const dependencies = browserDependencies(options);
  container.innerHTML = `${renderWorkbenchMarkup()}${renderEvidenceLedgerMarkup()}${renderMasterCandidateComparisonMarkup()}${renderComparisonReviewMarkup()}${renderEnrichmentProposalMarkup()}`;
  dependencies.graphElements = collectSourceGraphElements(container); dependencies.masterElements = collectMasterRegistryElements(container);
  dependencies.extractionElements = collectExtractionTesterElements(container); dependencies.evidenceElements = collectEvidenceLedgerElements(container);
  dependencies.comparisonElements = collectMasterCandidateComparisonElements(container); dependencies.reviewElements = collectComparisonReviewElements(container);
  dependencies.proposalElements = collectEnrichmentProposalElements(container);
  const controller = createWorkbenchController(collectElements(container), dependencies);
  const cleanup = () => { controller.cleanup(); container.replaceChildren(); };
  cleanup.controller = controller; return cleanup;
}
