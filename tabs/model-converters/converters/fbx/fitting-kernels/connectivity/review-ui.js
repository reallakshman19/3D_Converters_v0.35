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
    text: value === null || value === undefined || value === '' ? '—' : String(value),
  });
}

function table(documentRef, titles, rows, valuesFor) {
  const tableNode = element(documentRef, 'table', {
    className: 'model-converters-evidence-table',
  });
  const head = element(documentRef, 'thead'), body = element(documentRef, 'tbody');
  const heading = element(documentRef, 'tr');
  for (const title of titles) heading.appendChild(element(documentRef, 'th', { text: title }));
  head.appendChild(heading);
  for (const row of rows) {
    const data = element(documentRef, 'tr');
    for (const value of valuesFor(row)) data.appendChild(cell(documentRef, value));
    body.appendChild(data);
  }
  tableNode.append(head, body);
  return tableNode;
}

function groupTable(documentRef, rows) {
  return table(documentRef,
    ['Group', 'Topology', 'Components', 'Internal links', 'Boundary links', 'Open ports', 'Blocked'],
    rows,
    (row) => [row.groupId, row.topology, row.componentCount, row.internalLinkCount,
      row.boundaryLinkCount, row.openPortCount, row.blockedComponentCount]);
}

function componentTable(documentRef, rows) {
  return table(documentRef,
    ['Component', 'Type', 'Source occurrence', 'Group', 'Status', 'Internal', 'Boundary', 'Open', 'Blocked ports'],
    rows,
    (row) => [row.logicalComponentId, row.nativeType, row.sourceOccurrenceId, row.groupId,
      row.status, row.internalLinkCount, row.boundaryLinkCount, row.openPortCount,
      row.blockedPortCount]);
}

function portTable(documentRef, rows) {
  return table(documentRef,
    ['Endpoint', 'Component', 'Group', 'Role', 'Disposition', 'Target', 'Diagnostics'],
    rows,
    (row) => [row.endpointId, row.logicalComponentId, row.groupId, row.role,
      row.disposition, row.targetEndpointId, row.diagnosticCodes.join(', ')]);
}

function clearChildren(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function summaryText(model) {
  if (!model) return 'Connectivity review — not evaluated';
  const counts = model.counts;
  return `Connectivity review — ${counts.componentCount} components, ${counts.internalLinkCount} internal links, ${counts.openPortCount} open ports`;
}

function topologyText(model) {
  if (!model?.topologyCounts) return '';
  return Object.entries(model.topologyCounts).map(([name, count]) => `${name} ${count}`).join(' · ');
}

function appendSection(host, heading, tableNode) {
  host.appendChild(element(host.ownerDocument, 'h4', { text: heading }));
  host.appendChild(tableNode);
}

export function installConnectivityReviewUi(wrap) {
  const documentRef = wrap.ownerDocument || document;
  const download = element(documentRef, 'button', {
    type: 'button',
    className: 'model-converters-download-btn',
    'data-fbx-connectivity-download': '',
    text: 'Download connectivity evidence',
  });
  download.disabled = true;
  const details = element(documentRef, 'details', {
    'data-fbx-connectivity-review': '',
  });
  const summary = element(documentRef, 'summary', {
    'data-fbx-connectivity-summary': '',
    text: 'Connectivity review — not evaluated',
  });
  const message = element(documentRef, 'div', {
    'data-fbx-connectivity-message': '',
    text: 'Run FBX conversion with an approved mapping package, select a zone, then analyse zone geometry.',
  });
  const topology = element(documentRef, 'div', {
    'data-fbx-connectivity-topology': '',
  });
  const authority = element(documentRef, 'div', {
    'data-fbx-connectivity-authority': '',
    title: 'Only explicit approved mapping port links are reviewed. Geometry proximity, names, and renderer state never create connectivity.',
    text: 'ⓘ Explicit mapping links only; no proximity repair or topology inference.',
  });
  const tableHost = element(documentRef, 'div', {
    'data-fbx-connectivity-tables': '',
  });
  details.append(summary, message, topology, authority, tableHost);
  wrap.append(download, details);
  return Object.freeze({ download, details, summary, message, topology, authority, tableHost });
}

export function renderConnectivityReviewUi(view, model) {
  if (!view) return;
  view.summary.textContent = summaryText(model);
  view.message.textContent = model?.message
    || 'Run FBX conversion with an approved mapping package, select a zone, then analyse zone geometry.';
  view.topology.textContent = topologyText(model);
  view.details.dataset.status = model?.status || 'NOT_EVALUATED';
  clearChildren(view.tableHost);
  if (model?.groupRows?.length) {
    appendSection(view.tableHost, 'Connected groups', groupTable(view.tableHost.ownerDocument, model.groupRows));
  }
  if (model?.componentRows?.length) {
    appendSection(view.tableHost, 'Components', componentTable(view.tableHost.ownerDocument, model.componentRows));
  }
  if (model?.portRows?.length) {
    appendSection(view.tableHost, 'Open, boundary, and blocked ports',
      portTable(view.tableHost.ownerDocument, model.portRows));
  }
  view.download.disabled = !model || model.status === 'MAPPING_REQUIRED';
}

export function setConnectivityDownloadAvailability(view, enabled) {
  if (view?.download) view.download.disabled = !enabled;
}
