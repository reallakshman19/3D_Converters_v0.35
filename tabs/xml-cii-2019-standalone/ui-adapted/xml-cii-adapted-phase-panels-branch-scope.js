import { renderActivePhase as renderBaseActivePhase } from './xml-cii-adapted-phase-panels-smart.js?v=20260804-branch-scope-v1';
import { buildStandaloneOutputRunReadiness } from '../xml-cii-output-run-readiness.js?v=20260804-branch-scope-v1';
import { ensureXmlCiiBranchSelectionInRef } from './xml-cii-adapted-branch-scope-state.js?v=20260804-branch-scope-v1';
import {
  extendXmlCiiBranchScopeReadiness,
  prependXmlCiiBranchScopeBanner,
} from './xml-cii-adapted-branch-scope.js?v=20260804-branch-scope-v1';
import { renderXmlCiiBranchSelectionPanelV2 } from './xml-cii-adapted-branch-scope-panel-v2.js?v=20260804-branch-scope-v1';

function phaseCard(root, phaseId) {
  return root.querySelector?.(`[data-active-phase="${phaseId}"]`) || root;
}

function updateRunManifestDom(card, report) {
  for (const heading of card.querySelectorAll?.('h3') || []) {
    if (String(heading.textContent || '').trim() !== 'Run Manifest') continue;
    const pre = heading.parentElement?.querySelector?.('pre');
    if (pre) pre.textContent = JSON.stringify(report.manifest || {}, null, 2);
  }
}

function extendRunReadiness(card, stateRef) {
  const state = stateRef.current;
  const base = state.outputRunReadinessReport || buildStandaloneOutputRunReadiness(state);
  const report = extendXmlCiiBranchScopeReadiness(base, state);
  stateRef.current = { ...state, outputRunReadinessReport: report };
  updateRunManifestDom(card, report);
}

export function renderActivePhase(root, stateRef, render) {
  ensureXmlCiiBranchSelectionInRef(stateRef);
  renderBaseActivePhase(root, stateRef, render);
  const phaseId = stateRef.current.activePhaseId;
  const card = phaseCard(root, phaseId);
  if (phaseId === 'source' && (stateRef.current.activeSubTabId || 'loader') === 'loader') {
    const workspace = card.querySelector?.('.xml-cii-sub-workspace') || card;
    renderXmlCiiBranchSelectionPanelV2(workspace, stateRef, render);
    return;
  }
  prependXmlCiiBranchScopeBanner(card, stateRef, render);
  if (phaseId === 'run') extendRunReadiness(card, stateRef);
}