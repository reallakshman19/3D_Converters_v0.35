import { createElement } from './xml-cii-adapted-dom.js';
import { xmlCiiDryRunPreview } from './xml-cii-adapted-preview-dryrun.js';
import { applyXmlCiiFlangeWeightFallbackToIssue } from '../../../converters/xml-cii2019-core/flange-weight-fallback.js';
import { isXmlCiiWeightReviewNode } from '../../../converters/xml-cii2019-core/weight-match-model.js';
import {
  ensureValveHintConfig,
  formatValveHint,
  valveHintLengthToleranceMm,
  valveHintMappingRows,
  semanticKeywordRows,
  specialValveFactorRows,
  rankXmlCiiWeightCandidates
} from '../../../converters/xml-cii2019-core/weight-valve-hints.js';
import { saveMasterContextToLocalStorage, xmlCiiEnrichedConfigFromState } from './xml-cii-adapted-state.js';
import { DEFAULT_WEIGHT_MASTER_ROWS } from '../../../converters/xml-cii2019-core/default-weight-master-rows.js';

const WM_CACHE_KEY = 'xml-cii-wm-cache-v1';

function t(value) { return value === null || value === undefined ? '' : String(value); }
function clean(value) { return t(value).replace(/\s+/g, ' ').trim(); }
function esc(value) { return t(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function attr(value) { return esc(value).replaceAll("'", '&#39;'); }
function nfmt(value, digits = 1) { const numeric = Number(value); return Number.isFinite(numeric) ? numeric.toFixed(digits) : ''; }
function selectedWeight(candidate) { return candidate?.selectedWeight ?? candidate?.suggestedWeight ?? candidate?.weight ?? ''; }
function convOn(config) { return config?.weight?.convertSmallLengthsInToMm === true; }

function hasWeightMasterRows(config) {
  return Array.isArray(config?.weight?.masterRows) && config.weight.masterRows.length > 0;
}

// Weight master rows come from (in priority order): explicit config.weight.masterRows (uploaded/
// edited via the Valve Weights import UI), the restored master context, then the app's embedded
// default (converters/xml-cii2019-core/default-weight-master-rows.js) — no network fetch needed.
async function ensureWeightMasterRows(config, masterContext) {
  const out = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  if (hasWeightMasterRows(out)) return out;
  const rows = Array.isArray(masterContext?.weightMasterRows) && masterContext.weightMasterRows.length > 0
    ? masterContext.weightMasterRows
    : DEFAULT_WEIGHT_MASTER_ROWS;
  out.weight = out.weight && typeof out.weight === 'object' ? { ...out.weight } : {};
  out.weight.masterRows = rows.map((row) => ({ ...row }));
  return out;
}

function patternText(patterns) {
  return esc((patterns || []).join('\n'));
}

function targetText(targets) {
  return esc((targets || []).map((target) => `${target.code || ''}|${target.label || ''}|${target.factor || 1}`).join('\n'));
}

function semanticRuleRowsHtml(config) {
  return semanticKeywordRows(config).map((rule, index) => `
    <tr data-wm-semantic-row>
      <td><input type="checkbox" data-wm-rule-on ${rule.on ? 'checked' : ''}></td>
      <td><input type="number" data-wm-rule-priority value="${attr(rule.priority)}" style="width:72px;"></td>
      <td><input type="text" data-wm-rule-code value="${attr(rule.code)}" style="width:130px;"></td>
      <td><input type="text" data-wm-rule-label value="${attr(rule.label)}" style="width:150px;"></td>
      <td><textarea data-wm-rule-patterns spellcheck="false" style="min-width:320px;min-height:64px;background:#0b1320;color:#e6edf5;border:1px solid #31455f;border-radius:4px;">${patternText(rule.patterns)}</textarea></td>
    </tr>`).join('');
}

function factorRuleRowsHtml(config) {
  return specialValveFactorRows(config).map((rule) => `
    <tr data-wm-factor-row>
      <td><input type="checkbox" data-wm-rule-on ${rule.on ? 'checked' : ''}></td>
      <td><input type="number" data-wm-rule-priority value="${attr(rule.priority)}" style="width:72px;"></td>
      <td><input type="text" data-wm-rule-code value="${attr(rule.code)}" style="width:150px;"></td>
      <td><input type="text" data-wm-rule-label value="${attr(rule.label)}" style="width:170px;"></td>
      <td><textarea data-wm-rule-patterns spellcheck="false" style="min-width:280px;min-height:64px;background:#0b1320;color:#e6edf5;border:1px solid #31455f;border-radius:4px;">${patternText(rule.patterns)}</textarea></td>
      <td><textarea data-wm-rule-targets spellcheck="false" style="min-width:260px;min-height:64px;background:#0b1320;color:#e6edf5;border:1px solid #31455f;border-radius:4px;" title="One target per line: CODE|Label|Factor">${targetText(rule.targets)}</textarea></td>
    </tr>`).join('');
}

function editableRuleTable(title, headers, rowsHtml, helpText) {
  return `<section style="border:1px solid #253a55;border-radius:6px;overflow:hidden;background:#101a29;margin-bottom:12px;">
    <div style="padding:7px 9px;color:#9cc5ff;font-weight:700;font-size:12px;border-bottom:1px solid #253a55;">${esc(title)}</div>
    <div style="overflow:auto;max-height:280px;">
      <table class="mc-rigid-review-table" style="border-collapse:collapse;font-size:12px;min-width:100%;">
        <thead><tr>${headers.map((header) => `<th style="white-space:nowrap;padding:6px;text-align:left;border-bottom:1px solid #253a55;">${esc(header)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div style="padding:6px 8px;font-size:11px;color:#64748b;">${esc(helpText)}</div>
  </section>`;
}

function hintPanel(config) {
  ensureValveHintConfig(config);
  return `<div style="margin:8px 0;white-space:pre-line;font-size:12px;color:#94a3b8;background:rgba(30,41,59,0.5);padding:10px;border-radius:6px;border:1px solid rgba(148,163,184,0.15);">Rows included: RIGID, FLAN*, VALV / VALVE / VLV, INST. Rows excluded: support-only, TEE, ELBO/BEND, REDUCER, OLET, PIPE, GASK. Nodes with a non-empty ConnectionType (e.g. BRAN) are excluded. Valve Hint applies to all eligible nodes (Endpoint restriction removed). Exact candidate length gate is ±${esc(valveHintLengthToleranceMm(config))} mm.</div>`;
}

function enhancedHintPanel(config) {
  ensureValveHintConfig(config);
  return `${hintPanel(config)}
  <details style="margin:8px 0;background:#182232;border:1px solid #28394e;border-radius:6px;padding:8px;">
    <summary style="cursor:pointer;color:#d7e6ff;font-weight:700;font-size:13px;outline:none;user-select:none;">🛠️ Editable weight keyword / factor rules</summary>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;align-items:stretch;">
      <label style="display:flex;flex-direction:column;gap:4px;font-size:12px;color:#9cc5ff;">Length gate (mm)
        <input type="number" min="0" step="0.1" data-wm-weight-tolerance value="${attr(valveHintLengthToleranceMm(config))}" style="max-width:180px;background:#0b1320;color:#e6edf5;border:1px solid #31455f;border-radius:6px;padding:6px;">
      </label>
      ${editableRuleTable('DTXR semantic keyword rules', ['On', 'Priority', 'Code', 'Label', 'Regex patterns'], semanticRuleRowsHtml(config), 'Use one regex per line. Higher priority rules use lower priority numbers.')}
      ${editableRuleTable('Non-standard valve factor rules', ['On', 'Priority', 'Code', 'Label', 'Regex patterns', 'Targets'], factorRuleRowsHtml(config), 'Targets use CODE|Label|Factor, one per line. Candidate weight uses the maximum factored interpolated/extrapolated subset weight.')}
    </div>
    <div style="margin-top:8px;font-size:11px;color:#64748b;">Factor targets use semantic codes such as CONTROL and BALL. Candidate weight uses the maximum factored interpolated/extrapolated subset weight and flags odd extrapolation ratios.</div>
  </details>`;
}

function renderWeightMasterBlocked(contentEl) {
  contentEl.innerHTML = `<div style="padding:10px;border:1px solid #7c5a18;border-radius:8px;background:#2a210b;color:#ffe7a3;">Weight master is not ready, so 4A is blocked to prevent false <strong>0 / No match</strong> rows.<br><small style="display:block;margin-top:6px;color:#ffd98a;word-break:break-word;">No weight.masterRows and the app's built-in default rows were empty.</small></div>`;
}

function methodLabel(candidate) {
  if (candidate?.flangeWeightFallback) return 'Flange extrapolated';
  if (candidate?.specialFactorRule) return candidate?.oddEntry ? 'Factor odd' : 'Factor';
  if (candidate?.weightMethod === 'length-interpolated') return 'Interpolated';
  if (candidate?.weightMethod === 'length-extrapolated' && candidate?.inferredWeight) return 'Extrapolated';
  if (candidate?.zeroFallback) return 'No match';
  return candidate?.preferred ? 'Suggested' : '';
}

function renderAcceptedChip(candidate, rowIndex, issue) {
  const value = selectedWeight(candidate);
  const label = desc(candidate);
  const title = [`Rating: ${issue.rating || '-'}`, `TypeDesc: ${label}`, `Selected weight: ${value} kg`, `Length delta: ${nfmt(candidate.lengthDelta)} mm`, candidate?.weightWarning || ''].filter(Boolean).join(' | ');
  const marker = candidate?.inferredWeight ? '≈ ' : (candidate.preferred ? '★ ' : '');
  const method = methodLabel(candidate);
  const suffix = method ? ` · ${method}` : ` · Δ${esc(nfmt(candidate.lengthDelta))}`;
  return `<button type="button" class="mc-rigid-review-candidate${candidate.preferred ? ' best' : ''}" data-wm-candidate="${rowIndex}" data-wm-weight="${attr(value)}" title="${attr(title)}" style="font-size:11px;line-height:1.1;padding:3px 6px;border-radius:999px;white-space:nowrap;max-width:330px;overflow:hidden;text-overflow:ellipsis;cursor:pointer;border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.1);color:#60a5fa;margin-right:4px;margin-bottom:4px;">${marker}${esc(value)}kg${suffix}</button>`;
}

function renderRejectedChip(candidate) {
  return `<span class="mc-rigid-review-candidate mc-wm-chip-rejected" title="${attr(candidate.rejectedReason || '')}" style="font-size:11px;line-height:1.1;padding:3px 6px;border-radius:999px;white-space:nowrap;max-width:330px;overflow:hidden;text-overflow:ellipsis;opacity:.72;border:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.05);color:#f87171;margin-right:4px;margin-bottom:4px;display:inline-block;">× ${esc(desc(candidate))} · Δ${esc(nfmt(candidate.lengthDelta))}mm</span>`;
}

function desc(candidate) {
  return clean(candidate?.typeDesc || candidate?.valveType || candidate?.type || 'Unknown') || 'Unknown';
}

function widthTh(label, widthPx) {
  return `<th style="min-width:${widthPx}px;width:${widthPx}px;resize:horizontal;overflow:auto;white-space:nowrap;padding:8px;text-align:left;border-bottom:1px solid rgba(148,163,184,0.15);background:rgba(30,41,59,0.3);">${esc(label)}</th>`;
}

function readCache(storageKey) {
  try { return JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { return null; }
}

function writeCache(storageKey, fingerprint, data) {
  try {
    const payload = JSON.stringify({ fp: fingerprint, data, ts: Date.now() });
    if (payload.length > 2500000) return;
    localStorage.setItem(storageKey, payload);
  } catch {}
}

function invalidateXmlCiiWeightCache() {
  try { localStorage.removeItem(WM_CACHE_KEY); } catch {}
}

function wmCacheFingerprint(fileSize, jsonLen, masterLen, overrides, splitOn) {
  return `${fileSize || 0}|j${jsonLen}|m${masterLen}|s${splitOn ? 1 : 0}|o${JSON.stringify(overrides?.rigidWeight || {})}`;
}

function overrideValue(config, bucketName, keys) {
  const bucket = config?.overrides?.[bucketName];
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  for (const key of keys.filter(Boolean)) {
    const value = bucket[key];
    if (clean(value)) return clean(value);
  }
  return '';
}

function processRating(config, keys) {
  const bucket = config?.overrides?.processData;
  if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) return '';
  for (const key of keys.filter(Boolean)) {
    const value = bucket[key]?.rating;
    if (clean(value)) return clean(value);
  }
  return '';
}

function ratingFromConfig(row, config) {
  const keys = [row?.lineKey, row?.branchName, row?.requestedPipingClass, row?.resolvedPipingClass, row?.nodeNumber];
  return overrideValue(config, 'rating', keys)
    || processRating(config, keys)
    || clean(row?.rating)
    || clean(config?.rating?.defaultRating || config?.defaultRating);
}

function rerankWithRating(row, config) {
  const rating = ratingFromConfig(row, config);
  const ranking = rankXmlCiiWeightCandidates({
    boreMm: row.boreMm,
    rating,
    lengthMm: row.lengthMm,
    nodeName: row.nodeName,
    componentType: row.componentType,
    componentRefNo: row.componentRefNo,
    dtxr: row.dtxr,
  }, config, { includeRejected: true });
  const _derivedValveHint = formatValveHint(ranking.nodeHint) || (() => {
    const _best = ranking.candidates?.[0];
    if (_best?.specialFactorRule && _best?.specialFactorCode) {
      return (_best.typeDesc || '').split(':')[0].trim() || _best.specialFactorCode;
    }
    const _sm = ranking.semanticSource;
    return _sm?.matches?.[0] ? `${_sm.matches[0].label} (keyword)` : '';
  })();
  return {
    ...row,
    rating,
    valveHint: _derivedValveHint,
    nodeHint: ranking.nodeHint,
    candidates: ranking.candidates.slice(0, 5),
    rejectedCandidates: ranking.rejectedCandidates.slice(0, 3),
    ranking,
  };
}

function lines(value) {
  return t(value).split(/\r?\n/).map(clean).filter(Boolean);
}

function parseTargetLines(value) {
  return lines(value).map((line) => {
    const parts = line.split(/[|\t,]/).map(clean);
    const code = (parts[0] || '').toUpperCase();
    const factor = Number(parts[2] || parts[1]);
    return {
      code,
      label: parts[1] && Number.isNaN(Number(parts[1])) ? parts[1] : code,
      factor: Number.isFinite(factor) && factor > 0 ? factor : 1,
    };
  }).filter((target) => target.code);
}

function parseRuleRows(panelEl, selector, withTargets) {
  return [...(panelEl?.querySelectorAll(selector) || [])].map((row, index) => ({
    on: row.querySelector('[data-wm-rule-on]')?.checked !== false,
    priority: Number(row.querySelector('[data-wm-rule-priority]')?.value || ((index + 1) * 10)),
    code: clean(row.querySelector('[data-wm-rule-code]')?.value).toUpperCase(),
    label: clean(row.querySelector('[data-wm-rule-label]')?.value),
    patterns: lines(row.querySelector('[data-wm-rule-patterns]')?.value),
    ...(withTargets ? { targets: parseTargetLines(row.querySelector('[data-wm-rule-targets]')?.value) } : {}),
  })).filter((rule) => rule.code || rule.patterns.length);
}

function applyWeightRulePanelConfig(panelEl, config) {
  const cfg = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  cfg.weight = cfg.weight && typeof cfg.weight === 'object' && !Array.isArray(cfg.weight) ? cfg.weight : {};
  const tolerance = Number(panelEl?.querySelector('[data-wm-weight-tolerance]')?.value);
  if (Number.isFinite(tolerance) && tolerance >= 0) cfg.weight.valveHintLengthToleranceMm = tolerance;
  cfg.weight.semanticKeywordRules = parseRuleRows(panelEl, '[data-wm-semantic-row]', false);
  cfg.weight.specialValveFactorRules = parseRuleRows(panelEl, '[data-wm-factor-row]', true);
  ensureValveHintConfig(cfg);
  return cfg;
}

export function renderAdaptedWeightMatchPanel(card, stateOrRef, render) {
  const isRef = stateOrRef && 'current' in stateOrRef;
  const stateRef = isRef ? stateOrRef : { current: stateOrRef };
  const state = stateRef.current;

  card.innerHTML = `
    <p class="xml-cii-phase-help">Review zero/missing weight issues, score weight-master candidates, apply overrides, and finalize selections into standalone config.</p>
    <div style="display:flex;align-items:center;gap:6px;font-size:1.1rem;font-weight:600;margin-bottom:8px;">
      5 Weight Match 
      <span title="Length gate is mandatory. Rating is resolved before nearest-weight candidate ranking." style="cursor:help;color:#8bb7ff;border:1px solid #406089;border-radius:50%;padding:0 5px;font-size:11px;">i</span>
    </div>
    <div style="font-size:12px;color:#94a3b8;margin-bottom:12px;">Approximate component weights are computed after enriched/split XML nodes are produced. Click Build Weight Data to compute/recompute.</div>
    <div id="mc-wm-hint-panel"></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0;">
      <button type="button" id="mc-wm-refresh" style="cursor:pointer;padding:8px 16px;border-radius:6px;background:#1e4ed8;color:#fff;border:none;">Build Weight Data</button>
      <button type="button" id="mc-wm-fill-best" style="cursor:pointer;padding:8px 16px;border-radius:6px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;">Use all ★ preferred</button>
      <button type="button" id="mc-wm-length-toggle" style="cursor:pointer;padding:8px 16px;border-radius:6px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;" title="Convert small master lengths (<100) from inch to mm. Default OFF.">⇄ in→mm: OFF</button>
      <span id="mc-wm-status" style="font-size:12px;font-weight:600;margin-left:8px;">Ready to build</span>
    </div>
    <div id="mc-wm-content">
      <div style="text-align:center;padding:18px;background:rgba(30,41,59,0.3);border-radius:6px;border:1px solid rgba(148,163,184,0.08);color:#94a3b8;">Click <strong>Build Weight Data</strong> to compute approximate matches.</div>
    </div>
  `;

  bindParentWeightMatchPhase(card, stateRef, render);
}

function persistWeightMatchConfig(stateRef, config) {
  const nextJson = JSON.stringify(config, null, 2);
  const context = stateRef.current.masterContext || {};
  context.config = config;
  stateRef.current = { ...stateRef.current, supportConfigJson: nextJson, masterContext: { ...context, config } };
  saveMasterContextToLocalStorage(stateRef.current.masterContext);
}

// The Weight Match phase reuses the parent XML→CII(2019) implementation
// (weight-match-renderer + enrichment core) so lengths, DTXR resolution,
// split node numbers, and candidate ranking are identical to the parent tab.
// Falls back to the standalone matcher only if the parent modules fail to load.
async function bindParentWeightMatchPhase(card, stateRef, render) {
  const state = stateRef.current;
  try {
    const { loadParentWeightMatchModules } = await import('../xml-cii-standalone-run-parity.js');
    const { bindXmlCiiWeightMatchPhase, enrichXmlForCii2019 } = await loadParentWeightMatchModules();
    const config = await ensureWeightMasterRows(xmlCiiEnrichedConfigFromState(state), state.masterContext);
    const xmlFile = state.sourceFile || (state.sourceText ? new File([state.sourceText], 'source.xml', { type: 'application/xml' }) : null);
    bindXmlCiiWeightMatchPhase(card, {
      xmlFile,
      stagedJsonText: state.stagedJsonText || '',
      config,
      enrichXmlForCii2019,
      onSaveConfig: (cfg) => persistWeightMatchConfig(stateRef, cfg),
      ensureOverrides: (cfg) => { if (!cfg.overrides) cfg.overrides = {}; return cfg.overrides; },
      resolveStagedJsonText: async () => ({ text: stateRef.current.stagedJsonText || '', label: stateRef.current.stagedJsonFile?.name || '' }),
    });
  } catch (error) {
    console.warn('Parent weight-match phase unavailable; using standalone matcher:', error);
    bindAdaptedWeightMatchPanel(card, stateRef, render);
  }
}

// Parity with the parent workflow: when the resolved valve/flange split is
// ON, weight-match against the enriched (split-renumbered, DTXR/length-
// annotated) XML so node numbers match what the run will emit.
async function weightMatchSourceXml(xmlText, stagedJsonText, liveConfig, splitOn) {
  if (!splitOn) return xmlText;
  try {
    const { enrichStandaloneXmlForRun } = await import('../xml-cii-standalone-run-parity.js');
    const parity = await enrichStandaloneXmlForRun(
      { sourceText: xmlText, stagedJsonText, supportConfigJson: JSON.stringify(liveConfig), options: { splitCondensedValveFlange: true } },
      { dryRun: true, skipAutoWeightMatch: true }
    );
    if (parity.applied && parity.xmlText) return parity.xmlText;
  } catch (parityError) {
    console.warn('Weight match split parity skipped:', parityError);
  }
  return xmlText;
}

function bindAdaptedWeightMatchPanel(detailEl, stateRef, render) {
  const contentEl = detailEl.querySelector('#mc-wm-content');
  const statusEl = detailEl.querySelector('#mc-wm-status');
  const toggleEl = detailEl.querySelector('#mc-wm-length-toggle');
  const panelEl = detailEl.querySelector('#mc-wm-hint-panel');
  if (!contentEl) return;

  let localIssues = [];
  const status = (message, tone) => {
    if (statusEl) {
      statusEl.textContent = message || '';
      statusEl.className = tone || '';
      if (tone === 'bad') statusEl.style.color = '#ef4444';
      else if (tone === 'ok') statusEl.style.color = '#10b981';
      else statusEl.style.color = '#f59e0b';
    }
  };

  const activeConfig = () => xmlCiiEnrichedConfigFromState(stateRef.current);
  const onSaveConfig = (newCfg) => {
    const nextJson = JSON.stringify(newCfg, null, 2);
    stateRef.current.supportConfigJson = nextJson;
    if (stateRef.current.masterContext) {
      stateRef.current.masterContext.config = newCfg;
      saveMasterContextToLocalStorage(stateRef.current.masterContext);
    }
  };

  const syncToggle = () => {
    if (!toggleEl) return;
    const on = convOn(activeConfig());
    toggleEl.textContent = `⇄ in→mm: ${on ? 'ON' : 'OFF'}`;
    toggleEl.style.borderColor = on ? '#2f9e63' : '';
    toggleEl.style.color = on ? '#fff' : '';
    toggleEl.style.background = on ? '#14532d' : '';
  };
  const drawPanel = () => { if (panelEl) panelEl.innerHTML = enhancedHintPanel(activeConfig()); };

  const saveInput = (input) => {
    const key = input.getAttribute('data-wm-key') || '';
    const value = Number(input.value);
    if (!key || !Number.isFinite(value) || value <= 0) return;
    const cfg = activeConfig();
    if (!cfg.overrides) cfg.overrides = {};
    cfg.overrides.rigidWeight = { ...(cfg.overrides.rigidWeight || {}), [key]: value };
    onSaveConfig(cfg);
  };

  const drawRows = (issues) => {
    if (!issues.length) {
      contentEl.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;">No actual RIGID / FLAN* / VALVE / INST nodes with ElementLengthMm &gt; 6 mm were found.</div>';
      return;
    }
    const rows = issues.map((issue, rowIndex) => {
      const best = issue.candidates?.[0];
      const initial = issue.weight && issue.weight > 0 ? issue.weight : (best ? selectedWeight(best) : '');
      const rowStyle = issue.mapped ? 'background:#0f2a1b;border-left:4px solid #2f9e63;' : (best?.zeroFallback ? 'background:#3a1010;border-left:4px solid #ef4444;' : (best?.inferredWeight ? 'background:#302607;border-left:4px solid #d9a441;' : 'background:#3a240f;border-left:4px solid #d08a22;'));
      const inputStyle = `width:86px;padding:4px;border-radius:4px;font-size:12px;color:#e6edf5;background:#0f172a;border:1px solid #334155;${best?.zeroFallback ? 'background:#3a1010;border:1px solid #ef4444;color:#ffd6d6;' : (best?.inferredWeight ? 'background:#352706;border:1px solid #d9a441;color:#fff1b8;' : '')}`;
      const accepted = (issue.candidates || []).map((candidate) => renderAcceptedChip(candidate, rowIndex, issue)).join('');
      const rejected = (issue.rejectedCandidates || []).map(renderRejectedChip).join('');
      const chips = accepted || rejected || '<span style="color:#64748b;">No suggestion</span>';
      const statusText = issue.mapped ? `Mapped (${issue.weightSource || 'weight'})` : (methodLabel(best) || 'Unresolved');
      return `<tr style="${rowStyle}">
        <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(statusText)}</td>
        <td title="${attr(issue.branchName)}" style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(issue.branchName)}</td>
        <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.lineKey || '')}</td>
        <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.componentType || '')}</td>
        <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.boreMm == null ? '' : `${Number(issue.boreMm).toFixed(0)} mm`)}</td>
        <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.rating || '')}</td>
        <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.nodeNumber)}</td>
        <td title="${attr(issue.componentRefEndpoint || '')}" style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(issue.componentRefEndpoint || '')}</td>
        <td title="${attr([issue.dtxrSource, issue.dtxrMatchedKey, issue.dtxrSourcePath, issue.dtxrSuppressionReason].filter(Boolean).join(' · '))}" style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.dtxr || 'Not found')}</td>
        <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.valveHint || '')}</td>
        <td title="${attr(issue.elementLengthSource || '')}" style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);">${esc(issue.lengthMm == null ? '' : `${Number(issue.lengthMm).toFixed(1)} mm`)}</td>
        <td style="padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);"><input type="number" min="0" step="0.001" class="mc-rigid-review-input" data-wm-key="${attr(issue.key)}" value="${attr(initial)}" placeholder="kg" style="${inputStyle}"></td>
        <td style="max-width:540px;padding:8px;border-bottom:1px solid rgba(148,163,184,0.1);"><div style="display:flex;flex-wrap:wrap;gap:4px;max-height:72px;overflow:auto;align-items:flex-start;">${chips}</div></td>
      </tr>`;
    }).join('');
    
    const cfg = activeConfig();
    contentEl.innerHTML = `
      <div style="margin-bottom:8px;font-size:12px;color:#94a3b8;background:rgba(30,41,59,0.3);padding:8px;border-radius:6px;border:1px solid rgba(148,163,184,0.08);">
        Approximate matching source: dryrun nodes. Drag header edge to resize. Valve Hint is applied only to Endpoint 2 nodes. Exact candidate length gate is ±${nfmt(valveHintLengthToleranceMm(cfg))} mm. Length conversion is ${convOn(cfg) ? 'ON' : 'OFF'}.
      </div>
      <div class="mc-rigid-review-table-wrap" style="overflow:auto;max-height:48vh;border:1px solid rgba(148,163,184,0.15);border-radius:6px;">
        <table class="mc-rigid-review-table" style="border-collapse:collapse;font-size:12px;table-layout:auto;width:100%;">
          <thead>
            <tr>
              ${[
                ['Status', 140], ['Branch', 200], ['Line Key', 110], ['ComponentType', 130], ['Bore', 90], ['Rating', 90], ['Node', 90], ['ComponentRefNo_Endpoint', 190], ['DTXR', 180], ['Valve Hint', 140], ['Length', 100], ['Weight (kg)', 110], ['Nearest Suggestions', 360],
              ].map(([label, width]) => widthTh(label, width)).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;

    contentEl.querySelectorAll('[data-wm-candidate]').forEach((button) => button.addEventListener('click', () => {
      const input = contentEl.querySelectorAll('.mc-rigid-review-input')[Number(button.dataset.wmCandidate)];
      if (!input) return;
      input.value = button.dataset.wmWeight || '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }));
  };

  const fillBest = () => {
    let count = 0;
    contentEl.querySelectorAll('.mc-rigid-review-input').forEach((input, index) => {
      const best = localIssues[index]?.candidates?.[0];
      if (!best || Number(selectedWeight(best)) <= 0 || best.zeroFallback) return;
      input.value = String(selectedWeight(best));
      saveInput(input);
      count += 1;
    });
    return count;
  };

  const compute = async (opts = {}) => {
    let liveConfig = activeConfig();
    syncToggle(); drawPanel();
    const xmlText = stateRef.current.sourceText || '';
    if (!xmlText) {
      localIssues = [];
      contentEl.innerHTML = '<div style="padding:14px;text-align:center;color:#94a3b8;">No XML source loaded. Import an XML file first.</div>';
      status('No input', 'bad');
      return;
    }

    liveConfig = await ensureWeightMasterRows(liveConfig, stateRef.current.masterContext);
    if (!hasWeightMasterRows(liveConfig)) {
      localIssues = [];
      renderWeightMasterBlocked(contentEl);
      status('Weight master not ready', 'bad');
      return;
    }

    const stagedJsonText = stateRef.current.stagedJsonText || '';
    const file = stateRef.current.sourceFile;
    if (!opts.force) {
      const _fp = wmCacheFingerprint(file?.size || xmlText.length, stagedJsonText.length, liveConfig?.weight?.masterRows?.length || 0, liveConfig?.overrides, liveConfig?.splitCondensedValveFlange !== false);
      const _cached = readCache(WM_CACHE_KEY);
      if (_cached?.fp === _fp && Array.isArray(_cached?.data) && _cached.data.length) {
        localIssues = _cached.data.map((row) => applyXmlCiiFlangeWeightFallbackToIssue(rerankWithRating(row, liveConfig), liveConfig));
        const _mapped = localIssues.filter((r) => r.mapped).length;
        const _zero = localIssues.filter((r) => r.candidates?.[0]?.zeroFallback).length;
        const _unresolved = localIssues.length - _mapped - localIssues.filter((r) => r.candidates?.[0]?.preferred || r.candidates?.[0]?.flangeWeightFallback || (r.candidates?.[0]?.inferredWeight && !r.candidates?.[0]?.zeroFallback)).length - _zero;
        status(`${_mapped} mapped · (restored from cache) · ${localIssues.length} shown`, (_zero || _unresolved) ? 'bad' : 'ok');
        drawRows(localIssues);
        return;
      }
    }

    status('Computing weight matches...');
    try {
      const splitOn = liveConfig?.splitCondensedValveFlange !== false;
      const matchXmlText = await weightMatchSourceXml(xmlText, stagedJsonText, liveConfig, splitOn);
      const { nodeRows } = xmlCiiDryRunPreview(matchXmlText, liveConfig, stagedJsonText);

      localIssues = nodeRows.map((nr) => {
        const key = nr.key;
        const overrideWeight = Number(liveConfig?.overrides?.rigidWeight?.[key]);
        const hasOverride = Number.isFinite(overrideWeight) && overrideWeight > 0;
        const best = nr.weightCandidates?.[0];

        let currentIssue = {
          key,
          branchName: nr.branchName,
          nodeNumber: nr.nodeNumber,
          componentType: nr.componentType,
          boreMm: nr.boreMm,
          rating: nr.rating,
          resolvedPipingClass: nr.resolvedPipingClass,
          lengthMm: nr.lengthMm,
          dtxr: nr.dtxr,
          dtxrSource: nr.dtxrSource,
          dtxrMatchedKey: nr.dtxrMatchedKey,
          valveHint: nr.valveHint,
          componentRefNo: nr.componentRefNo || '',
          endpoint: nr.endpoint || '',
          componentRefEndpoint: nr.componentRefEndpoint || '',
          candidates: nr.weightCandidates || [],
          rejectedCandidates: nr.rejectedWeightCandidates || [],
          weight: hasOverride ? overrideWeight : (nr.weightMatch?.weight || 0),
          weightSource: hasOverride ? 'override' : (nr.weightMatch ? 'auto' : 'none'),
          mapped: hasOverride || (nr.weightMatch && nr.weightMatch.weight > 0 && !nr.weightMatch.zeroFallback)
        };

        currentIssue = applyXmlCiiFlangeWeightFallbackToIssue(currentIssue, liveConfig);
        return currentIssue;
      });

      const mapped = localIssues.filter((row) => row.mapped).length;
      const suggested = localIssues.filter((row) => row.candidates?.[0]?.preferred).length;
      const flange = localIssues.filter((row) => row.candidates?.[0]?.flangeWeightFallback).length;
      const inferred = localIssues.filter((row) => row.candidates?.[0]?.inferredWeight && !row.candidates?.[0]?.zeroFallback && !row.candidates?.[0]?.flangeWeightFallback).length;
      const zero = localIssues.filter((row) => row.candidates?.[0]?.zeroFallback).length;
      const unresolved = localIssues.length - mapped - suggested - flange - inferred - zero;

      status(`${mapped} mapped · ${suggested} exact · ${flange} flange fallback · ${inferred} inferred · ${zero} zero fallback · ${unresolved} unresolved · ${localIssues.length} shown`, (zero || unresolved) ? 'bad' : 'ok');
      drawRows(localIssues);

      const _cacheable = localIssues.map((row) => { const { ranking: _r, ...rest } = row; return rest; });
      const _fpWrite = wmCacheFingerprint(file?.size || xmlText.length, stagedJsonText.length, liveConfig?.weight?.masterRows?.length || 0, liveConfig?.overrides, splitOn);
      writeCache(WM_CACHE_KEY, _fpWrite, _cacheable);
    } catch (error) {
      localIssues = [];
      contentEl.innerHTML = `<div style="padding:14px;text-align:center;color:#ef4444;">Could not compute weight matches: ${esc(error?.message || error)}</div>`;
      status('Error', 'bad');
    }
  };

  detailEl.querySelector('#mc-wm-refresh')?.addEventListener('click', () => compute({ force: true }));
  toggleEl?.addEventListener('click', () => {
    invalidateXmlCiiWeightCache();
    const cfg = activeConfig();
    cfg.weight = cfg.weight && typeof cfg.weight === 'object' && !Array.isArray(cfg.weight) ? cfg.weight : {};
    cfg.weight.convertSmallLengthsInToMm = cfg.weight.convertSmallLengthsInToMm !== true;
    onSaveConfig(cfg);
    contentEl.innerHTML = '<div style="padding:12px;text-align:center;color:#94a3b8;">Length conversion changed. Click <strong>Build Weight Data</strong> to recompute.</div>';
    localIssues = [];
    syncToggle();
  });
  detailEl.querySelector('#mc-wm-fill-best')?.addEventListener('click', () => {
    const count = fillBest();
    status(`Applied ${count} preferred weight(s)`, count ? 'ok' : 'bad');
  });
  panelEl?.addEventListener('change', () => {
    try {
      const cfg = applyWeightRulePanelConfig(panelEl, activeConfig());
      cfg.weight.valveHintMapping = valveHintMappingRows(cfg);
      onSaveConfig(cfg);
      invalidateXmlCiiWeightCache();
      contentEl.innerHTML = '<div style="padding:12px;text-align:center;color:#94a3b8;">Weight keyword/factor rules changed. Click <strong>Build Weight Data</strong> to recompute.</div>';
      localIssues = [];
      status('Weight rules saved');
    } catch (error) {
      status(error?.message || String(error), 'bad');
    }
  });
  contentEl.addEventListener('change', (event) => {
    const input = event.target.closest?.('.mc-rigid-review-input');
    if (input) saveInput(input);
  });

  syncToggle();
  drawPanel();
  status('Ready to build');
}
