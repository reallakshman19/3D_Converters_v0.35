import { createElement } from './xml-cii-adapted-dom.js';
import { runStandaloneRegexTester } from '../xml-cii-regex-tester.js';

export function renderRatingSequenceEditor(parent, state, stateRef, render) {
  const section = createElement('section', '', 'xml-cii-regex-rule-card');
  section.appendChild(createElement('h4', 'Rating prefix mapping'));
  
  const tableEl = createElement('table', '', 'xml-cii-regex-table');
  tableEl.style.fontSize = '0.78rem';
  
  const thead = createElement('thead');
  const thr = createElement('tr');
  thr.append(createElement('th', 'Prefix'), createElement('th', 'Rating'), createElement('th', ''));
  thead.appendChild(thr);
  tableEl.appendChild(thead);
  
  const tbody = createElement('tbody');
  const seq = state.regexTesterConfig?.ratingSequence || [];
  
  seq.forEach((pair, idx) => {
    const tr = createElement('tr');
    tr.append(createElement('td', pair[0]), createElement('td', pair[1]));
    
    const delTd = createElement('td');
    delTd.style.textAlign = 'right';
    const delBtn = createElement('button', '✕');
    delBtn.type = 'button';
    Object.assign(delBtn.style, { border: 'none', background: 'transparent', color: '#f87171', cursor: 'pointer', padding: '0 4px', fontSize: '0.85rem' });
    delBtn.addEventListener('click', () => {
      const nextSeq = [...seq];
      nextSeq.splice(idx, 1);
      updateRatingSequence(nextSeq, stateRef, render);
    });
    delTd.appendChild(delBtn);
    tr.appendChild(delTd);
    tbody.appendChild(tr);
  });
  
  tableEl.appendChild(tbody);
  
  const scrollBox = createElement('div');
  Object.assign(scrollBox.style, { maxHeight: '150px', overflowY: 'auto', border: '1px solid rgba(148,163,184,0.08)', borderRadius: '4px' });
  scrollBox.appendChild(tableEl);
  section.appendChild(scrollBox);
  
  const form = createElement('div');
  Object.assign(form.style, { display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' });
  
  const prefixInput = createElement('input');
  prefixInput.type = 'text';
  prefixInput.placeholder = 'Prefix';
  Object.assign(prefixInput.style, { flex: '1', padding: '4px 6px', background: 'rgba(15,23,42,0.3)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '3px', color: '#fff', fontSize: '0.75rem', width: '60px' });
  
  const ratingInput = createElement('input');
  ratingInput.type = 'text';
  ratingInput.placeholder = 'Rating';
  Object.assign(ratingInput.style, { flex: '1', padding: '4px 6px', background: 'rgba(15,23,42,0.3)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: '3px', color: '#fff', fontSize: '0.75rem', width: '60px' });
  
  const addBtn = createElement('button', 'Add');
  addBtn.type = 'button';
  Object.assign(addBtn.style, { padding: '4px 8px', background: '#3b82f6', border: 'none', borderRadius: '3px', color: '#fff', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 'bold' });
  addBtn.addEventListener('click', () => {
    const pref = prefixInput.value.trim();
    const rat = ratingInput.value.trim();
    if (!pref || !rat) return;
    const nextSeq = [...seq, [pref, rat]];
    updateRatingSequence(nextSeq, stateRef, render);
  });
  
  form.append(prefixInput, ratingInput, addBtn);
  section.appendChild(form);
  
  parent.appendChild(section);
}

function updateRatingSequence(nextSeq, stateRef, render) {
  stateRef.current.regexTesterConfig.ratingSequence = nextSeq;
  stateRef.current.regexTesterResult = runStandaloneRegexTester({
    ...stateRef.current,
    sourceText: stateRef.current.sourceText,
    extractionConfig: stateRef.current.regexTesterConfig
  });
  render();
}
