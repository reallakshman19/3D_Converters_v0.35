function text(value) {
  return String(value ?? '');
}

function numberOrNull(value) {
  if (value === '' || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function value(row, selector) {
  return row.querySelector(selector)?.value ?? '';
}

function setValue(row, selector, next) {
  const element = row.querySelector(selector);
  if (!element) return null;
  element.value = next == null ? '' : String(next);
  return element;
}

export function collectUserCalculatedKd3Evidence(doc = document) {
  return [...doc.querySelectorAll('#userKd3Body tr[data-user-kd3-key]')].map((row) => ({
    key: text(row.dataset.userKd3Key),
    userAlternatingStressIntensityMpa: numberOrNull(value(row, '.user-kd3-salt')),
    equivalentAlternatingStressMpa: numberOrNull(value(row, '.user-kd3-seq')),
    permissibleCycles: numberOrNull(value(row, '.user-kd3-N')),
    calculationBasis: {
      code: value(row, '.user-kd3-code').trim(),
      edition: value(row, '.user-kd3-edition').trim(),
      methodRef: value(row, '.user-kd3-method').trim(),
      calculationRef: value(row, '.user-kd3-calc-ref').trim(),
      calculatedBy: value(row, '.user-kd3-calculated-by').trim(),
      checkedBy: value(row, '.user-kd3-checked-by').trim(),
      checkedAt: value(row, '.user-kd3-checked-at').trim(),
    },
  }));
}

export function applyUserCalculatedKd3Evidence(items = [], doc = document) {
  if (!Array.isArray(items)) throw new TypeError('USER_CALCULATED_KD3 evidence must be an array.');
  const rows = new Map(
    [...doc.querySelectorAll('#userKd3Body tr[data-user-kd3-key]')]
      .map((row) => [text(row.dataset.userKd3Key), row]),
  );
  const changed = [];
  const missing = [];
  for (const item of items) {
    const key = text(item?.key);
    const row = rows.get(key);
    if (!row) {
      missing.push(key);
      continue;
    }
    const elements = [
      setValue(row, '.user-kd3-salt', item.userAlternatingStressIntensityMpa),
      setValue(row, '.user-kd3-seq', item.equivalentAlternatingStressMpa),
      setValue(row, '.user-kd3-N', item.permissibleCycles),
      setValue(row, '.user-kd3-code', item.calculationBasis?.code),
      setValue(row, '.user-kd3-edition', item.calculationBasis?.edition),
      setValue(row, '.user-kd3-method', item.calculationBasis?.methodRef),
      setValue(row, '.user-kd3-calc-ref', item.calculationBasis?.calculationRef),
      setValue(row, '.user-kd3-calculated-by', item.calculationBasis?.calculatedBy),
      setValue(row, '.user-kd3-checked-by', item.calculationBasis?.checkedBy),
      setValue(row, '.user-kd3-checked-at', item.calculationBasis?.checkedAt),
    ].filter(Boolean);
    changed.push(...elements);
  }
  for (const element of changed) element.dispatchEvent(new Event('input', { bubbles: true }));
  return { restored: items.length - missing.length, expected: items.length, missing };
}

export function userCalculatedKd3EvidenceReady(doc = document) {
  return Boolean(doc.querySelector('#userKd3Body tr[data-user-kd3-key]'));
}

globalThis.HpUserCalculatedKd3EvidenceBridge = Object.freeze({
  collect: collectUserCalculatedKd3Evidence,
  apply: applyUserCalculatedKd3Evidence,
  ready: userCalculatedKd3EvidenceReady,
});
