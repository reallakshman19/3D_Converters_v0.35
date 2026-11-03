function element(documentRef, tag, attributes = {}) {
  const node = documentRef.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value);
  }
  return node;
}

function cell(documentRef, value) {
  return element(documentRef, 'td', {
    text: value === null || value === undefined ? '—' : String(value),
  });
}

function header(documentRef) {
  const row = element(documentRef, 'tr');
  for (const title of [
    'Generated PIPE', 'Branch', 'Explicit endpoint pair',
    'Source occurrences', 'Length mm', 'Status', 'Blocking reason',
  ]) row.appendChild(element(documentRef, 'th', { text: title }));
  return row;
}

function dataRow(documentRef, record) {
  const row = element(documentRef, 'tr');
  row.dataset.disposition = record.disposition;
  for (const value of [
    record.generatedLogicalComponentId,
    record.branchId,
    record.sourcePairKey,
    record.sourceOccurrenceIds,
    record.lengthMm,
    record.disposition,
    record.blockingReason,
  ]) row.appendChild(cell(documentRef, value));
  return row;
}

function tableOf(documentRef, rows) {
  const table = element(documentRef, 'table', {
    className: 'model-converters-evidence-table',
  });
  const head = element(documentRef, 'thead'), body = element(documentRef, 'tbody');
  head.appendChild(header(documentRef));
  for (const record of rows) body.appendChild(dataRow(documentRef, record));
  table.append(head, body);
  return table;
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function summaryText(model) {
  if (!model) return 'Generated gap PIPE review — not evaluated';
  return `Generated gap PIPE review — ${model.counts.generatedPipeCount} generated, ${model.counts.blockedCandidateCount} blocked`;
}

export function installGeneratedGapPipeReviewUi(wrap) {
  const documentRef = wrap.ownerDocument || document;
  const download = element(documentRef, 'button', {
    type: 'button', className: 'model-converters-download-btn',
    'data-fbx-generated-gap-pipe-download': '',
    text: 'Download generated gap PIPE evidence',
  });
  download.disabled = true;
  const details = element(documentRef, 'details', {
    'data-fbx-generated-gap-pipe-review': '',
  });
  const summary = element(documentRef, 'summary', {
    'data-fbx-generated-gap-pipe-summary': '',
    text: 'Generated gap PIPE review — not evaluated',
  });
  const info = element(documentRef, 'span', {
    'data-fbx-generated-gap-pipe-profile-info': '',
    text: ' ⓘ',
    title: 'Gap qualification profile is not available until analysis completes.',
  });
  summary.appendChild(info);
  const message = element(documentRef, 'div', {
    'data-fbx-generated-gap-pipe-message': '',
    text: 'Run conversion with approved mapping, select a zone, then analyse zone geometry.',
  });
  const authority = element(documentRef, 'div', {
    'data-fbx-generated-gap-pipe-authority': '',
    text: 'Only explicit approved port links may create a straight generated PIPE. No proximity fallback is used.',
  });
  const tableHost = element(documentRef, 'div', {
    'data-fbx-generated-gap-pipe-table': '',
  });
  details.append(summary, message, authority, tableHost);
  wrap.append(download, details);
  return Object.freeze({ download, details, summary, info, message, tableHost });
}

export function renderGeneratedGapPipeReviewUi(view, model) {
  if (!view) return;
  view.summary.firstChild.textContent = summaryText(model);
  view.message.textContent = model?.message
    || 'Run conversion with approved mapping, select a zone, then analyse zone geometry.';
  view.info.title = model?.profileDisclosure
    || 'Gap qualification profile is not available until analysis completes.';
  view.details.dataset.status = model?.status || 'NOT_EVALUATED';
  clearChildren(view.tableHost);
  if (model?.rows?.length) {
    view.tableHost.appendChild(tableOf(view.tableHost.ownerDocument, model.rows));
  }
  view.download.disabled = !model || model.status === 'MAPPING_REQUIRED';
}

export function setGeneratedGapPipeDownloadAvailability(view, enabled) {
  if (view?.download) view.download.disabled = !enabled;
}
