import { CaesarXmlImportAdapter } from './xml/CaesarXmlImportAdapter.js';
import { NeutralXmlImportAdapter } from './xml/NeutralXmlImportAdapter.js';
import { RevImportAdapter } from './rev/RevImportAdapter.js';
import { PcfImportAdapter } from './pcf/PcfImportAdapter.js';
import { PcfxImportAdapter } from './pcfx/PcfxImportAdapter.js';
import { GenericJsonImportAdapter } from './json/GenericJsonImportAdapter.js';
import { GlbImportAdapter } from './glb/GlbImportAdapter.js';
import { CaesarAccdbImportAdapter } from './accdb/CaesarAccdbImportAdapter.js';
import { CaesarPdfImportAdapter } from './pdf/CaesarPdfImportAdapter.js';

const ADAPTERS = [
  CaesarXmlImportAdapter,
  NeutralXmlImportAdapter,
  RevImportAdapter,
  PcfImportAdapter,
  PcfxImportAdapter,
  GenericJsonImportAdapter,
  GlbImportAdapter,
  CaesarAccdbImportAdapter,
  CaesarPdfImportAdapter,
];

function _scoreAdapter(Adapter, input) {
  if (typeof Adapter.detectConfidence === 'function') {
    const score = Number(Adapter.detectConfidence(input));
    return Number.isFinite(score) ? score : 0;
  }
  if (typeof Adapter.detect === 'function') {
    const probe = input?.text ?? input?.payload ?? '';
    return Adapter.detect(probe) ? 0.7 : 0;
  }
  return 0;
}

export function pickImportAdapter(input) {
  const ranked = ADAPTERS
    .map((Adapter) => ({
      Adapter,
      score: _scoreAdapter(Adapter, input),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    const fileName = String(input?.name || '').trim() || 'unknown file';
    throw new Error(`No import adapter matched for ${fileName}`);
  }
  return ranked[0];
}

export function buildImportResult({ sourceRecord, parsed, project, diagnostics }) {
  return {
    sourceRecord,
    parsed,
    project,
    diagnostics: {
      source: diagnostics?.source || [],
      canonical: diagnostics?.canonical || [],
      fidelity: diagnostics?.fidelity || null,
      losses: diagnostics?.losses || [],
    },
  };
}
