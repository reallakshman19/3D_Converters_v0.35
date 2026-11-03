import {
  classifyDtxrRobust,
  classifyWeightMasterCandidate,
  ensureValveHintConfig,
  specialValveFactorRows,
  normalizeWeightText
} from './weight-valve-hints.js';

function text(value) { return value === null || value === undefined ? '' : String(value); }

function numberOr(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizedRating(value) {
  return text(value).replace(/#/g, '').trim().toUpperCase();
}

function pickNumber(row, keys) {
  for (const key of keys || []) {
    const match = text(row?.[key] ?? row?._raw?.[key]).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) continue;
    const numeric = Number(match[0]);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function pickText(row, keys) {
  for (const key of keys || []) {
    const value = row?.[key] ?? row?._raw?.[key];
    if (text(value).trim()) return text(value).trim();
  }
  return '';
}

function ruleMatchesText(rule, value) {
  const raw = text(value);
  const normalized = normalizeWeightText(raw);
  return (rule?.patterns || []).some((pattern) => {
    try {
      const regex = pattern ? new RegExp(pattern, 'i') : null;
      return regex && (regex.test(raw) || regex.test(normalized));
    } catch {
      return false;
    }
  });
}

function activeSpecialValveFactorRows(config) {
  return specialValveFactorRows(config).filter((row) => row.on && row.code && row.patterns.length && row.targets.length).sort((a, b) => a.priority - b.priority);
}

function matchedSpecialFactorRule(dtxrText, nodeName, config) {
  const source = `${dtxrText || ''} ${nodeName || ''}`;
  return activeSpecialValveFactorRows(config).find((rule) => ruleMatchesText(rule, source)) || null;
}

export function applySpecialFactorsToExpected(expected, dtxrText, nodeName, config) {
  if (!Number.isFinite(expected) || expected <= 0) return expected;
  const rule = matchedSpecialFactorRule(dtxrText, nodeName, config);
  if (!rule) return expected;
  
  // Try to find the highest target factor
  const factors = rule.targets.map(t => numberOr(t.factor, 1));
  const maxFactor = Math.max(1, ...factors);
  
  return expected * maxFactor;
}

export function classifySubsetEntry(lengthMm, subsetLengths, config) {
  const target = Number(lengthMm);
  if (!Number.isFinite(target) || subsetLengths.length === 0) return { type: 'unknown', extrapolationRatio: 1 };

  const sorted = [...subsetLengths].sort((a, b) => a - b);
  const minLength = sorted[0];
  const maxLength = sorted[sorted.length - 1];
  const tolerance = numberOr(config?.weight?.stdLengthToleranceMm, 5);
  
  // Check if standard
  for (const len of sorted) {
    if (Math.abs(len - target) <= tolerance) {
      return { type: 'standard', extrapolationRatio: 1 };
    }
  }
  
  if (target > minLength && target < maxLength) {
    return { type: 'interpolated', extrapolationRatio: 1 };
  }
  
  // Extrapolated
  const ref = target < minLength ? minLength : maxLength;
  const ratio = target / ref;
  
  const minRatioBand = numberOr(config?.weight?.validatorOddThresholdRatioMin, 0.8);
  const maxRatioBand = numberOr(config?.weight?.validatorOddThresholdRatioMax, 1.2);
  
  if (ratio < minRatioBand || ratio > maxRatioBand) {
    return { type: 'odd', extrapolationRatio: ratio };
  }
  return { type: 'extrapolated', extrapolationRatio: ratio };
}

export function interpolateWeightFromSubset(lengthMm, subsetRows, config) {
  const target = Number(lengthMm);
  if (!Number.isFinite(target) || subsetRows.length === 0) return null;

  const validRows = subsetRows.filter(r => Number.isFinite(r.length) && Number.isFinite(r.weight) && r.length > 0 && r.weight > 0)
    .sort((a, b) => a.length - b.length);
    
  if (validRows.length === 0) return null;
  
  if (validRows.length === 1) {
    const ref = validRows[0];
    return ref.weight * (target / ref.length);
  }
  
  let lower = null;
  let upper = null;
  
  for (const row of validRows) {
    if (row.length <= target) lower = row;
    if (row.length >= target && !upper) upper = row;
  }
  
  if (lower && upper && lower !== upper) {
    return lower.weight + ((target - lower.length) * (upper.weight - lower.weight)) / (upper.length - lower.length);
  }
  
  const pair = target < validRows[0].length ? [validRows[0], validRows[1]] : [validRows[validRows.length - 2], validRows[validRows.length - 1]];
  if (pair[1].length === pair[0].length) return pair[0].weight; // Avoid div by zero
  
  const extrapolated = pair[0].weight + ((target - pair[0].length) * (pair[1].weight - pair[0].weight)) / (pair[1].length - pair[0].length);
  return extrapolated > 0 ? extrapolated : validRows[0].weight * (target / validRows[0].length);
}

export function ensureValidatorConfig(config) {
  ensureValveHintConfig(config);
  if (!Number.isFinite(Number(config.weight.validatorDeviationPct))) config.weight.validatorDeviationPct = 20;
  if (!Number.isFinite(Number(config.weight.validatorOddThresholdRatioMin))) config.weight.validatorOddThresholdRatioMin = 0.8;
  if (!Number.isFinite(Number(config.weight.validatorOddThresholdRatioMax))) config.weight.validatorOddThresholdRatioMax = 1.2;
  if (!Number.isFinite(Number(config.weight.stdLengthToleranceMm))) config.weight.stdLengthToleranceMm = 5;
  if (!Number.isFinite(Number(config.weight.fullBoreFallbackFactor))) config.weight.fullBoreFallbackFactor = 1.3;
  if (config.weight.validatorShowOnlyFlagged !== false) config.weight.validatorShowOnlyFlagged = true;
  return config.weight;
}

function positiveNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }
  return null;
}

function candidateLengthClass(candidate) {
  if (!candidate || candidate.zeroFallback) return 'unknown';
  const method = text(candidate.weightMethod).toLowerCase();
  if (method.includes('extrapolat')) return 'extrapolated';
  if (method.includes('interpolat')) return 'interpolated';
  if (method.includes('exact') || method.includes('standard') || method.includes('fallback')) return 'standard';
  return 'standard';
}

function candidateExpected(issue) {
  const candidates = Array.isArray(issue?.candidates) ? issue.candidates : [];
  const candidate = candidates.find((row) => row?.preferred && !row?.zeroFallback) || candidates.find((row) => !row?.zeroFallback) || null;
  if (!candidate) return null;
  const weight = positiveNumber(candidate.selectedWeight, candidate.suggestedWeight, candidate.weight, candidate.masterWeight, candidate.directWeight);
  if (!weight) return null;
  return {
    weight,
    family: text(candidate.candidateClass?.family).toUpperCase(),
    lengthClass: candidateLengthClass(candidate),
  };
}

function issueFamily(issue, dtxrClass, candidateFamily) {
  if (candidateFamily) return candidateFamily;
  const dtxr = text(issue?.dtxr);
  const componentType = text(issue?.componentType).toUpperCase();
  if (/\b(FLAN|FLANGED|WELDNECK|WNFL)\b/.test(componentType) || /\b(FLANGE|FLANGED)\b/i.test(dtxr)) return 'FLANGE';
  if (componentType === 'RIGID' && !dtxrClass?.matched) return '';
  return 'VALVE';
}

export function validateWeightSubsets(issues, masterRows, config) {
  ensureValidatorConfig(config);
  
  // Parse master rows to extract length, weight, bore, rating, family
  const parsedMaster = (masterRows || []).map(row => {
    const bore = pickNumber(row, ['boreMm', 'convertedBore', 'Converted Bore', 'bore', 'Bore', 'BORE', 'DN', 'NB', 'NPS']);
    const length = pickNumber(row, ['lengthMm', 'length', 'Length', 'LENGTH', 'Length mm', 'LENGTH_MM', 'Length (RF-F/F)', 'RF-F/F', 'LEN', 'faceToFace', 'Face To Face', 'F2F']);
    const weight = pickNumber(row, ['valveWeight', 'directWeight', 'weight', 'Weight', 'WEIGHT', 'Weight kg', 'WEIGHT_KG', 'RF/RTJ KG', 'Valve Weight']);
    const rating = normalizedRating(pickText(row, ['ratingClass', 'rating', 'Rating', 'RATING', 'Class', 'CLASS', 'Pressure Class']));
    const type = pickText(row, ['type', 'Type', 'TYPE', 'valveType', 'Valve Type']);
    const typeDesc = pickText(row, ['typeDesc', 'TypeDesc', 'Type Desc', 'Type Description', 'Description', 'Valve Type']);
    
    if (bore === null || length === null || weight === null || !rating) return null;
    
    const candidateClass = classifyWeightMasterCandidate({ type, typeDesc });
    return { bore, length, weight, rating, family: candidateClass.family, subtype: candidateClass.subtype };
  }).filter(Boolean);

  const deviationThreshold = numberOr(config.weight.validatorDeviationPct, 20) / 100;

  return (issues || []).map(issue => {
    const boreMm = Number(issue.boreMm);
    const lengthMm = Number(issue.lengthMm);
    const candidateBase = candidateExpected(issue);
    const matchedWeight = positiveNumber(issue.weight, candidateBase?.weight) || 0;
    const rating = normalizedRating(issue.rating);
    
    const dtxr = text(issue.dtxr);
    const dtxrClass = classifyDtxrRobust(dtxr, config);
    const family = issueFamily(issue, dtxrClass, candidateBase?.family || '');
    
    let expectedBase = candidateBase?.weight || null;
    let expectedSource = candidateBase ? 'candidate' : 'subset';
    
    // Find subset
    const subsetRows = family ? parsedMaster.filter(r => 
      Math.abs(r.bore - boreMm) < 1 &&
      r.rating === rating &&
      (family === 'VALVE' ? r.family === 'VALVE' : r.family === family)
    ) : [];

    const lengthClass = candidateBase
      ? { type: candidateBase.lengthClass, extrapolationRatio: 1 }
      : classifySubsetEntry(lengthMm, subsetRows.map(r => r.length), config);
    
    if (!expectedBase && subsetRows.length > 0) {
      expectedBase = interpolateWeightFromSubset(lengthMm, subsetRows, config);
    }
    
    let isFullBore = false;
    if (dtxrClass.matched && dtxrClass.code === 'FULL_BORE') {
      isFullBore = true;
      if (!expectedBase) {
        // Fallback to VBL subset
        const vblSubset = subsetRows.filter(r => r.subtype === 'BALL');
        if (vblSubset.length > 0) {
          const vblBase = interpolateWeightFromSubset(lengthMm, vblSubset, config);
          if (vblBase) {
             expectedBase = vblBase * numberOr(config.weight.fullBoreFallbackFactor, 1.3);
             expectedSource = 'subset-full-bore';
          }
        }
      }
    }
    
    let expectedFactored = expectedBase;
    if (expectedFactored && family === 'VALVE' && expectedSource !== 'candidate') {
      expectedFactored = applySpecialFactorsToExpected(expectedFactored, dtxr, issue.nodeName, config);
    }
    
    let deviationPct = 0;
    let isOdd = lengthClass.type === 'odd';
    let isSuspect = false;
    let noMatch = !expectedFactored || matchedWeight <= 0;
    
    if (expectedFactored && matchedWeight > 0) {
      deviationPct = Math.abs(matchedWeight - expectedFactored) / expectedFactored;
      if (deviationPct > deviationThreshold) {
        isSuspect = true;
      }
    }
    
    return {
      ...issue,
      validatorLengthClass: lengthClass.type,
      validatorExtrapolationRatio: lengthClass.extrapolationRatio,
      validatorExpectedBase: expectedBase,
      validatorExpectedFactored: expectedFactored,
      validatorExpectedSource: expectedSource,
      validatorMatchedWeight: matchedWeight,
      validatorDeviationPct: deviationPct,
      validatorIsOdd: isOdd,
      validatorIsSuspect: isSuspect,
      validatorNoMatch: noMatch,
      validatorIsFlagged: isOdd || isSuspect || noMatch
    };
  });
}
