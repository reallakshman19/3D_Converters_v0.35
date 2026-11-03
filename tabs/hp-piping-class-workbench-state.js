function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function tokens(path) {
  return String(path).split('.').filter(Boolean).map((part) => /^\d+$/.test(part) ? Number(part) : part);
}

function valueAt(target, path) {
  return tokens(path).reduce((cursor, token) => cursor == null ? undefined : cursor[token], target);
}

function setPath(target, path, value) {
  const parts = tokens(path);
  if (!parts.length) return;
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const key = parts[index];
    const next = parts[index + 1];
    if (cursor[key] == null || typeof cursor[key] !== 'object') cursor[key] = typeof next === 'number' ? [] : {};
    cursor = cursor[key];
  }
  const last = parts.at(-1);
  if (value === undefined) delete cursor[last];
  else cursor[last] = value;
}

function externalRows(project) {
  return (project.fatigueEvidence ?? []).flatMap((pkg) => pkg.externalResults ?? []);
}

export function applyHpPipingClassRelationalEdit(project, path, value) {
  const draft = project;
  const oldValue = valueAt(draft, path);
  const productMatch = String(path).match(/^products\.(\d+)\.productId$/);
  const stateMatch = String(path).match(/^transient\.states\.(\d+)\.stateId$/);
  const cycleMatch = String(path).match(/^transient\.transitions\.(\d+)\.cycleId$/);
  const transitionStateMatch = String(path).match(/^transient\.transitions\.(\d+)\.(fromStateId|toStateId)$/);

  setPath(draft, path, value);

  if (path === 'transient.spectrum.spectrumId') {
    (draft.transient?.states ?? []).forEach((row) => { row.spectrumId = value ?? ''; });
    (draft.transient?.transitions ?? []).forEach((row) => { row.spectrumId = value ?? ''; });
  }

  if (productMatch && oldValue !== value) {
    (draft.fatigueEvidence ?? []).forEach((pkg) => {
      if (pkg.productId === oldValue) pkg.productId = value ?? '';
    });
  }

  if (stateMatch && oldValue !== value) {
    (draft.transient?.transitions ?? []).forEach((row) => {
      if (row.fromStateId === oldValue) row.fromStateId = value ?? '';
      if (row.toStateId === oldValue) row.toStateId = value ?? '';
    });
    externalRows(draft).forEach((row) => {
      if (row.fromStateId === oldValue) row.fromStateId = value ?? '';
      if (row.toStateId === oldValue) row.toStateId = value ?? '';
    });
  }

  if (cycleMatch && oldValue !== value) {
    externalRows(draft).forEach((row) => {
      if (row.cycleId === oldValue) row.cycleId = value ?? '';
    });
  }

  if (transitionStateMatch) {
    const index = Number(transitionStateMatch[1]);
    const field = transitionStateMatch[2];
    const cycleId = draft.transient?.transitions?.[index]?.cycleId;
    if (cycleId) externalRows(draft).forEach((row) => {
      if (row.cycleId === cycleId) row[field] = value ?? '';
    });
  }

  return draft;
}

export function cascadeRemoveHpPipingClassProduct(project, index) {
  const product = project.products?.[index];
  if (!product) return project;
  project.products.splice(index, 1);
  project.fatigueEvidence = (project.fatigueEvidence ?? []).filter((pkg) => pkg.productId !== product.productId);
  return project;
}

export function cascadeRemoveHpPipingClassTransition(project, index) {
  const transition = project.transient?.transitions?.[index];
  if (!transition) return project;
  project.transient.transitions.splice(index, 1);
  (project.fatigueEvidence ?? []).forEach((pkg) => {
    pkg.externalResults = (pkg.externalResults ?? []).filter((row) => row.cycleId !== transition.cycleId);
  });
  return project;
}

export function cascadeRemoveHpPipingClassState(project, index) {
  const state = project.transient?.states?.[index];
  if (!state) return project;
  const removedCycleIds = new Set((project.transient?.transitions ?? [])
    .filter((row) => row.fromStateId === state.stateId || row.toStateId === state.stateId)
    .map((row) => row.cycleId));
  project.transient.states.splice(index, 1);
  project.transient.transitions = (project.transient?.transitions ?? [])
    .filter((row) => !removedCycleIds.has(row.cycleId));
  (project.fatigueEvidence ?? []).forEach((pkg) => {
    pkg.externalResults = (pkg.externalResults ?? []).filter((row) => !removedCycleIds.has(row.cycleId));
  });
  return project;
}

export function nextUncoveredTransition(project, evidenceIndex) {
  const pkg = project.fatigueEvidence?.[evidenceIndex];
  if (!pkg) return null;
  const used = new Set((pkg.externalResults ?? []).map((row) => row.cycleId));
  return (project.transient?.transitions ?? []).find((row) => row.cycleId && !used.has(row.cycleId)) ?? null;
}

export function createHpPipingClassExternalResultShell(project, evidenceIndex) {
  const transition = nextUncoveredTransition(project, evidenceIndex);
  if (!transition) return null;
  return {
    cycleId: transition.cycleId,
    fromStateId: transition.fromStateId || '',
    toStateId: transition.toStateId || '',
    locationId: '',
    calculationBasis: {},
  };
}

export function cloneHpPipingClassWorkbenchState(value) {
  return clone(value);
}
