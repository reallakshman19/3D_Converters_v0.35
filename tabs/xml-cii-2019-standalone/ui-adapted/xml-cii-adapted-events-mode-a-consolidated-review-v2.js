import { bindAdaptedWorkflowEvents as bindBaseModeAEvents } from './xml-cii-adapted-events-mode-a-cii-zip.js?v=20260814-save-all-cii-zip-1';
import { modeARawRef } from './xml-cii-adapted-mode-a-propagation.js?v=20260813-mode-a-rigid-review-1';
import { runModeABatchFastFromUi } from './xml-cii-adapted-run-workflow-mode-a-fast.js?v=20260814-fast-run-1';

function styleRunButton(button, primary = false) {
  if (!button?.style) return;
  Object.assign(button.style, {
    marginLeft: primary ? '8px' : '',
    padding: '7px 12px',
    borderRadius: '6px',
    border: primary ? '1px solid #2563eb' : (button.style.border || '1px solid #475569'),
    background: primary ? '#1d4ed8' : (button.style.background || ''),
    color: primary ? '#eff6ff' : (button.style.color || ''),
    cursor: 'pointer',
    fontWeight: primary ? '700' : (button.style.fontWeight || ''),
  });
}

function createProgress(parent) {
  let progress = parent?.querySelector?.('[data-mode-a-fast-run-status]') || null;
  if (progress) return progress;
  progress = document.createElement('span');
  progress.dataset.modeAFastRunStatus = 'true';
  progress.className = 'xml-cii-phase-help';
  Object.assign(progress.style, {
    marginLeft: '10px',
    color: '#bfdbfe',
    fontSize: '11px',
    minWidth: '220px',
  });
  parent?.appendChild?.(progress);
  return progress;
}

export function bindAdaptedWorkflowEvents(container, stateRef, render) {
  const result = bindBaseModeAEvents(container, stateRef, render);
  const rawRef = modeARawRef(stateRef);
  const existing = container.querySelector('[data-action="run"]');
  if (!existing?.parentNode) return result;

  const actions = existing.parentNode;
  const replacement = existing.cloneNode(true);
  replacement.textContent = 'Run Separate Models';
  replacement.title = 'Run every enabled XML as a separate CII model. Multi-file execution uses compact progress instead of rebuilding the full workspace between files.';
  replacement.disabled = !!rawRef.current.batchRunning;
  existing.parentNode.replaceChild(replacement, existing);
  styleRunButton(replacement, false);

  const finalize = document.createElement('button');
  finalize.type = 'button';
  finalize.dataset.modeAAction = 'finalize-run-download-zip';
  finalize.textContent = 'Finalize, Run & Download ZIP';
  finalize.title = 'Run existing preflight and consolidated rigid-weight review, process each enabled XML independently, then download successful CII outputs as one ZIP. Review/readiness gates are not bypassed.';
  finalize.disabled = !!rawRef.current.batchRunning;
  styleRunButton(finalize, true);
  replacement.insertAdjacentElement('afterend', finalize);

  const progress = createProgress(actions);
  const run = (downloadZip) => {
    replacement.disabled = true;
    finalize.disabled = true;
    void runModeABatchFastFromUi(rawRef, render, { downloadZip, progressElement: progress })
      .finally(() => {
        replacement.disabled = false;
        finalize.disabled = false;
      });
  };

  replacement.addEventListener('click', () => run(false));
  finalize.addEventListener('click', () => run(true));
  return result;
}
