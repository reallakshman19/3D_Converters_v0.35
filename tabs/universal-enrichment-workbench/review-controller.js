import { buildComparisonReviewCsv } from './review-csv.js';
import { normalizeComparisonReviewDraft, reviewSubjectKey } from './review-draft.js';
import {
  createComparisonReviewLedger, createComparisonReviewSubjects,
  serializeComparisonReviewLedger,
} from './review-ledger.js';
import { validateComparisonReviewAuthority } from './review-authority.js';
import {
  renderComparisonReviewPanel, REVIEW_MATCH_STEP,
} from './review-renderer.js';

const IDS = [
  'review-build','review-json-download','review-csv-download','review-status','review-ledger-id',
  'review-pending-count','review-confirmed-count','review-rejected-count','review-deferred-count',
  'review-view','review-entity-filter','review-field-filter','review-dataset-filter','review-status-filter',
  'review-search','review-subject-list','review-prev','review-next','review-visible-count','review-details',
  'review-disposition','review-selected-match','review-note','review-note-count','review-match-list',
  'review-match-count','review-match-more','review-errors','review-warnings',
];

export function collectComparisonReviewElements(container) {
  return Object.fromEntries(IDS.map((id) => [id, container.querySelector(`#uew-${id}`)]));
}

function initialState() {
  return {
    drafts: new Map(), ledger: null, status: 'Not ready',
    authorityValidation: { ok: false, errors: [], warnings: [] },
    view: 'pending', entityFilter: '', fieldFilter: '', datasetFilter: '',
    statusFilter: '', search: '', page: 0, selectedSubjectKey: '',
    matchLimit: REVIEW_MATCH_STEP,
  };
}

function addListener(context, element, type, handler) {
  if (!element) return; element.addEventListener(type, handler);
  context.listeners.push([element, type, handler]);
}

function revokeUrls(context) {
  context.objectUrls.forEach((url) => context.dependencies.urlApi.revokeObjectURL(url));
  context.objectUrls.clear();
}

function authorityIdentity(upstream) {
  const datasets = (upstream?.registry?.datasets || [])
    .map((item) => `${item.datasetId}:${item.contentHash}:${item.datasetRole}`).join(',');
  return [upstream?.graph?.sourceFileId,upstream?.graph?.sourceRevision,upstream?.graph?.contentHash,
    upstream?.ledger?.ledgerId,upstream?.config?.bindingConfigId,upstream?.run?.comparisonRunId,
    upstream?.run?.attachmentSetIdentity,datasets].join('|');
}

function draftsIdentity(drafts) {
  return JSON.stringify([...drafts.entries()].map(([key, value]) => [key, value]));
}

function reconcileDrafts(current, run) {
  const next = new Map();
  for (const subject of createComparisonReviewSubjects(run)) {
    const key = reviewSubjectKey(subject);
    next.set(key, normalizeComparisonReviewDraft(current.get(key), subject));
  }
  return next;
}

function render(context) {
  const upstream = context.getUpstream(); renderComparisonReviewPanel(context.elements, context.state, upstream);
  const busy = ['Checking authority','Building review ledger'].includes(context.state.status);
  context.elements['review-build'].disabled = !context.state.authorityValidation.ok || busy;
  const valid = context.state.ledger?.validation?.ok;
  context.elements['review-json-download'].disabled = !valid;
  context.elements['review-csv-download'].disabled = !valid;
  context.dependencies.onReviewChange?.(context.state);
}

function invalidateLedger(context, status) {
  context.requestId += 1; revokeUrls(context);
  context.state = { ...context.state, ledger: null, status, page: 0 };
  render(context);
}

async function syncAuthority(context) {
  const upstream = context.getUpstream(); const identity = authorityIdentity(upstream);
  if (identity === context.lastAuthorityIdentity) { render(context); return; }
  context.lastAuthorityIdentity = identity; const requestId = ++context.requestId;
  revokeUrls(context);
  const drafts = reconcileDrafts(context.state.drafts, upstream?.run);
  const subjects = createComparisonReviewSubjects(upstream?.run);
  const selectedSubjectKey = drafts.has(context.state.selectedSubjectKey)
    ? context.state.selectedSubjectKey : reviewSubjectKey(subjects[0]);
  context.state = {
    ...context.state, drafts, ledger: null, selectedSubjectKey,
    authorityValidation: { ok: false, errors: [], warnings: [] },
    status: 'Checking authority', page: 0, matchLimit: REVIEW_MATCH_STEP,
  };
  render(context);
  const validate = context.dependencies.validateComparisonReviewAuthority || validateComparisonReviewAuthority;
  const validation = await validate(upstream, context.dependencies);
  if (context.disposed || requestId !== context.requestId
    || identity !== authorityIdentity(context.getUpstream())) return;
  context.state = { ...context.state, authorityValidation: validation, status: validation.ok ? 'Ready for review' : 'Authority invalid' };
  render(context);
}

function updateSelectedDraft(context, patch, status) {
  const key = context.state.selectedSubjectKey; if (!key || !context.state.drafts.has(key)) return;
  const next = new Map(context.state.drafts); const current = next.get(key);
  const draft = normalizeComparisonReviewDraft({ ...current, ...patch, subjectKey: key });
  next.set(key, draft); context.state = { ...context.state, drafts: next };
  invalidateLedger(context, status);
}

function handleDisposition(context) {
  updateSelectedDraft(context, {
    disposition: context.elements['review-disposition'].value,
    selectedMatchId: '',
  }, 'Review disposition changed');
}

function handleSelectedMatch(context) {
  updateSelectedDraft(context, {
    selectedMatchId: context.elements['review-selected-match'].value,
  }, 'Selected match changed');
}

function handleNote(context) {
  updateSelectedDraft(context, { note: context.elements['review-note'].value }, 'Review note changed');
}

async function handleBuild(context) {
  if (!context.state.authorityValidation.ok) return;
  const upstream = context.getUpstream(); const identity = authorityIdentity(upstream);
  const draftIdentity = draftsIdentity(context.state.drafts); const requestId = ++context.requestId;
  context.state = { ...context.state, ledger: null, status: 'Building review ledger' }; render(context);
  try {
    const build = context.dependencies.createComparisonReviewLedger || createComparisonReviewLedger;
    const ledger = await build(upstream, context.state.drafts, context.dependencies);
    if (context.disposed || requestId !== context.requestId
      || identity !== authorityIdentity(context.getUpstream())
      || draftIdentity !== draftsIdentity(context.state.drafts)) return;
    revokeUrls(context);
    context.state = { ...context.state, ledger, status: ledger.validation.ok ? 'Review ledger valid' : 'Review ledger invalid' };
    render(context);
  } catch (error) {
    if (context.disposed || requestId !== context.requestId) return;
    context.state = { ...context.state, status: `Review build failed [${error.code || 'ERROR'}]: ${error.message}` };
    render(context);
  }
}

function download(context, content, type, name) {
  const blob = new context.dependencies.BlobCtor([content], { type });
  const url = context.dependencies.urlApi.createObjectURL(blob); context.objectUrls.add(url);
  context.dependencies.triggerDownload(url, name);
}

function bindDownloads(context) {
  const e = context.elements;
  addListener(context, e['review-json-download'], 'click', () => {
    download(context, serializeComparisonReviewLedger(context.state.ledger), 'application/json', 'comparison-review-ledger.json');
  });
  addListener(context, e['review-csv-download'], 'click', () => {
    download(context, buildComparisonReviewCsv(context.state.ledger), 'text/csv;charset=utf-8', 'comparison-review.csv');
  });
}

function bindFilters(context) {
  const e = context.elements;
  addListener(context, e['review-view'], 'change', () => {
    context.state = { ...context.state, view: e['review-view'].value, page: 0 }; render(context);
  });
  const pairs = [
    ['review-entity-filter','entityFilter'],['review-field-filter','fieldFilter'],
    ['review-dataset-filter','datasetFilter'],['review-status-filter','statusFilter'],
    ['review-search','search'],
  ];
  pairs.forEach(([id, key]) => addListener(context, e[id], 'input', () => {
    context.state = { ...context.state, [key]: e[id].value, page: 0 }; render(context);
  }));
  addListener(context, e['review-prev'], 'click', () => {
    context.state = { ...context.state, page: Math.max(0, context.state.page - 1) }; render(context);
  });
  addListener(context, e['review-next'], 'click', () => {
    context.state = { ...context.state, page: context.state.page + 1 }; render(context);
  });
}

function bindSelection(context) {
  const e = context.elements;
  addListener(context, e['review-subject-list'], 'click', (event) => {
    const key = event.target?.dataset?.reviewSubjectKey; if (!key) return;
    context.state = { ...context.state, selectedSubjectKey: key, matchLimit: REVIEW_MATCH_STEP }; render(context);
  });
  addListener(context, e['review-disposition'], 'change', () => handleDisposition(context));
  addListener(context, e['review-selected-match'], 'change', () => handleSelectedMatch(context));
  addListener(context, e['review-note'], 'input', () => handleNote(context));
  addListener(context, e['review-match-more'], 'click', () => {
    context.state = { ...context.state, matchLimit: context.state.matchLimit + REVIEW_MATCH_STEP }; render(context);
  });
}

export function createComparisonReviewController(elements, dependencies = {}, getUpstream = () => ({})) {
  const context = {
    elements, dependencies, getUpstream, listeners: [], objectUrls: new Set(),
    disposed: false, requestId: 0, lastAuthorityIdentity: '', state: initialState(),
  };
  addListener(context, elements['review-build'], 'click', () => handleBuild(context));
  bindDownloads(context); bindFilters(context); bindSelection(context); render(context);
  void syncAuthority(context);
  return {
    getState: () => context.state,
    syncUpstream: () => syncAuthority(context),
    cleanup() {
      if (context.disposed) return; context.disposed = true; context.requestId += 1;
      context.listeners.splice(0).forEach(([element, type, handler]) => element.removeEventListener(type, handler));
      revokeUrls(context);
    },
  };
}
