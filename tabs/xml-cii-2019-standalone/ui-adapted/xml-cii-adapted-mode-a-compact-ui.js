function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }

function styleSelect(select) {
  Object.assign(select.style, {
    minWidth: '280px',
    padding: '6px 8px',
    background: '#0b1220',
    color: '#e2e8f0',
    border: '1px solid #475569',
    borderRadius: '5px',
    fontSize: '11px',
  });
}

function compactIndividualWorkbenches(workspace, phaseLabel) {
  const details = [...workspace.querySelectorAll('details[data-mode-a-source-phase]')]
    .filter((item) => new RegExp(phaseLabel, 'i').test(text(item.querySelector('summary')?.textContent)));
  if (details.length < 2) return false;
  const heading = [...workspace.querySelectorAll('.model-converters-workflow-section-title')]
    .find((node) => new RegExp(`Individual ${phaseLabel}`, 'i').test(text(node.textContent)));
  if (!heading || heading.dataset.modeACompactSelector === 'true') return false;
  heading.dataset.modeACompactSelector = 'true';
  heading.textContent = `Individual ${phaseLabel} — open one XML only when needed`;

  const controls = document.createElement('div');
  controls.dataset.modeACompactSourceSelector = phaseLabel;
  Object.assign(controls.style, { display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap', margin:'0 0 10px' });
  const select = document.createElement('select');
  styleSelect(select);
  select.appendChild(new Option('Consolidated only (fastest)', ''));
  for (const detail of details) {
    const sourceId = detail.dataset.modeASourcePhase || '';
    const label = text(detail.querySelector('summary')?.textContent).replace(/\s*·\s*(Preview \/ Review|Weight Match).*$/i, '');
    select.appendChild(new Option(label || sourceId, sourceId));
    detail.style.display = 'none';
    detail.open = false;
  }
  const note = document.createElement('span');
  note.className = 'xml-cii-phase-help';
  note.textContent = 'Individual workbenches are lazy-loaded; consolidated mode avoids rendering every source panel.';
  controls.append(select, note);
  heading.insertAdjacentElement('afterend', controls);

  select.addEventListener('change', () => {
    for (const detail of details) {
      const show = select.value && detail.dataset.modeASourcePhase === select.value;
      detail.style.display = show ? '' : 'none';
      detail.open = Boolean(show);
      if (show) detail.scrollIntoView?.({ behavior:'smooth', block:'nearest' });
    }
  });
  return true;
}

function collapseTable(panel, label) {
  if (!panel || panel.dataset.modeACompactTable === 'true') return false;
  const table = panel.querySelector('table');
  if (!table) return false;
  panel.dataset.modeACompactTable = 'true';
  table.style.display = 'none';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.dataset.modeACompactTableToggle = 'true';
  toggle.textContent = `Show ${label}`;
  Object.assign(toggle.style, {
    margin:'6px 0', padding:'5px 9px', border:'1px solid #475569', borderRadius:'5px',
    background:'#172033', color:'#dbeafe', cursor:'pointer', fontSize:'10px',
  });
  toggle.addEventListener('click', () => {
    const hidden = table.style.display === 'none';
    table.style.display = hidden ? '' : 'none';
    toggle.textContent = `${hidden ? 'Hide' : 'Show'} ${label}`;
  });
  table.insertAdjacentElement('beforebegin', toggle);
  return true;
}

export function installModeACompactMultiUi(workspace, state = {}) {
  const enabled = (state?.sourceBatch?.sources || []).filter((source) => source.enabled !== false);
  if (!workspace || enabled.length < 2) return false;
  const phase = text(state.activePhaseId);
  let changed = false;
  if (phase === 'preview') changed = compactIndividualWorkbenches(workspace, 'Preview \/ Review') || changed;
  if (phase === 'weight-match') changed = compactIndividualWorkbenches(workspace, 'Weight Match') || changed;
  if (phase === 'run') {
    changed = collapseTable(workspace.querySelector('[data-mode-a-batch-readiness]'), 'per-file readiness') || changed;
    changed = collapseTable(workspace.querySelector('[data-mode-a-panel="batch-results"]'), 'per-file results') || changed;
  }
  return changed;
}
