function text(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function tryAutoBuild(details) {
  if (!details?.open) return false;
  const build = details.querySelector('[data-mc-preview-build]');
  if (!build || build.dataset.modeAPreviewAutoBuilt === 'true') return false;
  if (!/^Build Preview$/i.test(text(build.textContent))) return false;
  build.dataset.modeAPreviewAutoBuilt = 'true';
  build.click();
  return true;
}

function disconnectObserver(details) {
  details?.__modeAPreviewToolObserver?.disconnect?.();
  details.__modeAPreviewToolObserver = null;
}

function scheduleAutoBuild(details) {
  if (!details?.open) {
    disconnectObserver(details);
    return;
  }

  // The individual Preview is lazy-rendered. Observe child insertion so the
  // click happens after the native Build Preview listener has been installed.
  if (typeof MutationObserver !== 'undefined' && !details.__modeAPreviewToolObserver) {
    const observer = new MutationObserver(() => {
      if (tryAutoBuild(details)) disconnectObserver(details);
    });
    observer.observe(details, { childList: true, subtree: true });
    details.__modeAPreviewToolObserver = observer;
  }

  setTimeout(() => {
    if (tryAutoBuild(details)) disconnectObserver(details);
  }, 0);
}

export function installModeAIndividualPreviewToolVisibility(workspace) {
  if (!workspace) return false;
  let installed = false;
  for (const details of workspace.querySelectorAll('details[data-mode-a-source-phase]')) {
    const summary = details.querySelector('summary');
    if (!/Preview\s*\/\s*Review/i.test(text(summary?.textContent))) continue;
    if (details.dataset.modeAPreviewToolsBound !== 'true') {
      details.dataset.modeAPreviewToolsBound = 'true';
      details.addEventListener('toggle', () => scheduleAutoBuild(details));
      installed = true;
    }
    if (details.open) scheduleAutoBuild(details);
  }
  return installed;
}
