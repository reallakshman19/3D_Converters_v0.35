import {
  enrichStandaloneXmlForRun as enrichStandaloneXmlForRunBase,
  loadParentWeightMatchModules,
  standaloneParityOptions,
} from './xml-cii-standalone-run-parity-atta-default.js?v=20260804-mds-position-restraints-1';
import { createStandaloneRunParityEvidence } from './xml-cii-run-parity-evidence.js?v=20260804-mds-position-restraints-1';
import { closeGovernedMdsPositionRestraintsXml } from './xml-cii-mds-restraint-closure.js?v=20260804-mds-position-restraints-1';

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function parseConfig(raw) {
  try {
    const value = JSON.parse(text(raw) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function effectiveConfig(job, extraOptions) {
  return parseConfig(extraOptions?.supportConfigJson || job?.supportConfigJson || '{}');
}

function mergeStats(base, extra) {
  const out = { ...(base || {}) };
  for (const [key, value] of Object.entries(extra || {})) {
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = Number(out[key] || 0) + value;
    else out[key] = value;
  }
  return out;
}

export async function enrichStandaloneXmlForRun(job, extraOptions = {}) {
  const out = await enrichStandaloneXmlForRunBase(job, extraOptions);
  if (!out?.xmlText || out.error || out.applied !== true) return out;

  const closure = closeGovernedMdsPositionRestraintsXml(
    out.xmlText,
    text(job?.stagedJsonText),
    effectiveConfig(job, extraOptions),
  );
  out.diagnostics = [
    ...(Array.isArray(out.diagnostics) ? out.diagnostics : []),
    ...(Array.isArray(closure.diagnostics) ? closure.diagnostics : []),
  ];
  out.stats = mergeStats(out.stats, closure.stats);
  if (!closure.changed) return out;

  out.xmlText = closure.xmlText;
  out.evidence = createStandaloneRunParityEvidence({
    xmlText: out.xmlText,
    expectedEntries: out.expectedEntries,
    branchRows: out.branchRows,
    nodeRows: out.nodeRows,
  });
  out.stats.parityComparisons = out.evidence.comparisons;
  out.stats.parityMismatches = out.evidence.mismatchCount;
  if (!out.evidence.ok) {
    out.error = `MDS position-restraint closure blocked ${out.evidence.mismatchCount} parity mismatch(es).`;
    out.applied = false;
    out.logs = [...(out.logs || []), `${out.error} Engine input was not released.`];
    return out;
  }

  out.logs = [
    ...(out.logs || []),
    `MDS position-restraint closure applied: ${closure.stats.mdsGuideRestraintsAdded || 0} GUI, ${closure.stats.mdsLineStopRestraintsAdded || 0} LIM, and ${closure.stats.mdsRestRestraintsAdded || 0} REST restraint(s) added.`,
    `Standalone run parity reverified after MDS restraint closure: ${out.evidence.status}, input ${out.evidence.engineInputDigest}.`,
  ];
  return out;
}

export { loadParentWeightMatchModules, standaloneParityOptions };
