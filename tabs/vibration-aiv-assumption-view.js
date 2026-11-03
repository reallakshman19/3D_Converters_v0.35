import { AIV_DEFAULT_ASSUMPTION_PROFILE } from '../converters/vibration/aiv/aiv-assumption-profile.js';

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function input(path, label, value, type = 'text') {
  return `<label class="aivq-assumption-field"><span>${esc(label)}</span><input type="${type}" data-aiv-assumption="${esc(path)}" value="${esc(value)}"></label>`;
}

function select(path, label, value, options) {
  return `<label class="aivq-assumption-field"><span>${esc(label)}</span><select data-aiv-assumption="${esc(path)}">${options.map((option) => `<option value="${esc(option)}"${option === value ? ' selected' : ''}>${esc(option)}</option>`).join('')}</select></label>`;
}

function assumptionRows(resolution) {
  const rows = resolution?.assumptions ?? [];
  if (!rows.length) return '<tr><td colspan="5" class="aivq-empty-row">No assumptions were needed for the latest readiness input.</td></tr>';
  return rows.slice(0, 50).map((item) => `<tr>
    <td>${esc(item.tableKind)}</td>
    <td>${esc(item.rowIndex + 1)}</td>
    <td>${esc(item.column)}</td>
    <td>${esc(item.assumedValue)}</td>
    <td><code>${esc(item.profilePath)}</code></td>
  </tr>`).join('');
}

export function renderAivAssumptionProfileHtml(state = {}) {
  const profile = state.assumptionProfile ?? AIV_DEFAULT_ASSUMPTION_PROFILE;
  const last = state.assumptionResolution;
  return `<section class="aivq-card aivq-assumption-card">
    <div class="aivq-section-head"><div><h4>Missing-data assumptions</h4><p>Blank AIV cells are filled from this profile before readiness/calculation. Every assumed value remains visible, editable and traceable; values entered directly in the tables always win.</p></div><button type="button" class="engineering-console-btn" data-aiv-action="reset-assumptions">Reset benchmark defaults</button></div>
    <div class="aivq-banner"><strong>No human evidence gate.</strong><span>Release qualification is benchmark- and machine-parity-driven. Assumptions are explicit inputs, not hidden engineering defaults.</span></div>
    <details open data-aiv-disclosure-key="assumption-source-defaults"><summary>Source defaults</summary><div class="aivq-assumption-grid">
      ${select('source.sourceDeviceType', 'Device type', profile.source.sourceDeviceType, ['RELIEF_VALVE','CONTROL_VALVE','RESTRICTION_ORIFICE','PRESSURE_REDUCING_BRANCH_CONNECTION'])}
      ${select('source.sourceState', 'Source state', profile.source.sourceState, ['ACTIVE','OPEN','RELIEVING','CLOSED'])}
      ${select('source.phase', 'Phase', profile.source.phase, ['GAS','WET_GAS','TWO_PHASE','LIQUID'])}
      ${input('source.massFlow', 'Mass flow', profile.source.massFlow, 'number')}${input('source.massFlowUnit', 'Mass-flow unit', profile.source.massFlowUnit)}
      ${input('source.upstreamPressure', 'P1', profile.source.upstreamPressure, 'number')}${input('source.upstreamPressureUnit', 'P1 unit', profile.source.upstreamPressureUnit)}${select('source.upstreamPressureBasis', 'P1 basis', profile.source.upstreamPressureBasis, ['ABSOLUTE','GAUGE'])}
      ${input('source.downstreamPressure', 'P2', profile.source.downstreamPressure, 'number')}${input('source.downstreamPressureUnit', 'P2 unit', profile.source.downstreamPressureUnit)}${select('source.downstreamPressureBasis', 'P2 basis', profile.source.downstreamPressureBasis, ['ABSOLUTE','GAUGE'])}
      ${input('source.referencePressure', 'Reference pressure', profile.source.referencePressure, 'number')}${input('source.referencePressureUnit', 'Reference unit', profile.source.referencePressureUnit)}
      ${input('source.upstreamTemperature', 'Temperature', profile.source.upstreamTemperature, 'number')}${input('source.upstreamTemperatureUnit', 'Temperature unit', profile.source.upstreamTemperatureUnit)}
      ${input('source.molecularWeight', 'Molecular weight', profile.source.molecularWeight, 'number')}${input('source.molecularWeightUnit', 'MW unit', profile.source.molecularWeightUnit)}
      ${select('source.lowNoiseTrimState', 'Trim state', profile.source.lowNoiseTrimState, ['NONE','MANUFACTURER_REDUCTION','UNRESOLVED'])}${input('source.lowNoiseTrimReduction', 'Trim reduction when used', profile.source.lowNoiseTrimReduction, 'number')}${input('source.lowNoiseTrimUnit', 'Trim unit', profile.source.lowNoiseTrimUnit)}
      ${select('source.sonicState', 'Sonic state', profile.source.sonicState, ['NON_SONIC','SONIC','UNRESOLVED'])}
    </div></details>
    <details data-aiv-disclosure-key="assumption-assessment-defaults"><summary>Assessment defaults</summary><div class="aivq-assumption-grid">
      ${select('assessment.assessmentType', 'Assessment type', profile.assessment.assessmentType, ['WELDOLET','WELDED_TEE','WELDED_SUPPORT','OTHER_WELDED_DISCONTINUITY'])}
      ${input('assessment.mainOutsideDiameter', 'Main OD', profile.assessment.mainOutsideDiameter, 'number')}${input('assessment.mainOutsideDiameterUnit', 'Main OD unit', profile.assessment.mainOutsideDiameterUnit)}
      ${input('assessment.mainInsideDiameter', 'Main ID', profile.assessment.mainInsideDiameter, 'number')}${input('assessment.mainInsideDiameterUnit', 'Main ID unit', profile.assessment.mainInsideDiameterUnit)}
      ${input('assessment.mainWallThickness', 'Main wall', profile.assessment.mainWallThickness, 'number')}${input('assessment.mainWallThicknessUnit', 'Main wall unit', profile.assessment.mainWallThicknessUnit)}
      ${input('assessment.branchOutsideDiameter', 'Branch OD', profile.assessment.branchOutsideDiameter, 'number')}${input('assessment.branchOutsideDiameterUnit', 'Branch OD unit', profile.assessment.branchOutsideDiameterUnit)}
      ${input('assessment.branchWallThickness', 'Branch wall', profile.assessment.branchWallThickness, 'number')}${input('assessment.branchWallThicknessUnit', 'Branch wall unit', profile.assessment.branchWallThicknessUnit)}
      ${input('assessment.material', 'Material', profile.assessment.material)}${select('assessment.duplexState', 'Duplex state', profile.assessment.duplexState, ['NO','YES','UNRESOLVED'])}
    </div></details>
    <details data-aiv-disclosure-key="assumption-relationship-defaults"><summary>Relationship + identity defaults</summary><div class="aivq-assumption-grid">
      ${input('relationship.physicalDistance', 'Physical distance', profile.relationship.physicalDistance, 'number')}${input('relationship.physicalDistanceUnit', 'Distance unit', profile.relationship.physicalDistanceUnit)}
      ${input('relationship.simultaneousSourceGroup', 'Simultaneous group', profile.relationship.simultaneousSourceGroup)}${select('relationship.applicabilityDisposition', 'Applicability', profile.relationship.applicabilityDisposition, ['APPLICABLE','NOT_APPLICABLE','UNRESOLVED'])}
      ${input('identity.sourceIdPrefix', 'Source ID prefix', profile.identity.sourceIdPrefix)}${input('identity.assessmentIdPrefix', 'Assessment ID prefix', profile.identity.assessmentIdPrefix)}${input('identity.relationshipIdPrefix', 'Relationship record prefix', profile.identity.relationshipIdPrefix)}${input('identity.caseIdPrefix', 'Case ID prefix', profile.identity.caseIdPrefix)}
      ${input('identity.provenanceSource', 'Assumption provenance', profile.identity.provenanceSource)}${input('identity.provenanceRevision', 'Assumption revision', profile.identity.provenanceRevision)}
    </div></details>
    <details data-aiv-disclosure-key="assumption-benchmark-defaults"><summary>Benchmark / stages 8–10 defaults</summary><div class="aivq-assumption-grid">
      ${select('benchmark.stage8Model', 'Stage-8 model', profile.benchmark.stage8Model, ['CONFIGURED_D23_INTERMEDIATES'])}
      ${input('benchmark.publishedA', 'A', profile.benchmark.publishedA, 'number')}${input('benchmark.publishedS', 'S', profile.benchmark.publishedS, 'number')}${input('benchmark.publishedB', 'B', profile.benchmark.publishedB, 'number')}
      ${select('benchmark.flm1Mode', 'FLM1 mode', profile.benchmark.flm1Mode, ['PUBLISHED','RECALCULATED'])}${input('benchmark.flm1Published', 'FLM1 published', profile.benchmark.flm1Published, 'number')}${input('benchmark.flm1Recalculated', 'FLM1 recalculated', profile.benchmark.flm1Recalculated, 'number')}${input('benchmark.flm1ToleranceAbs', 'FLM1 tolerance', profile.benchmark.flm1ToleranceAbs, 'number')}
      ${input('benchmark.flm2', 'FLM2', profile.benchmark.flm2, 'number')}${input('benchmark.lossFactor', 'Loss factor Lf', profile.benchmark.lossFactor, 'number')}${input('benchmark.lofToleranceAbs', 'LOF comparison tolerance', profile.benchmark.lofToleranceAbs, 'number')}
      ${input('benchmark.d23FirstDiscontinuityLof', 'D.2.3 assessment LOF ref', profile.benchmark.d23FirstDiscontinuityLof, 'number')}${input('benchmark.workedExampleReliefLineLof', 'Worked-example line LOF ref', profile.benchmark.workedExampleReliefLineLof, 'number')}
      ${select('benchmark.lineAggregationMode', 'Line aggregation mode', profile.benchmark.lineAggregationMode, ['SEPARATE_RESULT_SCOPES'])}${select('benchmark.assessmentMode', 'Assessment mode', profile.benchmark.assessmentMode, ['BENCHMARK_COMPARE_ONLY'])}
    </div></details>
    <div class="aivq-result-summary"><span>Latest assumed cells <strong>${esc(last?.assumptionCount ?? 0)}</strong></span><span>Human evidence required <strong>false</strong></span><span>Design authority <strong>false</strong></span></div>
    <div class="aivq-example-table"><table><thead><tr><th>Table</th><th>Row</th><th>Column</th><th>Assumed value</th><th>Profile field</th></tr></thead><tbody>${assumptionRows(last)}</tbody></table></div>
  </section>`;
}