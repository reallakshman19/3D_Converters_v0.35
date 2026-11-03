function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function text(value) {
  return String(value ?? '').trim();
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function indexStates(states, spectrumId) {
  const map = new Map();
  for (const row of states.filter((item) => text(item?.spectrumId) === spectrumId)) {
    const id = text(row.stateId);
    if (!id) return failure('STATE_ID_MISSING', 'Every operating state requires stateId.');
    if (map.has(id)) return failure('STATE_DUPLICATE', `Duplicate stateId ${id}.`, { stateId: id });
    for (const field of ['pressureMpa', 'materialTemperatureC', 'structuralTemperatureC']) {
      if (!finite(row[field])) return failure('STATE_VALUE_INVALID', `${id}.${field} must be finite.`, { stateId: id, field });
    }
    if (row.pressureMpa < 0) return failure('STATE_VALUE_INVALID', `${id}.pressureMpa cannot be negative.`, { stateId: id });
    map.set(id, row);
  }
  return { ok: true, map };
}

function transitionResult(row, from, to) {
  const totalCycles = row.totalCycles;
  if (!finite(totalCycles) || totalCycles < 0) {
    return failure('TRANSITION_CYCLES_INVALID', `${row.cycleId}.totalCycles must be >= 0.`, { cycleId: row.cycleId });
  }
  return {
    ok: true,
    cycleId: text(row.cycleId),
    category: text(row.category),
    fromStateId: text(row.fromStateId),
    toStateId: text(row.toStateId),
    fromState: from,
    toState: to,
    totalCycles,
    cyclesPerYear: finite(row.cyclesPerYear) ? row.cyclesPerYear : null,
    pressureRangeMpa: Math.abs(to.pressureMpa - from.pressureMpa),
    meanPressureMpa: (to.pressureMpa + from.pressureMpa) / 2,
    materialTemperatureRangeC: Math.abs(to.materialTemperatureC - from.materialTemperatureC),
    structuralTemperatureRangeC: Math.abs(to.structuralTemperatureC - from.structuralTemperatureC),
    provenanceId: text(row.provenanceId) || null,
  };
}

export function resolveChapterIxTransientSpectrum({ spectrum = {}, states = [], transitions = [] } = {}) {
  const spectrumId = text(spectrum.spectrumId);
  if (!spectrumId) return failure('SPECTRUM_ID_MISSING', 'spectrum.spectrumId is required.');
  if (!Array.isArray(states) || !Array.isArray(transitions)) {
    return failure('INPUT_INVALID', 'states and transitions must be arrays.');
  }
  const indexed = indexStates(states, spectrumId);
  if (!indexed.ok) return indexed;
  const relevant = transitions.filter((row) => text(row?.spectrumId) === spectrumId);
  if (!relevant.length) return failure('TRANSITIONS_MISSING', `No transitions found for ${spectrumId}.`);
  const cycles = [];
  for (const row of relevant) {
    const cycleId = text(row.cycleId);
    const from = indexed.map.get(text(row.fromStateId));
    const to = indexed.map.get(text(row.toStateId));
    if (!cycleId) return failure('TRANSITION_ID_MISSING', 'Every transition requires cycleId.');
    if (!from || !to) {
      return failure('TRANSITION_STATE_NOT_FOUND', `${cycleId} must reference states in the same spectrum.`, {
        cycleId, fromStateId: row.fromStateId ?? null, toStateId: row.toStateId ?? null,
      });
    }
    const built = transitionResult(row, from, to);
    if (!built.ok) return built;
    cycles.push(built);
  }
  return {
    ok: true,
    canUseForDesignAuthority: false,
    spectrumId,
    designLifeYears: finite(spectrum.designLifeYears) ? spectrum.designLifeYears : null,
    cycles,
    cycleCount: cycles.length,
    totalDeclaredCycles: cycles.reduce((sum, row) => sum + row.totalCycles, 0),
    custody: {
      preparedBy: text(spectrum.preparedBy) || null,
      checkedBy: text(spectrum.checkedBy) || null,
      approvedBy: text(spectrum.approvedBy) || null,
      status: text(spectrum.status) || null,
    },
    formulation: 'HIGH_PR_TRANSIENT_SPECTRUM_V1',
  };
}
