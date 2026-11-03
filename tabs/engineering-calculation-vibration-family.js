import { isEngineeringCalculationExecutable } from './engineering-calculation-console-model.js';
import { definitionState, esc, pill } from './engineering-calculation-console-sections.js';

const FIT_ID = 'VIB.FIV.FLOW_TURBULENCE';
const AIV_ID = 'VIB.AIV.ACOUSTIC';
const FIT_PRODUCT_SURFACE = 'VIBRATION_INTEGRITY_TABLE_WORKSPACE';
const AIV_QUALIFICATION_SURFACE = 'VIBRATION_AIV_QUALIFICATION_WORKSPACE';

function statusKind(definition) {
  const state = definitionState(definition);
  if (state === 'BENCHMARK_ONLY') return 'warn';
  return isEngineeringCalculationExecutable(definition) ? 'ok' : 'bad';
}

function mechanismAction(definition) {
  const executable = isEngineeringCalculationExecutable(definition);
  const fitWorkspace = definition.id === FIT_ID
    && executable
    && definition.ui?.productSurface === FIT_PRODUCT_SURFACE;
  const aivQualification = definition.id === AIV_ID
    && definition.ui?.productSurface === AIV_QUALIFICATION_SURFACE;
  const label = fitWorkspace
    ? 'Open FIT workspace'
    : aivQualification
      ? 'Open AIV qualification workspace'
      : executable
        ? 'Open calculation'
        : 'View qualification basis';
  return `<button type="button" class="engineering-console-btn ${fitWorkspace ? 'primary' : ''}" data-calc-id="${esc(definition.id)}">${label}</button>`;
}

function mechanismCard(definition) {
  const issue = definition.qualificationIssue ? `Issue #${definition.qualificationIssue}` : 'No qualification issue';
  const limitations = definition.applicability?.limitations ?? [];
  return `<article class="engineering-vibration-card" data-vibration-mechanism="${esc(definition.id)}">
    <div class="engineering-vibration-card-head">
      <div>
        <h3>${esc(definition.shortName || definition.name)}</h3>
        <div class="engineering-console-id">${esc(definition.id)}</div>
      </div>
      <div class="engineering-vibration-card-status">${pill(definitionState(definition), statusKind(definition))}</div>
    </div>
    <p>${esc(definition.purpose || '')}</p>
    <div class="engineering-vibration-meta"><span>${esc(issue)}</span><span>Design authority: NO</span></div>
    ${limitations.length ? `<ul>${limitations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
    <div class="engineering-console-actions">${mechanismAction(definition)}</div>
  </article>`;
}

function authorityBanner(rows) {
  const screening = rows.filter((definition) => definitionState(definition) === 'SCREENING'
    && isEngineeringCalculationExecutable(definition));
  if (screening.length === 0) {
    return '<div class="engineering-console-banner warn"><strong>Authority boundary.</strong> No registered mechanism currently carries SCREENING qualification; evidence or benchmark capability does not imply screening authority.</div>';
  }
  return `<div class="engineering-console-banner warn"><strong>Authority boundary.</strong> ${screening.length} mechanisms currently carry registered SCREENING qualification. Authority remains mechanism-specific; no screening result grants design authority or complete vibration integrity.</div>`;
}

export function renderVibrationFamilyLanding(definitions = []) {
  const rows = definitions.filter((definition) => definition.family === 'VIB');
  const blocked = rows.filter((definition) => !isEngineeringCalculationExecutable(definition)).length;
  return `<section class="engineering-vibration-landing">
    <header class="engineering-vibration-header">
      <div>
        <h2>Vibration &amp; Dynamic Screening</h2>
        <p>Mechanism-specific vibration integrity. Registered qualification states and available product surfaces are shown without promoting evidence into screening authority.</p>
      </div>
      <div class="engineering-vibration-count">${rows.length} mechanisms · ${blocked} blocked</div>
    </header>
    ${authorityBanner(rows)}
    <div class="engineering-vibration-boundary"><strong>ENGINEERING AUTHORITY BOUNDARY</strong><span>TABLES / explicit engineering contracts = engineering facts. SVG / pixel geometry = presentation only. Governed AIV canvas/navigation/relationship authoring may exist, but presentation geometry never creates engineering physical distance or numerical authority.</span></div>
    <div class="engineering-vibration-grid">${rows.map(mechanismCard).join('')}</div>
  </section>`;
}

export { FIT_ID as VIBRATION_FIT_CALCULATION_ID, AIV_ID as VIBRATION_AIV_CALCULATION_ID };
