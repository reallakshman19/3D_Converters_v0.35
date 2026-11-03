import { WorkflowModal } from './shared/WorkflowModal.js?v=20260624-workflow-tabs-fix-1';
import { validateWeightSubsets } from '../../converters/xml-cii2019-core/weight-subset-validator.js';
import { getXmlCiiPreviewRuntimeConfig } from './shared/preview-filldown.js?v=20260620-rating-runtime-1';

function mergeRuntimeOverrides(baseConfig, runtimeConfig) {
  const out = baseConfig && typeof baseConfig === 'object' && !Array.isArray(baseConfig) ? { ...baseConfig } : {};
  const runtime = runtimeConfig && typeof runtimeConfig === 'object' && !Array.isArray(runtimeConfig) ? runtimeConfig : {};
  const runtimeOverrides = runtime.overrides && typeof runtime.overrides === 'object' && !Array.isArray(runtime.overrides) ? runtime.overrides : {};
  if (!Object.keys(runtimeOverrides).length) return out;
  out.overrides = out.overrides && typeof out.overrides === 'object' && !Array.isArray(out.overrides) ? { ...out.overrides } : {};
  for (const [k, v] of Object.entries(runtimeOverrides)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) out.overrides[k] = { ...(out.overrides[k] || {}), ...v };
    else if (v != null && String(v).trim()) out.overrides[k] = v;
  }
  return out;
}
function currentDomSupportConfig() {
  const input = document?.querySelector?.('[data-option-key="supportConfigJson"]');
  if (!input || !('value' in input)) return {};
  try { return JSON.parse(input.value) || {}; } catch { return {}; }
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attr(str) {
  return esc(str);
}

function activeConfig(baseConfig) {
  return mergeRuntimeOverrides(mergeRuntimeOverrides(mergeRuntimeOverrides(baseConfig || {}, currentDomSupportConfig()), getXmlCiiPreviewRuntimeConfig()), currentDomSupportConfig());
}

let _validatorInstalled = false;

export function installXmlCiiPostRunValidator(container) {
  if (!container || _validatorInstalled) return;
  _validatorInstalled = true;
  // Listen on document so events dispatched from inside WorkflowModal dialogs
  // (which are appended to document.body, outside the tab container) are received.
  document.addEventListener('xml-cii-weight-validator-ready', async (event) => {
    const issues = event.detail?.issues || [];
    const masterRows = event.detail?.masterRows || [];
    const baseConfig = event.detail?.config || {};
    
    if (!issues.length) return;
    
    const config = activeConfig(baseConfig);
    const validatedIssues = validateWeightSubsets(issues, masterRows, config);
    
    // Check if we have anything to show
    const flagged = validatedIssues.filter(i => i.validatorIsFlagged);
    const showOnlyFlagged = config.weight?.validatorShowOnlyFlagged !== false;
    
    const displayIssues = showOnlyFlagged ? flagged : validatedIssues;
    
    const exact = validatedIssues.filter(i => i.validatorLengthClass === 'standard').length;
    const interpolated = validatedIssues.filter(i => i.validatorLengthClass === 'interpolated').length;
    const extrapolated = validatedIssues.filter(i => i.validatorLengthClass === 'extrapolated').length;
    const odd = validatedIssues.filter(i => i.validatorLengthClass === 'odd').length;
    const suspect = validatedIssues.filter(i => i.validatorIsSuspect).length;
    const noMatch = validatedIssues.filter(i => i.validatorNoMatch).length;
    const totalFlagged = flagged.length;
    
    const modal = new WorkflowModal({
      title: 'Weight Validator — Post-Run Results',
      subtitle: 'Automatic validation of converted element weights against expected catalog subsets.',
      onClose: () => {}
    });
    
    const body = modal.open();
    
    const summaryHtml = `
      <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="background:#1a2836;border:1px solid #30455f;border-radius:6px;padding:8px 12px;display:flex;flex-direction:column;align-items:center;">
          <div style="font-size:11px;color:#9cc5ff;text-transform:uppercase;">Flagged</div>
          <div style="font-size:18px;font-weight:bold;color:${totalFlagged > 0 ? '#ef4444' : '#2f9e63'}">${totalFlagged}</div>
        </div>
        <div style="background:#1a2836;border:1px solid #30455f;border-radius:6px;padding:8px 12px;display:flex;flex-direction:column;align-items:center;">
          <div style="font-size:11px;color:#9cc5ff;text-transform:uppercase;">Odd Ratio</div>
          <div style="font-size:18px;font-weight:bold;color:${odd > 0 ? '#d08a22' : '#e6edf5'}">${odd}</div>
        </div>
        <div style="background:#1a2836;border:1px solid #30455f;border-radius:6px;padding:8px 12px;display:flex;flex-direction:column;align-items:center;">
          <div style="font-size:11px;color:#9cc5ff;text-transform:uppercase;">Suspect Weight</div>
          <div style="font-size:18px;font-weight:bold;color:${suspect > 0 ? '#ef4444' : '#e6edf5'}">${suspect}</div>
        </div>
        <div style="background:#1a2836;border:1px solid #30455f;border-radius:6px;padding:8px 12px;display:flex;flex-direction:column;align-items:center;">
          <div style="font-size:11px;color:#9cc5ff;text-transform:uppercase;">No Match</div>
          <div style="font-size:18px;font-weight:bold;color:${noMatch > 0 ? '#ef4444' : '#e6edf5'}">${noMatch}</div>
        </div>
        <div style="flex:1"></div>
        <div style="display:flex;align-items:center;font-size:12px;color:#9cc5ff;">
          <label style="display:flex;align-items:center;cursor:pointer;">
            <input type="checkbox" id="mc-wv-toggle-all" ${showOnlyFlagged ? 'checked' : ''} style="margin-right:6px;">
            Show only flagged/odd entries
          </label>
        </div>
      </div>
    `;
    
    let rowsHtml = '';
    if (displayIssues.length === 0) {
      rowsHtml = `<tr><td colspan="10" style="text-align:center;padding:20px;color:#9cc5ff;">No flagged entries to review. All good!</td></tr>`;
    } else {
      rowsHtml = displayIssues.map(issue => {
        const isOdd = issue.validatorIsOdd;
        const isSuspect = issue.validatorIsSuspect;
        const isNoMatch = issue.validatorNoMatch;
        const isFlagged = issue.validatorIsFlagged;
        
        const rowStyle = isNoMatch ? 'background:#3a1010;border-left:4px solid #ef4444;' :
                         (isSuspect ? 'background:#3a240f;border-left:4px solid #d08a22;' :
                         (isOdd ? 'background:#302607;border-left:4px solid #d9a441;' : 'background:#0f2a1b;border-left:4px solid #2f9e63;'));
        
        let status = '✓ OK';
        if (isNoMatch) status = '✗ No Match';
        else if (isSuspect) status = '⚠ Suspect Weight';
        else if (isOdd) status = '🔶 Odd Length';
        
        const expected = Number.isFinite(issue.validatorExpectedFactored) ? `${issue.validatorExpectedFactored.toFixed(1)} kg` : '-';
        const deviation = isNoMatch || !Number.isFinite(issue.validatorDeviationPct) ? '-' : `±${(issue.validatorDeviationPct * 100).toFixed(1)}%`;
        const lengthType = issue.validatorLengthClass;
        
        return `
          <tr style="${rowStyle}">
            <td>${esc(status)}</td>
            <td title="${attr(issue.branchName)}">${esc(issue.branchName)}</td>
            <td>${esc(issue.lineKey || '')}</td>
            <td>${esc(issue.componentType || '')}</td>
            <td>${esc(issue.boreMm == null ? '' : `${Number(issue.boreMm).toFixed(0)} mm`)}</td>
            <td>${esc(issue.rating || '')}</td>
            <td title="${attr(issue.dtxr)}">${esc(issue.dtxr || 'Not found')}</td>
            <td>${esc(issue.lengthMm == null ? '' : `${Number(issue.lengthMm).toFixed(1)} mm`)} <small style="color:#8bb7ff;">(${lengthType})</small></td>
            <td style="font-weight:bold;">${esc(issue.validatorMatchedWeight || 0)} kg</td>
            <td>${esc(expected)} <small style="color:#8bb7ff;">(${deviation})</small></td>
          </tr>
        `;
      }).join('');
    }
    
    body.innerHTML = `
      ${summaryHtml}
      <div class="mc-rigid-review-table-wrap" style="overflow:auto;max-height:60vh;">
        <table class="mc-rigid-review-table" style="border-collapse:collapse;font-size:12px;table-layout:auto;width:100%;">
          <thead>
            <tr>
              <th style="min-width:120px;white-space:nowrap;">Status</th>
              <th style="min-width:200px;white-space:nowrap;">Branch</th>
              <th style="min-width:100px;white-space:nowrap;">Line Key</th>
              <th style="min-width:110px;white-space:nowrap;">Comp Type</th>
              <th style="min-width:80px;white-space:nowrap;">Bore</th>
              <th style="min-width:80px;white-space:nowrap;">Rating</th>
              <th style="min-width:180px;white-space:nowrap;">DTXR</th>
              <th style="min-width:140px;white-space:nowrap;">Length</th>
              <th style="min-width:110px;white-space:nowrap;">Matched Wt</th>
              <th style="min-width:130px;white-space:nowrap;">Expected Wt</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
    
    // Add toggle handler
    body.querySelector('#mc-wv-toggle-all')?.addEventListener('change', (e) => {
      // Very simple re-render by just re-dispatching with the same payload but toggled config
      // Note: In a real implementation we would save the state to config or local memory and re-render
      const newConfig = { ...config };
      newConfig.weight = { ...(newConfig.weight || {}), validatorShowOnlyFlagged: e.target.checked };
      
      const refreshEvent = new CustomEvent('xml-cii-weight-validator-ready', {
        detail: { issues, masterRows, config: newConfig }
      });
      modal.close();
      container.dispatchEvent(refreshEvent);
    });
  });
}
