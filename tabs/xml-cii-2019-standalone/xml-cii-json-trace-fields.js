export const DEFAULT_JSON_TRACE_CAPTURE_FIELDS = Object.freeze([
  { name: 'DTXR_POS', enabled: true },
  { name: 'DTXR_PS', enabled: true },
  { name: 'DTXR', enabled: true },
  { name: 'SPRE', enabled: true },
  { name: 'SPREF', enabled: true },
  { name: 'MDSSUPPTYPE', enabled: true },
  { name: 'NAME', enabled: true },
  { name: 'CMPSUPGAP', enabled: true },
]);

const PRIMARY_FIELD_ORDER = Object.freeze(['DTXR', 'SPRE', 'SPREF', 'DTXR_PS', 'DTXR_POS']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function safeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeName(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

export function normalizeJsonTraceCaptureFields(value) {
  const source = Array.isArray(value) && value.length ? value : DEFAULT_JSON_TRACE_CAPTURE_FIELDS;
  const out = [];
  const seen = new Set();
  for (const item of source) {
    const rawName = typeof item === 'string' ? item : item?.name ?? item?.field ?? item?.key;
    const name = normalizeName(rawName);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push({ name, enabled: typeof item === 'object' ? item.enabled !== false : true });
  }
  return out.length ? out : DEFAULT_JSON_TRACE_CAPTURE_FIELDS.map((item) => ({ ...item }));
}

function caseInsensitiveValue(source, fieldName) {
  const wanted = normalizeName(fieldName);
  for (const [key, value] of Object.entries(safeObject(source))) {
    if (normalizeName(key) === wanted && text(value)) return text(value);
  }
  return '';
}

export function captureConfiguredJsonTraceFields(rawValue, config = {}) {
  const raw = safeObject(rawValue);
  const attrs = safeObject(raw.attributes || raw.ATTRIBUTES || raw.rawAttributes);
  const fields = normalizeJsonTraceCaptureFields(config.captureFields);
  const captured = {};
  for (const field of fields) {
    if (!field.enabled) continue;
    const value = caseInsensitiveValue(attrs, field.name) || caseInsensitiveValue(raw, field.name);
    if (value) captured[field.name] = value;
  }
  return captured;
}

export function configuredJsonTraceFieldNames(config = {}) {
  return normalizeJsonTraceCaptureFields(config.captureFields)
    .filter((field) => field.enabled)
    .map((field) => field.name);
}

function fallbackDescriptor(member = {}) {
  return text(member.labeled || member.description || member.dtxr || member.type || member.raw?.type);
}

export function formatConfiguredJsonTraceMember(member = {}, config = {}) {
  const captured = safeObject(member.capturedFields);
  const fields = configuredJsonTraceFieldNames(config);
  const primaryName = PRIMARY_FIELD_ORDER.find((name) => fields.includes(name) && text(captured[name]));
  const descriptor = text(primaryName ? captured[primaryName] : '') || fallbackDescriptor(member);
  const name = fields.includes('NAME') ? text(captured.NAME || member.name) : '';
  let output = descriptor;
  if (name && !output.toUpperCase().includes('NAME=')) output += `(NAME=${name})`;
  const extras = [];
  for (const fieldName of fields) {
    if (fieldName === primaryName || fieldName === 'NAME' || fieldName === 'DTXR_POS') continue;
    const value = text(captured[fieldName]);
    if (!value) continue;
    if (output.toUpperCase().includes(`${fieldName}=`)) continue;
    extras.push(`${fieldName}=${value}`);
  }
  return [output, ...extras].filter(Boolean).join(',');
}

export function decorateJsonTraceMember(member = {}, config = {}) {
  return {
    ...member,
    capturedFields: captureConfiguredJsonTraceFields(member.raw || member, config),
  };
}

function memberIdentity(member = {}) {
  return text(member.path || member.sourcePath)
    || `${text(member.jsonNodeNo)}|${text(member.description || member.dtxrPosValue)}|${text(member.name)}`;
}

function uniqueValues(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function supportKindsFromCapturedMembers(members = []) {
  const kinds = [];
  for (const member of members) {
    const code = text(member?.capturedFields?.MDSSUPPTYPE).toUpperCase();
    if (code.startsWith('GT')) kinds.push('GUIDE');
    if (code.startsWith('ST')) kinds.push('LINESTOP');
  }
  return uniqueValues(kinds);
}

export function decorateJsonTraceLedger(ledgerResult = {}, config = {}) {
  const groups = Array.isArray(ledgerResult.groups)
    ? ledgerResult.groups.map((group) => ({
      ...group,
      entries: Array.isArray(group.entries)
        ? group.entries.map((entry) => decorateJsonTraceMember(entry, config))
        : [],
    }))
    : [];
  const byPath = new Map();
  for (const group of groups) {
    for (const entry of group.entries) {
      const key = memberIdentity(entry);
      if (key) byPath.set(key, entry);
    }
  }
  const records = Array.isArray(ledgerResult.records)
    ? ledgerResult.records.map((record) => {
      const positionMembers = Array.isArray(record.positionMembers)
        ? record.positionMembers.map((member) => byPath.get(memberIdentity(member))
          || decorateJsonTraceMember(member, config))
        : [];
      return {
        ...record,
        positionMembers,
        derivedSupportTypes: uniqueValues([
          ...(Array.isArray(record.derivedSupportTypes) ? record.derivedSupportTypes : []),
          ...supportKindsFromCapturedMembers(positionMembers),
        ]),
      };
    })
    : [];
  return {
    ...ledgerResult,
    groups,
    records,
    ledger: Array.isArray(ledgerResult.ledger) ? records : ledgerResult.ledger,
  };
}
