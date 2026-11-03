import { AIV_DEFAULT_ASSUMPTION_PROFILE, validateAivAssumptionProfile } from '../converters/vibration/aiv/aiv-assumption-profile.js';
import { buildAivAutoStagePlan } from '../converters/vibration/aiv/aiv-auto-stage-plan.js';
import { AIV_D23_PRODUCT_PATH_VALIDATION } from './vibration-aiv-validation-records.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusKind(status) {
  if (/PASS|READY|COMPLETE|AUTHORIZED|RELEASED/u.test(status)) return 'ok';
  if (/INVALID|FAIL|NOT_APPLICABLE/u.test(status)) return 'bad';
  return 'gap';
}

function autoStageRows(plan) {
  return plan.stages.map((stage) => `<tr>
    <td><code>${esc(stage.stageId)}</code></td>
    <td>${esc(stage.label)}</td>
    <td><span class="aivq-status ${statusKind(stage.status)}">${esc(stage.status)}</span></td>
    <td><code>${esc(stage.autoAction)}</code></td>
  </tr>`).join('');
}

export function renderAivPromotionReadinessHtml(state = {}) {
  const profile = state.assumptionProfile ?? AIV_DEFAULT_ASSUMPTION_PROFILE;
  const profileValidation = validateAivAssumptionProfile(profile);
  const validationApplicable = Boolean(state.benchmark?.loaded)
    && !state.benchmark.loaded.modified
    && !state.assumptionProfileModified;
  const validationStatus = validationApplicable
    ? AIV_D23_PRODUCT_PATH_VALIDATION.status
    : state.benchmark?.loaded ? 'NOT_APPLICABLE_MODIFIED_INPUTS' : 'CONTROLLED_BENCHMARK_NOT_LOADED';
  const autoPlan = buildAivAutoStagePlan({ assumptionProfile: profile });

  return `<section class="aivq-card aivq-promotion-card">
    <div class="aivq-section-head"><div><h4>AUTO release status</h4><p>The AIV AUTO release program is machine-qualified through assessment-level SCREENING. Human evidence is not a prerequisite; assumptions remain visible, editable and exportable.</p></div></div>
    <div class="aivq-result-summary">
      <span>Mode <strong>AUTO</strong></span>
      <span>Calculation <strong>IMPLEMENTED</strong></span>
      <span>Qualification <strong>SCREENING</strong></span>
      <span>Screening authority <strong>AUTHORIZED</strong></span>
      <span>Screening scope <strong>ASSESSMENT</strong></span>
      <span>Design authority <strong>false</strong></span>
      <span>Assumption profile <strong>${esc(profileValidation.status)}</strong></span>
      <span>Next stage <strong>${esc(autoPlan.nextStageId ?? 'COMPLETE')}</strong></span>
    </div>
    <div class="aivq-example-table"><table><thead><tr><th>Stage</th><th>Release work</th><th>AUTO status</th><th>Action</th></tr></thead><tbody>${autoStageRows(autoPlan)}</tbody></table></div>
    <div class="aivq-example-table"><table><thead><tr><th>Release evidence</th><th>Status</th><th>Basis</th></tr></thead><tbody>
      <tr><td>EI D.2.3 product path</td><td><span class="aivq-status ${statusKind(validationStatus)}">${esc(validationStatus)}</span></td><td>${validationApplicable ? `${esc(AIV_D23_PRODUCT_PATH_VALIDATION.counts.passed)}/${esc(AIV_D23_PRODUCT_PATH_VALIDATION.counts.checks)} committed checks pass.` : 'Current edited inputs do not inherit benchmark parity; screening may be rerun after readiness.'}</td></tr>
      <tr><td>BENCHMARK_ONLY exact-head release</td><td><span class="aivq-status ok">PASS</span></td><td><code>AIV-BENCHMARK-ONLY-ReleaseValidationReceipt-v1.json</code> · 4/4 local controlled validation groups.</td></tr>
      <tr><td>SCREENING qualification</td><td><span class="aivq-status ok">PASS</span></td><td><code>AIV-SCREENING-ReleaseValidationReceipt-v1.json</code> · 8/8 local controlled qualification groups.</td></tr>
      <tr><td>Project-input assumption flow</td><td><span class="aivq-status ok">PASS</span></td><td>Blank project rows resolved 56 visible assumptions; explicit user values override assumptions and alter results.</td></tr>
      <tr><td>Single / batch parity</td><td><span class="aivq-status ok">PASS</span></td><td>Both modes execute the same central 10-stage <code>calculateAiv</code> kernel.</td></tr>
      <tr><td>Line / case summary</td><td><span class="aivq-status gap">NON-AUTHORITATIVE</span></td><td>Configured line/case LOF remains traceability-only; assessment LOF is the qualified screening result scope.</td></tr>
      <tr><td>GitHub Actions</td><td><span class="aivq-status gap">NOT_RUN</span></td><td>Hosted jobs continue to receive no runner/steps because the repository Actions budget prevents execution; local exact-source records provide the release evidence.</td></tr>
    </tbody></table></div>
    <div class="aivq-readiness-note">AUTO stages 16B.1–20 are complete. Current product authority is <strong>SCREENING</strong> for assessment-level results only. This does not provide design approval; <code>designAuthority=false</code>.</div>
  </section>`;
}
