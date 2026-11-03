import { createDefaultRigidSmartFillPolicy } from '../xml-cii-rigid-smart-fill.js';

const POLICY_KEY = 'xml-cii-rigid-smart-fill-policy-v1';

function readPolicy() {
  try {
    return {
      ...createDefaultRigidSmartFillPolicy(),
      ...JSON.parse(localStorage.getItem(POLICY_KEY) || '{}'),
    };
  } catch {
    return createDefaultRigidSmartFillPolicy();
  }
}

function writePolicy(policy) {
  try { localStorage.setItem(POLICY_KEY, JSON.stringify(policy)); } catch {}
}

function modalButton(label, primary = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  Object.assign(button.style, {
    cursor: 'pointer',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: '700',
    color: '#ffffff',
    background: primary ? '#2563eb' : '#334155',
    border: primary ? '1px solid #60a5fa' : '1px solid #64748b',
  });
  return button;
}

function createControl(panel, inputs, policy, labelText, type, key) {
  const label = document.createElement('label');
  Object.assign(label.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '14px',
    marginTop: '11px',
    color: '#e5e7eb',
  });
  const caption = document.createElement('span');
  caption.textContent = labelText;
  caption.style.color = '#e5e7eb';
  let input;
  if (type === 'select') {
    input = document.createElement('select');
    for (const [value, optionLabel] of [
      ['BRANCH_AND_BORE', 'Branch + bore'],
      ['CANONICAL_BRANCH', 'Canonical branch'],
      ['EXACT_BRANCH', 'Exact branch'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = optionLabel;
      input.appendChild(option);
    }
    input.value = policy.ratingFillScope;
  } else {
    input = document.createElement('input');
    input.type = type;
    if (type === 'number') {
      input.min = key === 'safe' ? '50' : '1';
      input.max = key === 'safe' ? '100' : '99';
      input.value = String(Math.round((key === 'safe' ? policy.safeThreshold : policy.reviewThreshold) * 100));
    } else {
      input.checked = Boolean({
        interpolation: policy.allowInterpolation,
        extrapolation: policy.allowExtrapolation,
        odd: policy.allowOddFactor,
        conflict: policy.blockDtxrConflicts,
      }[key]);
    }
  }
  if (type !== 'checkbox') {
    Object.assign(input.style, {
      width: '170px',
      background: '#0b1320',
      color: '#f8fafc',
      border: '1px solid #64748b',
      borderRadius: '5px',
      padding: '7px',
    });
  } else {
    Object.assign(input.style, { width: '18px', height: '18px', accentColor: '#3b82f6' });
  }
  inputs[key] = input;
  label.append(caption, input);
  panel.appendChild(label);
}

export function openRigidSmartFillPolicyModal({ dialog, opener } = {}) {
  document.querySelector('[data-rigid-smart-policy], [data-rigid-smart-policy-modal]')?.remove();
  const policy = readPolicy();
  const overlay = document.createElement('div');
  overlay.dataset.rigidSmartPolicyModal = 'true';
  overlay.setAttribute('role', 'presentation');
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483646',
    display: 'grid',
    placeItems: 'center',
    padding: '20px',
    background: 'rgba(2,6,23,.82)',
    backdropFilter: 'blur(3px)',
  });

  const panel = document.createElement('section');
  panel.dataset.rigidSmartPolicy = 'true';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Smart-fill policy');
  panel.tabIndex = -1;
  Object.assign(panel.style, {
    position: 'relative',
    zIndex: '2147483647',
    width: 'min(440px, calc(100vw - 32px))',
    maxHeight: 'calc(100vh - 40px)',
    overflow: 'auto',
    padding: '18px',
    borderRadius: '10px',
    background: '#111827',
    border: '1px solid #64748b',
    boxShadow: '0 24px 80px rgba(0,0,0,.72)',
    color: '#f8fafc',
    fontSize: '13px',
  });

  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '14px',
  });
  const title = document.createElement('strong');
  title.textContent = 'Smart-fill policy';
  Object.assign(title.style, { color: '#ffffff', fontSize: '16px' });
  const closeX = modalButton('×');
  Object.assign(closeX.style, { minWidth: '34px', padding: '5px 9px', fontSize: '18px' });
  header.append(title, closeX);
  panel.appendChild(header);

  const inputs = {};
  for (const control of [
    ['Rating fill scope', 'select', 'scope'],
    ['Safe threshold (%)', 'number', 'safe'],
    ['Review threshold (%)', 'number', 'review'],
    ['Allow interpolation', 'checkbox', 'interpolation'],
    ['Allow extrapolation', 'checkbox', 'extrapolation'],
    ['Allow odd factors', 'checkbox', 'odd'],
    ['Block DTXR conflicts', 'checkbox', 'conflict'],
  ]) createControl(panel, inputs, policy, ...control);

  const error = document.createElement('div');
  Object.assign(error.style, {
    minHeight: '18px',
    marginTop: '10px',
    color: '#fecaca',
    fontSize: '12px',
  });
  panel.appendChild(error);
  const footer = document.createElement('div');
  Object.assign(footer.style, {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '9px',
    marginTop: '14px',
    paddingTop: '14px',
    borderTop: '1px solid #334155',
  });
  const cancel = modalButton('Cancel');
  const save = modalButton('Save policy', true);
  footer.append(cancel, save);
  panel.appendChild(footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.remove();
    opener?.focus?.();
  };
  closeX.addEventListener('click', close);
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  save.addEventListener('click', () => {
    const safeThreshold = Number(inputs.safe.value) / 100;
    const reviewThreshold = Number(inputs.review.value) / 100;
    if (!Number.isFinite(safeThreshold)
      || !Number.isFinite(reviewThreshold)
      || safeThreshold < reviewThreshold) {
      error.textContent = 'Safe threshold must be greater than or equal to Review threshold.';
      return;
    }
    writePolicy({
      ...policy,
      ratingFillScope: inputs.scope.value,
      safeThreshold,
      reviewThreshold,
      allowInterpolation: inputs.interpolation.checked,
      allowExtrapolation: inputs.extrapolation.checked,
      allowOddFactor: inputs.odd.checked,
      blockDtxrConflicts: inputs.conflict.checked,
    });
    close();
    dialog?.querySelector?.('button[title="Analyze rigid-weight rows"], button[aria-label="Analyze rigid-weight rows"]')?.click();
  });
  panel.focus();
}
