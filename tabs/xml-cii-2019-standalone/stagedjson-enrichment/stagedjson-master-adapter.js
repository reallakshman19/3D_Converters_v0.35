/**
 * Functionality: adapts manually imported master rows to the existing
 * XML->CII(2019) Standalone resolver indexes. Parameters: explicit master row
 * collections and visible config. Outputs: normalized line rows, piping-class
 * index, material rows, and weight rows. Fallback: empty inputs stay empty.
 */

import { detectLineListFieldMap, normalizeLineListRow } from '../../../converters/xml-cii2019-core/linelist-mapping.js';
import { buildPipingClassIndex } from '../../../converters/xml-cii2019-core/piping-class-resolver.js';

export function buildStagedJsonMasterContext(masters, config) {
  const lineSourceRows = rows(masters?.lineList);
  const lineListFieldMap = detectLineListFieldMap(lineSourceRows, config?.lineListFieldMap || {}, config);
  const lineRows = lineSourceRows.map((row, index) => normalizeLineListRow(row, lineListFieldMap, index));
  const pipingClassRows = rows(masters?.pipingClass).map(clone);
  return Object.freeze({
    lineRows: Object.freeze(lineRows),
    lineListFieldMap: Object.freeze(lineListFieldMap),
    pipingClassRows: Object.freeze(pipingClassRows),
    pipingClassIndex: buildPipingClassIndex(pipingClassRows),
    materialMapRows: Object.freeze(rows(masters?.materialMap).map(clone)),
    weightMasterRows: Object.freeze(rows(masters?.weight).map(clone)),
    files: Object.freeze({ ...(masters?.files || {}) }),
  });
}

export function summarizeStagedJsonMasters(context) {
  return Object.freeze({
    lineList: context?.lineRows?.length || 0,
    pipingClass: context?.pipingClassRows?.length || 0,
    materialMap: context?.materialMapRows?.length || 0,
    weight: context?.weightMasterRows?.length || 0,
  });
}

function rows(value) { return Array.isArray(value) ? value : []; }
function clone(value) { return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : { value: String(value ?? '') }; }
