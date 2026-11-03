import { deepFreeze, text } from '../../contracts/topo-enriched-xml/contract-core.js';
import { runEnrichment } from './sj-enrichment-engine.js?v=4';
import { runTopoEnrichedXmlProduction } from './production/topo-enriched-xml-production.js';

export async function runEnrichmentWithTopology(input) {
  const mode = text(input?.operatingMode || 'LEGACY').toUpperCase();
  if (mode === 'LEGACY') return runEnrichment(input);
  if (mode === 'SHADOW') return runShadow(input);
  return runTopoEnrichedXmlProduction({
    ...input,
    operatingMode: mode,
    records: structuredClone(Array.isArray(input?.records) ? input.records : []),
    legacyOutput: null,
  });
}

async function runShadow(input) {
  const legacy = runEnrichment(input);
  const topologyProduction = await runTopoEnrichedXmlProduction({
    ...input,
    operatingMode: 'SHADOW',
    records: selectShadowRecords(input?.records, legacy),
    legacyOutput: {
      xmlText: legacy.xmlText,
      trace: [],
      records: structuredClone(legacy.records || []),
      audit: structuredClone(legacy.audit || null),
    },
  });
  return deepFreeze({ ...legacy, topologyProduction });
}

export function selectShadowRecords(inputRecords, legacy = {}) {
  const preferred = [inputRecords, legacy.canonicalRecords, legacy.records]
    .find((rows) => Array.isArray(rows) && rows.length > 0);
  if (preferred) return structuredClone(preferred);
  const empty = [inputRecords, legacy.canonicalRecords, legacy.records]
    .find((rows) => Array.isArray(rows));
  return structuredClone(empty || []);
}
