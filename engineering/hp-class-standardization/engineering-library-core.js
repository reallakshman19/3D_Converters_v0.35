(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HpEngineeringLibraryCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA = 'hp-piping-engineering-libraries/v1';
  const EPS = 1e-9;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function text(value) {
    return String(value ?? '').trim();
  }

  function number(value) {
    if (value === '' || value == null) return NaN;
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }

  function materialKey(row) {
    return [text(row.materialSpec), text(row.grade), text(row.condition)].join('|');
  }

  function materialLabel(row) {
    return [text(row.materialSpec), text(row.grade), text(row.condition)].filter(Boolean).join(' · ');
  }

  function productKey(row) {
    return [text(row.tag), text(row.productSpec), number(row.nominalWallMm).toFixed(6)].join('|');
  }

  function validateMetadata(metadata) {
    const errors = [];
    if (!metadata || typeof metadata !== 'object') return ['Library metadata is missing.'];
    if (!text(metadata.libraryId)) errors.push('Library ID is required.');
    if (!text(metadata.revision)) errors.push('Library revision is required.');
    if (!text(metadata.preparedBy)) errors.push('Prepared by is required.');
    if (!text(metadata.materialSourceRef)) errors.push('Material source reference is required.');
    if (!text(metadata.materialVersion)) errors.push('Material source version is required.');
    if (!text(metadata.productSourceRef)) errors.push('Product source reference is required.');
    if (!text(metadata.productVersion)) errors.push('Product source version is required.');
    return errors;
  }

  function validateMaterialRows(rows) {
    const errors = [];
    if (!Array.isArray(rows)) return ['Material rows must be an array.'];
    const seen = new Set();
    rows.forEach((row, index) => {
      const prefix = `Material row ${index + 1}`;
      const spec = text(row?.materialSpec);
      const grade = text(row?.grade);
      const temperatureC = number(row?.temperatureC);
      const S = number(row?.allowableStressMpa);
      const Syt = number(row?.yieldStrengthMpa);
      if (!spec) errors.push(`${prefix}: material specification is required.`);
      if (!grade) errors.push(`${prefix}: grade is required.`);
      if (!Number.isFinite(temperatureC)) errors.push(`${prefix}: temperature must be numeric.`);
      if (!(S > 0)) errors.push(`${prefix}: allowable stress S must be > 0.`);
      if (!(Syt > 0)) errors.push(`${prefix}: Syt must be > 0.`);
      if (!text(row?.sourceRef)) errors.push(`${prefix}: row source/reference is required.`);
      if (spec && grade && Number.isFinite(temperatureC)) {
        const key = `${materialKey(row)}|${temperatureC.toFixed(9)}`;
        if (seen.has(key)) errors.push(`${prefix}: duplicate temperature for the same material/grade/condition.`);
        seen.add(key);
      }
    });
    return errors;
  }

  function validateProductRows(rows) {
    const errors = [];
    if (!Array.isArray(rows)) return ['Product rows must be an array.'];
    const seen = new Set();
    rows.forEach((row, index) => {
      const prefix = `Product row ${index + 1}`;
      const D = number(row?.designDiameterMm);
      const wall = number(row?.nominalWallMm);
      const tol = number(row?.minusTolerancePct);
      if (!text(row?.tag)) errors.push(`${prefix}: NPS/tag is required.`);
      if (!text(row?.productSpec)) errors.push(`${prefix}: product specification is required.`);
      if (!(D > 0)) errors.push(`${prefix}: design D / max OD must be > 0.`);
      if (!(wall > 0)) errors.push(`${prefix}: nominal wall must be > 0.`);
      if (!(tol >= 0 && tol < 100)) errors.push(`${prefix}: minus tolerance must be >= 0 and < 100%.`);
      if (!text(row?.sourceRef)) errors.push(`${prefix}: row source/reference is required.`);
      if (text(row?.tag) && text(row?.productSpec) && wall > 0) {
        const key = productKey(row);
        if (seen.has(key)) errors.push(`${prefix}: duplicate product/tag/wall identity.`);
        seen.add(key);
      }
    });
    return errors;
  }

  function validateLibrary(lib) {
    const errors = [];
    if (!lib || typeof lib !== 'object' || Array.isArray(lib)) {
      return { ok: false, errors: ['Library must be a JSON object.'] };
    }
    if (lib.schema !== SCHEMA) errors.push(`Unsupported library schema: ${lib.schema || '(missing)'}.`);
    errors.push(...validateMetadata(lib.metadata));
    errors.push(...validateMaterialRows(lib.materials));
    errors.push(...validateProductRows(lib.products));
    return { ok: errors.length === 0, errors };
  }

  function createLibrary({ metadata, materials = [], products = [], generatedAt } = {}) {
    return {
      schema: SCHEMA,
      generatedAt: generatedAt || new Date().toISOString(),
      metadata: clone(metadata || {}),
      materials: clone(materials),
      products: clone(products),
      authorityNote: 'Values are user-controlled engineering data; no defaults or extrapolation are permitted.',
    };
  }

  function materialGroups(rows) {
    const groups = new Map();
    (rows || []).forEach((row) => {
      const key = materialKey(row);
      if (!groups.has(key)) groups.set(key, { key, label: materialLabel(row), row: clone(row) });
    });
    return [...groups.values()].filter((g) => g.label).sort((a, b) => a.label.localeCompare(b.label));
  }

  function interpolate(a, b, target, field) {
    const x1 = number(a.temperatureC);
    const x2 = number(b.temperatureC);
    const y1 = number(a[field]);
    const y2 = number(b[field]);
    const fraction = (target - x1) / (x2 - x1);
    return y1 + fraction * (y2 - y1);
  }

  function evaluateMaterial(rows, key, targetTemperatureC) {
    const target = number(targetTemperatureC);
    if (!Number.isFinite(target)) return { ok: false, error: 'Target temperature must be numeric.' };
    const selected = rows.filter((row) => materialKey(row) === key)
      .sort((a, b) => number(a.temperatureC) - number(b.temperatureC));
    if (!selected.length) return { ok: false, error: 'Selected material/grade/condition is not available.' };
    const errors = validateMaterialRows(selected);
    if (errors.length) return { ok: false, error: errors[0] };

    const exact = selected.find((row) => Math.abs(number(row.temperatureC) - target) <= EPS);
    if (exact) {
      return {
        ok: true,
        temperatureC: target,
        allowableStressMpa: number(exact.allowableStressMpa),
        yieldStrengthMpa: number(exact.yieldStrengthMpa),
        basis: 'Exact table point',
        lower: clone(exact), upper: clone(exact),
      };
    }

    const minT = number(selected[0].temperatureC);
    const maxT = number(selected[selected.length - 1].temperatureC);
    if (target < minT || target > maxT) {
      return { ok: false, error: `Target ${target}°C is outside controlled range ${minT}–${maxT}°C; no extrapolation.` };
    }

    let lower = null;
    let upper = null;
    for (let i = 0; i < selected.length - 1; i += 1) {
      const a = selected[i];
      const b = selected[i + 1];
      if (number(a.temperatureC) < target && target < number(b.temperatureC)) {
        lower = a; upper = b; break;
      }
    }
    if (!lower || !upper) return { ok: false, error: 'No valid bracketing material points were found.' };
    return {
      ok: true,
      temperatureC: target,
      allowableStressMpa: interpolate(lower, upper, target, 'allowableStressMpa'),
      yieldStrengthMpa: interpolate(lower, upper, target, 'yieldStrengthMpa'),
      basis: `Linear interpolation ${number(lower.temperatureC)}–${number(upper.temperatureC)}°C`,
      lower: clone(lower), upper: clone(upper),
    };
  }

  function productByIndex(rows, index) {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= rows.length) return { ok: false, error: 'Select one exact product row.' };
    const selected = rows[i];
    const errors = validateProductRows([selected]);
    if (errors.length) return { ok: false, error: errors[0].replace('Product row 1:', 'Selected product:') };
    return { ok: true, row: clone(selected), key: productKey(selected) };
  }

  function safeFilename(libraryId, revision) {
    const raw = `${libraryId || 'hp-engineering-library'}-${revision || 'draft'}`;
    const safe = raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return `${safe || 'hp-engineering-library'}.json`;
  }

  return Object.freeze({
    SCHEMA,
    createLibrary,
    validateLibrary,
    validateMaterialRows,
    validateProductRows,
    materialKey,
    materialGroups,
    evaluateMaterial,
    productByIndex,
    safeFilename,
  });
});