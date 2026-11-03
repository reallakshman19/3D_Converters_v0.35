import * as THREE from 'three';
import {
  classifySmartCivilFacetObject,
  smartCivilPolicyUserData,
} from './BrowserRvmSmartCivilFacetPolicy.js';

const INSTALL_FLAG = Symbol.for('pcf-glb-rvm-civil-fallback-policy-v3');
const VERSION = '20260622-rvm-smart-civil-code11-default-off-2';
const GLOBAL_KEY = '__PCF_GLB_RVM_CIVIL_FALLBACK_POLICY__';
const DIAG_KEY = '__PCF_GLB_RVM_CIVIL_FALLBACK_POLICY_DIAGNOSTICS__';
const LARGE_MAX_DIM = 700;
const LARGE_DIAGONAL = 1400;

const POLICY_INFO = Object.freeze({
  primitiveCodes: Object.freeze([
    'RVM PRIM code 10: Line/GENSEC/reference-line primitives; grid-like lines default hidden diagnostic, otherwise wire line.',
    'RVM PRIM code 11: Facet group/polygon mesh primitives; civil-style large panels/foundations/grids default hidden or wireframe proxy.',
  ]),
  triggerTerms: Object.freeze({
    GRID: ['GRID', 'GRIDS', 'GRDLN', 'GRIDLINE', 'GRATING', 'GRATE', 'DATUM', 'AXIS', 'REFERENCE', 'SETTINGOUT'],
    FOUNDATION: ['FDNS', 'FDN', 'FOUND', 'FOUNDATION', 'FOOTING', 'PILE', 'PILECAP', 'SLAB', 'BASESLAB', 'PEDESTAL', 'PLINTH', 'ANCHORBLOCK', 'CONCRETE', 'RCC', 'PCC'],
    EARTHWORK: ['PAVE', 'PAVEMENT', 'ROAD', 'CURB', 'KERB', 'GRAD', 'GRADE', 'DRAIN', 'TRENCH', 'PIT', 'PITS', 'DUCTBANK', 'CULVERT', 'CHANNEL', 'SUMP', 'BUND'],
    PANEL_FRAME: ['PANEL', 'FRAMEWORK', 'FRMWORK', 'SBFRAMEWORK', 'WALL', 'FLOOR', 'DECK', 'ROOF', 'PLATE', 'SHEET', 'CLADDING', 'FENCE', 'BARRIER'],
    STRUCTURE: ['STRUCTURE', 'STRUCTURAL', 'CIVIL', 'BUILDING', 'ARCH', 'ARCHITECTURAL'],
  }),
  protectionTerms: Object.freeze(['PIPE', 'PIPING', 'ELBOW', 'BEND', 'TEE', 'OLET', 'BRANCH', 'FLANGE', 'VALVE', 'NOZZLE', 'GASKET', 'REDUCER', 'CAP', 'COUPLING', 'INSTRUMENT', 'PUMP', 'VESSEL', 'DRUM', 'TANK', 'EXCHANGER', 'EQUIPMENT', 'SUPPORT', 'HANGER', 'SPRING', 'GUIDE', 'STOP', 'ANCHOR', 'SHOE']),
  geometryTriggers: Object.freeze([
    `large bbox if max dimension >= ${LARGE_MAX_DIM} or diagonal >= ${LARGE_DIAGONAL}`,
    'smart code-11 classifier also checks huge/planar/thin/broad/complex/hole-risk facet groups',
  ]),
});

const TOOLTIP_TEXT = policyTooltipText(POLICY_INFO);

export function installBrowserRvmCivilFallbackPolicyBridge() {
  if (globalThis[INSTALL_FLAG]) return globalThis[INSTALL_FLAG];
  const state = {
    version: VERSION,
    runs: 0,
    lastDiagnostics: null,
    policyInfo: POLICY_INFO,
    tooltip: TOOLTIP_TEXT,
    runNow: () => runPolicy(state),
  };
  globalThis[INSTALL_FLAG] = state;
  globalThis[GLOBAL_KEY] = state;
  const schedule = () => setTimeout(() => runPolicy(state), 0);
  for (const event of ['rvm-model-loaded', 'rvm-render-policy-diagnostics', 'rvm-browser-parse-diagnostics', 'rvm-native-facet-diagnostics']) {
    try { globalThis.addEventListener?.(event, schedule); } catch (_) {}
  }
  for (const delay of [300, 900, 1800, 3600, 7200]) setTimeout(schedule, delay);
  installCivilPolicyInfoUi();
  return state;
}

export function runBrowserRvmCivilFallbackPolicy(modelGroup = globalThis.__3D_RVM_VIEWER__?.modelGroup) {
  const diagnostics = baseDiagnostics();
  if (!modelGroup?.traverse) return { ...diagnostics, reason: 'model-not-ready' };
  modelGroup.traverse((obj) => {
    if (!(obj?.isMesh || obj?.isLine || obj?.isLineSegments || obj?.isGroup)) return;
    diagnostics.scannedCount += 1;
    const policy = classifyCivilFallback(obj);
    if (!policy) return;
    diagnostics.policyCount += 1;
    diagnostics.byKind[policy.kind] = (diagnostics.byKind[policy.kind] || 0) + 1;
    obj.userData = { ...(obj.userData || {}), ...policy.userData, browserRvmCivilFallbackPolicyVersion: VERSION };
    if (policy.action === 'hide') {
      obj.visible = false;
      diagnostics.hiddenCount += 1;
    } else if (policy.action === 'wireframe') {
      applyWireframe(obj, policy.opacity);
      diagnostics.wireframeCount += 1;
    }
  });
  return diagnostics;
}

function runPolicy(state) {
  const diagnostics = runBrowserRvmCivilFallbackPolicy();
  state.runs += 1;
  state.lastDiagnostics = diagnostics;
  globalThis[DIAG_KEY] = diagnostics;
  try { globalThis.dispatchEvent?.(new CustomEvent('rvm-civil-fallback-policy-diagnostics', { detail: diagnostics })); } catch (_) {}
  return diagnostics;
}

function classifyCivilFallback(obj) {
  const smart = classifySmartCivilFacetObject(obj);
  if (smart?.deferNativeTessellation) {
    const smartData = smartCivilPolicyUserData(smart);
    return {
      kind: smart.kind,
      action: smart.action === 'hidden' ? 'hide' : 'wireframe',
      opacity: smart.action === 'hidden' ? 0 : 0.10,
      userData: {
        ...smartData,
        geometryPolicy: smart.policy,
        materialPolicy: 'smart-civil-code11-default-off-runtime',
        rvmCivilFallbackKind: smart.kind,
        browserRvmCivilFallbackTooltip: TOOLTIP_TEXT,
      },
    };
  }

  const data = obj.userData || {};
  const text = sourceText(obj, data);
  const kind = genericCivilKind(text);
  if (!kind) return null;
  if (!isLargeEnvelope(obj)) return null;

  const primitive = String(data.effectiveRenderPrimitive || data.effectivePrimitive || data.renderPrimitive || data.renderKind || '').toUpperCase();
  const fallbackLike = /BBOX|BOX|PLACEHOLDER|GENERIC|UNKNOWN|STRUCTURE/.test(primitive) || data.browserRvmBboxPlaceholderWireframe || data.bboxPromotedSolidBlocked;
  if (!fallbackLike) return null;

  if (kind === 'GRID') return policy('GRID', 'hide', 'grid-or-reference-container-hidden-diagnostic', 0.08);
  if (kind === 'FOUNDATION') return policy('FOUNDATION', 'wireframe', 'foundation-or-concrete-container-wireframe-not-solid', 0.12);
  if (kind === 'PANEL_FRAME') return policy('PANEL_FRAME', 'wireframe', 'large-panel-frame-container-wireframe-diagnostic-not-solid-box', 0.10);
  return policy(kind, 'wireframe', `${kind.toLowerCase()}-civil-container-wireframe-diagnostic`, 0.14);
}

function policy(kind, action, reason, opacity = 0.18) {
  return {
    kind,
    action,
    opacity,
    userData: {
      pickable: false,
      selectable: false,
      nonSelectableReason: reason,
      fallbackReason: reason,
      geometryPolicy: action === 'hide' ? 'civil-container-hidden-diagnostic' : 'civil-container-wireframe-diagnostic',
      materialPolicy: 'civil-fallback-diagnostic',
      rvmCivilFallbackKind: kind,
      browserRvmCivilFallbackTooltip: TOOLTIP_TEXT,
    },
  };
}

function sourceText(obj, data) {
  const attrs = data.browserRvmAttributes || data.attributes || {};
  const props = data.browserRvmProperties || {};
  return [
    obj.name,
    data.displayName,
    data.sourceName,
    data.sourcePath,
    data.reviewName,
    props.sourcePath,
    props.SourcePath,
    props.displayName,
    attrs.RVM_OWNER_PATH,
    attrs.RVM_OWNER_NAME,
    attrs.NAME,
    attrs.TYPE,
    attrs.RVM_PRIMITIVE_KIND,
  ].filter(Boolean).join('/').toUpperCase();
}

function genericCivilKind(text) {
  if (/\b(GRID|GRIDS|GRDLN|GRIDLINE|GRATING|GRATE|DATUM|AXIS|REFERENCE|SETTINGOUT)\b/.test(text)) return 'GRID';
  if (/\b(FDNS|FDN|FOUND|FOUNDATION|FOOTING|PILE|PILECAP|SLAB|BASESLAB|PEDESTAL|PLINTH|ANCHORBLOCK|CONCRETE|RCC|PCC)\b/.test(text)) return 'FOUNDATION';
  if (/\b(PAVE|PAVEMENT|ROAD|CURB|KERB|GRAD|GRADE|DRAIN|TRENCH|PIT|PITS|DUCTBANK|CULVERT|CHANNEL|SUMP|BUND)\b/.test(text)) return 'EARTHWORK';
  if (/\b(PANEL|FRAMEWORK|FRMWORK|SBFRAMEWORK|WALL|FLOOR|DECK|ROOF|PLATE|SHEET|CLADDING|FENCE|BARRIER)\b/.test(text)) return 'PANEL_FRAME';
  if (/\b(STRUCTURE|STRUCTURAL|CIVIL|BUILDING|ARCH|ARCHITECTURAL)\b/.test(text)) return 'STRUCTURE';
  return '';
}

function isLargeEnvelope(obj) {
  let box = null;
  try { box = new THREE.Box3().setFromObject(obj); } catch (_) { return false; }
  if (!box || box.isEmpty()) return false;
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(Math.abs(size.x), Math.abs(size.y), Math.abs(size.z));
  const diagonal = Math.hypot(size.x, size.y, size.z);
  return maxDim >= LARGE_MAX_DIM || diagonal >= LARGE_DIAGONAL;
}

function applyWireframe(obj, opacity = 0.18) {
  obj.traverse?.((child) => {
    if (!child?.material || !child.isMesh) return;
    const mats = Array.isArray(child.material) ? child.material : [child.material];
    const next = mats.map((mat) => {
      const cloned = mat?.clone ? mat.clone() : new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
      cloned.wireframe = true;
      cloned.transparent = true;
      cloned.opacity = opacity;
      cloned.depthWrite = false;
      return cloned;
    });
    child.material = Array.isArray(child.material) ? next : next[0];
  });
}

function baseDiagnostics() {
  return {
    version: VERSION,
    capturedAt: new Date().toISOString(),
    scannedCount: 0,
    policyCount: 0,
    hiddenCount: 0,
    wireframeCount: 0,
    byKind: {},
    policyInfo: {
      primitiveCodes: POLICY_INFO.primitiveCodes,
      triggerKinds: Object.keys(POLICY_INFO.triggerTerms || {}),
      protectionTermCount: POLICY_INFO.protectionTerms?.length || 0,
      geometryTriggerCount: POLICY_INFO.geometryTriggers?.length || 0,
    },
  };
}

function installCivilPolicyInfoUi() {
  if (typeof document === 'undefined') return;
  injectCivilPolicyInfoStyles();
  const scan = () => document.querySelectorAll('[data-rvm-viewer]').forEach(injectCivilPolicyInfoToolbar);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan, { once: true });
  else setTimeout(scan, 0);
  try {
    const observer = new MutationObserver(scan);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
  try { globalThis.addEventListener?.('rvm-model-loaded', () => setTimeout(scan, 260)); } catch (_) {}
}

function injectCivilPolicyInfoToolbar(root) {
  const ribbon = root?.querySelector?.('.geo-top-ribbon');
  if (!ribbon || ribbon.querySelector('.rvm-civil-policy-info-tool-group')) return;
  const section = document.createElement('div');
  section.className = 'rvm-ribbon-section rvm-tool-group rvm-civil-policy-info-tool-group';
  section.innerHTML = `
    <span class="rvm-ribbon-label">Civil Ref</span>
    <div class="rvm-ribbon-button-row">
      <button type="button" class="rvm-tool-btn rvm-civil-policy-info-btn" data-rvm-civil-policy-info="true" aria-label="Civil reference default-off policy details" title="${escAttr(TOOLTIP_TEXT)}">
        <span aria-hidden="true">ⓘ</span><span>Policy</span>
      </button>
    </div>`;
  const anchor = ribbon.querySelector('.rvm-zone-lod-section') || ribbon.querySelector('.rvm-dtxr-coverage-tool-group') || ribbon.querySelector('.rvm-model-health-tool-group');
  if (anchor?.nextSibling) ribbon.insertBefore(section, anchor.nextSibling);
  else ribbon.appendChild(section);
  section.querySelector('[data-rvm-civil-policy-info]')?.addEventListener('click', () => {
    setStatus(root, 'Civil Ref policy: code-10 reference lines and smart code-11 civil facets default off/wireframe. Hover ⓘ for trigger/protection terms.');
  });
}

function injectCivilPolicyInfoStyles() {
  if (document.getElementById('rvm-civil-policy-info-style')) return;
  const style = document.createElement('style');
  style.id = 'rvm-civil-policy-info-style';
  style.textContent = `
    .rvm-civil-policy-info-tool-group .rvm-civil-policy-info-btn{min-width:70px}
    .rvm-civil-policy-info-tool-group .rvm-civil-policy-info-btn span:first-child{font-weight:700}
  `;
  document.head.appendChild(style);
}

function setStatus(root, message, warning = false) {
  const el = root?.querySelector?.('#rvm-sb-msg');
  if (!el) return;
  el.textContent = message;
  el.style.color = warning ? '#ffcf70' : '';
}

function policyTooltipText(info) {
  const triggerText = Object.entries(info.triggerTerms)
    .map(([kind, words]) => `${kind}: ${words.join(', ')}`)
    .join(' | ');
  return [
    'Smart civil/reference default-off policy',
    ...info.primitiveCodes,
    `Trigger words: ${triggerText}`,
    `Protected process terms: ${info.protectionTerms.join(', ')}`,
    `Geometry: ${info.geometryTriggers.join('; ')}`,
    'Project-specific names are not used; this is taxonomy + geometry based.',
  ].join('\n');
}

function escAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
