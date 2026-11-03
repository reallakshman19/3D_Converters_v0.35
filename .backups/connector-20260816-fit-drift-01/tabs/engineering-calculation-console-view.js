import {
  canExecuteEngineeringCalculation,
  canResolveEngineeringCalculation,
  isEngineeringCalculationExecutable,
} from './engineering-calculation-console-model.js';
import {
  definitionState,
  esc,
  pill,
  renderBasis,
  renderBatch,
  renderChecks,
  renderEvidence,
  renderInputForm,
  renderResults,
} from './engineering-calculation-console-sections.js';
import { renderVibrationFamilyLanding } from './engineering-calculation-vibration-family.js';

const FIT_CALCULATION_ID = 'VIB.FIV.FLOW_TURBULENCE';
const AIV_CALCULATION_ID = 'VIB.AIV.ACOUSTIC';
const FIT_PRODUCT_SURFACE = 'VIBRATION_INTEGRITY_TABLE_WORKSPACE';
const AIV_QUALIFICATION_SURFACE = 'VIBRATION_AIV_QUALIFICATION_WORKSPACE';

function authorityPillKind(definition) {
  const state = definitionState(definition);
  if (state === 'BENCHMARK_ONLY') return 'warn';
  return isEngineeringCalculationExecutable(definition) ? 'ok' : 'bad';
}

function isFitWorkspace(definition) {
  return definition.id === FIT_CALCULATION_ID && definition.ui?.productSurface === FIT_PRODUCT_SURFACE;
}

function isAivQualificationWorkspace(definition) {
  return definition.id === AIV_CALCULATION_ID && definition.ui?.productSurface === AIV_QUALIFICATION_SURFACE;
}

function renderCatalog(definitions, families, state) {
  return families.filter((family) => family.count > 0).map((family) => {
    const rows = definitions.filter((definition) => definition.family === family.id);
    const calculators = state.selectedFamily === family.id ? `<div class="engineering-console-calc-list">${rows.map((definition) => {
      return `<button class="engineering-console-calc-btn ${state.selectedId === definition.id ? 'is-active' : ''}" data-calc-id="${definition.id}"><span>${esc(definition.shortName || definition.name)}</span>${pill(definitionState(definition), authorityPillKind(definition))}</button>`;
    }).join('')}</div>` : '';
    return `<div class="engineering-console-family"><button class="engineering-console-family-btn ${state.selectedFamily === family.id ? 'is-active' : ''}" data-family-id="${family.id}"><span>${esc(family.label)}</span><small>${rows.length}</small></button>${calculators}</div>`;
  }).join('');
}

function activeView(definition, state) {
  if (state.activeView === 'checks') return renderChecks(state.result);
  if (state.activeView === 'basis') return renderBasis(definition, state.resolution);
  if (state.activeView === 'evidence') return renderEvidence(state.result);
  if (state.activeView === 'batch') return renderBatch(state, definition);
  return renderResults(state.result, state.validation);
}

function renderConsoleActions(definition, state) {
  if (isFitWorkspace(definition)) {
    return `<div class="engineering-console-actions">${pill('TABLE WORKSPACE', 'warn')} ${pill('BENCHMARK ONLY', 'warn')}</div>`;
  }
  if (isAivQualificationWorkspace(definition)) {
    return `<div class="engineering-console-actions">${pill('QUALIFICATION WORKSPACE', 'warn')} ${pill('BLOCKED', 'bad')}</div>`;
  }
  return `<div class="engineering-console-actions"><label>Mode <select class="engineering-console-input" data-console-mode><option value="single" ${state.mode === 'single' ? 'selected' : ''}>Single</option><option value="sandbox" ${state.mode === 'sandbox' ? 'selected' : ''}>Sandbox</option></select></label><label>Qualification <select class="engineering-console-input" data-qualification-mode>${['strict','benchmark','screening'].map((item) => `<option value="${item}" ${state.qualificationMode === item ? 'selected' : ''}>${item}</option>`).join('')}</select></label></div>`;
}

function renderDefinitionBody(definition, state) {
  if (isFitWorkspace(definition)) {
    return `<section class="engineering-console-card engineering-console-product-card"><div data-fit-workspace-host><div class="tab-loading">Loading Flow-Induced Vibration Screening workspace...</div></div></section>`;
  }
  if (isAivQualificationWorkspace(definition)) {
    return `<section class="engineering-console-card engineering-console-product-card"><div data-aiv-qualification-host><div class="tab-loading">Loading Acoustic-Induced Vibration qualification workspace...</div></div></section>`;
  }
  const executable = canExecuteEngineeringCalculation(definition, state.qualificationMode);
  const resolvable = canResolveEngineeringCalculation(definition);
  const tabs = [['results','Results'],['checks','Checks'],['basis','Basis'],['evidence','Evidence'],['batch','Batch']];
  return `<section class="engineering-console-card"><h3>Inputs</h3>${renderInputForm(definition,state)}<div class="engineering-console-actions"><button class="engineering-console-btn" data-action="validate" ${resolvable ? '' : 'disabled'}>Validate</button><button class="engineering-console-btn" data-action="resolve" ${resolvable ? '' : 'disabled'}>Resolve</button><button class="engineering-console-btn primary" data-action="calculate" ${executable ? '' : 'disabled'}>Calculate</button></div></section><nav class="engineering-console-view-tabs">${tabs.map(([id,label]) => `<button class="engineering-console-view-btn ${state.activeView === id ? 'is-active' : ''}" data-view="${id}">${label}</button>`).join('')}</nav><section class="engineering-console-results">${activeView(definition,state)}</section>`;
}

function renderFamilyLanding(definitions, families, state) {
  return `<div class="engineering-console-root"><header class="engineering-console-header"><div><h2>Engineering Calculations</h2><p>Registry-driven execution console. Engineering equations and authority remain in the registered calculation APIs.</p></div></header><div class="engineering-console-layout"><aside class="engineering-console-sidebar">${renderCatalog(definitions, families, state)}</aside><main class="engineering-console-main">${renderVibrationFamilyLanding(definitions)}</main></div></div>`;
}

export function renderEngineeringCalculationConsoleHtml({ definitions, families, definition, state }) {
  if (state.familyLanding === 'VIB') return renderFamilyLanding(definitions, families, state);

  const issue = definition.qualificationIssue ? pill(`#${definition.qualificationIssue}`, 'warn') : '';
  return `<div class="engineering-console-root"><header class="engineering-console-header"><div><h2>Engineering Calculations</h2><p>Registry-driven execution console. Engineering equations and authority remain in the registered calculation APIs.</p></div>${renderConsoleActions(definition,state)}</header><div class="engineering-console-layout"><aside class="engineering-console-sidebar">${renderCatalog(definitions,families,state)}</aside><main class="engineering-console-main"><section class="engineering-console-definition"><div><h3>${esc(definition.name)}</h3><div class="engineering-console-id">${esc(definition.id)}</div></div><div>${pill(definitionState(definition), authorityPillKind(definition))} ${issue}</div></section>${renderDefinitionBody(definition,state)}</main></div></div>`;
}
