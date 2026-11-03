import { sha256Hex } from './source-envelope.js';
import { canonicalMasterTable } from './master-normalize.js';

async function prefixedId(prefix, evidence, length, hashText) {
  const hash = await hashText(evidence);
  return `${prefix}-${hash.slice(0, length)}`;
}

export async function createMasterDatasetId(table, sourceKind, datasetRole, hashText = sha256Hex) {
  const evidence = `${sourceKind}\u0000${datasetRole}\u0000${canonicalMasterTable(table)}`;
  return prefixedId('master', evidence, 32, hashText);
}

export async function createMasterColumnId(table, sourceKind, datasetRole, name, sourceOrder, hashText = sha256Hex) {
  const evidence = `${sourceKind}\u0000${datasetRole}\u0000${canonicalMasterTable(table)}\u0000column\u0000${sourceOrder}\u0000${name}`;
  return prefixedId('column', evidence, 24, hashText);
}

export async function createMasterRowId(table, sourceKind, datasetRole, row, sourceOrder, hashText = sha256Hex) {
  const evidence = `${sourceKind}\u0000${datasetRole}\u0000${canonicalMasterTable(table)}\u0000row\u0000${sourceOrder}\u0000${JSON.stringify(row)}`;
  return prefixedId('row', evidence, 24, hashText);
}
