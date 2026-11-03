import { getConverterById } from './converter-registry.js?v=20260617-basic-glb-2';
import { xmlCiiWorkflowGetBridge } from './xml-cii-workflow-bridge.js?v=20260708-workflow-bridge-align-1';
import { run as originalXmlCiiRun } from './converters/xmltocii2019_runner.js?v=20260620-weight-ready-1';
import { decodeTextUtf8, encodeTextUtf8 } from './core/output-utils.js';
import { applyXmlCiiEnrichedXmlFix } from './converters/xml-cii-rich-enrichment-fix.js?v=20260624-rich-parity-ui-1';

const FLAG = '__xmlCiiWorkflowHotfix_20260624';
const STYLE_ID = 'xml-cii-workflow-hotfix-style';

function ready() { return typeof window !== 'undefined' && typeof document !== 'undefined'; }
function text(v) { return v == null ? '' : String(v).trim(); }
function bool(v) { if (v === true) return true; if (v === false || v == null) return false; return /^(1|true|yes|on)$/i.test(text(v)); }
function parse(raw) { try { const x = JSON.parse(raw || '{}'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch { return {}; } }
function configEl(root = document) { return root?.querySelector?.('[data-option-key="supportConfigJson"]') || document.querySelector('[data-option-key="supportConfigJson"]'); }
function readConfig(root) { return parse(configEl(root)?.value || '{}'); }
function writeConfig(root, cfg) { const el = configEl(root); if (!el) return; el.value = JSON.stringify(cfg || {}, null, 2); try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch {} }
function normalise(cfg) {
  const out = { ...(cfg || {}) };
  if ('split_condensed_valve_flange' in out && !('splitCondensedValveFlange' in out)) out.splitCondensedValveFlange = bool(out.split_condensed_valve_flange);
  if ('splitCondensedValveFlange' in out) out.split_condensed_valve_flange = bool(out.splitCondensedValveFlange);
  if ('condense_rigid_xsd' in out && !('condenseRigidXsd' in out)) out.condenseRigidXsd = bool(out.condense_rigid_xsd);
  if ('condenseRigidXsd' in out) out.condense_rigid_xsd = bool(out.condenseRigidXsd);
  out.dropGasketNodes = out.dropGasketNodes !== false;
  out.dropGasketsInEnrichment = out.dropGasketsInEnrichment !== false;
  out.disableGasketNodes = false;
  out.disableGasketInOutput = false;
  return out;
}

async function runXmlCiiWithWorkflowFix(context) {
  const primary = context.inputFiles?.find((f) => f.role === 'primary');
  const secondary = context.inputFiles?.find((f) => f.role === 'secondary');
  const sourceXml = primary?.bytes ? decodeTextUtf8(primary.bytes) : '';
  const stagedJson = secondary?.bytes ? decodeTextUtf8(secondary.bytes) : '';
  const options = context.options || {};
  let lastFix = null;
  const baseWorker = context.workerRunner;
  const workerRunner = baseWorker ? { ...baseWorker, runJob: async (job) => { const enriched = job?.inputFiles?.find((f) => /_enriched\.xml$/i.test(f?.name || '')); if (enriched?.bytes) { const current = decodeTextUtf8(enriched.bytes); lastFix = applyXmlCiiEnrichedXmlFix(current, sourceXml, stagedJson, options); enriched.bytes = encodeTextUtf8(lastFix.xmlText); } return baseWorker.runJob(job); } } : baseWorker;
  const response = await originalXmlCiiRun({ ...context, workerRunner });
  if (!response || !Array.isArray(response.outputs)) return response;
  const outputs = response.outputs.map((out) => { if (!/_enriched\.xml$/i.test(out?.name || '') || !text(out.text)) return out; lastFix = applyXmlCiiEnrichedXmlFix(out.text, sourceXml, stagedJson, options); return { ...out, text: lastFix.xmlText }; });
  if (lastFix) {
    const diagName = outputs.find((o) => /_enrichment_diagnostics\.json$/i.test(o?.name || ''));
    if (diagName?.text) { try { const payload = parse(diagName.text); payload.stats = { ...(payload.stats || {}), ...(lastFix.stats || {}) }; payload.diagnostics = [...(payload.diagnostics || []), ...(lastFix.diagnostics || [])]; diagName.text = JSON.stringify(payload, null, 2); } catch {} }
  }
  return { ...response, outputs, logs: { ...(response.logs || {}), stdout: [...(response.logs?.stdout || []), 'XML CII workflow fix: HydroPressure, gasket drop, and resolved negative valve/flange blocks applied.'] } };
}

function patchRunner() { const converter = getConverterById?.('xml_to_cii'); if (!converter || converter.__xmlCiiWorkflowHotfix === '20260624-workflow1-workflow2-1') return; converter.run = runXmlCiiWithWorkflowFix; converter.__xmlCiiWorkflowHotfix = '20260624-workflow1-workflow2-1'; }
function style() { if (document.getElementById(STYLE_ID)) return; const s = document.createElement('style'); s.id = STYLE_ID; s.textContent = `.xml-cii-hotfix-check{display:flex;flex-direction:row;align-items:center;gap:8px;color:#d8ecff;font-size:12px;line-height:1.35}.xml-cii-hotfix-info{border:1px solid #315070;border-radius:8px;padding:8px 10px;background:#102033;color:#bcd8f7;font-size:12px;margin:8px 0}`; document.head.appendChild(s); }
function checkbox(kind, checked) { const spec = kind === 'xsd' ? ['condenseRigidXsd', 'Record source/XSD condensed rigid intent', 'data-xml-cii-hotfix-condense'] : ['splitCondensedValveFlange', 'Apply resolved split for condensed valve/flange/rigid nodes', 'data-xml-cii-hotfix-condense']; return `<label class="xml-cii-hotfix-check"><input type="checkbox" ${spec[2]}="${spec[0]}" ${checked ? 'checked' : ''}> <span>${spec[1]}</span></label>`; }
function setBool(root, key, checked) { const cfg = normalise(readConfig(root)); cfg[key] = !!checked; if (key === 'splitCondensedValveFlange') { cfg.splitCondensedValveFlange = !!checked; cfg.split_condensed_valve_flange = !!checked; } if (key === 'condenseRigidXsd') { cfg.condenseRigidXsd = !!checked; cfg.condense_rigid_xsd = !!checked; } writeConfig(root, cfg); return cfg; }
function injectControls(scope, root) {
  const cfg = normalise(readConfig(root));
  const xsd = !!cfg.condenseRigidXsd || !!cfg.condense_rigid_xsd;
  const resolved = !!cfg.splitCondensedValveFlange || !!cfg.split_condensed_valve_flange;
  const anchor = scope.querySelector('[data-xml-cii-run-option="kgToNewton"]')?.closest('label') || scope.querySelector('[data-native-run-option="kgToNewton"]')?.closest('label');
  if (anchor && !scope.querySelector('[data-xml-cii-hotfix-condense="splitCondensedValveFlange"]')) anchor.insertAdjacentHTML('afterend', checkbox('xsd', xsd) + checkbox('resolved', resolved));
  const configAnchor = scope.querySelector('[data-native-config-bool="disableCiiSupportTagPopulation"]')?.closest('.xml-cii-native-grid') || scope.querySelector('[data-old-workflow-config-json]')?.parentElement;
  if (configAnchor && !scope.querySelector('[data-xml-cii-hotfix-info]')) configAnchor.insertAdjacentHTML('afterend', '<div class="xml-cii-hotfix-info" data-xml-cii-hotfix-info><strong>ⓘ XML→CII enrichment logic</strong><br>GASK Node blocks are dropped by default as the first enrichment step. Pressure1, HydroPressure, Temperature1..3 and density are copied from the same Preview resolver into enriched XML. Resolved condense constructs negative FLAN/VALV/RIGID/INST chains before CII generation.</div>');
  scope.querySelectorAll('[data-xml-cii-hotfix-condense]').forEach((input) => { if (input.dataset.hotfixBound === 'true') return; input.dataset.hotfixBound = 'true'; input.addEventListener('change', () => { const key = input.dataset.xmlCiiHotfixCondense; const cfg2 = setBool(root, key, input.checked); try { xmlCiiWorkflowGetBridge()?.savePopupConfigText?.(JSON.stringify(cfg2, null, 2), { [key]: input.checked }); } catch {} }); });
}
function suppressBlink(scope) { if (!scope || scope.dataset.xmlCiiHotfixNoBlink === 'true') return; scope.dataset.xmlCiiHotfixNoBlink = 'true'; scope.addEventListener('change', (event) => { const target = event.target; if (!target?.matches?.('[data-native-regex-path], [data-native-field-map]')) return; event.stopImmediatePropagation(); const bridge = xmlCiiWorkflowGetBridge(); if (target.matches('[data-native-regex-path]')) bridge?.setPopupConfigValue?.(target.dataset.nativeRegexPath, target.value, target.type === 'number' ? 'number' : 'text'); if (target.matches('[data-native-field-map]')) bridge?.setPopupMasterField?.(target.dataset.nativeMasterKey, target.dataset.nativeFieldMap, target.value); }, true); }
function patchUi(container = document) { for (const scope of [container, ...document.querySelectorAll('[data-xml-cii-workflow-root], .model-converters-workflow-detail, [data-old-xml-cii-phase-body]')].filter(Boolean)) { injectControls(scope, container); suppressBlink(scope); } }
export function installXmlCiiWorkflowHotfix(container = document) { if (!ready()) return; if (!window[FLAG]) window[FLAG] = { installed: true }; style(); patchRunner(); patchUi(container); for (const button of [container.querySelector?.('#model-converters-xml-cii-workflow1-btn'), container.querySelector?.('#model-converters-xml-cii-workflow2-btn'), document.querySelector('#model-converters-xml-cii-workflow1-btn'), document.querySelector('#model-converters-xml-cii-workflow2-btn')].filter(Boolean)) { if (button.dataset.xmlCiiHotfixBound === 'true') continue; button.dataset.xmlCiiHotfixBound = 'true'; button.addEventListener('click', () => [0, 40, 120, 300].forEach((d) => setTimeout(() => patchUi(container), d))); } if (!window[FLAG].tabPatchBound) { window[FLAG].tabPatchBound = true; document.addEventListener('click', (e) => { if (e.target?.closest?.('[data-modal-tab], [data-old-xml-cii-phase], [data-direct-process-phase]')) [0, 40, 120].forEach((d) => setTimeout(() => patchUi(container), d)); }, true); } [0, 80, 250].forEach((d) => setTimeout(() => patchUi(container), d)); }
