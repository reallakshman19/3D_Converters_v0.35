/*
 * ModelConvertersTab — orchestration shell for the Model Converters tab.
 */

import './xml-cii-rich-worker-cache-bust.js?v=20260729-inputxml-live-release-1';
import { renderLegacyModelConvertersTab } from './legacy-adapter.js?v=20260816-cii-v11-v14-dropdown-release-4';
import { CONVERTERS as LIVE_MODEL_CONVERTERS } from './converter-registry.js?v=20260729-inputxml-live-release-1';
import { run as inputXmlToCii2019LiveRun } from './converters/inputxml-to-cii2019.js?v=20260729-inputxml-live-release-1';
import { installFbxReviewUiAddon } from './fbx-review-ui-addon.js?v=20260729-fbx2-direct-pipe-1';
import { installFbxPreviewZoneSelector } from './fbx-preview-zone-selector.js?v=20260729-fbx2-direct-pipe-1';
import { installFbxZoneGeometryToolbar } from './converters/fbx/zone-geometry/zone-toolbar.js?v=20260729-fbx2-direct-pipe-1';
import { installFbxZonePackageExport } from './fbx-zone-package-export.js?v=20260731-fbx-taya-support-qualification-1';
import { installBmCiiSupportAnnotationPopup } from './bm-cii-support-annotation-popup.js?v=20260617-bmcii-open-basic-handoff-2';
import { installInputXmlPropertyTransferUi } from './inputxml-property-transfer-popup-ui-v4.js?v=20260615-inputxml-property-transfer-popup-host-hide-1';
import { installRvmAttrUxmlAddon } from './rvmattr-uxml-addon.js?v=20260618-port-bore-contract-1';
import { installRvmAttrScopeTreeAddon } from './rvmattr-scope-tree-addon.js?v=20260802-rvm-full-scope-tree-1';
import { installXmlCiiWorkflowButtonScope } from './xml-cii-workflow-button-scope.js?v=20260624-unified-wf2-1';
import { installXmlCiiWorkflowLauncherHotfix } from './xml-cii-workflow-launcher-hotfix.js?v=20260708-workflow-bridge-align-1';
import { installXmlCiiSimpleWorkflowController } from './xml-cii-simple-workflow-controller.js?v=20260624-workflow-consolidation-1';
import { installXmlCiiWorkflowOpenRegex } from './xml-cii-workflow-open-regex.js?v=20260625-open-regex-1';
import { installXmlCiiWorkflowPopup } from './xml-cii-workflow-popup.js?v=20260708-workflow-bridge-align-1';
import { installXmlCiiCustomInputWorkflowTab } from './custom-input/xml-cii-custom-input-workflow-tab.js?v=20260625-custom-input-2';
import { installXmlCiiBranchSampleSync } from './xml-cii-branch-sample-sync.js?v=20260624-workflow-consolidation-1';
import { installXmlCiiFinaliseRunButton } from './xml-cii-finalise-run-button.js?v=20260625-model-converters-finalise-run-owner-1';
import { installXmlCiiShortElementToggle } from './xml-cii-short-element-toggle.js?v=20260625-short-element-drop-1';
import { installXmlCiiWeightSemanticInfo } from './xml-cii-weight-semantic-info.js?v=20260625-weight-semantic-info-1';
import { installInputXmlBasicGlbBridge } from './inputxml-basic-glb-bridge.js';
import { installInputXmlManagedStageBridge } from './inputxml-managed-stage-bridge.js?v=20260623-inputxml-direct-stage-1';
import { installStagedJsonInputXmlDiagnosticsPanel } from './stagedjson-inputxml-diagnostics-panel.js?v=20260713-stagedjson-inputxml-audit-1';
import { installXmlCiiInputXmlSidecarDiagnosticsPanel } from './xml-cii-inputxml-sidecar-diagnostics-panel.js?v=20260713-xml-cii-sidecar-audit-1';
import { installXmlCiiDefaultMasterAutoloadLite } from '../xml-cii-master-autoload-lite.js?v=20260624-startup-autoload-noise-1';
import { installXmlCiiPreviewLineKeyRemap } from './xml-cii-preview-linekey-remap.js?v=20260620-rating-runtime-1';
import { installXmlCiiRuntimeOverrideSync } from './xml-cii-runtime-override-sync.js?v=20260624-master-tab-responsive-1';
import { installXmlCiiPostRunValidator } from './xml-cii-post-run-validator.js';
import { installCiiVer11MergeAddon } from './cii-ver11-merge-addon.js?v=20260816-cii-ver11-merge-1';
import { installCiiVer14MergeAddon } from './cii-ver14-merge-addon.js?v=20260816-cii-ver14-merge-1';
import { installCiiV11V14DropdownIntegration } from './cii-v11-v14-dropdown-integration.js?v=20260816-cii-v11-v14-dropdown-release-4';
import { installCiiMergeDropdownIntegration } from './cii-merge-dropdown-integration.js?v=20260816-cii-v11-v14-dropdown-release-4';

const TRACE_PREFIX = '[BM_CII_CONVERTER_TRACE]';
const INPUTXML_CII2019_LIVE_GUARD_VERSION = '20260627-inputxml-cii2019-live-guard-1';
const STYLE_LINKS = Object.freeze([
  ['model-converters-tab-css', './tabs/model-converters-tab.css?v=20260624-button-scope-1'],
  ['model-converters-css-fix', './tabs/model-converters-css-fix.css?v=20260624-simple-rich-isolation-1'],
]);
function ensureStylesheet(id, href) { const existing = document.getElementById(id); if (existing) { if (existing.getAttribute('href') !== href) existing.setAttribute('href', href); return; } const link = document.createElement('link'); link.id = id; link.rel = 'stylesheet'; link.href = href; link.dataset.owner = 'model-converters-tab'; document.head.appendChild(link); }
function ensureModelConvertersStyles() { if (typeof document === 'undefined') return; for (const [id, href] of STYLE_LINKS) ensureStylesheet(id, href); }
function markStylesReady(container) { if (!container) return; container.classList.add('model-converters-style-ready'); container.dataset.modelConvertersCss = '20260624-button-scope-1'; const root = container.querySelector?.('.model-converters-root'); if (root) root.dataset.modelConvertersCss = '20260624-button-scope-1'; }
function installSafely(name, installer, container) { try { installer(container); } catch (error) { console.warn(`${TRACE_PREFIX} Optional installer failed: ${name}`, error); } }
function monotonicNow() { return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now(); }
function scheduleModelConverterTask(callback) { if (typeof requestIdleCallback === 'function') return requestIdleCallback(callback, { timeout: 750 }); if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(() => callback(null)); return Promise.resolve().then(() => callback(null)); }
function scheduleInstallerQueue(container) { const queue = MODEL_CONVERTER_INSTALLERS.map((entry) => entry); const runNext = (deadline) => { const startedAt = monotonicNow(); while (queue.length) { const [name, install] = queue.shift(); installSafely(name, install, container); const elapsed = monotonicNow() - startedAt; if (deadline?.timeRemaining && deadline.timeRemaining() <= 4) break; if (!deadline?.timeRemaining && elapsed > 12) break; } if (queue.length) scheduleModelConverterTask(runNext); }; scheduleModelConverterTask(runNext); }
function installInputXmlCii2019LiveRunnerGuard() { const converter = Array.isArray(LIVE_MODEL_CONVERTERS) ? LIVE_MODEL_CONVERTERS.find((entry) => entry?.id === 'inputxml_to_cii2019') : null; if (!converter) { console.warn(`${TRACE_PREFIX} InputXML->CII(2019) live guard could not find registry entry.`); return false; } if (converter.run !== inputXmlToCii2019LiveRun) { converter.run = inputXmlToCii2019LiveRun; } converter.liveGuardVersion = INPUTXML_CII2019_LIVE_GUARD_VERSION; return true; }
function installCriticalXmlCiiWorkflow(container) { installSafely('xml-cii-workflow-button-scope', installXmlCiiWorkflowButtonScope, container); installSafely('xml-cii-workflow-launcher-hotfix', installXmlCiiWorkflowLauncherHotfix, container); installSafely('xml-cii-workflow-popup', installXmlCiiWorkflowPopup, container); }
function installFbxZonePackageExportAddon(container) { installFbxZonePackageExport(container, null); }

const MODEL_CONVERTER_INSTALLERS = Object.freeze([
  ['rvmattr-uxml-addon', installRvmAttrUxmlAddon], ['rvmattr-scope-tree-addon', installRvmAttrScopeTreeAddon], ['xml-cii-workflow-button-scope', installXmlCiiWorkflowButtonScope], ['xml-cii-workflow-launcher-hotfix', installXmlCiiWorkflowLauncherHotfix], ['xml-cii-simple-workflow-controller', installXmlCiiSimpleWorkflowController], ['xml-cii-open-regex', installXmlCiiWorkflowOpenRegex], ['xml-cii-workflow-popup', installXmlCiiWorkflowPopup], ['xml-cii-custom-input-workflow-tab', installXmlCiiCustomInputWorkflowTab], ['xml-cii-branch-sample-sync', installXmlCiiBranchSampleSync], ['xml-cii-finalise-run-button', installXmlCiiFinaliseRunButton], ['xml-cii-short-element-toggle', installXmlCiiShortElementToggle], ['xml-cii-weight-semantic-info', installXmlCiiWeightSemanticInfo], ['bm-cii-support-annotation-popup', installBmCiiSupportAnnotationPopup], ['inputxml-property-transfer-popup-ui-v4', installInputXmlPropertyTransferUi], ['inputxml-basic-glb-bridge', installInputXmlBasicGlbBridge], ['inputxml-managed-stage-bridge', installInputXmlManagedStageBridge], ['stagedjson-inputxml-diagnostics-panel', installStagedJsonInputXmlDiagnosticsPanel], ['xml-cii-inputxml-sidecar-diagnostics-panel', installXmlCiiInputXmlSidecarDiagnosticsPanel], ['xml-cii-default-master-autoload-lite', installXmlCiiDefaultMasterAutoloadLite], ['xml-cii-preview-linekey-remap', installXmlCiiPreviewLineKeyRemap], ['xml-cii-runtime-override-sync', installXmlCiiRuntimeOverrideSync], ['xml-cii-post-run-validator', installXmlCiiPostRunValidator], ['fbx-zone-package-export', installFbxZonePackageExportAddon],
]);
export function renderModelConvertersTab(container, ctx) { console.log('RENDER MODEL CONVERTERS TAB CALLED!', container); installInputXmlCii2019LiveRunnerGuard(); installFbxReviewUiAddon(); installFbxPreviewZoneSelector(container); installFbxZoneGeometryToolbar(container); ensureModelConvertersStyles(); renderLegacyModelConvertersTab(container, ctx); installSafely('cii-v11-v14-dropdown-integration', installCiiV11V14DropdownIntegration, container); installSafely('cii-ver11-merge-addon', installCiiVer11MergeAddon, container); installSafely('cii-ver14-merge-addon', installCiiVer14MergeAddon, container); installSafely('cii-merge-dropdown-integration', installCiiMergeDropdownIntegration, container); console.log('RENDER LEGACY MODEL CONVERTERS TAB RETURNED!'); markStylesReady(container); installCriticalXmlCiiWorkflow(container); scheduleInstallerQueue(container); }
export const __INPUTXML_CII2019_LIVE_GUARD_VERSION__ = INPUTXML_CII2019_LIVE_GUARD_VERSION;
