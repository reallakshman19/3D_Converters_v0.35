import { installModeAConsolidatedPreviewEasyUi } from './xml-cii-adapted-mode-a-consolidated-easy-ui.js?v=20260814-preview-tools-1';
import { installModeASmartMapUiV2 } from './xml-cii-adapted-mode-a-smart-map-ui-v2.js?v=20260814-smart-map-service-class-1';
import { installModeASmartMapSelectAll } from './xml-cii-adapted-mode-a-smart-map-select-all.js?v=20260814-preview-restore-1';
import { installModeAProcessFromUi } from './xml-cii-adapted-mode-a-process-from-ui.js?v=20260814-process-from-1';
import { repairModeAExactMappedProcessAuthority } from './xml-cii-adapted-mode-a-process-authority.js?v=20260814-preview-restore-1';
import { installModeAConsolidatedDtxrTools } from './xml-cii-adapted-mode-a-consolidated-dtxr.js?v=20260814-preview-restore-1';
import { installModeAIndividualPreviewToolVisibility } from './xml-cii-adapted-mode-a-individual-preview-tools.js?v=20260814-preview-restore-1';
import { modeARawState } from './xml-cii-adapted-mode-a-propagation.js?v=20260813-mode-a-easy-bulk-1';

function scheduleRebuild(build) {
  if (!build || build.dataset.modeAProcessAuthorityRebuild === 'true') return;
  build.dataset.modeAProcessAuthorityRebuild = 'true';
  const run = () => build.click();
  if (typeof queueMicrotask === 'function') queueMicrotask(run);
  else setTimeout(run, 0);
}

export function installModeAConsolidatedPreviewEasyUiFromWorkspace(workspace, stateRef) {
  const state = modeARawState(stateRef);
  if (state.activePhaseId !== 'preview') return false;

  // Individual Mode A Preview remains source-specific. Auto-building only when
  // the engineer explicitly expands it restores the native DTXR Wall, DTXR
  // Rating and B31.3 actions without changing the single-source Preview policy.
  installModeAIndividualPreviewToolVisibility(workspace);

  const result = state.modeAConsolidatedPreviewResult;
  if (!result) return false;
  const panels = [...(workspace?.querySelectorAll?.('.xml-cii-mode-a-consolidated') || [])];
  const panel = panels.find((node) => /Consolidated Preview/i.test(node.querySelector?.('h3')?.textContent || ''));
  if (!panel) return false;
  const body = panel.querySelector('table.xml-cii-audit-table tbody');
  if (body) body.dataset.modeAPreviewConsolidatedBody = 'true';
  const build = [...panel.querySelectorAll('button')].find((button) => /Consolidated Preview/i.test(button.textContent || ''));
  if (build) build.dataset.modeAConsolidatedBuild = 'preview';

  // Service-based process fallback is suggestion/review authority only. Once a
  // branch has an explicit/exact Line Key mapping, remove stale fallback-owned
  // process values so the mapped Line List row becomes authoritative again.
  const repair = repairModeAExactMappedProcessAuthority(stateRef, result.rows || []);

  const installed = installModeAConsolidatedPreviewEasyUi(panel, result, stateRef);
  installModeASmartMapUiV2(panel, result, stateRef);
  installModeASmartMapSelectAll(panel);
  installModeAProcessFromUi(panel, result, stateRef);
  installModeAConsolidatedDtxrTools(panel, stateRef);

  if (repair.changed) scheduleRebuild(build);
  return installed;
}
