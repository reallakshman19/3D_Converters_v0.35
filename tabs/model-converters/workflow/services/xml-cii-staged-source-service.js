/**
 * Resolves the approved staged JSON source outside legacy-adapter.js.
 * Inputs: workflow config, JSON Trace state, legacy Custom Input state.
 * Outputs: staged JSON text plus a user-facing source label.
 * Fallback: old Custom Input parsed tables are still supported for saved configs.
 */

export const XML_CII_JSON_TRACE_STORE_KEY = 'xmlCii.jsonTrace.v1';
export const XML_CII_CUSTOM_INPUT_STORE_KEY = 'xmlCii.customInput.v1';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function sourceEnabled(config) {
  return config?.useJsonTraceStagedSource === true
    || config?.useParsedCustomInputSource === true
    || config?.useParsedCustomInputSourceForPreview === true;
}

function readJson(key) {
  try {
    const host = typeof window !== 'undefined' ? window : globalThis;
    const raw = host?.localStorage?.getItem?.(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function xmlCiiJsonTraceSnapshot() {
  try {
    const host = typeof window !== 'undefined' ? window : globalThis;
    const live = host?.xmlCiiJsonTraceState?.getSnapshot?.();
    if (live && typeof live === 'object') return live;
  } catch {}
  return readJson(XML_CII_JSON_TRACE_STORE_KEY);
}

function customInputSnapshot() {
  try {
    const host = typeof window !== 'undefined' ? window : globalThis;
    const live = host?.xmlCiiCustomInputState?.getSnapshot?.();
    if (live && typeof live === 'object') return live;
  } catch {}
  return readJson(XML_CII_CUSTOM_INPUT_STORE_KEY);
}

function tableRows(tableText) {
  const lines = text(tableText).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const key = (value) => text(value).replace(/[^a-z0-9]/gi, '').toLowerCase();
  const headers = lines[0].split('\t').map(key);
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row = {};
    headers.forEach((header, index) => { row[header] = text(cells[index]); });
    return row;
  }).filter((row) => Object.values(row).some((value) => text(value)));
}

function rowValue(row, names) {
  for (const name of names) {
    const key = text(name).replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (text(row?.[key])) return text(row[key]);
  }
  return '';
}

function byNode(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const branchName = rowValue(row, ['branchName', 'branch']);
    const nodeNumber = rowValue(row, ['nodeNumber', 'node']);
    if (branchName || nodeNumber) map.set(`${branchName}::${nodeNumber}`, row);
  }
  return map;
}

function customInputStagedSource() {
  const state = customInputSnapshot();
  if (!state) return null;
  const dtxrRows = tableRows(state.dtxrRows);
  const weightByNode = byNode(tableRows(state.weightRows));
  const coordByNode = byNode(tableRows(state.coordinateRows));
  const branchByNode = byNode(tableRows(state.branchRows));
  const restraintRows = tableRows(state.restraintRows);
  const byBranch = new Map();
  const branchRecord = (branchName) => {
    const name = branchName || '/CUSTOM-INPUT/UNMAPPED';
    if (!byBranch.has(name)) byBranch.set(name, { type: 'BRANCH', name, attributes: { NAME: name }, children: [] });
    return byBranch.get(name);
  };

  for (const row of dtxrRows) {
    const branchName = rowValue(row, ['branchName', 'branch']);
    const nodeNumber = rowValue(row, ['nodeNumber', 'node']);
    const dtxr = rowValue(row, ['dtxr', 'dtxrPos', 'description']);
    if (!dtxr) continue;
    const key = `${branchName}::${nodeNumber}`;
    const weight = weightByNode.get(key) || {};
    const coord = coordByNode.get(key) || {};
    const branch = branchByNode.get(key) || {};
    const componentRefNo = rowValue(weight, ['componentRefNo', 'ref']);
    const pos = rowValue(coord, ['pos', 'position'])
      || [rowValue(coord, ['x']), rowValue(coord, ['y']), rowValue(coord, ['z'])].filter(Boolean).join(' ');
    branchRecord(branchName).children.push({
      type: rowValue(weight, ['componentType', 'type']) || 'COMP',
      name: componentRefNo || nodeNumber || dtxr,
      attributes: {
        OWNER: branchName,
        NODE: nodeNumber,
        NodeNumber: nodeNumber,
        REF: componentRefNo,
        ComponentRefNo: componentRefNo,
        ENDPOINT: rowValue(weight, ['endpoint', 'end']),
        DTXR: dtxr,
        DTXR_POS: dtxr,
        POS: pos,
        ABORE: rowValue(branch, ['boreMm', 'bore', 'dn']),
      },
    });
  }

  for (const row of restraintRows) {
    const branchName = rowValue(row, ['branchName', 'branch']);
    const nodeNumber = rowValue(row, ['nodeNumber', 'node']);
    const nodeName = rowValue(row, ['nodeName', 'ps', 'support']);
    branchRecord(branchName).children.push({
      type: 'SUPPORT',
      name: nodeName || nodeNumber,
      attributes: {
        OWNER: branchName,
        NODE: nodeNumber,
        NAME: nodeName,
        SUPPORT_TAG: nodeName,
        SUPPORT_KIND: rowValue(row, ['restraintType', 'restraint', 'supportType']),
        NODEGAP: rowValue(row, ['gap']),
        NODESTIFF: rowValue(row, ['stiffness']),
        NODEFRICTION: rowValue(row, ['friction']),
      },
    });
  }

  const children = [...byBranch.values()];
  if (!children.length) return null;
  const traceRows = Array.isArray(state.trace) ? state.trace.length : 0;
  return {
    text: JSON.stringify({ source: 'parsed-custom-input', profile: 'PDMS/E3D staged JSON - XML to CII', children }),
    label: `parsed Custom Input source (${dtxrRows.length} DTXR row(s), ${traceRows} trace row(s))`,
  };
}

export function xmlCiiWorkflowParsedStagedSource(config) {
  const jsonTrace = xmlCiiJsonTraceSnapshot();
  const useJsonTrace = sourceEnabled(config || {}) || jsonTrace?.useAsSource === true;
  if (useJsonTrace && text(jsonTrace?.stagedJsonText)) {
    const traceRows = Array.isArray(jsonTrace.trace) ? jsonTrace.trace.length : 0;
    const sourceName = text(jsonTrace.sourceFileName) || 'imported JSON';
    return {
      text: jsonTrace.stagedJsonText,
      label: `JSON Trace staged source (${sourceName}, ${traceRows} trace row(s))`,
    };
  }
  if (!sourceEnabled(config || {})) return null;
  return customInputStagedSource();
}

export function xmlCiiUseWorkflowParsedStagedSource(config) {
  const jsonTrace = xmlCiiJsonTraceSnapshot();
  return sourceEnabled(config || {}) || (jsonTrace?.useAsSource === true && text(jsonTrace?.stagedJsonText));
}
