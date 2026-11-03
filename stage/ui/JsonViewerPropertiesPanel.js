function findItem(model, selectedRef) {
  if (!model || !selectedRef) return null;
  if (selectedRef.type === 'root') return rootItem(model, selectedRef.id);
  if (selectedRef.type === 'node') return model.hierarchy?.nodes?.find((node) => node.id === selectedRef.id) || null;
  if (selectedRef.type === 'component') return model.components?.find((component) => component.id === selectedRef.id) || null;
  if (selectedRef.type === 'primitive') return model.primitives?.find((primitive) => primitive.id === selectedRef.id) || null;
  return null;
}

function rootItem(model, id) {
  return {
    type: 'root',
    id,
    schema: model.schema,
    fileName: model.source?.fileName,
    fileHash: model.source?.fileHash,
    units: model.source?.units,
    nodeCount: model.hierarchy?.nodes?.length || 0,
    componentCount: model.components?.length || 0,
    primitiveCount: model.primitives?.length || 0,
  };
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

function displayValue(value) {
  if (Array.isArray(value)) return value.length > 6 ? `${value.length} items` : value.join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return value === undefined || value === null || value === '' ? '—' : String(value);
}

function rootRows(item) {
  return [
    ['schema', item.schema],
    ['source fileName', item.fileName],
    ['source fileHash', item.fileHash],
    ['units', item.units],
    ['node count', item.nodeCount],
    ['component count', item.componentCount],
    ['primitive count', item.primitiveCount],
  ];
}

function nodeRows(item) {
  return [
    ['id', item.id],
    ['name', item.name],
    ['path', item.path],
    ['kind', item.kind],
    ['component count', count(item.componentIds)],
    ['primitive count', count(item.primitiveIds)],
    ['bboxWorld', item.bboxWorld],
  ];
}

function componentRows(item) {
  return [
    ['id', item.id],
    ['name', item.name],
    ['semanticType', item.semanticType],
    ['confidence.geometry', item.confidence?.geometry],
    ['confidence.semantic', item.confidence?.semantic],
    ['primitive count', count(item.primitiveIds)],
    ['bboxWorld', item.bboxWorld],
    ['renderPolicy', item.renderPolicy],
  ];
}

function rowsFor(item, selectedRef) {
  if (selectedRef?.type === 'root') return rootRows(item);
  if (selectedRef?.type === 'node') return nodeRows(item);
  if (selectedRef?.type === 'component') return componentRows(item);
  return Object.entries(item || {});
}

export function renderProperties(target, model, selectedRef) {
  target.replaceChildren();
  const item = findItem(model, selectedRef);
  if (!item) {
    const empty = document.createElement('div');
    empty.className = 'json-viewer-empty-state';
    empty.textContent = 'Select a hierarchy row to view properties';
    target.appendChild(empty);
    return;
  }

  const title = document.createElement('h2');
  title.className = 'json-viewer-panel-title';
  title.textContent = 'Properties';
  const table = document.createElement('dl');
  table.className = 'json-viewer-property-list';
  for (const [key, value] of rowsFor(item, selectedRef)) {
    const dt = document.createElement('dt');
    dt.textContent = key;
    const dd = document.createElement('dd');
    dd.textContent = displayValue(value);
    table.append(dt, dd);
  }
  target.append(title, table);
}
