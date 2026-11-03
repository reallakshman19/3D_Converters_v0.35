'use strict';

const KD2_SOURCE = Object.freeze({
  commit: '4dd651abbc86310077eaace6caa8b6788c1a6697',
  blob: '8f20cd0dab683d28359e02207f6f65b834144ec9',
});

const KD3_SOURCE = Object.freeze({
  commit: 'f4d49f2a47d970ae0abf913b537193e324556177',
  blob: 'e6abaddb7833eb0a61c9460ae39201e2252dc596',
  size: 1179548,
});

const DEFAULTS = Object.freeze({
  diameter: 114.3,
  designPressure: 20,
  allowableStress: 138,
  ci: 3,
  co: 0,
  tolerance: 12.5,
  walls: '13.49, 17.12, 22.00',
  cycles: [
    { id: 'C1', name: 'Startup / shutdown', pMin: 2, pMax: 20, tMin: 40, tMax: 200, syt: 225, n: 500 },
  ],
});

const byId = (id) => document.getElementById(id);
let cycleCounter = 1;
let currentWalls = [];
let currentMatrix = [];
let lastInput = null;

function numberValue(id) {
  const value = Number(byId(id)?.value);
  return Number.isFinite(value) ? value : NaN;
}

function parseWalls(value) {
  return [...new Set(
    String(value || '')
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((n) => n > 0 && Number.isFinite(n))
  )];
}

function requiredPressureWall({ D, co, P, S }) {
  return ((D - 2 * co) / 2) * (1 - Math.exp(-P / S));
}

function pressureRating({ D, co, T, ci, S }) {
  const numerator = D - 2 * co;
  const denominator = D - 2 * (T - ci);
  if (numerator <= 0 || denominator <= 0 || numerator <= denominator) return NaN;
  return S * Math.log(numerator / denominator);
}

function pressureStress({ P, D, T, c }) {
  const effective = T - c;
  const denominator = 2 * effective * (D - effective);
  if (effective <= 0 || D <= effective || denominator <= 0) return NaN;
  return (P * D * D) / denominator;
}

function pressureState({ P, D, effective }) {
  const ro = D / 2;
  const ri = ro - effective;
  const denominator = ro * ro - ri * ri;
  if (!(effective > 0) || !(ri > 0) || !(denominator > 0)) {
    return { axial: NaN, hoop: NaN, radial: NaN };
  }
  return {
    axial: P * ri * ri / denominator,
    hoop: P * (ro * ro + ri * ri) / denominator,
    radial: -P,
  };
}

function stressIntensityFromPrincipal(values) {
  if (!values.every(Number.isFinite)) return NaN;
  return Math.max(...values) - Math.min(...values);
}

function requiredNominalWall(minRequired, tolerancePercent) {
  const factor = 1 - tolerancePercent / 100;
  return factor > 0 ? minRequired / factor : NaN;
}

function fmt(value, digits = 3) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'INVALID';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function editionYear(value) {
  const match = String(value || '').match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : '';
}

function authorityState() {
  return {
    b31Edition: byId('b31Edition')?.value.trim() || '',
    viii3Edition: byId('viii3Edition')?.value.trim() || '',
    materialSpec: byId('materialSpec')?.value.trim() || '',
    materialGrade: byId('materialGrade')?.value.trim() || '',
    productSpec: byId('productSpec')?.value.trim() || '',
    toleranceSource: byId('toleranceSource')?.value.trim() || '',
    evidencePackage: byId('evidencePackage')?.value.trim() || '',

    kd2Edition: byId('kd2Edition')?.value.trim() || '',
    kd2AnalysisMethod: byId('kd2AnalysisMethod')?.value || 'unassessed',
    kd2StressModel: byId('kd2StressModel')?.value || 'pressure-analytic',
    kd2Geometry: byId('kd2Geometry')?.value || 'uniform',
    kd2Residual: byId('kd2Residual')?.value || 'none',
    kd2LimitCalcId: byId('kd2LimitCalcId')?.value.trim() || '',
    kd2Approved: Boolean(byId('kd2Approved')?.checked),

    kd3SourceEdition: byId('kd3SourceEdition')?.value.trim() || '',
    kd3SourceConfirmed: Boolean(byId('kd3SourceConfirmed')?.checked),
    kd3CompatibilityConfirmed: Boolean(byId('kd3CompatibilityConfirmed')?.checked),
    kdRoute: byId('kdRoute')?.value.trim() || '',
    seqMode: byId('seqMode')?.value || 'manual',
    seqRouteSourceRef: byId('seqRouteSourceRef')?.value.trim() || '',
    seqRouteApproved: Boolean(byId('seqRouteApproved')?.checked),
    seqMeanBasis: byId('seqMeanBasis')?.value || 'elastic-average-nonnegative',
    seqBeta: numberValue('seqBeta'),
    seqReferenceCycles: numberValue('seqReferenceCycles'),
    seqMeanTermLimit: numberValue('seqMeanTermLimit'),
    fatigueCurveId: byId('fatigueCurveId')?.value.trim() || '',
    fatigueCurveMode: byId('fatigueCurveMode')?.value || 'manual',
    fatigueCurveSourceRef: byId('fatigueCurveSourceRef')?.value.trim() || '',
    fatigueCurveData: byId('fatigueCurveData')?.value || '',
    fatigueInterpolation: byId('fatigueInterpolation')?.value || 'loglog',
    fatigueInterpolationApproved: Boolean(byId('fatigueInterpolationApproved')?.checked),
    fatigueCurveApproved: Boolean(byId('fatigueCurveApproved')?.checked),

    fractureStatus: byId('fractureStatus')?.value || 'unassessed',
    fractureEvidence: byId('fractureEvidence')?.value.trim() || '',
  };
}

function authorityComplete(authority) {
  const base = Boolean(
    authority.viii3Edition &&
    authority.materialSpec &&
    authority.materialGrade &&
    authority.productSpec &&
    authority.toleranceSource &&
    authority.evidencePackage &&
    authority.kdRoute
  );
  if (!base) return false;
  if (authority.fatigueCurveMode === 'curve') {
    return Boolean(authority.fatigueCurveId && authority.fatigueCurveSourceRef);
  }
  return true;
}

function kd2Gate(authority) {
  if (!authority.kd2Edition) return { ok: false, label: 'KD-2 edition unconfirmed', css: 'blocked' };
  if (authority.kd2AnalysisMethod === 'unassessed') return { ok: false, label: 'KD-2 route unassessed', css: 'blocked' };
  if (authority.kd2AnalysisMethod === 'inelastic' || authority.kd2AnalysisMethod === 'special') {
    return { ok: false, label: 'KD-2 detailed/special route', css: 'warn' };
  }
  if (authority.kd2StressModel !== 'pressure-analytic') return { ok: false, label: 'External KD-2 model required', css: 'warn' };
  if (authority.kd2Geometry !== 'uniform') return { ok: false, label: 'Local/special geometry route', css: 'warn' };
  if (authority.kd2Residual === 'evidence' && !authority.kd2LimitCalcId) {
    return { ok: false, label: 'Residual/prestress evidence required', css: 'blocked' };
  }
  if (!authority.kd2LimitCalcId) return { ok: false, label: 'KD-2 limit-check ID required', css: 'blocked' };
  if (!authority.kd2Approved) return { ok: false, label: 'KD-2 approval pending', css: 'blocked' };
  return { ok: true, label: 'KD-2 package approved', css: 'good' };
}

function kd3SourceGate(authority) {
  if (!authority.viii3Edition) return { ok: false, label: 'Project VIII-3 edition missing', css: 'blocked' };
  if (!authority.kd3SourceEdition) return { ok: false, label: 'KD-3 source edition unconfirmed', css: 'blocked' };
  if (!authority.kd3SourceConfirmed) return { ok: false, label: 'KD-3 source verification pending', css: 'blocked' };
  const projectYear = editionYear(authority.viii3Edition);
  const sourceYear = editionYear(authority.kd3SourceEdition);
  if (projectYear && sourceYear && projectYear !== sourceYear) {
    return { ok: false, label: `KD-3 / project edition mismatch (${sourceYear} vs ${projectYear})`, css: 'warn' };
  }
  if (!authority.kd3CompatibilityConfirmed) {
    return { ok: false, label: 'KD-3 edition compatibility review pending', css: 'blocked' };
  }
  return { ok: true, label: 'KD-3 source / edition verified', css: 'good' };
}

function fractureGate(authority) {
  if (authority.fractureStatus === 'special') return { ok: false, label: 'Outside automatic class route', css: 'warn' };
  if (authority.fractureStatus === 'unassessed') return { ok: false, label: 'Unassessed', css: 'blocked' };
  if (!authority.fractureEvidence) return { ok: false, label: 'Evidence ID required', css: 'blocked' };
  if (authority.fractureStatus === 'kd4-approved') return { ok: true, label: 'KD-4 evidence approved', css: 'good' };
  return { ok: true, label: 'Review cleared', css: 'good' };
}

/**
 * Parse reviewer-entered fatigue curve points.
 * Accepted lines: "N, Sa", "N Sa", or "N;Sa". Blank lines and # comments are ignored.
 * No ASME curve values are embedded in this application.
 */
function parseFatigueCurvePoints(text) {
  const points = [];
  const errors = [];
  String(text || '').split(/\r?\n/).forEach((raw, index) => {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) return;
    const parts = line.split(/[,\s;]+/).filter(Boolean);
    if (parts.length !== 2) {
      errors.push(`Line ${index + 1}: enter exactly N and Sa.`);
      return;
    }
    const N = Number(parts[0]);
    const Sa = Number(parts[1]);
    if (!(N > 0) || !(Sa > 0) || !Number.isFinite(N) || !Number.isFinite(Sa)) {
      errors.push(`Line ${index + 1}: N and Sa must be positive numbers.`);
      return;
    }
    points.push({ N, Sa });
  });

  if (errors.length) return { ok: false, points: [], error: errors[0] };
  if (points.length < 2) return { ok: false, points, error: 'At least two fatigue-curve points are required.' };

  points.sort((a, b) => a.N - b.N);
  const nValues = new Set();
  const sValues = new Set();
  for (const p of points) {
    if (nValues.has(p.N)) return { ok: false, points, error: `Duplicate cycle value N=${p.N}.` };
    if (sValues.has(p.Sa)) return { ok: false, points, error: `Duplicate stress amplitude Sa=${p.Sa}; automatic interpolation is ambiguous.` };
    nValues.add(p.N);
    sValues.add(p.Sa);
  }
  for (let i = 1; i < points.length; i += 1) {
    if (!(points[i].Sa < points[i - 1].Sa)) {
      return { ok: false, points, error: 'Sa must decrease strictly as N increases for automatic interpolation.' };
    }
  }
  return { ok: true, points, error: '' };
}

/**
 * Generic log-log interpolation of N at a supplied stress amplitude.
 * This is mathematical tooling only. The reviewer must confirm that this interpolation basis
 * is permitted for the selected licensed fatigue curve. Extrapolation is never performed.
 */
function interpolateFatigueLife(seq, points) {
  if (!(seq > 0) || !Number.isFinite(seq)) return { ok: false, N: NaN, status: 'Seq missing/invalid' };
  if (!Array.isArray(points) || points.length < 2) return { ok: false, N: NaN, status: 'Curve points unavailable' };

  for (const p of points) {
    if (Math.abs(seq - p.Sa) <= Math.max(1e-12, Math.abs(p.Sa) * 1e-12)) {
      return { ok: true, N: p.N, status: 'Exact curve point' };
    }
  }

  const maxSa = points[0].Sa;
  const minSa = points[points.length - 1].Sa;
  if (seq > maxSa || seq < minSa) {
    return { ok: false, N: NaN, status: `Outside curve range ${minSa}–${maxSa} MPa; no extrapolation` };
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const high = points[i];
    const low = points[i + 1];
    if (seq < high.Sa && seq > low.Sa) {
      const logN1 = Math.log10(high.N);
      const logN2 = Math.log10(low.N);
      const logS1 = Math.log10(high.Sa);
      const logS2 = Math.log10(low.Sa);
      const fraction = (Math.log10(seq) - logS1) / (logS2 - logS1);
      const N = 10 ** (logN1 + fraction * (logN2 - logN1));
      return { ok: true, N, status: 'Log-log interpolation' };
    }
  }
  return { ok: false, N: NaN, status: 'No valid interpolation segment found' };
}

/**
 * Log-log interpolation of stress amplitude at a supplied cycle count.
 * Used only as a mathematical helper for reviewer-approved Seq correction routes.
 * No extrapolation is performed.
 */
function interpolateCurveStressAtCycles(referenceCycles, points) {
  if (!(referenceCycles > 0) || !Number.isFinite(referenceCycles)) {
    return { ok: false, Sa: NaN, status: 'Reference cycle count missing/invalid' };
  }
  if (!Array.isArray(points) || points.length < 2) {
    return { ok: false, Sa: NaN, status: 'Curve points unavailable' };
  }

  for (const p of points) {
    if (Math.abs(referenceCycles - p.N) <= Math.max(1e-12, Math.abs(p.N) * 1e-12)) {
      return { ok: true, Sa: p.Sa, status: 'Exact curve point' };
    }
  }

  const minN = points[0].N;
  const maxN = points[points.length - 1].N;
  if (referenceCycles < minN || referenceCycles > maxN) {
    return { ok: false, Sa: NaN, status: `Reference cycles outside curve range ${minN}-${maxN}; no extrapolation` };
  }

  for (let i = 0; i < points.length - 1; i += 1) {
    const lowN = points[i];
    const highN = points[i + 1];
    if (referenceCycles > lowN.N && referenceCycles < highN.N) {
      const logN1 = Math.log10(lowN.N);
      const logN2 = Math.log10(highN.N);
      const logS1 = Math.log10(lowN.Sa);
      const logS2 = Math.log10(highN.Sa);
      const fraction = (Math.log10(referenceCycles) - logN1) / (logN2 - logN1);
      const Sa = 10 ** (logS1 + fraction * (logS2 - logS1));
      return { ok: true, Sa, status: 'Log-log curve interpolation' };
    }
  }
  return { ok: false, Sa: NaN, status: 'No valid reference-amplitude segment found' };
}

function seqGate(authority) {
  if (authority.seqMode === 'manual') {
    return { ok: true, label: 'Manual licensed Seq', css: 'good', mode: 'manual', saRef: NaN, points: [] };
  }

  const source = kd3SourceGate(authority);
  if (!source.ok) return { ...source, mode: authority.seqMode, saRef: NaN, points: [] };
  if (authority.kd2AnalysisMethod !== 'elastic' || authority.kd2StressModel !== 'pressure-analytic' || authority.kd2Geometry !== 'uniform') {
    return { ok: false, label: 'Automatic Seq requires approved elastic pressure-only uniform-pipe route', css: 'warn', mode: authority.seqMode, saRef: NaN, points: [] };
  }
  if (authority.kd2Residual !== 'none') {
    return { ok: false, label: 'Automatic Seq does not include credited residual/prestress effects', css: 'warn', mode: authority.seqMode, saRef: NaN, points: [] };
  }
  if (!authority.kdRoute) return { ok: false, label: 'KD-312 route/clause reference required', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
  if (!authority.seqRouteSourceRef) return { ok: false, label: 'Seq route source/calculation reference required', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
  if (!authority.seqRouteApproved) return { ok: false, label: 'Seq route review/approval pending', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };

  if (authority.seqMode === 'mean-embedded') {
    if (!authority.fatigueCurveId) {
      return { ok: false, label: 'Fatigue curve ID required for mean-embedded Seq route', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
    }
    return { ok: true, label: 'Mean-stress effects confirmed in selected curve', css: 'good', mode: authority.seqMode, saRef: NaN, points: [] };
  }

  if (authority.seqMode === 'explicit-mean') {
    if (authority.seqMeanBasis !== 'elastic-average-nonnegative') {
      return { ok: false, label: 'Unsupported associated-mean basis', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
    }
    if (!(authority.seqBeta >= 0) || !Number.isFinite(authority.seqBeta)) {
      return { ok: false, label: 'Mean-correction coefficient required', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
    }
    if (!(authority.seqReferenceCycles > 0) || !Number.isFinite(authority.seqReferenceCycles)) {
      return { ok: false, label: 'Reference cycle count required', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
    }
    if (!(authority.seqMeanTermLimit >= 0 && authority.seqMeanTermLimit < 1) || !Number.isFinite(authority.seqMeanTermLimit)) {
      return { ok: false, label: 'Mean-correction term limit must be >=0 and <1', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
    }
    if (authority.fatigueCurveMode !== 'curve') {
      return { ok: false, label: 'Explicit mean correction requires controlled curve-point mode', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
    }
    const curve = curveGate(authority);
    if (!curve.ok) return { ...curve, mode: authority.seqMode, saRef: NaN };
    const ref = interpolateCurveStressAtCycles(authority.seqReferenceCycles, curve.points);
    if (!ref.ok) return { ok: false, label: ref.status, css: 'blocked', mode: authority.seqMode, saRef: NaN, points: curve.points };
    return {
      ok: true,
      label: `Explicit mean correction ready; Sa_ref=${fmt(ref.Sa, 3)} MPa`,
      css: 'good',
      mode: authority.seqMode,
      saRef: ref.Sa,
      points: curve.points,
    };
  }

  return { ok: false, label: 'Unsupported automatic Seq mode', css: 'blocked', mode: authority.seqMode, saRef: NaN, points: [] };
}

function updateSeqStatus(authority) {
  const box = byId('seqStatusBox');
  if (!box) return;
  const gate = seqGate(authority);
  box.className = `notice ${gate.ok ? 'info' : gate.css === 'warn' ? 'warning' : 'error'}`;
  if (authority.seqMode === 'manual') {
    box.textContent = 'Manual Seq mode: each wall x cycle row requires a controlled licensed Seq value.';
  } else if (gate.ok) {
    box.textContent = authority.seqMode === 'mean-embedded'
      ? 'Automatic Seq ready: the reviewer has confirmed that mean-stress effects are incorporated in the selected licensed fatigue curve; Seq is taken from the controlling Salt pair.'
      : `Automatic Seq ready: explicit mean correction uses reviewer-controlled beta=${authority.seqBeta}, Nref=${authority.seqReferenceCycles}, term limit=${authority.seqMeanTermLimit}, Sa_ref=${fmt(gate.saRef, 3)} MPa.`;
  } else {
    box.textContent = `Automatic Seq blocked: ${gate.label}.`;
  }
}

function curveGate(authority) {
  if (authority.fatigueCurveMode !== 'curve') return { ok: true, label: 'Manual Ni mode', css: 'good', points: [] };
  const source = kd3SourceGate(authority);
  if (!source.ok) return { ...source, points: [] };
  if (!authority.fatigueCurveId) return { ok: false, label: 'Fatigue curve ID required', css: 'blocked', points: [] };
  if (!authority.fatigueCurveSourceRef) return { ok: false, label: 'Fatigue curve source reference required', css: 'blocked', points: [] };
  if (authority.fatigueInterpolation !== 'loglog') {
    return { ok: false, label: 'Unsupported interpolation method', css: 'blocked', points: [] };
  }
  if (!authority.fatigueInterpolationApproved) {
    return { ok: false, label: 'Interpolation basis not approved', css: 'blocked', points: [] };
  }
  if (!authority.fatigueCurveApproved) {
    return { ok: false, label: 'Fatigue curve transcription not approved', css: 'blocked', points: [] };
  }
  const parsed = parseFatigueCurvePoints(authority.fatigueCurveData);
  if (!parsed.ok) return { ok: false, label: parsed.error, css: 'blocked', points: parsed.points };
  return { ok: true, label: `${parsed.points.length} curve points approved`, css: 'good', points: parsed.points };
}

function updateCurveStatus(authority) {
  const box = byId('curveStatusBox');
  if (!box) return;
  const gate = curveGate(authority);
  box.className = `notice ${gate.ok ? 'info' : gate.css === 'warn' ? 'warning' : 'error'}`;
  if (authority.fatigueCurveMode === 'manual') {
    box.textContent = 'Manual Ni mode: each wall × cycle row requires a controlled licensed Ni value.';
  } else {
    box.textContent = gate.ok
      ? `Controlled curve ready: ${gate.label}. Automatic Ni uses log-log interpolation with no extrapolation.`
      : `Automatic Ni blocked: ${gate.label}.`;
  }
}

function addCycleRow(data = {}) {
  cycleCounter += 1;
  const id = data.id || `C${cycleCounter}`;
  const row = document.createElement('tr');
  row.dataset.cycleId = id;
  row.innerHTML = `
    <td><input class="table-input cycle-name" value="${escapeHtml(data.name || id)}" aria-label="Cycle block name"></td>
    <td><input class="table-input cycle-pmin" type="number" step="any" value="${data.pMin ?? ''}" aria-label="Pmin"></td>
    <td><input class="table-input cycle-pmax" type="number" step="any" value="${data.pMax ?? ''}" aria-label="Pmax"></td>
    <td><input class="table-input cycle-tmin" type="number" step="any" value="${data.tMin ?? ''}" aria-label="Tmin"></td>
    <td><input class="table-input cycle-tmax" type="number" step="any" value="${data.tMax ?? ''}" aria-label="Tmax"></td>
    <td class="cycle-avg">-</td>
    <td><input class="table-input cycle-syt" type="number" min="0" step="any" value="${data.syt ?? ''}" placeholder="controlled" aria-label="Syt at average temperature"></td>
    <td><input class="table-input cycle-n" type="number" min="1" step="1" value="${data.n ?? ''}" aria-label="Cycle count"></td>
    <td class="center"><button type="button" class="remove-cycle small-button">Remove</button></td>`;
  byId('cycleBody').appendChild(row);
  refreshCycleAverage(row);
}

function refreshCycleAverage(row) {
  const tMin = Number(row.querySelector('.cycle-tmin').value);
  const tMax = Number(row.querySelector('.cycle-tmax').value);
  row.querySelector('.cycle-avg').textContent = Number.isFinite(tMin) && Number.isFinite(tMax)
    ? fmt((tMin + tMax) / 2, 1)
    : '-';
}

function readCycles() {
  return [...byId('cycleBody').querySelectorAll('tr')].map((row, index) => {
    const num = (selector) => Number(row.querySelector(selector).value);
    return {
      id: row.dataset.cycleId || `C${index + 1}`,
      name: row.querySelector('.cycle-name').value.trim() || `Cycle ${index + 1}`,
      pMin: num('.cycle-pmin'),
      pMax: num('.cycle-pmax'),
      tMin: num('.cycle-tmin'),
      tMax: num('.cycle-tmax'),
      syt: num('.cycle-syt'),
      n: num('.cycle-n'),
    };
  });
}

function readInputs() {
  return {
    D: numberValue('diameter'),
    Pdesign: numberValue('designPressure'),
    S: numberValue('allowableStress'),
    ci: numberValue('ci'),
    co: numberValue('co'),
    tolerance: numberValue('tolerance'),
    walls: parseWalls(byId('candidateWalls')?.value),
    cycles: readCycles(),
    authority: authorityState(),
  };
}

function validateInputs(input) {
  if (!(input.D > 0) || !(input.Pdesign > 0) || !(input.S > 0)) return 'D, design pressure and allowable stress S must be positive.';
  if (input.ci < 0 || input.co < 0) return 'ci and co cannot be negative.';
  if (input.D <= 2 * input.co) return 'D must be greater than 2 × co.';
  if (!(input.tolerance >= 0 && input.tolerance < 100)) return 'Wall minus tolerance must be between 0% and 100%.';
  if (!input.walls.length) return 'Enter at least one positive candidate nominal wall.';
  if (!input.cycles.length) return 'Enter at least one pressure-cycle block.';
  for (const cycle of input.cycles) {
    if (![cycle.pMin, cycle.pMax, cycle.tMin, cycle.tMax, cycle.syt, cycle.n].every(Number.isFinite)) {
      return `Complete all numeric inputs for ${cycle.name}.`;
    }
    if (cycle.pMin < 0 || cycle.pMax < cycle.pMin) return `${cycle.name}: require 0 ≤ Pmin ≤ Pmax.`;
    if (cycle.tMax < cycle.tMin) return `${cycle.name}: require Tmin ≤ Tmax.`;
    if (!(cycle.syt > 0)) return `${cycle.name}: Syt at cycle-average temperature must be positive.`;
    if (!(cycle.n > 0)) return `${cycle.name}: cycle count n must be positive.`;
  }
  return '';
}

function staticWallResult(input, tNominal, staticMinimum) {
  const T = tNominal * (1 - input.tolerance / 100);
  const rating = pressureRating({ D: input.D, co: input.co, T, ci: input.ci, S: input.S });
  const pass = T >= staticMinimum && Number.isFinite(rating) && rating >= input.Pdesign;
  return { tNominal, T, rating, pass };
}

function fatigueResult(input, wall, cycle) {
  const c = input.ci + input.co;
  const effective = wall.T - c;
  const spMin = pressureStress({ P: cycle.pMin, D: input.D, T: wall.T, c });
  const spMax = pressureStress({ P: cycle.pMax, D: input.D, T: wall.T, c });
  const deltaSp = spMax - spMin;
  const stateMin = pressureState({ P: cycle.pMin, D: input.D, effective });
  const stateMax = pressureState({ P: cycle.pMax, D: input.D, effective });
  const delta = {
    axial: stateMax.axial - stateMin.axial,
    hoop: stateMax.hoop - stateMin.hoop,
    radial: stateMax.radial - stateMin.radial,
  };
  return {
    wall: wall.tNominal,
    cycleId: cycle.id,
    cycleName: cycle.name,
    averageT: (cycle.tMin + cycle.tMax) / 2,
    syt: cycle.syt,
    n: cycle.n,
    effective,
    spMin,
    spMax,
    deltaSp,
    halfRange: deltaSp / 2,
    elastic: Number.isFinite(spMax) && spMax <= 2 * cycle.syt,
    stateMin,
    stateMax,
    delta,
    deltaSI: stressIntensityFromPrincipal([delta.axial, delta.hoop, delta.radial]),
  };
}

function kd312PairMetrics(result) {
  const min = [result.stateMin.hoop, result.stateMin.axial, result.stateMin.radial];
  const max = [result.stateMax.hoop, result.stateMax.axial, result.stateMax.radial];
  const defs = [
    { id: '12', a: 0, b: 1, signA: 1, signB: -1 },
    { id: '23', a: 1, b: 2, signA: 1, signB: -1 },
    { id: '31', a: 2, b: 0, signA: 1, signB: -1 },
  ];
  return defs.map((def) => {
    const diffMinState = def.signA * min[def.a] + def.signB * min[def.b];
    const diffMaxState = def.signA * max[def.a] + def.signB * max[def.b];
    const sMax = Math.max(diffMinState, diffMaxState);
    const sMin = Math.min(diffMinState, diffMaxState);
    const normalAtMinState = 0.5 * (min[def.a] + min[def.b]);
    const normalAtMaxState = 0.5 * (max[def.a] + max[def.b]);
    const normalMax = Math.max(normalAtMinState, normalAtMaxState);
    const normalMin = Math.min(normalAtMinState, normalAtMaxState);
    const meanElastic = Math.max(0, 0.5 * (normalMax + normalMin));
    return {
      id: def.id,
      sAtPmin: diffMinState,
      sAtPmax: diffMaxState,
      sMax,
      sMin,
      salt: 0.5 * (sMax - sMin),
      normalAtPmin: normalAtMinState,
      normalAtPmax: normalAtMaxState,
      normalMax,
      normalMin,
      meanElastic,
    };
  });
}

function calculateAutomaticSeq(result, authority) {
  const gate = seqGate(authority);
  const pairs = kd312PairMetrics(result);
  if (!gate.ok) return { ok: false, seq: NaN, pair: '', basis: gate.label, pairs, saRef: gate.saRef };
  if (authority.seqMode === 'manual') return { ok: false, seq: NaN, pair: '', basis: 'Manual licensed Seq', pairs, saRef: NaN };
  if (!result.elastic) return { ok: false, seq: NaN, pair: '', basis: 'Inelastic/special route - automatic Seq disabled', pairs, saRef: gate.saRef };

  const evaluated = pairs.map((pair) => {
    if (authority.seqMode === 'mean-embedded') {
      return { ...pair, seq: pair.salt, correctionTerm: 0 };
    }
    const rawTerm = gate.saRef > 0 ? authority.seqBeta * pair.meanElastic / gate.saRef : NaN;
    if (!Number.isFinite(rawTerm)) return { ...pair, seq: NaN, correctionTerm: NaN };
    const correctionTerm = Math.min(Math.max(rawTerm, 0), authority.seqMeanTermLimit);
    const denominator = 1 - correctionTerm;
    return { ...pair, seq: denominator > 0 ? pair.salt / denominator : NaN, correctionTerm };
  });

  const finite = evaluated.filter((pair) => pair.seq > 0 && Number.isFinite(pair.seq));
  if (!finite.length) return { ok: false, seq: NaN, pair: '', basis: 'Automatic Seq calculation produced no valid pair', pairs: evaluated, saRef: gate.saRef };
  const controlling = finite.reduce((best, pair) => pair.seq > best.seq ? pair : best, finite[0]);
  const basis = authority.seqMode === 'mean-embedded'
    ? `Auto mean-embedded; pair ${controlling.id}; Salt=${fmt(controlling.salt, 4)} MPa`
    : `Auto explicit mean; pair ${controlling.id}; Salt=${fmt(controlling.salt, 4)} MPa; mean=${fmt(controlling.meanElastic, 4)} MPa; term=${fmt(controlling.correctionTerm, 5)}; Sa_ref=${fmt(gate.saRef, 4)} MPa`;
  return { ok: true, seq: controlling.seq, pair: controlling.id, basis, pairs: evaluated, saRef: gate.saRef };
}

function rowKey(wall, cycleId) {
  return `${wall.toFixed(4)}-${cycleId}`;
}

function readKdState(wall, cycleId) {
  const key = rowKey(wall, cycleId);
  return {
    seq: Number(byId(`seq-${key}`)?.value),
    ni: Number(byId(`ni-${key}`)?.value),
    source: (byId(`source-${key}`)?.value || '').trim(),
    approved: Boolean(byId(`approved-${key}`)?.checked),
    seqBasis: byId(`seqbasis-${key}`)?.textContent || '',
    niBasis: byId(`nibasis-${key}`)?.textContent || '',
  };
}

function captureKdStates() {
  const map = new Map();
  for (const result of currentMatrix) {
    map.set(rowKey(result.wall, result.cycleId), readKdState(result.wall, result.cycleId));
  }
  return map;
}

function kdComplete(kd) {
  return kd.seq > 0 && kd.ni > 0 && Boolean(kd.source) && kd.approved;
}

function kdInputsHtml(result, previous, input) {
  const key = rowKey(result.wall, result.cycleId);
  const isSeqAuto = input.authority.seqMode !== 'manual';
  const isCurve = input.authority.fatigueCurveMode === 'curve';
  const priorManualSeq = String(previous.seqBasis || '').startsWith('Manual');
  const priorManualNi = String(previous.niBasis || '').startsWith('Manual');
  const seq = !isSeqAuto && priorManualSeq && Number.isFinite(previous.seq) && previous.seq > 0 ? previous.seq : '';
  const ni = !isCurve && priorManualNi && Number.isFinite(previous.ni) && previous.ni > 0 ? previous.ni : '';
  const defaultSource = isSeqAuto
    ? input.authority.seqRouteSourceRef
    : isCurve
      ? input.authority.fatigueCurveSourceRef
      : input.authority.evidencePackage;
  const source = previous.source || defaultSource || '';
  return `
    <td><input id="seq-${key}" class="table-input" type="number" min="0" step="any" value="${seq}" placeholder="${isSeqAuto ? 'auto' : 'licensed Seq'}" ${isSeqAuto ? 'readonly' : ''}></td>
    <td id="seqbasis-${key}" class="text-left">${isSeqAuto ? 'Awaiting Seq route' : 'Manual licensed Seq'}</td>
    <td><input id="ni-${key}" class="table-input" type="number" min="1" step="any" value="${isCurve ? '' : ni}" placeholder="${isCurve ? 'auto' : 'licensed Ni'}" ${isCurve ? 'readonly' : ''}></td>
    <td id="nibasis-${key}" class="text-left">${isCurve ? 'Awaiting curve/Seq' : 'Manual licensed Ni'}</td>
    <td><input id="source-${key}" class="table-input source-input" value="${escapeHtml(source)}" placeholder="KD-3 clause / calc ID"></td>
    <td class="center"><input id="approved-${key}" type="checkbox" ${previous.approved ? 'checked' : ''} aria-label="KD-3 evidence approved"></td>`;
}

function renderSummaryMetrics(input, pressureWall, staticMinimum, nominalRequired) {
  byId('requiredWall').textContent = `${fmt(pressureWall, 4)} mm`;
  byId('minimumWall').textContent = `${fmt(staticMinimum, 4)} mm`;
  byId('nominalRequired').textContent = `${fmt(nominalRequired, 4)} mm`;
  byId('cycleCountMetric').textContent = String(input.cycles.length);
}

function renderStaticTable(input, staticMinimum) {
  currentWalls = input.walls.map((wall) => staticWallResult(input, wall, staticMinimum));
  byId('staticBody').innerHTML = currentWalls.map((wall) => `<tr>
    <td>${fmt(wall.tNominal, 2)}</td>
    <td>${fmt(wall.T, 4)}</td>
    <td>${fmt(wall.T - staticMinimum, 4)}</td>
    <td>${fmt(wall.rating, 2)}</td>
    <td><span class="badge ${wall.pass ? 'good' : 'bad'}">${wall.pass ? 'PASS' : 'FAIL'}</span></td>
  </tr>`).join('');
}

function renderKd2Table(input) {
  const gate = kd2Gate(input.authority);
  byId('kd2Body').innerHTML = currentMatrix.map((result) => `<tr>
    <td>${fmt(result.wall, 2)}</td>
    <td class="text-left">${escapeHtml(result.cycleName)}</td>
    <td>${fmt(result.effective, 4)}</td>
    <td>${fmt(result.stateMin.axial, 2)} / ${fmt(result.stateMax.axial, 2)}</td>
    <td>${fmt(result.stateMin.hoop, 2)} / ${fmt(result.stateMax.hoop, 2)}</td>
    <td>${fmt(result.stateMin.radial, 2)} / ${fmt(result.stateMax.radial, 2)}</td>
    <td>${fmt(result.delta.axial, 2)} / ${fmt(result.delta.hoop, 2)} / ${fmt(result.delta.radial, 2)}</td>
    <td>${fmt(result.deltaSI, 2)}</td>
    <td><span class="badge ${gate.css}">${escapeHtml(gate.label)}</span></td>
  </tr>`).join('');
}

function refreshAutomaticSeq(input) {
  const authority = input.authority;
  updateSeqStatus(authority);
  const isAuto = authority.seqMode !== 'manual';
  if (!isAuto) return;

  const gate = seqGate(authority);
  for (const result of currentMatrix) {
    const key = rowKey(result.wall, result.cycleId);
    const seqInput = byId(`seq-${key}`);
    const basis = byId(`seqbasis-${key}`);
    if (!seqInput || !basis) continue;
    if (!gate.ok) {
      seqInput.value = '';
      basis.textContent = gate.label;
      continue;
    }
    const calc = calculateAutomaticSeq(result, authority);
    if (!calc.ok) {
      seqInput.value = '';
      basis.textContent = calc.basis;
      continue;
    }
    seqInput.value = String(calc.seq);
    basis.textContent = calc.basis;
  }
}

function refreshAutomaticNi(input) {
  const authority = input.authority;
  updateCurveStatus(authority);
  if (authority.fatigueCurveMode !== 'curve') return;

  const gate = curveGate(authority);
  for (const result of currentMatrix) {
    const key = rowKey(result.wall, result.cycleId);
    const niInput = byId(`ni-${key}`);
    const basis = byId(`nibasis-${key}`);
    if (!niInput || !basis) continue;
    if (!gate.ok) {
      niInput.value = '';
      basis.textContent = gate.label;
      continue;
    }
    const seq = Number(byId(`seq-${key}`)?.value);
    const life = interpolateFatigueLife(seq, gate.points);
    if (!life.ok) {
      niInput.value = '';
      basis.textContent = life.status;
      continue;
    }
    niInput.value = String(life.N);
    basis.textContent = life.status;
  }
}

function renderFatigueMatrix(input) {
  const oldKd = captureKdStates();
  currentMatrix = [];
  for (const wall of currentWalls) {
    for (const cycle of input.cycles) currentMatrix.push(fatigueResult(input, wall, cycle));
  }
  renderKd2Table(input);

  byId('fatigueBody').innerHTML = currentMatrix.map((result) => {
    const previous = oldKd.get(rowKey(result.wall, result.cycleId)) || {
      seq: NaN, ni: NaN, source: '', approved: false,
    };
    return `<tr data-key="${rowKey(result.wall, result.cycleId)}">
      <td>${fmt(result.wall, 2)}</td>
      <td class="text-left">${escapeHtml(result.cycleName)}</td>
      <td>${fmt(result.averageT, 1)}</td>
      <td>${fmt(result.effective, 4)}</td>
      <td>${fmt(result.spMin, 2)}</td>
      <td>${fmt(result.spMax, 2)}</td>
      <td>${fmt(result.deltaSp, 2)}</td>
      <td>${fmt(result.halfRange, 2)}</td>
      <td><span class="badge ${result.elastic ? 'good' : 'warn'}">${result.elastic ? 'Elastic route' : 'Inelastic required'}</span></td>
      ${kdInputsHtml(result, previous, input)}
      <td class="usage">-</td>
    </tr>`;
  }).join('');

  refreshAutomaticSeq(input);
  refreshAutomaticNi(input);
  updateUsageAndClassSummary(input, false);
}

function wallStatus(input, wall) {
  if (!wall.pass) return { label: 'Static fail', css: 'bad', cumulative: NaN, kdCount: 0, anyInelastic: false };

  const kd2 = kd2Gate(input.authority);
  if (!kd2.ok) return { label: kd2.label, css: kd2.css, cumulative: NaN, kdCount: 0, anyInelastic: false };

  const kd3 = kd3SourceGate(input.authority);
  if (!kd3.ok) return { label: kd3.label, css: kd3.css, cumulative: NaN, kdCount: 0, anyInelastic: false };

  if (input.authority.seqMode !== 'manual') {
    const seqRoute = seqGate(input.authority);
    if (!seqRoute.ok) return { label: seqRoute.label, css: seqRoute.css, cumulative: NaN, kdCount: 0, anyInelastic: false };
  }

  if (input.authority.fatigueCurveMode === 'curve') {
    const curve = curveGate(input.authority);
    if (!curve.ok) return { label: curve.label, css: curve.css, cumulative: NaN, kdCount: 0, anyInelastic: false };
  }

  const results = currentMatrix.filter((row) => row.wall === wall.tNominal);
  const anyInelastic = results.some((row) => !row.elastic);
  if (anyInelastic) {
    return { label: 'Inelastic / special route', css: 'warn', cumulative: NaN, kdCount: 0, anyInelastic };
  }

  let cumulative = 0;
  let kdCount = 0;
  let allKd = true;
  for (const result of results) {
    const kd = readKdState(result.wall, result.cycleId);
    if (!kdComplete(kd)) {
      allKd = false;
      continue;
    }
    kdCount += 1;
    cumulative += result.n / kd.ni;
  }

  if (!allKd) {
    return {
      label: input.authority.seqMode !== 'manual'
        ? 'Automatic Seq / row approval pending'
        : input.authority.fatigueCurveMode === 'curve'
          ? 'Seq / row evidence pending'
          : 'KD-3 Seq / Ni evidence pending',
      css: 'blocked',
      cumulative: NaN,
      kdCount,
      anyInelastic,
    };
  }
  if (!authorityComplete(input.authority)) {
    return { label: 'Authority metadata incomplete', css: 'blocked', cumulative, kdCount, anyInelastic };
  }

  const fracture = fractureGate(input.authority);
  if (!fracture.ok) return { label: fracture.label, css: fracture.css, cumulative, kdCount, anyInelastic };
  if (cumulative > 1) return { label: 'Cumulative fatigue usage > 1.0', css: 'bad', cumulative, kdCount, anyInelastic };
  return { label: 'Eligible for class-release review', css: 'good', cumulative, kdCount, anyInelastic };
}

function updateUsageAndClassSummary(input, refreshFatigue = true) {
  if (refreshFatigue) {
    refreshAutomaticSeq(input);
    refreshAutomaticNi(input);
  }

  for (const result of currentMatrix) {
    const row = byId('fatigueBody').querySelector(`tr[data-key="${rowKey(result.wall, result.cycleId)}"]`);
    if (!row) continue;
    const kd = readKdState(result.wall, result.cycleId);
    const usage = kdComplete(kd) ? result.n / kd.ni : NaN;
    row.querySelector('.usage').textContent = Number.isFinite(usage) ? usage.toFixed(5) : '-';
  }

  const fracture = fractureGate(input.authority);
  const kd2 = kd2Gate(input.authority);
  const kd3 = kd3SourceGate(input.authority);
  byId('summaryBody').innerHTML = currentWalls.map((wall) => {
    const status = wallStatus(input, wall);
    return `<tr>
      <td>${fmt(wall.tNominal, 2)}</td>
      <td><span class="badge ${wall.pass ? 'good' : 'bad'}">${wall.pass ? 'PASS' : 'FAIL'}</span></td>
      <td><span class="badge ${kd2.css}">${escapeHtml(kd2.label)}</span></td>
      <td><span class="badge ${kd3.css}">${escapeHtml(kd3.label)}</span></td>
      <td>${input.cycles.length}</td>
      <td>${status.kdCount}/${input.cycles.length} approved</td>
      <td>${status.anyInelastic ? 'YES' : 'NO'}</td>
      <td>${Number.isFinite(status.cumulative) ? status.cumulative.toFixed(5) : '-'}</td>
      <td><span class="badge ${fracture.css}">${escapeHtml(fracture.label)}</span></td>
      <td><span class="badge ${status.css}">${escapeHtml(status.label)}</span></td>
    </tr>`;
  }).join('');
}

function calculate() {
  const input = readInputs();
  const error = validateInputs(input);
  byId('errorBox').textContent = error;
  byId('errorBox').hidden = !error;
  if (error) return;

  const c = input.ci + input.co;
  const pressureWall = requiredPressureWall({ D: input.D, co: input.co, P: input.Pdesign, S: input.S });
  const staticMinimum = pressureWall + c;
  const nominalRequired = requiredNominalWall(staticMinimum, input.tolerance);

  lastInput = input;
  renderSummaryMetrics(input, pressureWall, staticMinimum, nominalRequired);
  renderStaticTable(input, staticMinimum);
  renderFatigueMatrix(input);
}

function loadReferenceExample() {
  byId('diameter').value = DEFAULTS.diameter;
  byId('designPressure').value = DEFAULTS.designPressure;
  byId('allowableStress').value = DEFAULTS.allowableStress;
  byId('ci').value = DEFAULTS.ci;
  byId('co').value = DEFAULTS.co;
  byId('tolerance').value = DEFAULTS.tolerance;
  byId('candidateWalls').value = DEFAULTS.walls;

  [
    'viii3Edition','materialSpec','materialGrade','productSpec','toleranceSource','evidencePackage',
    'kd2Edition','kd2LimitCalcId','kd3SourceEdition','kdRoute','seqRouteSourceRef','seqBeta',
    'seqReferenceCycles','seqMeanTermLimit','fatigueCurveId','fatigueCurveSourceRef','fatigueCurveData','fractureEvidence'
  ].forEach((id) => { if (byId(id)) byId(id).value = ''; });

  byId('kd2AnalysisMethod').value = 'unassessed';
  byId('kd2StressModel').value = 'pressure-analytic';
  byId('kd2Geometry').value = 'uniform';
  byId('kd2Residual').value = 'none';
  byId('kd2Approved').checked = false;

  byId('kd3SourceConfirmed').checked = false;
  byId('kd3CompatibilityConfirmed').checked = false;
  byId('seqMode').value = 'manual';
  byId('seqMeanBasis').value = 'elastic-average-nonnegative';
  byId('seqRouteApproved').checked = false;
  byId('fatigueCurveMode').value = 'manual';
  byId('fatigueInterpolation').value = 'loglog';
  byId('fatigueInterpolationApproved').checked = false;
  byId('fatigueCurveApproved').checked = false;

  byId('fractureStatus').value = 'unassessed';

  byId('cycleBody').innerHTML = '';
  cycleCounter = 0;
  DEFAULTS.cycles.forEach((cycle) => addCycleRow(cycle));
  currentMatrix = [];
  calculate();
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function downloadCsv() {
  if (!lastInput || !currentMatrix.length) calculate();
  if (!lastInput || !currentMatrix.length) return;

  const a = authorityState();
  lastInput = { ...lastInput, authority: a };
  refreshAutomaticSeq(lastInput);
  refreshAutomaticNi(lastInput);
  const curve = parseFatigueCurvePoints(a.fatigueCurveData);
  const headers = [
    'b31_edition','viii3_edition','material_spec','material_grade','product_spec','tolerance_source','evidence_package',
    'kd2_source_commit','kd2_source_blob','kd2_source_edition','kd2_analysis_method','kd2_stress_model','kd2_geometry','kd2_residual','kd2_limit_calc_id','kd2_approved',
    'kd3_source_commit','kd3_source_blob','kd3_source_size_bytes','kd3_source_edition','kd3_source_confirmed','kd3_compatibility_confirmed',
    'kd3_route','seq_mode','seq_route_source_ref','seq_route_approved','seq_mean_basis','seq_beta','seq_reference_cycles','seq_mean_term_limit',
    'fatigue_curve_mode','fatigue_curve_id','fatigue_curve_source_ref','fatigue_interpolation','fatigue_interpolation_approved','fatigue_curve_approved','fatigue_curve_points','fatigue_curve_validation',
    'fracture_status','fracture_evidence',
    'nominal_wall_mm','minimum_T_mm','static_pass','cycle_id','cycle_name','Pmin_MPa','Pmax_MPa','Tmin_C','Tmax_C','avg_T_C','Syt_MPa','cycles_n',
    'effective_T_minus_c_mm','sigma_z_Pmin_MPa','sigma_z_Pmax_MPa','sigma_theta_Pmin_MPa','sigma_theta_Pmax_MPa','sigma_r_Pmin_MPa','sigma_r_Pmax_MPa',
    'delta_sigma_z_MPa','delta_sigma_theta_MPa','delta_sigma_r_MPa','pressure_only_delta_SI_MPa',
    'Sp_Pmin_MPa','Sp_Pmax_MPa','delta_Sp_MPa','half_range_descriptor_MPa','elastic_gate',
    'Salt12_MPa','Salt23_MPa','Salt31_MPa','mean12_MPa','mean23_MPa','mean31_MPa','Seq_MPa','Seq_basis','Ni_cycles','Ni_basis','KD3_source_calc_id','KD3_row_approved','usage_Ui','cumulative_U','class_status'
  ];

  const rows = currentMatrix.map((result) => {
    const wall = currentWalls.find((w) => w.tNominal === result.wall);
    const cycle = lastInput.cycles.find((c) => c.id === result.cycleId);
    const kd = readKdState(result.wall, result.cycleId);
    const usage = kdComplete(kd) ? result.n / kd.ni : '';
    const summary = wallStatus(lastInput, wall);
    return [
      a.b31Edition,a.viii3Edition,a.materialSpec,a.materialGrade,a.productSpec,a.toleranceSource,a.evidencePackage,
      KD2_SOURCE.commit,KD2_SOURCE.blob,a.kd2Edition,a.kd2AnalysisMethod,a.kd2StressModel,a.kd2Geometry,a.kd2Residual,a.kd2LimitCalcId,a.kd2Approved,
      KD3_SOURCE.commit,KD3_SOURCE.blob,KD3_SOURCE.size,a.kd3SourceEdition,a.kd3SourceConfirmed,a.kd3CompatibilityConfirmed,
      a.kdRoute,a.seqMode,a.seqRouteSourceRef,a.seqRouteApproved,a.seqMeanBasis,a.seqBeta,a.seqReferenceCycles,a.seqMeanTermLimit,
      a.fatigueCurveMode,a.fatigueCurveId,a.fatigueCurveSourceRef,a.fatigueInterpolation,a.fatigueInterpolationApproved,a.fatigueCurveApproved,
      curve.ok ? curve.points.map((p) => `${p.N}:${p.Sa}`).join(';') : '',
      curve.ok ? 'VALID' : curve.error,
      a.fractureStatus,a.fractureEvidence,
      result.wall,wall.T,wall.pass,cycle.id,cycle.name,cycle.pMin,cycle.pMax,cycle.tMin,cycle.tMax,result.averageT,result.syt,result.n,
      result.effective,result.stateMin.axial,result.stateMax.axial,result.stateMin.hoop,result.stateMax.hoop,result.stateMin.radial,result.stateMax.radial,
      result.delta.axial,result.delta.hoop,result.delta.radial,result.deltaSI,
      result.spMin,result.spMax,result.deltaSp,result.halfRange,result.elastic,
      ...(() => { const pairs = kd312PairMetrics(result); return [pairs[0].salt,pairs[1].salt,pairs[2].salt,pairs[0].meanElastic,pairs[1].meanElastic,pairs[2].meanElastic]; })(),
      kd.seq > 0 ? kd.seq : '',kd.seqBasis,kd.ni > 0 ? kd.ni : '',kd.niBasis,kd.source,kd.approved,usage,
      Number.isFinite(summary.cumulative) ? summary.cumulative : '',summary.label
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hp-class-standardization-qualification-matrix.csv';
  link.click();
  URL.revokeObjectURL(url);
}

function refreshAuthorityAndStatus() {
  if (!lastInput) return;
  lastInput = { ...lastInput, authority: authorityState() };
  updateUsageAndClassSummary(lastInput);
}

byId('calculateButton').addEventListener('click', calculate);
byId('resetButton').addEventListener('click', loadReferenceExample);
byId('csvButton').addEventListener('click', downloadCsv);
byId('printButton').addEventListener('click', () => window.print());
byId('addCycleButton').addEventListener('click', () => addCycleRow({ name: `Cycle ${cycleCounter + 1}` }));

byId('cycleBody').addEventListener('input', (event) => {
  const row = event.target.closest('tr');
  if (row) refreshCycleAverage(row);
});
byId('cycleBody').addEventListener('click', (event) => {
  if (!event.target.classList.contains('remove-cycle')) return;
  if (byId('cycleBody').children.length <= 1) {
    byId('errorBox').textContent = 'At least one pressure-cycle block is required.';
    byId('errorBox').hidden = false;
    return;
  }
  event.target.closest('tr').remove();
  calculate();
});

byId('fatigueBody').addEventListener('input', refreshAuthorityAndStatus);
byId('fatigueBody').addEventListener('change', refreshAuthorityAndStatus);

[
  'viii3Edition','materialSpec','materialGrade','productSpec','toleranceSource','evidencePackage',
  'kd2Edition','kd2AnalysisMethod','kd2StressModel','kd2Geometry','kd2Residual','kd2LimitCalcId','kd2Approved',
  'kd3SourceEdition','kd3SourceConfirmed','kd3CompatibilityConfirmed','kdRoute',
  'seqMode','seqRouteSourceRef','seqRouteApproved','seqMeanBasis','seqBeta','seqReferenceCycles','seqMeanTermLimit',
  'fatigueCurveMode','fatigueCurveId','fatigueCurveSourceRef','fatigueCurveData','fatigueInterpolation',
  'fatigueInterpolationApproved','fatigueCurveApproved',
  'fractureStatus','fractureEvidence'
].forEach((id) => {
  const element = byId(id);
  if (!element) return;
  element.addEventListener('input', refreshAuthorityAndStatus);
  element.addEventListener('change', () => {
    if ((id === 'fatigueCurveMode' || id === 'seqMode') && lastInput) {
      lastInput = { ...lastInput, authority: authorityState() };
      renderFatigueMatrix(lastInput);
    } else refreshAuthorityAndStatus();
  });
});

window.HPClassApp = Object.freeze({
  parseFatigueCurvePoints,
  interpolateFatigueLife,
  interpolateCurveStressAtCycles,
  kd312PairMetrics,
  calculateAutomaticSeq,
  requiredPressureWall,
  pressureRating,
  pressureStress,
});

loadReferenceExample();
