import { WORKFLOW_MODES } from '../WorkflowAdapterContract.js';
import { prepareXmlCiiMasterContext } from '../../../../converters/xml-cii2019-core/master-context.js';
import { enrichRowsForFinalPcf } from '../../../../rvm-pcf-extract/RvmPcfRowEnricher.js';
import { RvmPcfEmitter } from '../../../../rvm-pcf-extract/RvmPcfEmitter.js';
import { runUxmlTopologyForRvmRows } from '../../../../rvm-pcf-extract/RvmUxmlTopologyBridge.js';

const PHASES = Object.freeze([
  { id: 'regex', label: 'Regex' },
  { id: 'importMasters', label: 'Import Masters' },
  { id: 'preview', label: 'Preview' },
  { id: 'diagnostics', label: 'Topology + Row Diagnostics' },
  { id: 'weightMatch', label: 'Weight Match' },
  { id: 'run', label: 'Run PCF' },
  { id: 'supportTypes', label: 'Support Types' },
  { id: 'config', label: 'Config' },
]);

const PREVIEW_COLUMNS = Object.freeze([
  'pipelineRef',
  'lineNoKey',
  'type',
  'nodeName',
  'resolvedPipingClass',
  'rating',
  'material',
  'wallThicknessMm',
  'corrosionAllowanceMm',
  'dtxr',
  'weight',
  'supportKind',
  'ca',
]);

const FINAL_RUN_ORDER = Object.freeze([
  'Build/receive legacy JSON/RVM PCF rows',
  'Run UXML topology gate',
  'Apply topology handoff to legacy rows',
  'Enrich rows using XML→CII shared master/resolver services',
  'Emit final PCF using RvmPcfEmitter',
]);

function _baseModel(extra = {}) {
  return {
    mode: WORKFLOW_MODES.JSON_RVM_PCF,
    adapterId: WORKFLOW_MODES.JSON_RVM_PCF,
    title: 'JSON/RVM → PCF',
    subtitle: 'Uses the shared XML→CII(2019) master/enrichment workflow UI through adapter models.',
    ...extra,
  };
}

function _rowsFrom(ctx = {}) {
  const source = ctx.source || {};
  if (Array.isArray(source.rows)) return source.rows;
  if (Array.isArray(ctx.rows)) return ctx.rows;
  return [];
}

function _stagedJsonTextFrom(ctx = {}) {
  const source = ctx.source || {};
  return String(
    source.stagedJsonText ??
    source.secondaryText ??
    source.primaryText ??
    ctx.stagedJsonText ??
    ctx.secondaryText ??
    ctx.primaryText ??
    ''
  );
}

function _configFrom(ctx = {}) {
  return ctx.config || ctx.rawConfig || {};
}

function _diagnosticsFrom(ctx = {}) {
  return Array.isArray(ctx.diagnostics) ? ctx.diagnostics : [];
}

function _lineRowsFrom(ctx = {}, masterContext = null) {
  if (Array.isArray(ctx.lineRows)) return ctx.lineRows;
  if (Array.isArray(ctx.source?.lineRows)) return ctx.source.lineRows;
  if (Array.isArray(masterContext?.lineRows)) return masterContext.lineRows;
  return null;
}

async function _buildMasterContext(ctx = {}) {
  if (ctx.masterContext && typeof ctx.masterContext === 'object') {
    return ctx.masterContext;
  }
  return prepareXmlCiiMasterContext({
    rawConfig: _configFrom(ctx),
    diagnostics: _diagnosticsFrom(ctx),
  });
}

async function _enrichRows(ctx = {}, options = {}) {
  const services = ctx.services || {};
  const enrich = services.enrichRowsForFinalPcf || enrichRowsForFinalPcf;
  const masterContext = options.masterContext || await _buildMasterContext(ctx);

  return enrich({
    rows: options.rows || _rowsFrom(ctx),
    topologyHandoff: options.topologyHandoff || null,
    masterContext,
    config: masterContext.config || _configFrom(ctx),
    stagedJsonText: _stagedJsonTextFrom(ctx),
    lineRows: _lineRowsFrom(ctx, masterContext),
    diagnostics: options.diagnostics || _diagnosticsFrom(ctx),
    mode: options.mode || 'run',
    commit: options.commit !== false,
  });
}

function _topologyAccepted(topology) {
  if (topology?.topologyDecision && typeof topology.topologyDecision.exportAllowed === 'boolean') {
    return topology.topologyDecision.exportAllowed === true;
  }
  if (topology?.readinessGate && typeof topology.readinessGate.pass === 'boolean') {
    return topology.readinessGate.pass === true;
  }
  return topology?.ok === true;
}

function _diagnosticKey(diagnostic = {}) {
  return [
    diagnostic.type || '',
    diagnostic.severity || '',
    diagnostic.refNo || '',
    diagnostic.rowNo ?? diagnostic.rowIndex ?? '',
    diagnostic.message || diagnostic.reason || '',
  ].map((part) => String(part)).join('|');
}

function _dedupeDiagnostics(diagnostics = []) {
  const seen = new Set();
  const out = [];
  for (const diagnostic of diagnostics) {
    if (!diagnostic || typeof diagnostic !== 'object') continue;
    const key = _diagnosticKey(diagnostic);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(diagnostic);
  }
  return out;
}

function _topologyDiagnostics(topology) {
  const primary = Array.isArray(topology?.diagnostics) ? topology.diagnostics : [];
  const readiness = Array.isArray(topology?.readinessGate?.diagnostics) ? topology.readinessGate.diagnostics : [];
  return _dedupeDiagnostics(primary.length ? primary : readiness);
}

async function _runTopology(ctx = {}, rows = [], config = {}) {
  const services = ctx.services || {};
  const runTopology = services.runTopologyForRows || services.runTopology || runUxmlTopologyForRvmRows;
  const topologyOptions = {
    ...(config.topology || {}),
    allowPartialExport: config?.topology?.allowPartialExport === true || config?.pcf?.allowPartialPcf === true,
    name: config?.topology?.name || ctx?.source?.name || 'json-rvm-pcf-workflow',
  };
  return runTopology(rows, topologyOptions);
}

function _emitPcf(ctx = {}, rows = [], config = {}) {
  const services = ctx.services || {};
  const emitterOptions = {
    allowPartialPcf: config?.pcf?.allowPartialPcf === true,
  };

  if (typeof services.emitPcf === 'function') {
    return services.emitPcf(rows, emitterOptions, ctx);
  }

  const emitter = typeof services.createEmitter === 'function'
    ? services.createEmitter(emitterOptions)
    : (services.emitter || new RvmPcfEmitter(emitterOptions));

  return emitter.emit(rows);
}

export const jsonRvmPcfWorkflowAdapter = Object.freeze({
  id: WORKFLOW_MODES.JSON_RVM_PCF,
  label: 'JSON/RVM → PCF',

  getPhaseModel() {
    return _baseModel({
      defaultPhase: 'preview',
      phases: PHASES,
      notes: {
        preview: 'Preview is dry-run enrichment only; final PCF export still requires topology acceptance first.',
        run: 'Final run sequence is topology → enrichment → RvmPcfEmitter.',
      },
    });
  },

  async loadSource({ rows = [], stagedJsonText = '', primaryText = '', secondaryText = '' } = {}) {
    return _baseModel({
      ok: true,
      sourceKind: 'RVM_VIEWER_CURRENT_MODEL',
      rows,
      stagedJsonText: stagedJsonText || secondaryText || primaryText || '',
      primaryText,
      secondaryText,
    });
  },

  async buildMasterContext(ctx = {}) {
    const masterContext = await _buildMasterContext(ctx);
    return _baseModel({
      ok: true,
      phase: 'importMasters',
      masterContext,
      config: masterContext.config,
      diagnostics: masterContext.diagnostics || _diagnosticsFrom(ctx),
      lineRows: masterContext.lineRows || [],
      materialMapRows: masterContext.materialMapRows || [],
      pipingClassRows: masterContext.pipingClassRows || [],
      pipingClassIndex: masterContext.pipingClassIndex || null,
      weightMasterRows: masterContext.weightMasterRows || [],
    });
  },

  async buildRegexModel() {
    return _baseModel({
      phase: 'regex',
      description: 'Uses the shared XML→CII regex/line-key rules against pipelineRef, branchName, and lineNoKey from legacy PCF rows.',
    });
  },

  async buildImportMastersModel(ctx = {}) {
    const masterContext = await _buildMasterContext(ctx);
    return _baseModel({
      phase: 'importMasters',
      ok: true,
      description: 'Reuses the existing XML→CII Import Masters UI and master definitions. No JSON/RVM-specific Masters tab is created.',
      masterContext,
      lineRows: masterContext.lineRows || [],
      materialMapRows: masterContext.materialMapRows || [],
      pipingClassRows: masterContext.pipingClassRows || [],
      weightMasterRows: masterContext.weightMasterRows || [],
      diagnostics: masterContext.diagnostics || _diagnosticsFrom(ctx),
    });
  },

  async buildPreviewModel(ctx = {}) {
    const masterContext = await _buildMasterContext(ctx);
    const enrichment = await _enrichRows(ctx, {
      masterContext,
      mode: 'preview',
      commit: false,
      diagnostics: [..._diagnosticsFrom(ctx)],
    });

    return _baseModel({
      phase: 'preview',
      ok: true,
      previewOnly: true,
      commit: false,
      description: 'Dry-run legacy row enrichment preview. It does not emit PCF and does not commit final enrichment before topology acceptance.',
      columns: PREVIEW_COLUMNS,
      rows: enrichment.rows || [],
      diagnostics: enrichment.diagnostics || [],
      masterContext: enrichment.context || masterContext,
    });
  },

  async runDiagnostics(ctx = {}) {
    const preview = await this.buildPreviewModel(ctx);
    return _baseModel({
      phase: 'diagnostics',
      ok: preview.ok,
      description: 'Shows row-enrichment diagnostics for JSON/RVM→PCF mode. Final topology diagnostics are produced by Run PCF.',
      diagnostics: preview.diagnostics || [],
      rows: preview.rows || [],
    });
  },

  async runWeightMatch(ctx = {}) {
    const preview = await this.buildPreviewModel(ctx);
    const candidates = (preview.rows || []).flatMap((row) => (row.weightCandidates || []).map((candidate) => ({
      row,
      candidate,
    })));
    return _baseModel({
      phase: 'weightMatch',
      ok: true,
      description: 'Reuses XML→CII valve/weight ranking against legacy PCF rows.',
      rows: preview.rows || [],
      candidates,
      diagnostics: preview.diagnostics || [],
    });
  },

  async runSupportTypes(ctx = {}) {
    const preview = await this.buildPreviewModel(ctx);
    const rows = (preview.rows || []).filter((row) => String(row.type || '').toUpperCase() === 'SUPPORT' || row.supportKind);
    return _baseModel({
      phase: 'supportTypes',
      ok: true,
      description: 'Reuses support mapping services to populate PCF support row metadata only. CII restraint functions remain outside this route.',
      rows,
      diagnostics: preview.diagnostics || [],
    });
  },

  async buildConfigModel(ctx = {}) {
    const config = _configFrom(ctx);
    return _baseModel({
      phase: 'config',
      options: {
        runTopologyBeforeEnrichment: true,
        rejectFinalPcfIfTopologyFails: true,
        preserveExistingCaValues: true,
        overwriteCaFromEnrichment: config?.pcf?.overwriteCaFromEnrichment === true,
        allowPartialPcf: config?.pcf?.allowPartialPcf === true,
      },
    });
  },

  async runFinal(ctx = {}) {
    const rows = _rowsFrom(ctx);
    const masterContext = await _buildMasterContext(ctx);
    const config = masterContext.config || _configFrom(ctx);
    const topology = await _runTopology(ctx, rows, config);
    const topologyDiagnostics = _topologyDiagnostics(topology);

    if (!_topologyAccepted(topology)) {
      return _baseModel({
        phase: 'run',
        ok: false,
        finalRunOrder: FINAL_RUN_ORDER,
        message: 'Final PCF export rejected because the topology decision gate did not allow export.',
        pcfTextByPipelineRef: {},
        errors: topologyDiagnostics,
        warnings: [],
        diagnostics: topologyDiagnostics,
        topology,
        enrichedRows: [],
      });
    }

    const rowsWithTopology = Array.isArray(topology?.legacyRows) && topology.legacyRows.length
      ? topology.legacyRows
      : rows;

    const enrichment = await _enrichRows(ctx, {
      masterContext,
      rows: rowsWithTopology,
      topologyHandoff: topology?.acceptedTopologyHandoff || null,
      mode: 'run',
      commit: true,
      diagnostics: [..._diagnosticsFrom(ctx)],
    });

    const emitted = await _emitPcf(ctx, enrichment.rows || [], config);
    const errors = Array.isArray(emitted?.errors) ? emitted.errors : [];
    const warnings = Array.isArray(emitted?.warnings) ? emitted.warnings : [];
    const diagnostics = _dedupeDiagnostics([
      ...topologyDiagnostics,
      ...(Array.isArray(enrichment.diagnostics) ? enrichment.diagnostics : []),
      ...warnings,
      ...errors,
    ]);

    return _baseModel({
      phase: 'run',
      ok: emitted?.ok ?? errors.length === 0,
      finalRunOrder: FINAL_RUN_ORDER,
      pcfTextByPipelineRef: emitted?.pcfTextByPipelineRef || {},
      errors,
      warnings,
      diagnostics,
      topology,
      enrichedRows: enrichment.rows || [],
      enrichmentContext: enrichment.context || masterContext,
    });
  },
});