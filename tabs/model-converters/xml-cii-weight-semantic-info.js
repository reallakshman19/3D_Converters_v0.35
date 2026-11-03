const FLAG = '__xmlCiiWeightSemanticInfo_v1';

const INFO_HTML = '<div data-xml-cii-weight-semantic-info class="model-converters-workflow-detail-note" style="margin:8px 0;border-color:#406089;color:#d8ecff;background:#102033;">ⓘ <strong>Weight keyword tie-break:</strong> primary candidate gate is Bore + Rating + Length ±6 mm. If several primary candidates remain, DTXR keywords are used first. If DTXR has no keyword, Endpoint 2 Valve Hint is used. Configurable order: Full bore, Reduced bore, Ball, Gate, Globe, Swing, Non-slam, Wafer+Butterfly, Butterfly, Check.</div>';

function ready() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function inject(root = document) {
  const panel = root.querySelector?.('#mc-wm-hint-panel') || document.querySelector('#mc-wm-hint-panel');
  if (!panel || panel.querySelector('[data-xml-cii-weight-semantic-info]')) return;
  panel.insertAdjacentHTML('beforeend', INFO_HTML);
}

export function installXmlCiiWeightSemanticInfo(root = document) {
  if (!ready()) return;
  const scope = root?.querySelector?.('.model-converters-root') || root || document;
  if (scope[FLAG]) return;
  scope[FLAG] = true;
  inject(scope);
  scope.addEventListener?.('click', () => queueMicrotask(() => inject(scope)), true);
}
