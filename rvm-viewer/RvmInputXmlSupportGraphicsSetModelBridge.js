import { RvmViewer3D } from './RvmViewer3D.js?v=20260518-statusbar-theme-12';
import { applyInputXmlSupportGraphicsOverlay } from './RvmInputXmlSupportGraphics.js?v=20260619-source-bend-collapse-1';
import { refreshInputXmlGraphics } from './RvmInputXmlAutoBendGraphics.js?v=20260619-source-bend-collapse-1';

const INPUTXML_SUPPORT_SYMBOLS_KEY = 'rvm.inputxml.supportSymbols';

function readSupportSymbolsEnabled() {
  const root = document.querySelector('[data-rvm-viewer]');
  const checkbox = root?.querySelector?.('#rvm-inputxml-support-symbols');
  if (checkbox) return checkbox.checked === true;
  try { return localStorage.getItem(INPUTXML_SUPPORT_SYMBOLS_KEY) === 'on'; } catch { return false; }
}

function optionsFromUi() {
  const apiOptions = window.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__?.optionsFromUi?.();
  if (apiOptions) return apiOptions;
  const root = document.querySelector('[data-rvm-viewer]');
  const scale = Number(root?.querySelector?.('#rvm-inputxml-support-scale, #rvm-support-scale')?.value);
  const labels = root?.querySelector?.('#rvm-inputxml-support-labels, #rvm-support-labels');
  const autoBend = root?.querySelector?.('#rvm-inputxml-auto-bend')?.checked;
  return {
    scaleMultiplier: Number.isFinite(scale) ? Math.max(0.25, Math.min(1.5, scale)) : 0.75,
    labelsVisible: labels?.checked === true || labels?.getAttribute?.('aria-pressed') === 'true',
    autoBendEnabled: autoBend !== false,
    supportSymbolsEnabled: readSupportSymbolsEnabled(),
  };
}

function refresh(viewer) {
  const api = window.__PCF_GLB_RVM_INPUTXML_SOURCE_TOOLS__;
  if (api?.refresh) {
    api.refresh(viewer);
    return;
  }
  const options = optionsFromUi();
  refreshInputXmlGraphics(viewer, options);
  applyInputXmlSupportGraphicsOverlay(viewer, options);
}

if (!RvmViewer3D.prototype.__inputXmlGraphicsSetModelBridgeV11) {
  const setModelOriginal = RvmViewer3D.prototype.setModel;
  RvmViewer3D.prototype.setModel = function setModelWithInputXmlGraphics(...args) {
    const result = setModelOriginal.apply(this, args);
    window.__rvmInputXmlSupportGraphicsViewer = this;
    setTimeout(() => refresh(this), 0);
    setTimeout(() => refresh(this), 100);
    return result;
  };
  RvmViewer3D.prototype.__inputXmlGraphicsSetModelBridgeV11 = true;
}
