import { bindAdaptedWorkflowEvents as bindBaseModeAEvents } from './xml-cii-adapted-events-mode-a.js?v=20260813-mode-a-rigid-review-1';
import { modeARawRef } from './xml-cii-adapted-mode-a-propagation.js?v=20260813-mode-a-rigid-review-1';
import {
  collectModeASuccessfulCiiFiles,
  downloadModeACiiZip,
} from './xml-cii-adapted-mode-a-cii-zip.js?v=20260814-save-all-cii-zip-1';

function installSaveAllCiiZip(container, stateRef) {
  const panel = container.querySelector?.('[data-mode-a-panel="batch-results"]');
  if (!panel || panel.querySelector?.('[data-mode-a-action="download-all-cii-zip"]')) return;

  const batchResult = stateRef.current?.batchRunResult;
  const files = collectModeASuccessfulCiiFiles(batchResult);
  if (!files.length) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.modeAAction = 'download-all-cii-zip';
  button.textContent = `Save All CII Files (.zip) · ${files.length}`;
  button.title = `Download ${files.length} successful independent CII model${files.length === 1 ? '' : 's'} as one ZIP. Failed, blocked, and cancelled models are excluded.`;
  Object.assign(button.style, {
    marginLeft: '8px',
    padding: '6px 10px',
    borderRadius: '5px',
    border: '1px solid #2563eb',
    background: '#1d4ed8',
    color: '#eff6ff',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: '700',
  });

  button.addEventListener('click', () => {
    const currentFiles = collectModeASuccessfulCiiFiles(stateRef.current?.batchRunResult);
    if (!currentFiles.length) return;
    downloadModeACiiZip(stateRef.current.batchRunResult);
  });

  const manifest = panel.querySelector?.('[data-mode-a-action="download-batch-manifest"]');
  if (manifest?.parentNode) manifest.insertAdjacentElement('afterend', button);
  else panel.prepend(button);

  const note = document.createElement('div');
  note.dataset.modeACiiZipNote = 'true';
  note.className = 'xml-cii-phase-help';
  note.textContent = `ZIP contains ${files.length} successful CII output${files.length === 1 ? '' : 's'} only; each XML remains an independent CII model.`;
  Object.assign(note.style, { marginTop: '6px', color: '#93c5fd' });
  button.insertAdjacentElement('afterend', note);
}

export function bindAdaptedWorkflowEvents(container, stateRef, render) {
  const result = bindBaseModeAEvents(container, stateRef, render);
  installSaveAllCiiZip(container, modeARawRef(stateRef));
  return result;
}
