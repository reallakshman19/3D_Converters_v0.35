(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HpEngineeringLibraryCsv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CATALOG_PATH = '../../docs/Masters/HP_Piping_Class/library-catalog.csv';
  const S_SCHEDULES = new Set(['5S', '10S', '40S', '80S']);

  function parseDelimited(text, delimiter = ',') {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const source = String(text || '').replace(/\r/g, '');
    for (let i = 0; i < source.length; i += 1) {
      const ch = source[i];
      if (quoted) {
        if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === delimiter) { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.some((value) => String(value).length));
  }

  function toObjects(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map((h) => String(h).trim());
    return rows.slice(1).map((row) => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
  }

  function parseCsv(text) { return toObjects(parseDelimited(text, ',')); }
  function parseTsv(text) { return toObjects(parseDelimited(text, '\t')); }

  function csvEscape(value) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function serializeCsv(headers, rows) {
    const lines = [headers.join(',')];
    rows.forEach((row) => lines.push(headers.map((h) => csvEscape(row[h])).join(',')));
    return `${lines.join('\n')}\n`;
  }

  function parseCatalog(text) {
    const rows = parseCsv(text);
    return rows.map((row) => ({
      dataset: String(row.dataset || '').trim(),
      relativePath: String(row.relative_path || '').trim(),
      format: String(row.format || '').trim().toLowerCase(),
      status: String(row.status || '').trim(),
      sourceVersion: String(row.source_version || '').trim(),
      dependencyPath: String(row.dependency_path || '').trim(),
      dependencyVersion: String(row.dependency_version || '').trim(),
    })).filter((row) => row.dataset && row.relativePath);
  }

  function materialRowsFromCsv(text) {
    const rows = parseCsv(text).filter((row) => Object.values(row).some((v) => String(v).trim())).map((row) => ({
      materialSpec: String(row.material_spec || '').trim(),
      grade: String(row.grade || '').trim(),
      condition: String(row.condition || '').trim(),
      temperatureC: String(row.temperature_c || '').trim(),
      allowableStressMpa: String(row.allowable_stress_mpa || '').trim(),
      yieldStrengthMpa: String(row.yield_strength_mpa || '').trim(),
      sourceRef: String(row.source_ref || '').trim(),
    }));
    const errors = validateMaterialCsvRows(rows);
    if (errors.length) throw new Error(errors[0]);
    return rows;
  }

  function overlayRowsFromCsv(text) {
    const rows = parseCsv(text).filter((row) => Object.values(row).some((v) => String(v).trim())).map((row) => ({
      nps: String(row.nps || '').trim(),
      schedule: String(row.schedule || '').trim().toUpperCase(),
      productSpec: String(row.product_spec || '').trim(),
      designDiameterMm: String(row.design_d_max_mm || '').trim(),
      minusTolerancePct: String(row.minus_tolerance_pct || '').trim(),
      sourceRef: String(row.source_ref || '').trim(),
    }));
    const errors = validateProductOverlayRows(rows.map((row) => ({ tag: row.nps, ...row })));
    if (errors.length) throw new Error(errors[0]);
    return rows;
  }

  function dimensionStandard(schedule) {
    return S_SCHEDULES.has(String(schedule).toUpperCase()) ? 'ASME B36.19M' : 'ASME B36.10M';
  }

  function pipeRowsFromMaster(tsvText, sourcePath = '') {
    const rows = parseTsv(tsvText);
    if (!rows.length) return [];
    const schedules = Object.keys(rows[0]).filter((h) => !['INCH', 'OD(mm)', 'BORE', 'OD(in)'].includes(h));
    const expanded = [];
    rows.forEach((row, index) => {
      const nps = String(Number(row.INCH));
      const D = String(row['OD(mm)'] || '').trim();
      schedules.forEach((schedule) => {
        const wall = String(row[schedule] || '').trim();
        if (!wall) return;
        expanded.push({
          tag: nps,
          schedule,
          dimensionStandard: dimensionStandard(schedule),
          productSpec: '',
          referenceOdMm: D,
          designDiameterMm: '',
          nominalWallMm: wall,
          minusTolerancePct: '',
          sourceRef: '',
          geometrySourceRef: `${sourcePath || 'pipe master'} row ${index + 2} / ${schedule}`,
        });
      });
    });
    return expanded;
  }

  function mergeProductOverlay(products, overlays) {
    const map = new Map(overlays.map((row) => [`${Number(row.nps)}|${row.schedule}`, row]));
    return products.map((row) => {
      const overlay = map.get(`${Number(row.tag)}|${String(row.schedule).toUpperCase()}`);
      return overlay ? { ...row, productSpec: overlay.productSpec, designDiameterMm: overlay.designDiameterMm, minusTolerancePct: overlay.minusTolerancePct, sourceRef: overlay.sourceRef } : { ...row };
    });
  }



  function validateMaterialCsvRows(rows) {
    const errors = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const prefix = `Material CSV row ${index + 1}`;
      const temperature = Number(row.temperatureC);
      const S = Number(row.allowableStressMpa);
      const Syt = Number(row.yieldStrengthMpa);
      if (!String(row.materialSpec || '').trim()) errors.push(`${prefix}: material specification is required.`);
      if (!String(row.grade || '').trim()) errors.push(`${prefix}: grade is required.`);
      if (!Number.isFinite(temperature)) errors.push(`${prefix}: temperature must be numeric.`);
      if (!(S > 0)) errors.push(`${prefix}: allowable stress S must be > 0.`);
      if (!(Syt > 0)) errors.push(`${prefix}: Syt must be > 0.`);
      if (!String(row.sourceRef || '').trim()) errors.push(`${prefix}: source reference is required.`);
      const key = `${String(row.materialSpec || '').trim()}|${String(row.grade || '').trim()}|${String(row.condition || '').trim()}|${temperature}`;
      if (seen.has(key)) errors.push(`${prefix}: duplicate material/grade/condition/temperature point.`);
      seen.add(key);
    });
    return errors;
  }

  function validateProductOverlayRows(rows) {
    const errors = [];
    const seen = new Set();
    rows.forEach((row, index) => {
      const hasOverlay = String(row.productSpec || '').trim() || String(row.designDiameterMm || '').trim() || String(row.minusTolerancePct || '').trim() || String(row.sourceRef || '').trim();
      if (!hasOverlay) return;
      const nps = Number(row.tag);
      const schedule = String(row.schedule || '').trim().toUpperCase();
      const dRaw = String(row.designDiameterMm ?? '').trim();
      const designD = dRaw === '' ? NaN : Number(dRaw);
      const toleranceRaw = String(row.minusTolerancePct ?? '').trim();
      const tolerance = toleranceRaw === '' ? NaN : Number(toleranceRaw);
      if (!(nps > 0)) errors.push(`Product overlay row ${index + 1}: NPS must be > 0.`);
      if (!schedule) errors.push(`Product overlay row ${index + 1}: schedule is required.`);
      if (!String(row.productSpec || '').trim()) errors.push(`Product overlay row ${index + 1}: product specification is required.`);
      if (!(designD > 0)) errors.push(`Product overlay row ${index + 1}: design D / maximum permitted OD must be > 0.`);
      if (!(Number.isFinite(tolerance) && tolerance >= 0 && tolerance < 100)) errors.push(`Product overlay row ${index + 1}: minus tolerance must be >= 0 and < 100%.`);
      if (!String(row.sourceRef || '').trim()) errors.push(`Product overlay row ${index + 1}: purchase/tolerance source is required.`);
      const key = `${nps}|${schedule}`;
      if (seen.has(key)) errors.push(`Product overlay row ${index + 1}: duplicate NPS/schedule ${key}.`);
      seen.add(key);
    });
    return errors;
  }

  function materialCsv(rows) {
    const headers = ['material_spec','grade','condition','temperature_c','allowable_stress_mpa','yield_strength_mpa','source_ref'];
    return serializeCsv(headers, rows.map((row) => ({
      material_spec: row.materialSpec, grade: row.grade, condition: row.condition, temperature_c: row.temperatureC,
      allowable_stress_mpa: row.allowableStressMpa, yield_strength_mpa: row.yieldStrengthMpa, source_ref: row.sourceRef,
    })));
  }

  function productOverlayCsv(rows) {
    const headers = ['nps','schedule','product_spec','design_d_max_mm','minus_tolerance_pct','source_ref'];
    const overlays = rows.filter((row) => String(row.productSpec || '').trim() || String(row.designDiameterMm || '').trim() || String(row.minusTolerancePct || '').trim() || String(row.sourceRef || '').trim());
    return serializeCsv(headers, overlays.map((row) => ({
      nps: row.tag, schedule: row.schedule, product_spec: row.productSpec, design_d_max_mm: row.designDiameterMm,
      minus_tolerance_pct: row.minusTolerancePct, source_ref: row.sourceRef,
    })));
  }

  function resolveUrl(baseUrl, relativePath) { return new URL(relativePath, baseUrl).toString(); }

  return Object.freeze({
    CATALOG_PATH, parseDelimited, parseCsv, parseTsv, parseCatalog, materialRowsFromCsv, overlayRowsFromCsv,
    pipeRowsFromMaster, mergeProductOverlay, validateMaterialCsvRows, validateProductOverlayRows, materialCsv, productOverlayCsv, resolveUrl,
  });
});
