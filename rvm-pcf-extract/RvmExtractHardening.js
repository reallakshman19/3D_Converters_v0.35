import { auditCaUnits } from './RvmLineListUnitDetector.js';

const NPS_TO_MM = {
  '1/2': 15,
  '3/4': 20,
  '1': 25,
  '1-1/4': 32,
  '1-1/2': 40,
  '2': 50,
  '2-1/2': 65,
  '3': 80,
  '3-1/2': 90,
  '4': 100,
  '5': 125,
  '6': 150,
  '8': 200,
  '10': 250,
  '12': 300,
  '14': 350,
  '16': 400,
  '18': 450,
  '20': 500,
  '24': 600,
  '30': 750,
  '36': 900,
  '42': 1050,
  '48': 1200,
};

function _clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function _normaliseFraction(str) {
  const whole = str.match(/^(\d+)-(\d+)\/(\d+)$/);
  if (whole) {
    return `${parseInt(whole[1], 10)}-${parseInt(whole[2], 10)}/${parseInt(whole[3], 10)}`;
  }

  const frac = str.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    return `${frac[1]}/${frac[2]}`;
  }

  const integer = str.match(/^(\d+(?:\.\d+)?)$/);
  if (integer) {
    const value = parseFloat(integer[1]);
    return Number.isInteger(value) ? String(Math.round(value)) : null;
  }

  return null;
}

function _hasCoord(value) {
  if (!value || typeof value !== 'object') return false;

  return (
    Number.isFinite(Number(value.x)) &&
    Number.isFinite(Number(value.y)) &&
    Number.isFinite(Number(value.z))
  );
}

function _safeStem(value, fallback = 'RVM-EXTRACT') {
  const safe = _clean(value || fallback)
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');

  return safe || fallback;
}

function _safePcfFilename(ref) {
  return `${_safeStem(ref)}.pcf`;
}

function _crc32(bytes) {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];

    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function _u16(value) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function _u32(value) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function _dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);

  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return { dosTime, dosDate };
}

function _concatUint8(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
}

/**
 * Minimal deterministic ZIP writer.
 * Inputs: array of { name, content } text files.
 * Output: Uint8Array ZIP bytes using STORE method only.
 * Fallback: no external JSZip dependency; browser download is skipped in non-DOM runtimes.
 */
function _createStoredZip(files) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  const { dosTime, dosDate } = _dosDateTime(new Date());
  let offset = 0;

  const sortedFiles = [...files].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  for (const file of sortedFiles) {
    const nameBytes = encoder.encode(file.name);
    const dataBytes = encoder.encode(file.content ?? '');
    const crc = _crc32(dataBytes);

    const localHeader = new Uint8Array([
      ..._u32(0x04034b50),
      ..._u16(20),
      ..._u16(0x0800),
      ..._u16(0),
      ..._u16(dosTime),
      ..._u16(dosDate),
      ..._u32(crc),
      ..._u32(dataBytes.length),
      ..._u32(dataBytes.length),
      ..._u16(nameBytes.length),
      ..._u16(0),
    ]);

    localChunks.push(localHeader, nameBytes, dataBytes);

    const centralHeader = new Uint8Array([
      ..._u32(0x02014b50),
      ..._u16(20),
      ..._u16(20),
      ..._u16(0x0800),
      ..._u16(0),
      ..._u16(dosTime),
      ..._u16(dosDate),
      ..._u32(crc),
      ..._u32(dataBytes.length),
      ..._u32(dataBytes.length),
      ..._u16(nameBytes.length),
      ..._u16(0),
      ..._u16(0),
      ..._u16(0),
      ..._u16(0),
      ..._u32(0),
      ..._u32(offset),
    ]);

    centralChunks.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + dataBytes.length;
  }

  const centralStart = offset;
  const centralData = _concatUint8(centralChunks);
  const centralSize = centralData.length;

  const endRecord = new Uint8Array([
    ..._u32(0x06054b50),
    ..._u16(0),
    ..._u16(0),
    ..._u16(sortedFiles.length),
    ..._u16(sortedFiles.length),
    ..._u32(centralSize),
    ..._u32(centralStart),
    ..._u16(0),
  ]);

  return _concatUint8([...localChunks, centralData, endRecord]);
}

function _downloadBlob(filename, blob) {
  if (typeof document === 'undefined') return false;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return true;
}

export class RvmExtractHardening {
  sortRows(rows) {
    rows.sort((a, b) => {
      const r = (a.pipelineRef || '').localeCompare(b.pipelineRef || '');
      if (r !== 0) return r;

      const s = (a.sourcePath || '').localeCompare(b.sourcePath || '');
      if (s !== 0) return s;

      const t = (a.type || '').localeCompare(b.type || '');
      if (t !== 0) return t;

      return (a.sourceCanonicalId || '').localeCompare(b.sourceCanonicalId || '');
    });

    rows.forEach((row, i) => {
      row.rowNo = (i + 1) * 10;

      if (row.ca && row.ca['98'] != null) {
        // Keep existing CA98.
      } else {
        if (!row.ca) row.ca = {};
        row.ca['98'] = row.rowNo;
      }
    });

    return rows;
  }

  exportMasters(masters) {
    return {
      schema: 'rvm-json-pcf-extract-masters/v1',
      exportedAt: new Date().toISOString(),
      masters,
    };
  }

  importMasters(jsonStringOrObj) {
    try {
      const parsed =
        typeof jsonStringOrObj === 'string'
          ? JSON.parse(jsonStringOrObj)
          : jsonStringOrObj;

      if (parsed && parsed.masters) return { masters: parsed.masters, diagnostics: [] };
      if (parsed && typeof parsed === 'object') return { masters: parsed, diagnostics: [] };

      return { masters: null, diagnostics: ['MASTERS-IMPORT-FAILED'] };
    } catch (e) {
      return { masters: null, diagnostics: ['MASTERS-IMPORT-FAILED'] };
    }
  }

  resolveValveAmbiguity(rows, rowNo, candidateIndex) {
    const row = rows.find(r => r.rowNo === rowNo);
    if (!row) return { resolved: false, row: null };

    const requests = row.ambiguousValveWeightRequests;
    if (!requests || !requests.length) return { resolved: false, row };

    const candidates = requests[0].candidates;
    if (!candidates || candidateIndex >= candidates.length) {
      return { resolved: false, row };
    }

    if (!row.ca) row.ca = {};
    row.ca['8'] = candidates[candidateIndex].weight;
    row.ambiguousValveWeightRequests = [];
    row.valveWeightSource = 'WM-VALVE-CA8-RESOLVED';

    return { resolved: true, row };
  }

  parseLineKeyBoreMm(value) {
    const text = _clean(value).toUpperCase();
    if (!text) return null;

    const directDn = text.match(/(?:^|[^A-Z0-9])DN\s*([0-9]{2,4})(?:[^0-9]|$)/);
    if (directDn) return Number(directDn[1]);

    const quotedInch = text.match(/([0-9]{1,2}(?:-[0-9]\/[0-9]|\/[0-9])?)"/);
    if (quotedInch) {
      const key = _normaliseFraction(quotedInch[1]);
      if (key && NPS_TO_MM[key] != null) return NPS_TO_MM[key];
    }

    const delimited = text.match(
      /(?:^|[-_\s])([0-9]{1,2}(?:-[0-9]\/[0-9]|\/[0-9])?)(?=[-_\s])/
    );
    if (delimited && NPS_TO_MM[delimited[1]] != null) {
      return NPS_TO_MM[delimited[1]];
    }

    const explicit = text.match(
      /(?:NPS|SIZE|BORE)\s*[-:=]?\s*([0-9]{1,2}(?:-[0-9]\/[0-9]|\/[0-9])?)/
    );
    if (explicit && NPS_TO_MM[explicit[1]] != null) {
      return NPS_TO_MM[explicit[1]];
    }

    return null;
  }

  buildPcfAuditReport(rows = [], pcfTextByPipelineRef = {}, sourceLabel = '') {
    const diagnostics = [];
    const pcfRefs = Object.keys(pcfTextByPipelineRef || {});

    const unitAudit = auditCaUnits(rows);

    const summary = {
      rowCount: rows.length,
      includedRows: 0,
      excludedRows: 0,
      missingCoordinateRows: 0,
      rowsWithCa21: 0,
      rowsWithConvertedBore: 0,
      rowsWithLineKeyBoreCandidate: 0,
      pipelineRefs: {},
      componentTypes: {},
      pcfPipelineCount: pcfRefs.length,
      expectedDownloadMode: pcfRefs.length > 1 ? 'zip' : 'single-file',
      pcfFilenames: pcfRefs.map(_safePcfFilename),
      generatedOriginCoordinateLines: 0,
      generatedComponentAttributeLines: 0,
      masterResolutionPending: 0,
      masterResolutionExact: 0,
      masterResolutionFuzzy: 0,
      masterResolutionManual: 0,
      weightCa8Matched: 0,
      weightCa8Ambiguous: 0,
      weightCa8NoMatch: 0,
      lineListManual: 0,
      lineListNoMatch: 0,
      pipingClassFuzzy: 0,
      pipingClassNoMatch: 0,
    };

    const push = (severity, code, message, row = {}, extra = {}) => {
      diagnostics.push({
        severity,
        code,
        message,
        rowNo: row.rowNo ?? null,
        type: row.type ?? null,
        pipelineRef: row.pipelineRef ?? null,
        sourceCanonicalId: row.sourceCanonicalId ?? null,
        ...extra,
      });
    };

    const requiredByType = {
      BRANCH: [],
      PIPE: ['ep1', 'ep2'],
      BEND: ['ep1', 'ep2', 'cp'],
      TEE: ['ep1', 'ep2', 'cp', 'bp'],
      OLET: ['cp', 'bp'],
    };

    for (const row of rows) {
      const type = _clean(row.type || 'UNKNOWN').toUpperCase();
      const ref = _clean(row.pipelineRef || 'RVM-EXTRACT');

      summary.componentTypes[type] = (summary.componentTypes[type] || 0) + 1;
      summary.pipelineRefs[ref] = (summary.pipelineRefs[ref] || 0) + 1;

      if (row.include === false) summary.excludedRows += 1;
      else summary.includedRows += 1;

      const required = requiredByType[type] || (type === 'SUPPORT' ? [] : ['ep1', 'ep2']);

      for (const key of required) {
        if (!_hasCoord(row[key])) {
          summary.missingCoordinateRows += 1;
          push(
            'ERROR',
            'PCF-MISSING-COORDINATE',
            `${type} row ${row.rowNo ?? '?'} (${row.sourceCanonicalId ?? 'unknown'}) missing ${key}`,
            row,
            { required: key }
          );
        }
      }

      if (
        type === 'SUPPORT' &&
        !_hasCoord(row.supportCoor) &&
        !_hasCoord(row.cp) &&
        !_hasCoord(row.ep1)
      ) {
        summary.missingCoordinateRows += 1;
        push(
          'ERROR',
          'PCF-MISSING-COORDINATE',
          `SUPPORT row ${row.rowNo ?? '?'} (${row.sourceCanonicalId ?? 'unknown'}) missing supportCoor/cp/ep1`,
          row,
          { required: ['supportCoor', 'cp', 'ep1'] }
        );
      }

      if (row.ca && row.ca['21'] != null) {
        summary.rowsWithCa21 += 1;
        push(
          'WARNING',
          'PCF-CA21-SOURCE',
          'Source row contains CA21; verify whether this is intended.',
          row,
          { ca21: row.ca['21'] }
        );
      }

      if (row.convertedBore != null) summary.rowsWithConvertedBore += 1;

      const parsedLineKeyBore = this.parseLineKeyBoreMm(
        row.lineKey || row.pipelineRef || row.name || row.sourcePath || ''
      );

      if (parsedLineKeyBore != null) {
        summary.rowsWithLineKeyBoreCandidate += 1;

        if (row.convertedBore == null) {
          push(
            'WARNING',
            'PCF-LINEKEY-BORE-NOT-WIRED',
            'Line key contains bore candidate but convertedBore is empty.',
            row,
            { parsedLineKeyBore }
          );
        }
      }

      const rowDiagnostics = Array.isArray(row.diagnostics) ? row.diagnostics : [];

      if (rowDiagnostics.some(d => String(d).includes('EXACT-MATCH'))) {
        summary.masterResolutionExact += 1;
      }

      if (rowDiagnostics.some(d => String(d).includes('FUZZY-MATCH'))) {
        summary.masterResolutionFuzzy += 1;
      }

      if (rowDiagnostics.some(d => String(d).includes('MANUAL'))) {
        summary.masterResolutionManual += 1;
      }

      if (rowDiagnostics.some(d => String(d).includes('USER-RESOLVED'))) {
        summary.masterResolutionManual += 1;
      }

      if (rowDiagnostics.includes('WM-WEIGHT-CA8-MATCH')) {
        summary.weightCa8Matched += 1;
      }

      if (rowDiagnostics.includes('WM-WEIGHT-CA8-AMBIGUOUS')) {
        summary.weightCa8Ambiguous += 1;
      }

      if (rowDiagnostics.includes('WM-WEIGHT-CA8-NO-MATCH')) {
        summary.weightCa8NoMatch += 1;
      }

      if (rowDiagnostics.includes('LINELIST-MANUAL')) {
        summary.lineListManual += 1;
      }

      if (rowDiagnostics.some(d => String(d).includes('LINELIST') && String(d).includes('NO_MATCH'))) {
        summary.lineListNoMatch += 1;
      }

      if (rowDiagnostics.includes('PCF-CLASS-FUZZY-MATCH')) {
        summary.pipingClassFuzzy += 1;
      }

      if (rowDiagnostics.some(d => String(d).includes('PCF-CLASS') && String(d).includes('NO_MATCH'))) {
        summary.pipingClassNoMatch += 1;
      }

      if (
        rowDiagnostics.includes('WM-WEIGHT-CA8-AMBIGUOUS') ||
        rowDiagnostics.includes('WM-WEIGHT-CA8-NO-MATCH') ||
        rowDiagnostics.some(d => String(d).includes('LINELIST') && String(d).includes('NO_MATCH')) ||
        rowDiagnostics.some(d => String(d).includes('PCF-CLASS') && String(d).includes('NO_MATCH'))
      ) {
        summary.masterResolutionPending += 1;
      }
    }

    for (const [ref, text] of Object.entries(pcfTextByPipelineRef || {})) {
      const body = String(text || '');

      const originLines =
        body.match(
          /^\s*(END-POINT|CENTRE-POINT|BRANCH1-POINT|CO-ORDS)\s+0(?:\.0+)?\s+0(?:\.0+)?\s+0(?:\.0+)?(?:\s+0(?:\.0+)?)?\s*$/gm
        ) || [];

      summary.generatedOriginCoordinateLines += originLines.length;

      if (originLines.length) {
        push(
          'ERROR',
          'PCF-FAKE-ORIGIN-COORDINATE',
          `Generated PCF ${ref} has origin coordinate line(s).`,
          { pipelineRef: ref },
          { count: originLines.length }
        );
      }

      const compAttr = body.match(/^\s*COMPONENT-ATTRIBUTE\d+\s+/gm) || [];
      summary.generatedComponentAttributeLines += compAttr.length;
    }

    const bySeverity = diagnostics.reduce((acc, item) => {
      acc[item.severity] = (acc[item.severity] || 0) + 1;
      return acc;
    }, {});

    return {
      schema: 'pcf-extract-audit/v1',
      sourceLabel,
      generatedAt: new Date().toISOString(),
      pass: !bySeverity.ERROR && unitAudit.pass,
      bySeverity,
      summary: {
        ...summary,
        ...unitAudit.summary
      },
      diagnostics: [
        ...diagnostics,
        ...unitAudit.diagnostics.map(d => ({ ...d, _source: 'unit-audit' }))
      ],
    };
  }

  buildValidationRegister(rows) {
    const register = [];

    for (const row of rows) {
      const meta = {
        rowNo: row.rowNo,
        type: row.type,
        name: row.name,
        pipelineRef: row.pipelineRef,
        sourceCanonicalId: row.sourceCanonicalId,
      };

      if (row.diagnostics && Array.isArray(row.diagnostics)) {
        for (const code of row.diagnostics) {
          register.push({
            severity: this._severity(code),
            code,
            message: code,
            ...meta,
          });
        }
      }

      if (row.ambiguousValveWeightRequests && row.ambiguousValveWeightRequests.length) {
        const code = 'WM-VALVE-CA8-AMBIGUOUS';

        register.push({
          severity: this._severity(code),
          code,
          message: `Valve weight ambiguous: ${row.ambiguousValveWeightRequests.length} candidate(s)`,
          ...meta,
        });
      }
    }

    return register;
  }

  _severity(code) {
    if (code.includes('MISSING-GEOMETRY')) return 'ERROR';

    if (
      code.includes('AMBIGUOUS') ||
      code.includes('UNRESOLVED') ||
      code.includes('INCOMPLETE') ||
      code.includes('NO-MATCH')
    ) {
      return 'WARNING';
    }

    return 'INFO';
  }

  downloadAllPcf(pcfTextByPipelineRef) {
    const entries = Object.entries(pcfTextByPipelineRef || {}).map(([ref, text]) => ({
      ref,
      name: _safePcfFilename(ref),
      content: String(text ?? ''),
    }));

    if (typeof document === 'undefined') {
      return entries.length > 1
        ? [`${_safeStem('rvm-pcf-extract')}.zip`]
        : entries.map(entry => entry.name);
    }

    if (!entries.length) {
      return [];
    }

    if (entries.length === 1) {
      const [entry] = entries;

      _downloadBlob(
        entry.name,
        new Blob([entry.content], { type: 'application/octet-stream' })
      );

      return [entry.name];
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipName = `rvm-pcf-extract-${ts}.zip`;
    const zipBytes = _createStoredZip(entries);

    _downloadBlob(
      zipName,
      new Blob([zipBytes], { type: 'application/zip' })
    );

    return [zipName];
  }
}
