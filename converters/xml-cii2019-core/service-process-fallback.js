const DEFAULT_FIELDS = Object.freeze(['p1', 'hydroPressure', 't1', 't2', 't3', 'density']);

const PROCESS_ALIASES = Object.freeze({
  p1: Object.freeze(['p1', 'P1', 'Pressure1', 'Design Pressure', 'DesignPressure', 'Pressure Max kPa(g)', 'Pressure Max', 'PressureMax', 'Operating Pressure']),
  hydroPressure: Object.freeze(['hydroPressure', 'hydro_pressure', 'HydroPressure', 'Hydro Test Pressure', 'Hydrotest Pressure', 'Hydro Pressure', 'Hydro Pr', 'Hyd Test Pr', 'Test Pressure', 'TEST_PRESSURE', 'HYDRO_TEST_PRESSURE', 'Pressure2', 'Hydro/Test Pressure']),
  t1: Object.freeze(['t1', 'T1', 'Temperature1', 'Design Temp', 'Design Temperature', 'Temp Max ºC', 'Temp Max °C', 'Temp Max', 'Operating Temp']),
  t2: Object.freeze(['t2', 'T2', 'Temperature2', 'Temp. ºC', 'Temp. °C', 'Operating Temp', 'Operating Temperature', 'Temperature']),
  t3: Object.freeze(['t3', 'T3', 'Temperature3', 'Temp Min ºC', 'Temp Min °C', 'Min Temp', 'Minimum Temp']),
  density: Object.freeze(['density', 'Density', 'fluidDensity', 'FluidDensity', 'Fluid Density', 'densityMixed', 'densityGas', 'densityLiquid', 'Mixed kg/m³', 'Gas kg/m³', 'Liquid kg/m³']),
});

const SERVICE_ALIASES = Object.freeze(['service', 'Service', 'SERVICE', 'fluid', 'Fluid', 'FLUID', 'lineKey1', 'Key 1', 'ColumnX1', 'Medium', 'medium']);

function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function cleanComparable(value) {
  return text(value).toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9/_-]/g, '');
}

function headerKey(value) {
  return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '');
}

function rowValue(row, keys = []) {
  if (!row || typeof row !== 'object') return '';
  const wanted = keys.map(headerKey).filter(Boolean);
  for (const source of [row, row._raw]) {
    if (!source || typeof source !== 'object') continue;
    for (const key of keys) {
      const direct = source[key];
      if (text(direct)) return text(direct);
    }
    for (const [key, value] of Object.entries(source)) {
      if (wanted.includes(headerKey(key)) && text(value)) return text(value);
    }
  }
  return '';
}

function processRowValue(row, field) {
  return rowValue(row, PROCESS_ALIASES[field] || [field]);
}

export function numericXmlCiiServiceProcessValue(value) {
  const raw = text(value).replace(/,/g, '');
  const match = raw.match(/^\s*([-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)/);
  return match ? match[1] : '';
}

function serviceFromRow(row) {
  return rowValue(row, SERVICE_ALIASES);
}

function stripBranchSuffix(branchName) {
  return text(branchName).replace(/^\/+/, '').replace(/\/B\d+$/i, '');
}

function looksLikeSize(token) {
  return /^(?:\d+(?:\.\d+)?|\d+\s*\/\s*\d+)(?:\s*(?:in|inch|"))?$/i.test(text(token));
}

function looksLikeLineKey(token) {
  const value = text(token);
  if (!value || looksLikeSize(value)) return false;
  return /^(?=.*[A-Za-z])(?=.*\d{4,})[A-Za-z][A-Za-z0-9_./-]*$/i.test(value);
}

function looksLikePipingClass(token) {
  const value = text(token);
  return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{4,}$/i.test(value) && !looksLikeLineKey(value);
}

export function deriveXmlCiiServiceFromBranchName(branchName, config = {}) {
  const explicit = rowValue({ branchName }, ['service', 'Service', 'fluid', 'Fluid']);
  if (explicit) return explicit;
  const delimiter = text(config?.linelist?.tokenDelimiter) || '-';
  const tokens = stripBranchSuffix(branchName).split(delimiter).map((part) => text(part)).filter(Boolean);
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!token) continue;
    if (looksLikeSize(token) || looksLikeLineKey(token) || looksLikePipingClass(token)) continue;
    if (/^[A-Za-z][A-Za-z0-9_/.-]{1,10}$/i.test(token)) return token;
  }
  return '';
}

function majorityValue(rows, field, options = {}) {
  const values = [];
  const buckets = new Map();
  for (const row of rows) {
    // Every supported fallback field is numerically consumed by Preview/CII.
    // Reject labels such as "Water" rather than persisting them as pressure or
    // temperature overrides. Numeric cells may still carry trailing units.
    const raw = numericXmlCiiServiceProcessValue(processRowValue(row, field));
    if (!raw) continue;
    const key = cleanComparable(raw);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, { value: raw, count: 0, sourceRows: [] });
    const bucket = buckets.get(key);
    bucket.count += 1;
    bucket.sourceRows.push(row?._sourceRowIndex || row?._rowIndex || '');
    values.push(key);
  }
  const populated = values.length;
  if (!populated) return null;
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  const best = sorted[0];
  const confidence = best.count / populated;
  const threshold = Number(options.threshold ?? 0.7);
  if (best.count < 1 || confidence < threshold) return null;
  return {
    value: best.value,
    field,
    source: 'service-match',
    confidence,
    agreeingRows: best.count,
    populatedRows: populated,
    sourceRows: best.sourceRows.filter(Boolean),
    needsReview: true,
  };
}

export function buildXmlCiiServiceProcessFallback({ branchName = '', lineRow = null, requestedPipingClass = '', href = '', tref = '', config = {}, fields = DEFAULT_FIELDS, options = {} } = {}) {
  const service = serviceFromRow(lineRow) || deriveXmlCiiServiceFromBranchName(branchName, config);
  const serviceKey = cleanComparable(service);
  const classKey = cleanComparable(requestedPipingClass);
  const rows = Array.isArray(config?.linelist?.masterRows) ? config.linelist.masterRows : [];
  const minRows = Number(options.minRows ?? config?.serviceProcessFallback?.minRows ?? 2);
  const threshold = Number(options.threshold ?? config?.serviceProcessFallback?.threshold ?? 0.7);
  if (!serviceKey || !rows.length) return { service, serviceKey, rows: [], fields: {}, stats: { matchedRows: 0, resolvedFields: 0 }, reason: serviceKey ? 'no-line-list-rows' : 'no-service' };
  
  let matchedRows = rows
    .map((row, index) => ({ ...row, _raw: row, _sourceRowIndex: row?._sourceRowIndex || row?._rowIndex || index + 1 }))
    .filter((row) => cleanComparable(serviceFromRow(row)) === serviceKey);
    
  if (classKey) {
     const classMatched = matchedRows.filter(row => cleanComparable(rowValue(row, ['pipingClass', 'Piping Class', 'PIPING_CLASS'])) === classKey);
     if (classMatched.length > 0) {
       matchedRows = classMatched;
       
       if (href || tref) {
         const hrefKey = cleanComparable(href);
         const trefKey = cleanComparable(tref);
         const connectedMatches = matchedRows.filter(row => {
           const rowKey = cleanComparable(rowValue(row, ['lineNoKey', 'lineNo', 'lineKey', 'Line Number']));
           if (!rowKey) return false;
           return (hrefKey && hrefKey.includes(rowKey)) || (trefKey && trefKey.includes(rowKey));
         });
         
         if (connectedMatches.length > 0) {
            matchedRows = connectedMatches;
         }
       }
     }
  }

  const requiredMinRows = matchedRows.length === 1 && (href || tref) ? 1 : minRows;
  if (matchedRows.length < requiredMinRows) return { service, serviceKey, rows: matchedRows, fields: {}, stats: { matchedRows: matchedRows.length, resolvedFields: 0 }, reason: 'not-enough-service-rows' };
  const resolved = {};
  for (const field of fields || DEFAULT_FIELDS) {
    const value = majorityValue(matchedRows, field, { threshold });
    if (value) resolved[field] = { ...value, service, matchedRows: matchedRows.length, threshold };
  }
  return {
    service,
    serviceKey,
    rows: matchedRows,
    fields: resolved,
    stats: { matchedRows: matchedRows.length, resolvedFields: Object.keys(resolved).length },
    reason: Object.keys(resolved).length ? 'service-consensus' : 'no-field-consensus',
  };
}

function shouldReplaceProcessValue(row, field) {
  const source = text(row?.[`${field}Source`]);
  const value = text(row?.[field]);
  if (!value) return true;
  return source === 'default' || source === 'default-zero' || source === 'none' || source === 'config-default';
}

export function applyXmlCiiServiceProcessFallbackToPreviewRows(rows = [], config = {}, options = {}) {
  let resolvedRows = 0;
  let resolvedFields = 0;
  const diagnostics = [];
  const nextRows = (Array.isArray(rows) ? rows : []).map((row) => {
    if (!row?.lineMiss) return row;
    const fallback = buildXmlCiiServiceProcessFallback({ branchName: row.branchName, lineRow: row, config, options });
    if (!fallback.stats.resolvedFields) return row;
    const next = { ...row, serviceProcessFallback: fallback };
    let rowFields = 0;
    for (const [field, info] of Object.entries(fallback.fields)) {
      if (!shouldReplaceProcessValue(next, field)) continue;
      next[field] = info.value;
      next[`${field}Source`] = 'service-match';
      next[`${field}SourceField`] = `Service=${fallback.service}`;
      next[`${field}NeedsReview`] = true;
      rowFields += 1;
      resolvedFields += 1;
    }
    if (rowFields > 0) {
      resolvedRows += 1;
      diagnostics.push({
        type: 'service-process-fallback-applied',
        branchName: row.branchName || '',
        lineKey: row.lineKey || '',
        service: fallback.service,
        matchedRows: fallback.stats.matchedRows,
        resolvedFields: rowFields,
        message: `Exact Line No key was not found; process values were suggested from matching Service=${fallback.service} rows.`,
      });
    }
    return next;
  });
  return {
    rows: nextRows,
    diagnostics,
    stats: {
      serviceProcessFallbackRows: resolvedRows,
      serviceProcessFallbackFields: resolvedFields,
    },
  };
}
