const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const uiPath = path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js');
const ui = fs.readFileSync(uiPath, 'utf8');
const composer = fs.readFileSync(path.join(root, 'converters/xml-cii2019-core/b313-preview-wall-update.js'), 'utf8');
const provenance = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-provenance.js'), 'utf8');
const activation = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-diagnostics-audit-v7.js'), 'utf8');
const auditController = fs.readFileSync(path.join(root, 'tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-audit-controller.js'), 'utf8');

assert(ui.includes("B313_PREVIEW_ACTION_LABEL = 'Update wall thickness as per B31.3 Sec II'"));
assert(ui.includes('resolvePreviewB313MaterialFromRow'));
assert(ui.includes('resolvePreviewB313FactorBasis'));
assert(ui.includes('calculateAndSelectPreviewB313Wall'));
assert(ui.includes('listPipeWallsForSize'));
assert(ui.includes('B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT'));
assert(ui.includes('__b313WallEvidence'));
assert(ui.includes('Open B31.3 Material Factors'));
assert(ui.includes("tabId: 'b313-material-factors'"));
assert(ui.includes('Preview Material → B31.3 material identity'));
assert(ui.includes('ACTIVE_MASTER_STRICT'));
assert(ui.includes('MANUAL_EXPLICIT_FALLBACK'));
assert(ui.includes('BENCHMARK_ONLY factor data is never enabled'));
assert(ui.includes('No ASME Section II allowable-stress table is embedded here'));
assert(ui.includes('A106 benchmark is not used as a default'));
assert(ui.includes('B313_PREVIEW_PRESSURE_UNIT_UNRESOLVED'));
assert(ui.includes('B313_PREVIEW_ROW_OD_PARITY_MISMATCH'));
assert(!ui.includes('P*D /'), 'Preview UI must not duplicate the B31.3 equation.');
assert(!ui.includes('20000'), 'Preview UI must not hardcode the A106 benchmark allowable stress.');

assert(composer.includes('calculateB313Thickness'));
assert(composer.includes('selectPipeWallForCalculation'));
assert(composer.includes('resolveB313MaterialIdentity'));
assert(composer.includes('resolveB313DesignFactors'));
assert(composer.includes("qualificationMode: 'strict'"));
assert(!composer.includes("qualificationMode: 'benchmark'"), 'Preview must never opt into BENCHMARK_ONLY factor data.');
assert(composer.includes('value: B313_PREVIEW_NEGATIVE_MILL_TOLERANCE_PCT'));
assert(composer.includes('B313_PREVIEW_MATERIAL_CONFLICT'));
assert(composer.includes('B313_PREVIEW_MATERIAL_AMBIGUOUS'));
assert(!composer.includes('P*D /'), 'Composer must call the B31.3 API rather than duplicate its equation.');

assert(provenance.includes("source === 'b313-sec-ii'"));
assert(provenance.includes('__b313WallEvidence'));
assert(activation.includes('installPreviewB313WallUpdateAuditController'));
assert(activation.includes('b313WallUpdateReport'));
assert(activation.includes('onSaveConfigPreservePreview'));
assert(auditController.includes('selectPreviewB313AuditRows'));
assert(auditController.includes('derivePreviewB313AuditSummary'));
assert(auditController.includes('renderPreviewB313WallAuditHtml'));
assert(auditController.includes('event.stopImmediatePropagation()'));
assert(auditController.includes('BENCHMARK_ONLY factors'));
assert(auditController.includes('Audit counters were recomputed from row evidence'));

console.log('XML/CII Preview B31.3 material-factor action and stable audit wiring checks passed.');
