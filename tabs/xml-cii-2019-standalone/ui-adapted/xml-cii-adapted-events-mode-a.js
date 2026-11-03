import { bindAdaptedWorkflowEvents as bindSmartWorkflowEvents } from './xml-cii-adapted-events-smart.js?v=20260813-mode-a-full-propagation-2';
import { downloadTextFile } from './xml-cii-adapted-dom.js?v=20260813-mode-a-full-propagation-2';
import { activateModeASource, normalizeModeABatchState } from '../xml-cii-mode-a-batch.js?v=20260813-mode-a-full-propagation-2';
import {
  clearModeASourceCaches,
  importModeASources,
  removeModeASource,
  replaceModeAState,
  updateModeASource,
} from './xml-cii-adapted-mode-a-state.js?v=20260813-mode-a-full-propagation-2';
import { modeABatchArtifactValue } from './xml-cii-adapted-mode-a-panel.js?v=20260813-mode-a-full-propagation-2';
import { runModeABatchFromUi } from './xml-cii-adapted-run-workflow-mode-a.js?v=20260813-mode-a-full-propagation-2';
import { detectXmlCiiWorkflowSourceKind } from '../xml-cii-workflow-source-detect.js?v=20260813-mode-a-full-propagation-2';
import {
  buildModeADiagnosticsAggregate,
  createModeABatchSharedRef,
  createModeARegexProcessingRef,
  modeARawRef,
  modeARawState,
  runModeARegexBatch,
  runModeAResolverBatch,
} from './xml-cii-adapted-mode-a-propagation.js?v=20260813-mode-a-full-propagation-2';

async function sourceRows(files, state) {
  const rows = [];
  const rejected = [];
  const sharedSupportConfigJson = state.sourceBatch?.sharedSupportConfigJson || state.supportConfigJson;
  for (const file of files) {
    try {
      const sourceText = await file.text();
      if (!String(sourceText || '').trim()) {
        rejected.push(`${file.name} is empty; no XML text was read (${Number(file.size || 0)} bytes reported by browser).`);
        continue;
      }
      const kind = detectXmlCiiWorkflowSourceKind(sourceText, 'xml');
      if (kind !== 'xml') {
        rejected.push(`${file.name} is ${kind}; Mode A multi-file import accepts PSI116 XML only.`);
        continue;
      }
      rows.push({
        sourceFile: file,
        fileName: file.name,
        sourceText,
        supportConfigJson: sharedSupportConfigJson,
      });
    } catch (error) {
      rejected.push(`${file.name}: ${error?.message || error}`);
    }
  }
  return { rows, rejected };
}

function installMultipleSourceCapture(container, stateRef, render) {
  container.querySelectorAll('[data-field="source-file"]').forEach((input) => {
    if (input.__xmlCiiModeABound) return;
    input.__xmlCiiModeABound = true;
    input.addEventListener('change', async (event) => {
      event.stopImmediatePropagation();
      const files = [...(event.target.files || [])];
      if (!files.length) return;
      const { rows, rejected } = await sourceRows(files, stateRef.current);
      const imported = importModeASources(stateRef.current, rows);
      const batch = imported.state.sourceBatch || {};
      clearModeASourceCaches();
      replaceModeAState(stateRef, {
        ...imported.state,
        sourceKind: 'xml',
        sourceBatch: {
          ...batch,
          importStatus: [batch.importStatus, ...rejected].filter(Boolean).join(' | '),
        },
      });
      render();
    }, true);
  });
}

function clearSourceWorkflowAfterStagedChange(workflow = {}) {
  return {
    ...workflow,
    resolverJsonTraceResult: null,
    resolverJsonTraceJsonResult: null,
    previewDiagnosticsAuditReport: null,
    weightMatchResult: null,
    outputRunReadinessReport: null,
    result: null,
  };
}

function bindBatchStagedJsonCapture(container, stateRef, render) {
  container.querySelectorAll('[data-mode-a-staged-json-all]').forEach((input) => {
    if (input.__xmlCiiModeAStagedBound) return;
    input.__xmlCiiModeAStagedBound = true;
    input.addEventListener('change', async (event) => {
      event.stopImmediatePropagation();
      const file = event.target.files?.[0] || null;
      if (!file) return;
      let stagedJsonText = '';
      try { stagedJsonText = await file.text(); } catch { stagedJsonText = ''; }
      if (!String(stagedJsonText || '').trim()) return;

      const rawRef = modeARawRef(stateRef);
      const current = modeARawState(rawRef);
      const sources = (current.sourceBatch?.sources || []).map((source) => source.enabled === false ? source : {
        ...source,
        stagedJsonFile: file,
        stagedJsonText,
        workflow: clearSourceWorkflowAfterStagedChange(source.workflow),
      });
      const active = sources.find((source) => source.sourceId === current.sourceBatch?.activeSourceId) || sources[0] || null;
      clearModeASourceCaches();
      replaceModeAState(rawRef, {
        ...current,
        stagedJsonFile: active?.stagedJsonFile || null,
        stagedJsonText: active?.stagedJsonText || '',
        resolverJsonTraceResult: null,
        resolverJsonTraceJsonResult: null,
        previewDiagnosticsAuditReport: null,
        weightMatchResult: null,
        outputRunReadinessReport: null,
        result: null,
        batchRunResult: null,
        sourceBatch: {
          ...current.sourceBatch,
          sources,
          stagedJsonStatus: `${file.name} applied to ${(sources || []).filter((source) => source.enabled !== false).length} enabled XML sources.`,
        },
      });
      render();
    }, true);
  });
}

function bindInventoryActions(container, stateRef, render) {
  container.querySelectorAll('[data-mode-a-action="activate"]').forEach((control) => {
    control.addEventListener('click', () => {
      clearModeASourceCaches();
      replaceModeAState(stateRef, activateModeASource(stateRef.current, control.dataset.modeASourceId));
      render();
    });
  });
  container.querySelectorAll('[data-mode-a-enable]').forEach((control) => {
    control.addEventListener('change', () => {
      replaceModeAState(stateRef, updateModeASource(stateRef.current, control.dataset.modeAEnable, { enabled: control.checked }));
      render();
    });
  });
  container.querySelectorAll('[data-mode-a-action="remove"]').forEach((control) => {
    control.addEventListener('click', () => {
      clearModeASourceCaches();
      replaceModeAState(stateRef, removeModeASource(stateRef.current, control.dataset.modeASourceId));
      render();
    });
  });
}

function captureAction(container, action, handler) {
  container.querySelectorAll(`[data-action="${action}"]`).forEach((control) => {
    if (control.__xmlCiiModeABatchAction) return;
    control.__xmlCiiModeABatchAction = true;
    control.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      handler();
    }, true);
  });
}

function installBatchActionCapture(container, stateRef, render) {
  captureAction(container, 'test-regex', () => {
    runModeARegexBatch(stateRef, { save: false });
    render();
  });
  captureAction(container, 'save-regex-config', () => {
    runModeARegexBatch(stateRef, { save: true });
    render();
  });
  captureAction(container, 'build-resolver-index', () => {
    runModeAResolverBatch(stateRef, { save: false });
    render();
  });
  captureAction(container, 'save-resolver-json-config', () => {
    runModeAResolverBatch(stateRef, { save: true });
    render();
  });
  captureAction(container, 'build-preview-audit', () => {
    const rawRef = modeARawRef(stateRef);
    const current = modeARawState(rawRef);
    const report = buildModeADiagnosticsAggregate(current);
    replaceModeAState(rawRef, {
      ...current,
      previewDiagnosticsAuditReport: report,
      previewDiagnosticsAuditStatus: `Batch diagnostics built across ${(current.sourceBatch?.sources || []).filter((source) => source.enabled !== false).length} XML files: ${report.summary?.matchedFacts || 0} matched, ${report.summary?.rejectedFacts || 0} rejected.`,
    });
    render();
  });
}

function eventRefForPhase(stateRef) {
  const phaseId = modeARawState(stateRef).activePhaseId;
  if (phaseId === 'regex') return createModeARegexProcessingRef(stateRef);
  if (['json-trace', 'diagnostics', 'support-mapper', 'config', 'run'].includes(phaseId)) {
    return createModeABatchSharedRef(stateRef, phaseId);
  }
  return stateRef;
}

function replaceRunHandler(container, stateRef, render) {
  const existing = container.querySelector('[data-action="run"]');
  if (!existing?.parentNode) return;
  const replacement = existing.cloneNode(true);
  replacement.textContent = 'Run Separate Models';
  replacement.disabled = !!stateRef.current.batchRunning;
  existing.parentNode.replaceChild(replacement, existing);
  replacement.addEventListener('click', () => runModeABatchFromUi(stateRef, render));
}

function bindDownloads(container, stateRef) {
  container.querySelector('[data-mode-a-action="download-batch-manifest"]')?.addEventListener('click', () => {
    const manifest = stateRef.current.batchRunResult?.manifest;
    if (!manifest) return;
    downloadTextFile('xml-cii-mode-a-batch-manifest.json', JSON.stringify(manifest, null, 2), 'application/json;charset=utf-8');
  });
  container.querySelectorAll('[data-mode-a-action="download-batch-artifact"]').forEach((control) => {
    control.addEventListener('click', () => {
      const artifact = modeABatchArtifactValue(
        stateRef.current.batchRunResult,
        control.dataset.modeASourceId,
        control.dataset.modeAArtifact,
      );
      if (!artifact?.text) return;
      downloadTextFile(artifact.name, artifact.text, artifact.mime);
    });
  });
}

export function bindAdaptedWorkflowEvents(container, stateRef, render) {
  const rawRef = modeARawRef(stateRef);
  installMultipleSourceCapture(container, rawRef, render);
  bindBatchStagedJsonCapture(container, rawRef, render);
  installBatchActionCapture(container, rawRef, render);

  const eventRef = eventRefForPhase(stateRef);
  const result = bindSmartWorkflowEvents(container, eventRef, render);

  bindInventoryActions(container, rawRef, render);
  replaceRunHandler(container, rawRef, render);
  bindDownloads(container, rawRef);
  return result;
}

export function modeASourceCount(state = {}) {
  return normalizeModeABatchState(state).sourceBatch?.sources?.length || 0;
}
