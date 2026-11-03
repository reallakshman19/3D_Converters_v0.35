const ELEMENT_LINES = 15;
const PREFIX = 2;
const WIDTH = 13;
const DEFAULT_BLOCK = 1000;
const STATE = new WeakMap();
const PROGRAMMATIC_INPUTS = new WeakSet();
let installed = false;

function sectionRows(text, target) {
  const rows = [];
  let active = false;
  for (const raw of String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = raw.match(/^\s*#\$\s+([A-Z0-9_&]+)\b/i);
    if (match) {
      active = match[1].toUpperCase() === target;
      continue;
    }
    if (active) rows.push(raw);
  }
  return rows;
}

function fixedField(row, index) {
  const start = PREFIX + WIDTH * index;
  return String(row || '').padEnd(start + WIDTH, ' ').slice(start, start + WIDTH);
}

function integerField(row, index, label) {
  const token = fixedField(row, index).trim();
  const value = Number(token);
  const integer = Math.round(value);
  if (!token || !Number.isFinite(value) || Math.abs(value - integer) > 1e-6) {
    throw new Error(`${label}: invalid integer node field ${JSON.stringify(token)}`);
  }
  return integer;
}

function versionSignature(text) {
  for (const row of sectionRows(text, 'VERSION')) {
    const values = (row.match(/[-+]?\d+(?:\.\d+)?(?:[Ee][-+]?\d+)?/g) || []).map(Number);
    if (values.length >= 2 && values.every(Number.isFinite)) return [Math.round(values[0]), Math.round(values[1])];
  }
  return null;
}

export function analyzeCiiNodeRange(text, { expectedRelease = null } = {}) {
  const version = versionSignature(text);
  if (expectedRelease != null && (!version || version[0] !== 5 || version[1] !== expectedRelease)) {
    const found = version ? `${version[0]}.${version[1]}` : 'unknown';
    throw new Error(`Expected CAESAR CII 5.${expectedRelease}; found ${found}.`);
  }

  const elementRows = sectionRows(text, 'ELEMENTS');
  if (elementRows.length % ELEMENT_LINES === 1 && elementRows.at(-1) === '') elementRows.pop();
  if (!elementRows.length || elementRows.length % ELEMENT_LINES !== 0) {
    throw new Error(`ELEMENTS must contain complete ${ELEMENT_LINES}-row records.`);
  }

  const nodes = new Set();
  for (let start = 0; start < elementRows.length; start += ELEMENT_LINES) {
    for (const fieldIndex of [0, 1]) {
      const node = integerField(elementRows[start], fieldIndex, 'ELEMENTS');
      if (node > 0) nodes.add(node);
    }
  }

  const coordRows = sectionRows(text, 'COORDS');
  if (coordRows.length > 1 && coordRows.at(-1) === '') coordRows.pop();
  if (coordRows.length) {
    const declaredToken = coordRows[0].trim().split(/\s+/)[0];
    const declared = Number(declaredToken);
    if (!Number.isInteger(declared) || declared < 0 || coordRows.length - 1 !== declared) {
      throw new Error('COORDS count mismatch.');
    }
    for (const row of coordRows.slice(1)) {
      let node;
      try {
        node = integerField(row, 0, 'COORDS');
      } catch {
        const token = row.trim().split(/\s+/)[0];
        const value = Number(token);
        if (!Number.isInteger(value)) throw new Error(`COORDS: invalid node field ${JSON.stringify(token)}`);
        node = value;
      }
      if (node > 0) nodes.add(node);
    }
  }

  if (!nodes.size) throw new Error('No positive CAESAR nodes were found.');
  const sorted = [...nodes].sort((a, b) => a - b);
  return {
    version,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    count: sorted.length,
    elementCount: elementRows.length / ELEMENT_LINES,
    nodes: sorted,
  };
}

function ceilBlock(value, blockSize) {
  return Math.ceil(value / blockSize) * blockSize;
}

export function suggestNodeOffsets(entries, { blockSize = DEFAULT_BLOCK } = {}) {
  if (!Number.isSafeInteger(blockSize) || blockSize <= 0) throw new Error('blockSize must be a positive safe integer.');
  let occupiedMax = 0;
  const occupiedNodes = new Set();
  return entries.map((entry, index) => {
    const analysis = entry?.analysis;
    if (!analysis) return { offset: 0, mode: entry?.manual ? 'manual' : 'auto', ready: false, reason: 'Analysis pending.' };

    let offset;
    let reason;
    if (entry.manual) {
      offset = Number(entry.manualOffset);
      if (!Number.isSafeInteger(offset)) {
        return { offset: 0, mode: 'manual', ready: false, error: 'Manual offset must be a safe integer.' };
      }
      reason = 'Manual offset retained.';
    } else if (index === 0) {
      offset = 0;
      reason = 'First file retains its original node namespace.';
    } else if (analysis.min > occupiedMax) {
      offset = 0;
      reason = `Original minimum ${analysis.min} is already above previous maximum ${occupiedMax}.`;
    } else {
      offset = ceilBlock(occupiedMax, blockSize);
      reason = `Previous maximum ${occupiedMax} → ${offset} (${blockSize}-node boundary).`;
    }

    const resultMin = analysis.min + offset;
    const resultMax = analysis.max + offset;
    if (resultMin <= 0) {
      return { offset, mode: entry.manual ? 'manual' : 'auto', ready: false, error: `Offset maps minimum node to invalid ${resultMin}.` };
    }

    const shifted = analysis.nodes.map((node) => node + offset);
    const collisions = shifted.filter((node) => occupiedNodes.has(node));
    const rangeOverlap = index > 0 && resultMin <= occupiedMax;
    for (const node of shifted) occupiedNodes.add(node);
    occupiedMax = Math.max(occupiedMax, resultMax);

    return {
      offset,
      mode: entry.manual ? 'manual' : 'auto',
      ready: true,
      reason,
      resultMin,
      resultMax,
      collisions,
      rangeOverlap,
      occupiedMax,
    };
  });
}

function modalConfig(modal) {
  if (modal?.matches?.('[data-cii-v11-card]')) {
    return { release: 11, prefix: 'cii-v11', files: '[data-cii-v11-files]', offset: '[data-cii-v11-offset]', remove: '[data-cii-v11-remove]', clear: '[data-cii-v11-clear]', rows: '[data-cii-v11-rows]' };
  }
  if (modal?.matches?.('[data-cii-v14-card]')) {
    return { release: 14, prefix: 'cii-v14', files: '[data-cii-v14-files]', offset: '[data-cii-v14-offset]', remove: '[data-cii-v14-remove]', clear: '[data-cii-v14-clear]', rows: '[data-cii-v14-rows]' };
  }
  return null;
}

function closestModal(target) {
  return target?.closest?.('[data-cii-v11-card],[data-cii-v14-card]') || null;
}

function ensureHeader(modal) {
  const header = modal.querySelector('thead tr');
  if (!header || header.dataset.ciiAutoOffsetEnhanced) return;
  const cells = [...header.children];
  if (cells.length !== 4) return;
  const original = document.createElement('th');
  original.textContent = 'Original nodes';
  original.style.cssText = 'padding:9px 10px;min-width:125px;';
  const resulting = document.createElement('th');
  resulting.textContent = 'Resulting nodes';
  resulting.style.cssText = 'padding:9px 10px;min-width:145px;';
  header.insertBefore(original, cells[2]);
  header.insertBefore(resulting, cells[3]);
  header.dataset.ciiAutoOffsetEnhanced = '1';
}

function safeText(value) {
  return String(value ?? '').replace(/[&<>]/g, '');
}

function addRangeCells(row, entry, result) {
  let original = row.querySelector('[data-cii-original-range]');
  let resulting = row.querySelector('[data-cii-result-range]');
  const cells = [...row.children];
  if (!original && cells.length === 4) {
    original = document.createElement('td');
    original.dataset.ciiOriginalRange = '1';
    original.style.cssText = 'padding:8px 10px;color:#b8c8d8;font-family:Consolas,monospace;white-space:nowrap;';
    row.insertBefore(original, cells[2]);
    resulting = document.createElement('td');
    resulting.dataset.ciiResultRange = '1';
    resulting.style.cssText = 'padding:8px 10px;color:#b8c8d8;font-family:Consolas,monospace;white-space:nowrap;';
    row.insertBefore(resulting, cells[3]);
  }
  if (!original || !resulting) return;

  if (entry.analysisError) {
    original.innerHTML = `<span style="color:#ffaaaa;">Analysis blocked</span><div style="font-family:inherit;font-size:10px;white-space:normal;margin-top:3px;">${safeText(entry.analysisError)}</div>`;
    resulting.textContent = '—';
    return;
  }
  if (!entry.analysis) {
    original.textContent = 'Analyzing…';
    resulting.textContent = '—';
    return;
  }
  original.innerHTML = `${entry.analysis.min} → ${entry.analysis.max}<div style="font-family:inherit;font-size:10px;color:#75899f;margin-top:3px;">${entry.analysis.count} unique nodes</div>`;
  if (!result?.ready) {
    resulting.textContent = result?.error || '—';
    resulting.style.color = '#ffaaaa';
    return;
  }
  const collision = result.collisions?.length ? `Collision: ${result.collisions.slice(0, 4).join(', ')}` : '';
  const overlap = !collision && result.rangeOverlap ? 'Ranges overlap; node IDs distinct' : '';
  const note = collision || overlap || (result.mode === 'manual' ? 'MANUAL' : 'AUTO');
  resulting.innerHTML = `${result.resultMin} → ${result.resultMax}<div style="font-family:inherit;font-size:10px;margin-top:3px;color:${collision ? '#ffaaaa' : overlap ? '#e6c27a' : '#8fb7dd'};">${note}</div>`;
}

function updateOffsetCell(input, entry, result) {
  if (!input || !result) return;
  const cell = input.closest('td');
  let note = cell?.querySelector?.('[data-cii-offset-note]');
  if (cell && !note) {
    note = document.createElement('div');
    note.dataset.ciiOffsetNote = '1';
    note.style.cssText = 'font-size:10px;line-height:1.3;color:#75899f;margin-top:4px;max-width:190px;';
    cell.appendChild(note);
  }
  if (entry.analysis && !entry.manual && result.ready && String(input.value) !== String(result.offset)) {
    PROGRAMMATIC_INPUTS.add(input);
    input.value = String(result.offset);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    PROGRAMMATIC_INPUTS.delete(input);
  }
  if (note) note.textContent = entry.manual ? 'MANUAL · engineer override' : result.ready ? `AUTO · ${result.reason}` : (entry.analysisError || result.error || 'Analyzing…');
}

function refreshModal(modal) {
  const config = modalConfig(modal);
  const state = STATE.get(modal);
  if (!config || !state) return;
  ensureHeader(modal);
  const results = suggestNodeOffsets(state.entries);
  const rows = [...modal.querySelectorAll(`${config.rows} tr`)];
  rows.forEach((row, index) => {
    const entry = state.entries[index];
    if (!entry) return;
    const input = row.querySelector(config.offset);
    updateOffsetCell(input, entry, results[index]);
    addRangeCells(row, entry, results[index]);
  });
}

function scheduleRefresh(modal) {
  setTimeout(() => refreshModal(modal), 0);
}

function beginAnalysis(modal, files) {
  const config = modalConfig(modal);
  if (!config) return;
  const state = STATE.get(modal) || { entries: [] };
  STATE.set(modal, state);
  for (const file of files) {
    const entry = { file, analysis: null, analysisError: '', manual: false, manualOffset: 0 };
    state.entries.push(entry);
    Promise.resolve(file.text())
      .then((text) => { entry.analysis = analyzeCiiNodeRange(text, { expectedRelease: config.release }); })
      .catch((error) => { entry.analysisError = String(error?.message || error || 'Node analysis failed.'); })
      .finally(() => refreshModal(modal));
  }
  scheduleRefresh(modal);
}

export function installCiiMergeAutoOffset() {
  if (installed || typeof document === 'undefined') return installed;
  installed = true;

  document.addEventListener('change', (event) => {
    const modal = closestModal(event.target);
    const config = modalConfig(modal);
    if (!config || !event.target.matches(config.files)) return;
    beginAnalysis(modal, Array.from(event.target.files || []));
  }, true);

  document.addEventListener('input', (event) => {
    if (PROGRAMMATIC_INPUTS.has(event.target)) return;
    const modal = closestModal(event.target);
    const config = modalConfig(modal);
    if (!config || !event.target.matches(config.offset)) return;
    const state = STATE.get(modal);
    const index = Number(event.target.getAttribute(`data-${config.prefix}-offset`));
    if (!state?.entries[index]) return;
    state.entries[index].manual = true;
    state.entries[index].manualOffset = event.target.value;
    scheduleRefresh(modal);
  });

  document.addEventListener('click', (event) => {
    const modal = closestModal(event.target);
    const config = modalConfig(modal);
    if (!config) return;
    const state = STATE.get(modal);
    if (!state) return;
    const remove = event.target.closest(config.remove);
    if (remove) {
      const index = Number(remove.getAttribute(`data-${config.prefix}-remove`));
      if (Number.isInteger(index)) state.entries.splice(index, 1);
      scheduleRefresh(modal);
      return;
    }
    if (event.target.closest(config.clear)) {
      state.entries = [];
      scheduleRefresh(modal);
    }
  });

  return true;
}

export const __CII_MERGE_AUTO_OFFSET_VERSION__ = '20260816-cii-auto-offset-1';
