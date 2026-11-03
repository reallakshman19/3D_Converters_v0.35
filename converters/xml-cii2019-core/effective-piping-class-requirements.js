import { computeLineNoKey } from './linelist-mapping.js';
import { normalizePipingClass } from './piping-class-resolver.js';
import { deriveLineKeyFromBranchName } from './regex-line-key.js';

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function rowText(row, keys) {
  if (!row || typeof row !== 'object') return '';
  for (const key of keys) {
    const value = row[key] ?? row._raw?.[key];
    if (text(value)) return text(value);
  }
  return '';
}

function branchClassToken(branchName, config = {}) {
  const delimiter = config?.rating?.tokenDelimiter || '-';
  const index = Math.max(1, Number(config?.rating?.pipingClassTokenIndex || 5));
  const parts = text(branchName)
    .replace(/^\/+/, '')
    .replace(/\/B\d+$/i, '')
    .split(delimiter)
    .map(text);
  const value = parts[index - 1] || '';
  if (/^(CS|SS|LTCS|DSS|SDSS)$/i.test(value) && /^S\d+/i.test(parts[5] || '')) return '';
  return value;
}

function normalizeLineKey(value) {
  return text(value).toUpperCase().replace(/\s+/g, '');
}

function lineKeyAliases(value) {
  const compact = normalizeLineKey(value);
  if (!compact) return [];
  const withoutServicePrefix = compact.replace(/^[A-Z](?=\d{5,}$)/, '');
  return [...new Set([compact, withoutServicePrefix].filter(Boolean))];
}

function activeLineKeyAliases(branchNames, config) {
  const aliases = new Set();
  for (const branchName of branchNames || []) {
    for (const alias of lineKeyAliases(deriveLineKeyFromBranchName(branchName, config))) aliases.add(alias);
  }
  return aliases;
}

function rowLineKey(row, config) {
  const mapped = computeLineNoKey(row, config?.linelist?.fieldMap || {});
  const compact = normalizeLineKey(mapped);
  if (compact && !/^[A-Z]$/.test(compact)) return mapped;
  return rowText(row, [
    'lineNoKey', 'lineNo', 'lineKey', 'lineSeqNo',
    'LineNo', 'Line No', 'Line Number', 'PipelineReference',
  ]);
}

function lineRowApplies(row, aliases, config) {
  if (!aliases.size) return false;
  return lineKeyAliases(rowLineKey(row, config)).some((alias) => aliases.has(alias));
}

function addRequirement(target, value, source) {
  const display = text(value).toUpperCase();
  const normalized = normalizePipingClass(display);
  if (!normalized) return;
  const existing = target.get(normalized);
  if (existing) {
    existing.sources.add(source);
    return;
  }
  target.set(normalized, { value: display, normalized, sources: new Set([source]) });
}

function addOverrideBucket(target, bucket, source) {
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return;
  for (const value of Object.values(bucket)) addRequirement(target, value, source);
}

export function collectEffectivePipingClassRequirements({ branchNames = [], config = {} } = {}) {
  const requirements = new Map();

  for (const branchName of branchNames || []) {
    addRequirement(requirements, branchClassToken(branchName, config), 'branch-name');
  }

  const aliases = activeLineKeyAliases(branchNames, config);
  const lineRows = Array.isArray(config?.linelist?.masterRows) ? config.linelist.masterRows : [];
  for (const row of lineRows) {
    if (!lineRowApplies(row, aliases, config)) continue;
    addRequirement(
      requirements,
      rowText(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'SPEC', 'Spec']),
      'line-list',
    );
  }

  const overrides = config?.overrides || {};
  addOverrideBucket(requirements, overrides.pipingClass, 'override');
  addOverrideBucket(requirements, overrides.pipingClassApprox, 'override');
  addOverrideBucket(requirements, overrides.approxPipingClass, 'override');

  const processData = overrides.processData;
  if (processData && typeof processData === 'object' && !Array.isArray(processData)) {
    for (const value of Object.values(processData)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      addRequirement(
        requirements,
        value.pipingClass ?? value['Piping Class'] ?? value.PIPING_CLASS,
        'process-data',
      );
    }
  }

  return [...requirements.values()]
    .map((item) => ({ ...item, sources: [...item.sources].sort() }))
    .sort((left, right) => left.normalized.localeCompare(right.normalized, undefined, { numeric: true }));
}

export function loadedPipingClassSet(rows = []) {
  const out = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const normalized = normalizePipingClass(
      rowText(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS', 'SPEC', 'Spec', 'Class']),
    );
    if (normalized && normalized !== 'ONDEMAND') out.add(normalized);
  }
  return out;
}

export function matchPipingClassIndexRequirements(index, requirements = []) {
  const classes = index?.classes && typeof index.classes === 'object' && !Array.isArray(index.classes)
    ? index.classes
    : {};
  const required = new Map((requirements || []).map((item) => [
    normalizePipingClass(item?.normalized || item?.value || item),
    item,
  ]).filter(([key]) => key));
  const matched = [];
  const matchedRequired = new Set();

  for (const [classKey, meta] of Object.entries(classes)) {
    const aliases = [classKey, ...(Array.isArray(meta?.matchTokens) ? meta.matchTokens : [])]
      .map(normalizePipingClass)
      .filter(Boolean);
    const requirement = aliases.map((alias) => required.get(alias)).find(Boolean);
    if (!requirement) continue;
    matched.push({ classKey, meta, requirement });
    matchedRequired.add(normalizePipingClass(requirement?.normalized || requirement?.value || requirement));
  }

  const unmatched = [...required.entries()]
    .filter(([key]) => !matchedRequired.has(key))
    .map(([, requirement]) => requirement);

  matched.sort((left, right) => normalizePipingClass(left.classKey).localeCompare(
    normalizePipingClass(right.classKey),
    undefined,
    { numeric: true },
  ));
  return { matched, unmatched };
}

export function effectivePipingClassRequirementSignature(requirements = []) {
  return (requirements || [])
    .map((item) => normalizePipingClass(item?.normalized || item?.value || item))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
    .join('|');
}
