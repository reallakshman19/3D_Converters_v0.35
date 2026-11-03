function failure(code, message, details = {}) {
  return { ok: false, code, message, details, canUseForDesignAuthority: false };
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function calculateChapterIxCumulativeDamage({ cycles = [] } = {}) {
  if (!Array.isArray(cycles) || !cycles.length) {
    return failure('FATIGUE_CYCLES_REQUIRED', 'At least one fatigue cycle result is required.');
  }
  const contributions = [];
  for (const row of cycles) {
    if (!finite(row.appliedCycles) || row.appliedCycles < 0) {
      return failure('FATIGUE_APPLIED_CYCLES_INVALID', 'appliedCycles must be finite and >= 0.', { cycleId: row.cycleId ?? null });
    }
    if (row.zeroDamage === true) {
      contributions.push({
        cycleId: row.cycleId ?? null,
        appliedCycles: row.appliedCycles,
        permissibleCycles: null,
        zeroDamage: true,
        usage: 0,
      });
      continue;
    }
    if (!finite(row.permissibleCycles) || !(row.permissibleCycles > 0)) {
      return failure('FATIGUE_PERMISSIBLE_CYCLES_INVALID', 'permissibleCycles must be finite and > 0.', { cycleId: row.cycleId ?? null });
    }
    const usage = row.appliedCycles / row.permissibleCycles;
    contributions.push({
      cycleId: row.cycleId ?? null,
      appliedCycles: row.appliedCycles,
      permissibleCycles: row.permissibleCycles,
      zeroDamage: false,
      usage,
    });
  }
  const cumulativeUsage = contributions.reduce((sum, row) => sum + row.usage, 0);
  return {
    ok: true,
    canUseForDesignAuthority: false,
    contributions,
    cumulativeUsage,
    usageLimit: 1,
    usageWithinUnity: cumulativeUsage <= 1,
    referenceStatus: cumulativeUsage <= 1 ? 'REFERENCE_PASS' : 'REFERENCE_FAIL',
    formulation: 'HIGH_PR_MINER_CUMULATIVE_DAMAGE_V1',
  };
}
