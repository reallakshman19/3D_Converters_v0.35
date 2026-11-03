import {
  DEFAULT_PIPE_WALL_MASTER_ROWS,
  PIPE_WALL_MASTER_SIZE_ROWS,
  PIPE_WALL_MASTER_SOURCE,
} from './default-pipe-wall-master-rows.js';

const EPSILON_MM = 1e-9;

function text(value) {
  return String(value ?? '').trim();
}

export function normalizePipeDimensionStandard(value) {
  const norm = text(value).toUpperCase().replace(/[\s._-]+/g, '');
  if (['ASMEB3610M', 'ASMEB3610', 'B3610M', 'B3610'].includes(norm)) return 'ASME B36.10M';
  if (['ASMEB3619M', 'ASMEB3619', 'B3619M', 'B3619'].includes(norm)) return 'ASME B36.19M';
  return text(value).toUpperCase();
}

export function normalizePipeSchedule(value) {
  let norm = text(value).toUpperCase();
  norm = norm.replace(/SCHEDULE/g, '').replace(/SCH\.?/g, '');
  norm = norm.replace(/[\s:_-]+/g, '');
  if (norm === 'STANDARD' || norm === 'STANDARDWT') return 'STD';
  if (norm === 'EXTRASTRONG') return 'XS';
  if (norm === 'DOUBLEEXTRASTRONG') return 'XXS';
  if (/^\d+\.0+$/.test(norm)) norm = String(Number(norm));
  return norm;
}

export function normalizePipeNps(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? String(number) : '';
}

function normalizeDn(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function canonicalRow(row) {
  const standard = normalizePipeDimensionStandard(row?.dimensionStandard ?? row?.standard);
  const nps = normalizePipeNps(row?.nps);
  const dn = normalizeDn(row?.dn);
  const schedule = normalizePipeSchedule(row?.schedule);
  const nominalWallMm = positive(row?.nominalWallMm ?? row?.wallThicknessMm ?? row?.wallMm);
  const outsideDiameterMm = positive(row?.outsideDiameterMm ?? row?.odMm);
  if (!standard || !nps || !dn || !schedule || !nominalWallMm || !outsideDiameterMm) return null;
  return Object.freeze({
    ...row,
    dimensionStandard: standard,
    nps,
    dn,
    schedule,
    nominalWallMm,
    outsideDiameterMm,
  });
}

function keyOf(row) {
  return `${row.dimensionStandard}|NPS${row.nps}|${row.schedule}`;
}

function scheduleRank(schedule) {
  if (/^\d+$/.test(schedule)) return [0, Number(schedule), schedule];
  if (/^\d+S$/.test(schedule)) return [0, Number(schedule.slice(0, -1)), schedule];
  const aliases = { STD: 1000, XS: 2000, XXS: 3000 };
  return [1, aliases[schedule] ?? 9999, schedule];
}

function compareSchedule(a, b) {
  const ar = scheduleRank(a);
  const br = scheduleRank(b);
  return ar[0] - br[0] || ar[1] - br[1] || ar[2].localeCompare(br[2]);
}

function compareWallRows(a, b) {
  return a.nominalWallMm - b.nominalWallMm || compareSchedule(a.schedule, b.schedule);
}

function resolveSizeRows(rows, { nps, dn } = {}) {
  const normalizedNps = normalizePipeNps(nps);
  const normalizedDn = normalizeDn(dn);
  if (!normalizedNps && !normalizedDn) return [];
  let matches = rows;
  if (normalizedNps) matches = matches.filter((row) => row.nps === normalizedNps);
  if (normalizedDn) matches = matches.filter((row) => row.dn === normalizedDn);
  return matches;
}

export function validatePipeWallMaster({
  rows = DEFAULT_PIPE_WALL_MASTER_ROWS,
  sizeRows = PIPE_WALL_MASTER_SIZE_ROWS,
  odParityToleranceMm = 1,
} = {}) {
  const errors = [];
  const warnings = [];
  const canonical = rows.map(canonicalRow).filter(Boolean);

  if (canonical.length !== rows.length) {
    errors.push({
      code: 'INVALID_MASTER_ROW',
      count: rows.length - canonical.length,
      message: 'One or more pipe-wall rows are missing required standard/size/schedule/wall fields',
    });
  }

  const seen = new Map();
  for (const row of canonical) {
    const key = keyOf(row);
    const prior = seen.get(key);
    if (prior && Math.abs(prior.nominalWallMm - row.nominalWallMm) > EPSILON_MM) {
      errors.push({
        code: 'CONFLICTING_MASTER_WALL',
        key,
        values: [prior.nominalWallMm, row.nominalWallMm],
      });
    } else if (!prior) {
      seen.set(key, row);
    }
    if (row.nominalWallMm * 2 >= row.outsideDiameterMm) {
      errors.push({
        code: 'IMPOSSIBLE_PIPE_GEOMETRY',
        key,
        outsideDiameterMm: row.outsideDiameterMm,
        nominalWallMm: row.nominalWallMm,
      });
    }
  }

  for (const size of sizeRows || []) {
    const odFromIn = Number(size.outsideDiameterInSource) * 25.4;
    const deltaMm = Math.abs(Number(size.outsideDiameterMm) - odFromIn);
    if (Number.isFinite(deltaMm) && deltaMm > odParityToleranceMm) {
      warnings.push({
        code: 'SOURCE_OD_UNIT_PARITY_MISMATCH',
        sourceRow: size.sourceRow,
        nps: size.nps,
        dn: size.dn,
        outsideDiameterMm: size.outsideDiameterMm,
        outsideDiameterInSource: size.outsideDiameterInSource,
        convertedInchOdMm: odFromIn,
        deltaMm,
      });
    }
  }

  const sizesWithWallData = new Set(canonical.map((row) => `${row.nps}|${row.dn}`));
  const sizesWithoutWallData = (sizeRows || [])
    .filter((size) => !sizesWithWallData.has(`${size.nps}|${size.dn}`))
    .map((size) => ({ nps: size.nps, dn: size.dn, sourceRow: size.sourceRow }));

  return {
    ok: errors.length === 0,
    source: PIPE_WALL_MASTER_SOURCE,
    counts: {
      sourceSizeRows: (sizeRows || []).length,
      wallRows: canonical.length,
      uniqueWallKeys: seen.size,
      sizesWithWallData: sizesWithWallData.size,
      sizesWithoutWallData: sizesWithoutWallData.length,
    },
    errors,
    warnings,
    sizesWithoutWallData,
  };
}

export function createPipeWallMaster({
  rows = DEFAULT_PIPE_WALL_MASTER_ROWS,
  acceptedDataStatuses = ['PROJECT_MASTER', 'VERIFIED', 'PROJECT_APPROVED'],
} = {}) {
  const accepted = new Set((acceptedDataStatuses || []).map((value) => text(value).toUpperCase()));
  const allRows = rows.map(canonicalRow).filter(Boolean);
  const activeRows = allRows.filter((row) => accepted.has(text(row.dataStatus).toUpperCase()));

  function lookup({ standard, dimensionStandard, nps, dn, schedule } = {}) {
    const targetStandard = normalizePipeDimensionStandard(dimensionStandard ?? standard);
    const targetSchedule = normalizePipeSchedule(schedule);
    if (!targetStandard || !targetSchedule) {
      return {
        ok: false,
        code: 'PIPE_WALL_LOOKUP_INVALID',
        message: 'dimensionStandard/standard and schedule are required',
      };
    }
    const sizeMatches = resolveSizeRows(activeRows, { nps, dn });
    const matches = sizeMatches.filter(
      (row) => row.dimensionStandard === targetStandard && row.schedule === targetSchedule,
    );
    if (matches.length === 0) {
      return {
        ok: false,
        code: 'PIPE_WALL_LOOKUP_MISS',
        query: { dimensionStandard: targetStandard, nps: normalizePipeNps(nps), dn: normalizeDn(dn), schedule: targetSchedule },
      };
    }
    const uniqueWalls = [...new Set(matches.map((row) => row.nominalWallMm))];
    if (uniqueWalls.length !== 1) {
      return {
        ok: false,
        code: 'PIPE_WALL_LOOKUP_CONFLICT',
        matches,
      };
    }
    return {
      ok: true,
      code: 'PIPE_WALL_LOOKUP_HIT',
      row: matches[0],
      provenance: {
        sourcePath: matches[0].sourcePath,
        sourceBlobSha: matches[0].sourceBlobSha,
        sourceAuthority: matches[0].sourceAuthority,
        dataStatus: matches[0].dataStatus,
        sourceRow: matches[0].sourceRow,
      },
    };
  }

  function listForSize({ standard, dimensionStandard, nps, dn } = {}) {
    const targetStandard = normalizePipeDimensionStandard(dimensionStandard ?? standard);
    if (!targetStandard) {
      return { ok: false, code: 'PIPE_WALL_SIZE_INVALID', message: 'dimensionStandard/standard is required' };
    }
    const matches = resolveSizeRows(activeRows, { nps, dn })
      .filter((row) => row.dimensionStandard === targetStandard)
      .sort(compareWallRows);
    return matches.length
      ? { ok: true, code: 'PIPE_WALL_SIZE_HIT', rows: matches }
      : { ok: false, code: 'PIPE_WALL_SIZE_MISS', rows: [] };
  }

  function selectRequired({
    standard,
    dimensionStandard,
    nps,
    dn,
    requiredNominalThicknessMm,
    allowedSchedules,
  } = {}) {
    const requirement = positive(requiredNominalThicknessMm);
    if (!requirement) {
      return {
        ok: false,
        code: 'INVALID_REQUIRED_NOMINAL_THICKNESS',
        message: 'requiredNominalThicknessMm must be a positive finite number',
      };
    }
    const listed = listForSize({ standard, dimensionStandard, nps, dn });
    if (!listed.ok) return listed;

    const scheduleFilter = Array.isArray(allowedSchedules) && allowedSchedules.length
      ? new Set(allowedSchedules.map(normalizePipeSchedule))
      : null;
    const candidates = scheduleFilter
      ? listed.rows.filter((row) => scheduleFilter.has(row.schedule))
      : listed.rows;

    const passing = candidates.filter((row) => row.nominalWallMm + EPSILON_MM >= requirement);
    if (passing.length === 0) {
      return {
        ok: false,
        code: 'NO_ADEQUATE_PIPE_WALL',
        requiredNominalThicknessMm: requirement,
        maximumAvailableWallMm: candidates.length ? Math.max(...candidates.map((row) => row.nominalWallMm)) : null,
        candidates,
      };
    }

    const selectedWallMm = Math.min(...passing.map((row) => row.nominalWallMm));
    const equivalentRows = passing
      .filter((row) => Math.abs(row.nominalWallMm - selectedWallMm) <= EPSILON_MM)
      .sort((a, b) => compareSchedule(a.schedule, b.schedule));
    const selectedRow = equivalentRows[0];

    return {
      ok: true,
      code: 'PIPE_WALL_SELECTED',
      requiredNominalThicknessMm: requirement,
      selected: {
        ...selectedRow,
        equivalentSchedules: equivalentRows.map((row) => row.schedule),
        marginMm: selectedWallMm - requirement,
      },
      candidates,
      provenance: {
        sourcePath: selectedRow.sourcePath,
        sourceBlobSha: selectedRow.sourceBlobSha,
        sourceAuthority: selectedRow.sourceAuthority,
        dataStatus: selectedRow.dataStatus,
        sourceRow: selectedRow.sourceRow,
      },
    };
  }

  function selectForCalculation({ calculation, ...query } = {}) {
    if (!calculation?.ok || !positive(calculation.requiredNominalThicknessMm)) {
      return {
        ok: false,
        code: 'INVALID_THICKNESS_CALCULATION',
        message: 'A successful calculation with requiredNominalThicknessMm is required',
      };
    }
    return selectRequired({
      ...query,
      requiredNominalThicknessMm: calculation.requiredNominalThicknessMm,
    });
  }

  return Object.freeze({
    rows: activeRows,
    allRows,
    lookup,
    listForSize,
    selectRequired,
    selectForCalculation,
    validate: () => validatePipeWallMaster({ rows: allRows }),
  });
}

const DEFAULT_MASTER = createPipeWallMaster();

export function lookupPipeWall(query) {
  return DEFAULT_MASTER.lookup(query);
}

export function listPipeWallsForSize(query) {
  return DEFAULT_MASTER.listForSize(query);
}

export function selectRequiredPipeWall(query) {
  return DEFAULT_MASTER.selectRequired(query);
}

export function selectPipeWallForCalculation(query) {
  return DEFAULT_MASTER.selectForCalculation(query);
}
