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
  for (const title of [
    'Family', 'Reference', 'Source occurrence', 'Status', 'Ports',
    'Primary Ø mm', 'Secondary Ø mm', 'Length mm', 'Angle °',
    'Radius mm', 'Method', 'Blocking reason',
  ]) row.appendChild(element(documentRef, 'th', { text: title }));
  return row;
}

function dataRow(documentRef, record) {
  const row = element(documentRef, 'tr');
  row.dataset.disposition = record.disposition;
  for (const value of [
    record.family,
    record.reference || record.displayName || record.managedRecordId,
    record.sourceOccurrenceId,
    record.disposition,
    record.portCount,
    record.primaryDiameterMm,
    record.secondaryDiameterMm,
    record.axialLengthMm,
    record.angleDeg,
    record.radiusMm,
    record.geometryMethod,
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

function downloadButton(documentRef, family) {
  const label = family === 'elbow' ? 'ELBOW' : family === 'tee' ? 'TEE' : 'REDUCER';
  const button = element(documentRef, 'button', {
    type: 'button',
    className: 'model-converters-download-btn',
    [`data-fbx-${family}-evidence-download`]: '',
    text: `Download ${label} evidence`,
  });
  button.disabled = true;
  return button;
}

function summaryText(model) {
  return model
    ? `Primary fittings — ${model.managedCount} mapped, ${model.admittedCount} admitted, ${model.blockedCount} blocked`
    : 'Primary fittings — not evaluated';
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function installPrimaryFittingReviewUi(wrap) {
  const documentRef = wrap.ownerDocument || document;
  const downloads = Object.freeze({
    elbow: downloadButton(documentRef, 'elbow'),
    tee: downloadButton(documentRef, 'tee'),
    reducer: downloadButton(documentRef, 'reducer'),
  });
  const details = element(documentRef, 'details', { 'data-fbx-primary-fitting-review': '' });
  const summary = element(documentRef, 'summary', {
    'data-fbx-primary-fitting-summary': '', text: 'Primary fittings — not evaluated',
  });
  const message = element(documentRef, 'div', {
    'data-fbx-primary-fitting-message': '',
    text: 'Run FBX conversion with an approved mapping package, select a zone, then analyse zone geometry.',
  });
  const authority = element(documentRef, 'div', {
    'data-fbx-primary-fitting-authority': '',
    text: 'Exact source binding and solid-fitting port evidence only; no engineering attributes or flow direction are inferred.',
  });
  const tableHost = element(documentRef, 'div', { 'data-fbx-primary-fitting-table': '' });
  details.append(summary, message, authority, tableHost);
  wrap.append(downloads.elbow, downloads.tee, downloads.reducer, details);
  return Object.freeze({ downloads, details, summary, message, authority, tableHost });
}

export function renderPrimaryFittingReviewUi(view, model) {
  if (!view) return;
  view.summary.textContent = summaryText(model);
  view.message.textContent = model?.message
    || 'Run FBX conversion with an approved mapping package, select a zone, then analyse zone geometry.';
  view.details.dataset.status = model?.status || 'NOT_EVALUATED';
  clearChildren(view.tableHost);
  if (model?.rows?.length) view.tableHost.appendChild(tableOf(view.tableHost.ownerDocument, model.rows));
  const disabled = !model || model.status === 'MAPPING_REQUIRED';
  for (const button of Object.values(view.downloads)) button.disabled = disabled;
}

export function setPrimaryFittingDownloadAvailability(view, availability = {}) {
  if (!view?.downloads) return;
  view.downloads.elbow.disabled = !availability.elbow;
  view.downloads.tee.disabled = !availability.tee;
  view.downloads.reducer.disabled = !availability.reducer;
}
