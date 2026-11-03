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
  return element(documentRef, 'td', { text: value === null || value === undefined ? '—' : String(value) });
}

function headingRow(documentRef) {
  const row = element(documentRef, 'tr');
  for (const title of ['Reference', 'Source occurrence', 'Status', 'Large Ø mm', 'Small Ø mm', 'Length mm', 'Half-angle °', 'Blocking reason']) {
    row.appendChild(element(documentRef, 'th', { text: title }));
  }
  return row;
}

function dataRow(documentRef, record) {
  const row = element(documentRef, 'tr');
  row.dataset.disposition = record.disposition;
  for (const value of [
    record.reference || record.displayName || record.managedRecordId,
    record.sourceOccurrenceId,
    record.disposition,
    record.largeDiameterMm,
    record.smallDiameterMm,
    record.axialLengthMm,
    record.halfAngleDeg,
    record.blockingReason,
  ]) row.appendChild(cell(documentRef, value));
  return row;
}

function tableOf(documentRef, rows) {
  const table = element(documentRef, 'table', { className: 'model-converters-evidence-table' });
  const head = element(documentRef, 'thead'), body = element(documentRef, 'tbody');
  head.appendChild(headingRow(documentRef));
  for (const record of rows) body.appendChild(dataRow(documentRef, record));
  table.append(head, body);
  return table;
}

function summaryText(model) {
  return model ? `OLET review — ${model.managedCount} mapped, ${model.admittedCount} admitted, ${model.blockedCount} blocked`
    : 'OLET review — not evaluated';
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function installBranchFittingReviewUi(wrap) {
  const documentRef = wrap.ownerDocument || document;
  const download = element(documentRef, 'button', {
    type: 'button',
    className: 'model-converters-download-btn',
    'data-fbx-branch-fitting-download': '',
    text: 'Download OLET evidence',
  });
  download.disabled = true;
  const details = element(documentRef, 'details', { 'data-fbx-branch-fitting-review': '' });
  const summary = element(documentRef, 'summary', {
    'data-fbx-branch-fitting-summary': '', text: 'OLET review — not evaluated',
  });
  const message = element(documentRef, 'div', {
    'data-fbx-branch-fitting-message': '', text: 'Run FBX conversion with an approved mapping package, select a zone, then analyse zone geometry.',
  });
  const tableHost = element(documentRef, 'div', { 'data-fbx-branch-fitting-table': '' });
  details.append(summary, message, tableHost);
  wrap.append(download, details);
  return Object.freeze({ download, details, summary, message, tableHost });
}

export function renderBranchFittingReviewUi(view, model) {
  if (!view) return;
  view.summary.textContent = summaryText(model);
  view.message.textContent = model?.message
    || 'Run FBX conversion with an approved mapping package, select a zone, then analyse zone geometry.';
  view.details.dataset.status = model?.status || 'NOT_EVALUATED';
  clearChildren(view.tableHost);
  if (model?.rows?.length) view.tableHost.appendChild(tableOf(view.tableHost.ownerDocument, model.rows));
  view.download.disabled = !model || model.status === 'MAPPING_REQUIRED';
}

export function setBranchFittingDownloadAvailability(view, enabled) {
  if (view?.download) view.download.disabled = !enabled;
}
