import {
  calculateEngineering,
  calculateEngineeringBatch,
  getEngineeringCalculationDefinition,
  listEngineeringCalculationFamilies,
  listEngineeringCalculations,
  resolveEngineeringCalculationInputs,
  validateEngineeringCalculationInput,
} from '../converters/engineering-calculations/index.js';
import {
  buildEngineeringConsoleRequest,
  createEngineeringConsoleDraft,
  invalidateEngineeringConsoleExecution,
  isEngineeringCalculationExecutable,
  parseEngineeringBatchEditor,
} from './engineering-calculation-console-model.js';
import { renderEngineeringCalculationConsoleHtml } from './engineering-calculation-console-view.js';

const FIT_CALCULATION_ID = 'VIB.FIV.FLOW_TURBULENCE';
const AIV_CALCULATION_ID = 'VIB.AIV.ACOUSTIC';
const VIBRATION_FAMILY_ID = 'VIB';

function ensureStylesheet() {
  if (document.querySelector('link[data-engineering-console-style="true"]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = './tabs/engineering-calculations.css?v=engineering-console-1';
  link.dataset.engineeringConsoleStyle = 'true';
  document.head.appendChild(link);
}

function initialDefinition(definitions, context) {
  const requested = context?.calculationId ? getEngineeringCalculationDefinition(context.calculationId) : null;
  if (requested) return requested;
  return definitions.find((row) => row.id === 'PIPE.B313.MATERIAL_DESIGN')
    ?? definitions.find(isEngineeringCalculationExecutable)
    ?? definitions[0];
}

function validationOptions(request) {
  return { inputUnits: request.inputUnits, context: request.context, ...request.options };
}

export function renderEngineeringCalculationsTab(container, { context = null } = {}) {
  ensureStylesheet();
  const definitions = listEngineeringCalculations();
  const families = listEngineeringCalculationFamilies();
  let definition = initialDefinition(definitions, context);
  let productDestroy = null;
  let productToken = 0;
  let destroyed = false;
  if (!definition) {
    container.innerHTML = '<div class="tab-error"><h2>No engineering calculations registered</h2></div>';
    return () => {};
  }

  const initialFamilyLanding = !context?.calculationId && context?.familyId === VIBRATION_FAMILY_ID;
  const state = {
    selectedFamily: initialFamilyLanding ? VIBRATION_FAMILY_ID : definition.family,
    selectedId: initialFamilyLanding ? null : definition.id,
    familyLanding: initialFamilyLanding ? VIBRATION_FAMILY_ID : null,
    draft: createEngineeringConsoleDraft(definition, context?.inputs ?? {}),
    mode: context?.executionMode === 'sandbox' ? 'sandbox' : 'single',
    qualificationMode: context?.qualificationMode || 'strict',
    activeView: isEngineeringCalculationExecutable(definition) ? 'results' : 'basis',
    editorErrors: [], validation: null, resolution: null, result: null,
    batchText: '[]', batchResult: null, batchError: null,
  };

  function cleanupProduct() {
    productToken += 1;
    try { productDestroy?.(); } catch (error) { console.warn('Engineering product cleanup failed', error); }
    productDestroy = null;
  }

  async function mountProductSurface() {
    if (state.familyLanding) return;
    const token = ++productToken;
    try {
      if (definition.id === FIT_CALCULATION_ID) {
        const host = container.querySelector('[data-fit-workspace-host]');
        if (!host) return;
        const module = await import('./vibration-integrity-tab.js?v=20260815-sbc-pf05-cache-1');
        if (destroyed || token !== productToken || definition.id !== FIT_CALCULATION_ID || state.familyLanding) return;
        host.innerHTML = '';
        const maybeDestroy = module.renderVibrationIntegrityTab(host);
        productDestroy = typeof maybeDestroy === 'function' ? maybeDestroy : null;
        return;
      }
      if (definition.id === AIV_CALCULATION_ID) {
        const host = container.querySelector('[data-aiv-qualification-host]');
        if (!host) return;
        const module = await import('./vibration-aiv-qualification-tab.js?v=20260816-aiv-canvas-release-1');
        if (destroyed || token !== productToken || definition.id !== AIV_CALCULATION_ID || state.familyLanding) return;
        host.innerHTML = '';
        const maybeDestroy = module.renderAivQualificationWorkspace(host);
        productDestroy = typeof maybeDestroy === 'function' ? maybeDestroy : null;
      }
    } catch (error) {
      if (destroyed || token !== productToken) return;
      const host = definition.id === FIT_CALCULATION_ID
        ? container.querySelector('[data-fit-workspace-host]')
        : container.querySelector('[data-aiv-qualification-host]');
      if (!host) return;
      const name = definition.id === FIT_CALCULATION_ID ? 'Flow-Induced Vibration Screening' : 'Acoustic-Induced Vibration qualification';
      host.innerHTML = `<div class="tab-error"><h3>Could not load ${name}</h3><pre>${String(error?.message || error)}</pre></div>`;
    }
  }

  function render() {
    cleanupProduct();
    container.innerHTML = renderEngineeringCalculationConsoleHtml({ definitions, families, definition, state });
    mountProductSurface();
  }

  function resetForDefinition(next) {
    definition = next;
    state.familyLanding = null;
    state.selectedId = next.id;
    state.selectedFamily = next.family;
    state.draft = createEngineeringConsoleDraft(next, context?.calculationId === next.id ? context?.inputs ?? {} : {});
    state.editorErrors = [];
    invalidateEngineeringConsoleExecution(state);
    state.activeView = isEngineeringCalculationExecutable(next) ? 'results' : 'basis';
    render();
  }

  function openFamilyLanding(familyId) {
    state.selectedFamily = familyId;
    state.selectedId = null;
    state.familyLanding = familyId;
    state.editorErrors = [];
    invalidateEngineeringConsoleExecution(state);
    render();
  }

  function buildRequest() {
    const built = buildEngineeringConsoleRequest(definition, state.draft, {
      executionMode: state.mode,
      qualificationMode: state.qualificationMode,
      context: context?.calculationContext ?? {},
      includeEvidence: true,
    });
    state.editorErrors = built.ok ? [] : built.errors;
    return built;
  }

  function runValidation() {
    const built = buildRequest();
    if (!built.ok) { render(); return; }
    state.validation = validateEngineeringCalculationInput(
      definition.id, built.request.inputs, validationOptions(built.request),
    );
    state.activeView = 'results';
    render();
  }

  function runResolution() {
    const built = buildRequest();
    if (!built.ok) { render(); return; }
    state.resolution = resolveEngineeringCalculationInputs(
      definition.id,
      built.request.inputs,
      built.request.context,
      { inputUnits: built.request.inputUnits, ...built.request.options },
    );
    state.activeView = 'basis';
    render();
  }

  function runCalculation() {
    const built = buildRequest();
    if (!built.ok) { render(); return; }
    state.result = calculateEngineering(built.request);
    state.activeView = 'results';
    render();
  }

  function addCurrentToBatch() {
    if (!isEngineeringCalculationExecutable(definition)) {
      state.batchError = `${definition.id} is blocked and cannot be added as the current executable request.`;
      render();
      return;
    }
    const built = buildRequest();
    if (!built.ok) { render(); return; }
    const parsed = parseEngineeringBatchEditor(state.batchText);
    if (!parsed.ok) { state.batchError = parsed.error; render(); return; }
    state.batchText = JSON.stringify([...parsed.batchRequest.requests, built.request], null, 2);
    state.batchError = null;
    render();
  }

  function runBatch() {
    const parsed = parseEngineeringBatchEditor(state.batchText);
    if (!parsed.ok) {
      state.batchError = parsed.error;
      state.batchResult = null;
      render();
      return;
    }
    state.batchResult = calculateEngineeringBatch(parsed.batchRequest);
    state.batchError = null;
    render();
  }

  function onClick(event) {
    const calc = event.target.closest('[data-calc-id]');
    if (calc) {
      const next = getEngineeringCalculationDefinition(calc.dataset.calcId);
      if (next) resetForDefinition(next);
      return;
    }
    const family = event.target.closest('[data-family-id]');
    if (family) {
      const familyId = family.dataset.familyId;
      if (familyId === VIBRATION_FAMILY_ID) {
        openFamilyLanding(familyId);
        return;
      }
      state.familyLanding = null;
      state.selectedFamily = familyId;
      const next = definitions.find((row) => row.family === familyId && isEngineeringCalculationExecutable(row))
        ?? definitions.find((row) => row.family === familyId);
      if (next) resetForDefinition(next); else render();
      return;
    }
    const view = event.target.closest('[data-view]');
    if (view) { state.activeView = view.dataset.view; render(); return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'validate') runValidation();
    else if (action === 'resolve') runResolution();
    else if (action === 'calculate') runCalculation();
    else if (action === 'add-current-batch') addCurrentToBatch();
    else if (action === 'run-batch') runBatch();
  }

  function onInput(event) {
    const field = event.target.dataset.field;
    if (field) {
      state.draft.values[field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      state.editorErrors = state.editorErrors.filter((item) => item.field !== field);
      invalidateEngineeringConsoleExecution(state);
    }
    const unit = event.target.dataset.unit;
    if (unit) {
      state.draft.units[unit] = event.target.value;
      invalidateEngineeringConsoleExecution(state);
    }
    if (event.target.matches('[data-batch-editor]')) state.batchText = event.target.value;
  }

  function onChange(event) {
    if (event.target.matches('[data-console-mode]')) {
      state.mode = event.target.value;
      invalidateEngineeringConsoleExecution(state);
    }
    if (event.target.matches('[data-qualification-mode]')) {
      state.qualificationMode = event.target.value;
      invalidateEngineeringConsoleExecution(state);
    }
    onInput(event);
  }

  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
  render();

  return () => {
    destroyed = true;
    cleanupProduct();
    container.removeEventListener('click', onClick);
    container.removeEventListener('input', onInput);
    container.removeEventListener('change', onChange);
  };
}