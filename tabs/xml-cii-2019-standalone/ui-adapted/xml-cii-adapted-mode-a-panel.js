import * as core from './xml-cii-adapted-mode-a-panel-core.js?v=20260813-mode-a-full-propagation-2';
import { buildModeAPreflight, normalizeModeABatchState } from '../xml-cii-mode-a-batch.js?v=20260813-mode-a-full-propagation-2';
import {
  renderModeABatchBranchSelector,
  replaceModeAActiveHierarchyWithBatch,
} from './xml-cii-adapted-mode-a-batch-scope-panel.js?v=20260813-mode-a-full-propagation-2';

export * from './xml-cii-adapted-mode-a-panel-core.js?v=20260813-mode-a-full-propagation-2';

function cleanInventoryPanel(panel, state) {
  if (!panel) return;
  const table = panel.querySelector?.('table');
  if (table) {
    const headers = [...(table.querySelectorAll?.('thead th') || [])];
    const index = headers.findIndex((th) => String(th.textContent || '').trim() === 'Conflicts');
    if (index >= 0) {
      headers[index].style.display = 'none';
      for (const row of table.querySelectorAll?.('tbody tr') || []) {
        if (row.children?.[index]) row.children[index].style.display = 'none';
      }
    }
  }
  const preflight = buildModeAPreflight(state.sourceBatch || {});
  for (const note of panel.querySelectorAll?.('.model-converters-workflow-detail-note') || []) {
    if (!String(note.textContent || '').includes('files enabled')) continue;
    note.textContent = `${preflight.enabledSourceCount}/${preflight.sourceCount} files enabled · ${preflight.branchCount} branch occurrences · ${preflight.nodeCount} XML nodes · duplicate validation disabled in Mode A.`;
    break;
  }
}

export function renderModeASourceInventory(parent, stateRef, render) {
  core.renderModeASourceInventory(parent, stateRef);
  const state = normalizeModeABatchState(stateRef.current);
  const panels = parent.querySelectorAll?.('[data-mode-a-panel="source-inventory"]') || [];
  cleanInventoryPanel(panels[panels.length - 1] || null, state);
  replaceModeAActiveHierarchyWithBatch(parent, state);

  const refreshBatchSelector = typeof render === 'function' ? render : () => {
    parent.querySelector?.('.xml-cii-mode-a-batch-scope-panel')?.remove?.();
    renderModeABatchBranchSelector(parent, stateRef, refreshBatchSelector);
  };
  renderModeABatchBranchSelector(parent, stateRef, refreshBatchSelector);
}
