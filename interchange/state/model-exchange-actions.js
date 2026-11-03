import { buildSourcePreview } from '../view/SourcePreviewBuilder.js';
import { buildCanonicalPreview } from '../view/CanonicalPreviewBuilder.js';
import { buildRenderedPreview } from '../view/RenderedPreviewBuilder.js';
import { pickImportAdapter, buildImportResult } from '../source/adapter-registry.js';
import { PcfExportAdapter } from '../export/pcf/PcfExportAdapter.js';
import { PcfxExportAdapter } from '../export/pcfx/PcfxExportAdapter.js';
import { XmlExportAdapter } from '../export/xml/XmlExportAdapter.js';
import { GlbExportAdapter } from '../export/glb/GlbExportAdapter.js';
import { getConversionConfig } from '../config/conversion-config-store.js';
import { emit } from '../../core/event-bus.js';
import { RuntimeEvents } from '../../contracts/runtime-events.js';

const EXPORT_ADAPTERS = Object.freeze({
  PCF: PcfExportAdapter,
  PCFX: PcfxExportAdapter,
  XML: XmlExportAdapter,
  GLB: GlbExportAdapter,
});

export async function importIntoModelExchange(store, { id = '', name = '', text = '', payload = null } = {}) {
  const match = pickImportAdapter({ name, text, payload });
  const adapter = new match.Adapter();
  const rawResult = await adapter.import({ id, name, text, payload });
  const result = buildImportResult({
    sourceRecord: rawResult.sourceRecord,
    parsed: rawResult.parsed,
    project: rawResult.project,
    diagnostics: rawResult.diagnostics || {}
  });

  const configSnapshot = getConversionConfig();
  store.patch({
    sourceRecord: result.sourceRecord,
    parsed: result.parsed,
    project: result.project,
    sourcePreview: buildSourcePreview(result.sourceRecord),
    canonicalPreview: buildCanonicalPreview(result.project),
    renderedPreview: buildRenderedPreview(result.project, store.viewState),
    configSnapshot,
    lastImportResult: {
      name,
      adapter: adapter.constructor.name,
      format: result.sourceRecord?.format || 'UNKNOWN',
      dialect: result.sourceRecord?.dialect || 'UNKNOWN',
    },
    lastExportResult: null,
  });

  emit(RuntimeEvents.MODEL_EXCHANGE_IMPORTED, {
    sourceName: name || result.sourceRecord?.name,
    format: result.sourceRecord?.format,
    dialect: result.sourceRecord?.dialect,
    adapter: adapter.constructor.name,
  });
  return result;
}

export async function importFileIntoModelExchange(store, file) {
  const lower = String(file?.name || '').toLowerCase();
  const payload = lower.endsWith('.glb') ? await file.arrayBuffer() : null;
  const text = payload ? '' : await file.text();
  return importIntoModelExchange(store, { id: file?.name || '', name: file?.name || '', text, payload });
}

export function exportFromModelExchange(store, targetFormat = 'PCFX') {
  if (!store.project) {
    throw new Error('No project loaded for export.');
  }
  const Adapter = EXPORT_ADAPTERS[String(targetFormat || '').toUpperCase()];
  if (!Adapter) {
    throw new Error(`Unsupported export target "${targetFormat}".`);
  }

  const config = getConversionConfig();
  const adapter = new Adapter({ config });
  const result = adapter.export(store.project, { config });
  store.patch({
    lastExportResult: {
      ...result,
      targetFormat: String(targetFormat || '').toUpperCase(),
      adapter: adapter.constructor.name,
    },
    configSnapshot: config,
  });

  emit(RuntimeEvents.MODEL_EXCHANGE_EXPORTED, {
    targetFormat: String(targetFormat || '').toUpperCase(),
    adapter: adapter.constructor.name,
    losses: result.losses?.length || 0,
  });

  return result;
}

export function updateViewState(store, patch) {
  store.setViewState(patch);
  if (store.project) {
    store.patch({
      renderedPreview: buildRenderedPreview(store.project, store.viewState),
    });
  }
}
