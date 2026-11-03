import { computeXmlCiiWeightIssues } from './converters/xmltocii2019_helper/weight-match-renderer.js?v=20260626-standalone-val-1';
import { validateWeightSubsets } from '../../converters/xml-cii2019-core/weight-subset-validator.js';
import { WorkflowModal } from './shared/WorkflowModal.js';
import { getXmlCiiPreviewRuntimeConfig } from './shared/preview-filldown.js?v=20260626-smart-fill-1';

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

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

function activeConfig(baseConfig) {
  return mergeRuntimeOverrides(mergeRuntimeOverrides(mergeRuntimeOverrides(baseConfig || {}, currentDomSupportConfig()), getXmlCiiPreviewRuntimeConfig()), currentDomSupportConfig());
}

// Derive the rigidWeight override key for an issue row (matches weight-match-renderer logic).
function weightKey(issue) {
  return issue?.key || `${issue?.branchName || ''}::${issue?.nodeNumber || ''}`;
}

// Persist user-edited weights from the popup table into supportConfigJson.overrides.rigidWeight.
function saveEditedWeights(body) {
  const inputs = body?.querySelectorAll?.('.mc-wv-weight-input[data-wv-key]');
  if (!inputs || !inputs.length) return;
  const domInput = document?.querySelector?.('[data-option-key="supportConfigJson"]');
  if (!domInput || !('value' in domInput)) return;
  let changed = false;
  try {
    const cfg = JSON.parse(domInput.value || '{}');
    if (!cfg.overrides) cfg.overrides = {};
    if (!cfg.overrides.rigidWeight) cfg.overrides.rigidWeight = {};
    inputs.forEach((inp) => {
      const key = inp.dataset.wvKey;
      const val = Number(inp.value);
      const original = Number(inp.dataset.wvOriginal);
      if (key && Number.isFinite(val) && val > 0 && val !== original) {
        cfg.overrides.rigidWeight[key] = val;
        changed = true;
      }
    });
    if (changed) {
      domInput.value = JSON.stringify(cfg);
      domInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } catch {}
}

function showWeightValidatorPopup(issues, masterRows, baseConfig, onCloseCallback) {
  const config = activeConfig(baseConfig);
  const validatedIssues = validateWeightSubsets(issues, masterRows, config);

  const totalFlagged = validatedIssues.filter((i) => i.validatorIsFlagged).length;
  const totalOdd = validatedIssues.filter((i) => i.validatorIsOdd).length;
  const totalSuspect = validatedIssues.filter((i) => i.validatorIsSuspect).length;
  const totalNoMatch = validatedIssues.filter((i) => i.validatorNoMatch).length;

  let body;

  const modal = new WorkflowModal({
    title: 'Weight Validator — Post-Run Results',
    subtitle: 'Review weight validation. Edit "Matched Wt" to override. Close → conversion files are created.',
    onClose: () => {
      saveEditedWeights(body);
      if (typeof onCloseCallback === 'function') onCloseCallback();
    },
  });

  body = modal.open();

  // Filter state: null = show all; otherwise Set of active filter keys
  const activeFilters = new Set();

  function filterRow(issue) {
    if (!activeFilters.size) return true;
    if (activeFilters.has('flagged') && issue.validatorIsFlagged) return true;
    if (activeFilters.has('odd') && issue.validatorIsOdd) return true;
    if (activeFilters.has('suspect') && issue.validatorIsSuspect) return true;
    if (activeFilters.has('nomatch') && issue.validatorNoMatch) return true;
    return false;
  }

  function updateRowVisibility() {
    body.querySelectorAll('tr[data-wv-row]').forEach((tr) => {
      const issue = validatedIssues[Number(tr.dataset.wvRow)];
      tr.style.display = issue && filterRow(issue) ? '' : 'none';
    });
  }

  function chipStyle(active) {
    return active
      ? 'cursor:pointer;border:2px solid #60a5fa;background:#1e3a5f;color:#bfdbfe;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:bold;display:flex;flex-direction:column;align-items:center;min-width:80px;'
      : 'cursor:pointer;border:2px solid #30455f;background:#1a2836;color:#9cc5ff;border-radius:8px;padding:6px 14px;font-size:12px;font-weight:bold;display:flex;flex-direction:column;align-items:center;min-width:80px;';
  }

  const summaryHtml = `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center;">
      <button type="button" class="mc-wv-chip" data-wv-filter="all" style="${chipStyle(true)}">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Show All</span>
        <span style="font-size:18px;">${validatedIssues.length}</span>
      </button>
      <button type="button" class="mc-wv-chip" data-wv-filter="flagged" style="${chipStyle(false)}">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Flagged</span>
        <span style="font-size:18px;color:${totalFlagged > 0 ? '#ef4444' : '#2f9e63'}">${totalFlagged}</span>
      </button>
      <button type="button" class="mc-wv-chip" data-wv-filter="odd" style="${chipStyle(false)}">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Odd Ratio</span>
        <span style="font-size:18px;color:${totalOdd > 0 ? '#d08a22' : '#e6edf5'}">${totalOdd}</span>
      </button>
      <button type="button" class="mc-wv-chip" data-wv-filter="suspect" style="${chipStyle(false)}">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Suspect Weight</span>
        <span style="font-size:18px;color:${totalSuspect > 0 ? '#ef4444' : '#e6edf5'}">${totalSuspect}</span>
      </button>
      <button type="button" class="mc-wv-chip" data-wv-filter="nomatch" style="${chipStyle(false)}">
        <span style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;">No Match</span>
        <span style="font-size:18px;color:${totalNoMatch > 0 ? '#ef4444' : '#e6edf5'}">${totalNoMatch}</span>
      </button>
    </div>
  `;

  const rowsHtml = validatedIssues.map((issue, idx) => {
    const isOdd = issue.validatorIsOdd;
    const isSuspect = issue.validatorIsSuspect;
    const isNoMatch = issue.validatorNoMatch;
    const rowStyle = isNoMatch ? 'background:#3a1010;border-left:4px solid #ef4444;' :
      (isSuspect ? 'background:#3a240f;border-left:4px solid #d08a22;' :
        (isOdd ? 'background:#302607;border-left:4px solid #d9a441;' : 'background:#0f2a1b;border-left:4px solid #2f9e63;'));
    let statusText = '✓ OK';
    if (isNoMatch) statusText = '✗ No Match';
    else if (isSuspect) statusText = '⚠ Suspect Weight';
    else if (isOdd) statusText = '🔶 Odd Length';
    const expected = Number.isFinite(issue.validatorExpectedFactored) ? `${issue.validatorExpectedFactored.toFixed(1)} kg` : '-';
    const deviation = isNoMatch || !Number.isFinite(issue.validatorDeviationPct) ? '-' : `±${(issue.validatorDeviationPct * 100).toFixed(1)}%`;
    const lengthType = issue.validatorLengthClass || '';
    const matchedWt = issue.validatorMatchedWeight || 0;
    const key = weightKey(issue);
    return `
      <tr style="${rowStyle}" data-wv-row="${idx}">
        <td>${esc(statusText)}</td>
        <td title="${esc(issue.branchName)}">${esc(issue.branchName)}</td>
        <td>${esc(issue.lineKey || '')}</td>
        <td>${esc(issue.componentType || '')}</td>
        <td>${esc(issue.boreMm == null ? '' : `${Number(issue.boreMm).toFixed(0)} mm`)}</td>
        <td>${esc(issue.rating || '')}</td>
        <td title="${esc(issue.dtxr)}">${esc(issue.dtxr || 'Not found')}</td>
        <td>${esc(issue.lengthMm == null ? '' : `${Number(issue.lengthMm).toFixed(1)} mm`)} <small style="color:#8bb7ff;">(${esc(lengthType)})</small></td>
        <td style="font-weight:bold;padding:2px;">
          <input type="number" class="mc-wv-weight-input" data-wv-key="${esc(key)}" data-wv-original="${matchedWt}"
            value="${matchedWt}" step="0.001" min="0"
            style="width:90px;background:#0a1929;color:#e6edf5;border:1px solid #30455f;border-radius:4px;padding:2px 4px;font-size:12px;font-weight:bold;">
          <small style="color:#8bb7ff;font-size:10px;">kg</small>
        </td>
        <td>${esc(expected)} <small style="color:#8bb7ff;">(${esc(deviation)})</small></td>
      </tr>
    `;
  }).join('');

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
            <th style="min-width:120px;white-space:nowrap;">Matched Wt ✎</th>
            <th style="min-width:130px;white-space:nowrap;">Expected Wt</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div style="margin-top:10px;font-size:11px;color:#9cc5ff;">
      ✎ Edit "Matched Wt" to override the weight. Changes are saved to config when you close this window. Conversion files are created after Close.
    </div>
  `;

  // Wire filter chip buttons
  body.querySelectorAll('.mc-wv-chip[data-wv-filter]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const filter = chip.dataset.wvFilter;
      if (filter === 'all') {
        activeFilters.clear();
      } else {
        if (activeFilters.has(filter)) activeFilters.delete(filter);
        else activeFilters.add(filter);
      }
      // Update chip styles
      body.querySelectorAll('.mc-wv-chip[data-wv-filter]').forEach((c) => {
        const f = c.dataset.wvFilter;
        const isActive = f === 'all' ? !activeFilters.size : activeFilters.has(f);
        c.style.cssText = chipStyle(isActive);
      });
      updateRowVisibility();
    });
  });

  // Start with Show All active
  updateRowVisibility();
}

// Pre-run validation: runs weight computation (dryRun) BEFORE the actual conversion.
// Shows the popup for user review. Actual conversion starts ONLY after the user clicks Close.
// onClose: called when user closes the popup (trigger actual run here).
// onNoIssues: called immediately if weight master not ready or no issues found.
export async function runXmlCiiStandalonePostRunValidation({ xmlFile, resolveStagedJsonText, config, enrichXmlForCii2019, onClose, onNoIssues }) {
  const proceed = typeof onClose === 'function' ? onClose : () => {};
  const proceedDirect = typeof onNoIssues === 'function' ? onNoIssues : proceed;
  try {
    const result = await computeXmlCiiWeightIssues({ xmlFile, resolveStagedJsonText, config, enrichXmlForCii2019 });
    if (!result || !Array.isArray(result.issues) || !result.issues.length) {
      proceedDirect();
      return;
    }
    showWeightValidatorPopup(result.issues, result.masterRows, result.config, proceed);
  } catch (err) {
    console.warn('XML→CII standalone post-run validator failed:', err);
    proceedDirect();
  }
}
