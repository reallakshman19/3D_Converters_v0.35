import { createElement } from './xml-cii-adapted-dom.js';
import { saveMasterContextToLocalStorage } from './xml-cii-adapted-state.js';

function parseConfig(state) {
  try {
    const value = JSON.parse(state?.supportConfigJson || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function persist(stateRef, config, render) {
  const masterContext = { ...(stateRef.current.masterContext || {}), config };
  stateRef.current = {
    ...stateRef.current,
    supportConfigJson: JSON.stringify(config, null, 2),
    masterContext,
  };
  saveMasterContextToLocalStorage(masterContext);
  if (typeof render === 'function') render();
}

export function appendBendRadiusConfigToggle(card, stateRef, render) {
  const config = parseConfig(stateRef.current);
  const bend = config.bendRadius && typeof config.bendRadius === 'object' && !Array.isArray(config.bendRadius)
    ? config.bendRadius
    : {};
  const enabled = bend.publishOnePointFiveD === true;

  const section = createElement('section', '', 'xml-cii-audit-panel');
  section.style.marginTop = '14px';
  section.appendChild(createElement('h3', 'Bend Radius Publication'));

  const label = createElement('label');
  label.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:12px;color:#cbd5e1;cursor:pointer;';
  const input = createElement('input');
  input.type = 'checkbox';
  input.checked = enabled;
  input.dataset.field = 'bend-radius-1-5d';
  label.append(input, document.createTextNode('Bend radius: 1.5D'));
  section.appendChild(label);

  const help = createElement(
    'p',
    enabled
      ? 'ON — enriched ELBO BendRadius is published as 1.5 × effective OD and the same explicit radius is written to CII.'
      : 'OFF (default) — BendRadius is omitted from enriched XML and the CII bend-radius field is zero, leaving CAESAR to apply its default 1.5D behavior.',
    'xml-cii-phase-help'
  );
  help.style.marginTop = '7px';
  section.appendChild(help);

  input.addEventListener('change', (event) => {
    const next = parseConfig(stateRef.current);
    next.bendRadius = next.bendRadius && typeof next.bendRadius === 'object' && !Array.isArray(next.bendRadius)
      ? { ...next.bendRadius }
      : {};
    next.bendRadius.publishOnePointFiveD = event.target.checked === true;
    next.bendRadius.formula = '1.5*OD';
    next.bendRadius.default = 'CAESAR_WHEN_OFF';
    persist(stateRef, next, render);
  });

  card.appendChild(section);
}
