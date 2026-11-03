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

function headingRow(documentRef) {
  const row = element(documentRef, 'tr');
  const titles = [
    'Family', 'Reference', 'Source occurrence', 'Status', 'Ports',
    'Mean Ø mm', 'Face-to-face mm', 'Topology', 'Native mapping', 'Blocking reason',
  ];
  for (const title of titles) row.appendChild(element(documentRef, 'th', { text: title }));
  return row;
}

function dataRow(documentRef, record) {
  const row = element(documentRef, 'tr');
  row.dataset.family = record.family;
  row.dataset.disposition = record.disposition;
  const values = [
    record.family,
    record.reference || record.displayName || record.managedRecordId,
    record.sourceOccurrenceId,
    record.disposition,
    record.portCount,
    record.diameterMm,
    record.faceToFaceMm,
    record.topologyDisposition,
    record.nativeMappingSupported ? 'SUPPORTED' : 'REVIEW ONLY',
    record.blockingReason,
  ];
  for (const value of values) row.appendChild(cell(documentRef, value));
  return row;
}

function tableOf(documentRef, rows) {
  const table = element(documentRef, 'table', {
    className: 'model-converters-evidence-table',
  });
  const head = element(documentRef, 'thead'), body = element(documentRef, 'tbody');
  head.appendChild(headingRow(documentRef));
  for (const record of rows) body.appendChild(dataRow(documentRef, record));
  table.append(head, body);
  return table;
}

function familySummaryText(model) {
  if (!model?.familySummary?.length) return '';
  return model.familySummary.map((item) => (
    `${item.family} ${item.admitted}/${item.managed}`
  )).join(' · ');
}

function summaryText(model) {
  return model
    ? `Inline assembly review — ${model.managedCount} mapped, ${model.admittedCount} admitted, ${model.blockedCount} blocked`
    : 'Inline assembly review — not evaluated';
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function installInlineAssemblyReviewUi(wrap) {
  const documentRef = wrap.ownerDocument || document;
  const download = element(documentRef, 'button', {
    type: 'button',
    className: 'model-converters-download-btn',
    'data-fbx-inline-assembly-download': '',
    text: 'Download inline assembly evidence',
  });
  download.disabled = true;
  const details = element(documentRef, 'details', {
    'data-fbx-inline-assembly-review': '',
  });
  const summary = element(documentRef, 'summary', {
    'data-fbx-inline-assembly-summary': '',
    text: 'Inline assembly review — not evaluated',
  });
  const message = element(documentRef, 'div', {
    'data-fbx-inline-assembly-message': '',
    text: 'Run FBX conversion with an approved mapping package, select a zone, then analyse zone geometry.',
  });
  const families = element(documentRef, 'div', {
    'data-fbx-inline-assembly-families': '',
  });
  const authority = element(documentRef, 'div', {
    'data-fbx-inline-assembly-authority': '',
    text: 'BLIND remains review-only; three-port INSTRUMENT remains review-only until governed native writer contracts exist.',
  });
  const tableHost = element(documentRef, 'div', {
    'data-fbx-inline-assembly-table': '',
  });
  details.append(summary, message, families, authority, tableHost);
  wrap.append(download, details);
  return Object.freeze({ download, details, summary, message, families, authority, tableHost });
}

export function renderInlineAssemblyReviewUi(view, model) {
  if (!view) return;
  view.summary.textContent = summaryText(model);
  view.message.textContent = model?.message
    || 'Run FBX conversion with an approved mapping package, select a zone, then analyse zone geometry.';
  view.families.textContent = familySummaryText(model);
  view.details.dataset.status = model?.status || 'NOT_EVALUATED';
  clearChildren(view.tableHost);
  if (model?.rows?.length) {
    view.tableHost.appendChild(tableOf(view.tableHost.ownerDocument, model.rows));
  }
  view.download.disabled = !model || model.status === 'MAPPING_REQUIRED';
}

export function setInlineAssemblyDownloadAvailability(view, enabled) {
  if (view?.download) view.download.disabled = !enabled;
}
