export const BROWSER_RVM_INSTRUCTION_FILTER_SCHEMA = 'browser-rvm-instruction-filter/v1';

const DEFAULT_OPTIONS = Object.freeze({
  enabled: true,
  minAbsoluteDiagonal: 12,
  medianFactor: 40,
  p90Factor: 12,
  minSampleCount: 12,
});

const PIPING_OWNER_RE = /\b(PIPE|BRANCH|VALVE|FLANGE|ELBOW|TEE|GASKET|REDUCER|NOZZLE|INSTRUMENT|SUPPORT|STRAINER|CAP)\b/i;
const NON_PIPING_OWNER_RE = /\b(EQUIPMENT|SUBEQUIPMENT|STRUCTURE|FRAME|STEEL|PLATFORM|STAIR|LADDER|ROAD|TRANCHE|CIVIL|FOUNDATION)\b/i;
const NON_PIPING_TYPE_RE = /^(BOX|STRUCTURE|AUXILIARY_SOLID|UNKNOWN|GENERIC)$/i;
const BOXISH_PRIMITIVE_RE = /BOX|STRUCTURE|GENERIC|UNKNOWN/i;
const TORUS_RE = /TORUS|GASK/i;

export function filterBrowserRvmRenderInstructions(instructionSet = {}, options = {}) {
  const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
  const source = Array.isArray(instructionSet.instructions) ? instructionSet.instructions : [];
  if (opts.enabled === false || !source.length) {
    return withFilterDiagnostics(instructionSet, source, [], makeEmptyDiagnostics(source.length, 'disabled'));
  }

  const plan = makeOversizedNonPipingPlan(source, opts);
  const kept = [];
  const skipped = [];

  for (const instruction of source) {
    const item = classifyInstruction(instruction);
    const oversized = item.diagonal > plan.threshold;
    const hidden = oversized && item.nonPipingCandidate;
    if (hidden) {
      skipped.push({ instruction, reason: item.reason, diagonal: item.diagonal, threshold: plan.threshold });
      continue;
    }
    kept.push(instruction);
  }

  const diagnostics = {
    schemaVersion: BROWSER_RVM_INSTRUCTION_FILTER_SCHEMA,
    enabled: true,
    originalCount: source.length,
    keptCount: kept.length,
    skippedCount: skipped.length,
    threshold: round(plan.threshold),
    medianDiagonal: round(plan.median),
    p90Diagonal: round(plan.p90),
    sampleCount: plan.sampleCount,
    skippedReasons: summarizeSkipped(skipped),
    oversizedNonPipingHidden: skipped.length,
  };

  return withFilterDiagnostics(instructionSet, kept, skipped, diagnostics);
}

function withFilterDiagnostics(instructionSet, instructions, skipped, diagnostics) {
  return {
    ...instructionSet,
    instructions,
    count: instructions.length,
    diagnostics: {
      ...(instructionSet?.diagnostics || {}),
      oversizedNonPipingFilter: diagnostics,
      originalInstructionCount: diagnostics.originalCount,
      filteredInstructionCount: diagnostics.keptCount,
      oversizedNonPipingSkippedCount: diagnostics.skippedCount,
    },
    skippedInstructions: skipped,
  };
}

function makeEmptyDiagnostics(count, reason) {
  return {
    schemaVersion: BROWSER_RVM_INSTRUCTION_FILTER_SCHEMA,
    enabled: false,
    reason,
    originalCount: count,
    keptCount: count,
    skippedCount: 0,
    threshold: 0,
    medianDiagonal: 0,
    p90Diagonal: 0,
    sampleCount: 0,
    skippedReasons: {},
    oversizedNonPipingHidden: 0,
  };
}

function makeOversizedNonPipingPlan(instructions, opts) {
  const comparable = [];
  for (const instruction of instructions) {
    const item = classifyInstruction(instruction);
    if (!Number.isFinite(item.diagonal) || item.diagonal <= 0) continue;
    if (item.nonPipingCandidate && item.diagonal > opts.minAbsoluteDiagonal) continue;
    comparable.push(item.diagonal);
  }
  const sample = comparable.length >= opts.minSampleCount
    ? comparable
    : instructions.map((instruction) => classifyInstruction(instruction).diagonal).filter((value) => Number.isFinite(value) && value > 0);
  sample.sort((a, b) => a - b);
  const median = percentile(sample, 0.5) || 0;
  const p90 = percentile(sample, 0.9) || median || 0;
  const threshold = Math.max(
    positiveNumber(opts.minAbsoluteDiagonal, DEFAULT_OPTIONS.minAbsoluteDiagonal),
    median * positiveNumber(opts.medianFactor, DEFAULT_OPTIONS.medianFactor),
    p90 * positiveNumber(opts.p90Factor, DEFAULT_OPTIONS.p90Factor),
  );
  return { threshold, median, p90, sampleCount: sample.length };
}

function classifyInstruction(instruction = {}) {
  const attrs = instruction.attributes || {};
  const text = [
    instruction.sourcePath,
    instruction.sourceName,
    instruction.displayName,
    instruction.type,
    instruction.kind,
    instruction.renderPrimitive,
    attrs.RVM_OWNER_NAME,
    attrs.RVM_OWNER_PATH,
    attrs.NAME,
    attrs.TYPE,
    attrs.RVM_PRIMITIVE_KIND,
  ].map((value) => String(value || '')).join(' ');
  const type = String(instruction.type || attrs.TYPE || '').toUpperCase();
  const kind = String(instruction.kind || attrs.RVM_PRIMITIVE_KIND || '').toUpperCase();
  const primitive = String(instruction.renderPrimitive || '').toUpperCase();
  const bbox = parseBbox(instruction.bbox || attrs.RVM_BROWSER_BBOX);
  const diagonal = bbox ? bboxDiagonal(bbox) : fallbackDiagonal(instruction);
  const ownerLooksPiping = PIPING_OWNER_RE.test(text);
  const ownerLooksNonPiping = NON_PIPING_OWNER_RE.test(text) && !ownerLooksPiping;
  const boxLike = NON_PIPING_TYPE_RE.test(type) || NON_PIPING_TYPE_RE.test(kind) || BOXISH_PRIMITIVE_RE.test(primitive);
  const torusInNonPipingOwner = ownerLooksNonPiping && (TORUS_RE.test(type) || TORUS_RE.test(kind) || TORUS_RE.test(primitive));
  const nonPipingCandidate = boxLike || ownerLooksNonPiping || torusInNonPipingOwner;
  return {
    diagonal,
    nonPipingCandidate,
    reason: torusInNonPipingOwner ? 'oversized-nonpiping-torus' : ownerLooksNonPiping ? 'oversized-nonpiping-owner' : boxLike ? 'oversized-box-structure' : 'oversized-nonpiping',
  };
}

function summarizeSkipped(skipped) {
  const out = {};
  for (const item of skipped) out[item.reason] = (out[item.reason] || 0) + 1;
  return out;
}

function parseBbox(value) {
  if (Array.isArray(value) && value.length >= 6) {
    const nums = value.slice(0, 6).map(Number);
    return nums.every(Number.isFinite) ? nums : null;
  }
  if (typeof value === 'string') {
    const nums = value.replace(/[\[\]]/g, ' ').split(/[\s,]+/g).filter((entry) => entry.trim() !== '').map(Number).filter(Number.isFinite);
    return nums.length >= 6 ? nums.slice(0, 6) : null;
  }
  return null;
}

function bboxDiagonal(bbox) {
  return Math.hypot(Math.abs(bbox[3] - bbox[0]), Math.abs(bbox[4] - bbox[1]), Math.abs(bbox[5] - bbox[2]));
}

function fallbackDiagonal(instruction = {}) {
  const len = Number(instruction.length);
  const rad = Number(instruction.radius);
  if (Number.isFinite(len) && len > 0) return Math.hypot(len, Math.max(rad || 0, 0) * 2, Math.max(rad || 0, 0) * 2);
  return 0;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function round(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Number(n.toFixed(6)) : 0;
}
