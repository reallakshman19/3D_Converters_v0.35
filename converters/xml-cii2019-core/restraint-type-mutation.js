import { restraintTypeToCaesarCode } from './restraint-type-codes.js';

export const DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS = Object.freeze([
  Object.freeze({ label: '+Y', from: '17', to: '14' }),
  Object.freeze({ label: 'LIM', from: '7', to: '8' }),
  Object.freeze({ label: 'GUI', from: '10', to: '9' }),
  Object.freeze({ label: 'X', from: '1', to: '2' }),
  Object.freeze({ label: 'Y', from: '2', to: '3' }),
  Object.freeze({ label: 'Z', from: '3', to: '5' }),
  Object.freeze({ label: '', from: '18', to: '15' }),
]);

export const RESTRAINT_TYPE_MUTATION_INFO = [
  'Restraint TYPE is first normalized with the Python XML->CII native code table.',
  'Numeric TYPE values pass through when they are in the CAESAR II 1-62 range.',
  'The editable rows then mutate specific source TYPE codes into target TYPE codes before enrichment.',
].join('\n');

const text = (value) => String(value ?? '').trim();

function normalizeNumberText(value) {
  const raw = text(value);
  const numeric = Number(raw);
  if (!raw || !Number.isFinite(numeric)) return raw;
  return Math.abs(numeric - Math.round(numeric)) < 1e-9
    ? String(Math.round(numeric))
    : raw.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

export function normalizeRestraintTypeMutationRows(rows = DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS) {
  const source = Array.isArray(rows) ? rows : DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS;
  return source.map((row) => ({
    label: text(row?.label),
    from: text(row?.from),
    to: text(row?.to),
  }));
}

export function defaultRestraintTypeMutationConfig() {
  return {
    enabled: true,
    rows: normalizeRestraintTypeMutationRows(DEFAULT_RESTRAINT_TYPE_MUTATION_ROWS),
  };
}

export function normalizeRestraintTypeMutationConfig(config = {}) {
  return {
    enabled: config?.enabled !== false,
    rows: normalizeRestraintTypeMutationRows(config?.rows),
  };
}

export function normalizeRestraintTypeValue(value) {
  const code = restraintTypeToCaesarCode(value);
  if (code !== null && code !== undefined) return String(code);
  return normalizeNumberText(value);
}

export function mutateRestraintType(value, config = {}) {
  const base = normalizeRestraintTypeValue(value);
  if (!base) return base;
  const normalizedConfig = normalizeRestraintTypeMutationConfig(config);
  if (normalizedConfig.enabled === false) return base;
  const match = normalizedConfig.rows.find((row) => normalizeRestraintTypeValue(row.from) === base);
  return match ? normalizeRestraintTypeValue(match.to) || base : base;
}
