import { addAivInputRow, updateAivInputCell } from './vibration-aiv-input-model.js';

function text(value) { return String(value ?? '').trim(); }

function setField(table, rowIndex, column, value) {
  const columnIndex = table.header.indexOf(column);
  if (columnIndex < 0 || value === undefined) return table;
  return updateAivInputCell(table, rowIndex, columnIndex, value);
}

export function addAivUnifiedCanvasTableRow(table, values = {}) {
  let next = addAivInputRow(table);
  const rowIndex = next.rows.length - 1;
  for (const [column, value] of Object.entries(values)) {
    next = setField(next, rowIndex, column, value);
  }
  return next;
}

export function readAivUnifiedCanvasTableDraft(container, kind) {
  if (kind === 'sources') {
    return Object.freeze({
      'Source Canonical ID': text(container.querySelector('[data-aiv-table-new-source-id]')?.value),
      'Operating Case': text(container.querySelector('[data-aiv-table-new-source-case]')?.value),
      'Source Device Type': text(container.querySelector('[data-aiv-table-new-source-device]')?.value),
    });
  }
  if (kind === 'assessments') {
    return Object.freeze({
      'Assessment Canonical ID': text(container.querySelector('[data-aiv-table-new-assessment-id]')?.value),
      'Assessment Type': text(container.querySelector('[data-aiv-table-new-assessment-type]')?.value),
    });
  }
  throw new RangeError(`Unsupported AIV unified table draft kind ${kind}.`);
}

export function validateAivUnifiedCanvasTableDraft(kind, values) {
  if (kind === 'sources') {
    if (!values['Source Canonical ID'] || !values['Operating Case']) {
      throw new TypeError('AIV table Source creation requires Source Canonical ID and Operating Case.');
    }
    return true;
  }
  if (kind === 'assessments') {
    if (!values['Assessment Canonical ID']) {
      throw new TypeError('AIV table Assessment creation requires Assessment Canonical ID.');
    }
    return true;
  }
  throw new RangeError(`Unsupported AIV unified table draft kind ${kind}.`);
}
