(function () {
  'use strict';

  const Core = globalThis.HpAuthorityPackageCore;
  const byId = (id) => document.getElementById(id);
  const appFrame = () => byId('appFrame');

  const DESIGN_TEXT = [
    'b31Edition','viii3Edition','materialSpec','materialGrade','productSpec',
    'toleranceSource','evidencePackage','candidateWalls',
  ];
  const DESIGN_NUM = ['diameter','designPressure','allowableStress','ci','co','tolerance'];
  const AUTH_TEXT = [
    'kd2Edition','kd2AnalysisMethod','kd2StressModel','kd2Geometry','kd2Residual','kd2LimitCalcId',
    'kd3SourceEdition','kdRoute','seqMode','seqRouteSourceRef','seqMeanBasis',
    'fatigueCurveId','fatigueCurveMode','fatigueCurveSourceRef','fatigueCurveData',
    'fatigueInterpolation','fractureStatus','fractureEvidence',
  ];
  const AUTH_NUM = ['seqBeta','seqReferenceCycles','seqMeanTermLimit'];
  const AUTH_CHECK = [
    'kd2Approved','kd3SourceConfirmed','kd3CompatibilityConfirmed','seqRouteApproved',
    'fatigueInterpolationApproved','fatigueCurveApproved',
  ];

  function status(message, kind = 'info') {
    const box = byId('packageStatusBox');
    box.className = `notice ${kind}`;
    box.textContent = message;
  }

  function appDocument() {
    const frame = appFrame();
    try {
      const doc = frame?.contentDocument;
      if (!doc?.getElementById('diameter')) throw new Error('calculator DOM not ready');
      return doc;
    } catch (error) {
      throw new Error(`Calculator is not available through the same origin: ${error.message}`);
    }
  }

  function appWindow() {
    const win = appFrame()?.contentWindow;
    if (!win) throw new Error('Calculator window is not ready.');
    return win;
  }

  function kd3Bridge() {
    return appWindow().HpUserCalculatedKd3EvidenceBridge ?? null;
  }

  async function waitForKd3Bridge(doc, attempts = 50) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const bridge = kd3Bridge();
      if (bridge?.ready?.(doc)) return bridge;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return kd3Bridge();
  }

  function text(doc, id) {
    return doc.getElementById(id)?.value ?? '';
  }

  function numeric(doc, id) {
    const raw = doc.getElementById(id)?.value ?? '';
    if (String(raw).trim() === '') return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }

  function checked(doc, id) {
    return Boolean(doc.getElementById(id)?.checked);
  }

  function metadata() {
    return {
      packageId: byId('packageId').value.trim(),
      revision: byId('packageRevision').value.trim(),
      projectRef: byId('packageProjectRef').value.trim(),
      preparedBy: byId('packagePreparedBy').value.trim(),
      checkedBy: byId('packageCheckedBy').value.trim(),
      lifecycle: byId('packageLifecycle').value,
    };
  }

  function collectCycles(doc) {
    return [...doc.querySelectorAll('#cycleBody tr')].map((row) => {
      const num = (selector) => {
        const raw = row.querySelector(selector)?.value ?? '';
        if (String(raw).trim() === '') return null;
        const value = Number(raw);
        return Number.isFinite(value) ? value : null;
      };
      return {
        id: row.dataset.cycleId || '',
        name: row.querySelector('.cycle-name')?.value || '',
        pMin: num('.cycle-pmin'), pMax: num('.cycle-pmax'),
        tMin: num('.cycle-tmin'), tMax: num('.cycle-tmax'),
        syt: num('.cycle-syt'), n: num('.cycle-n'),
      };
    });
  }

  function collectInputs(doc) {
    const design = {};
    DESIGN_TEXT.forEach((id) => { design[id] = text(doc, id); });
    DESIGN_NUM.forEach((id) => { design[id] = numeric(doc, id); });
    const authority = {};
    AUTH_TEXT.forEach((id) => { authority[id] = text(doc, id); });
    AUTH_NUM.forEach((id) => { authority[id] = numeric(doc, id); });
    AUTH_CHECK.forEach((id) => { authority[id] = checked(doc, id); });
    return { design, authority, cycles: collectCycles(doc) };
  }

  function collectRowEvidence(doc) {
    return [...doc.querySelectorAll('#fatigueBody tr')].map((row) => {
      const seq = row.querySelector('input[id^="seq-"]');
      const ni = row.querySelector('input[id^="ni-"]');
      return {
        key: row.dataset.key || '',
        seq: seq?.value !== '' ? Number(seq.value) : null,
        ni: ni?.value !== '' ? Number(ni.value) : null,
        source: row.querySelector('input[id^="source-"]')?.value || '',
        approved: Boolean(row.querySelector('input[id^="approved-"]')?.checked),
        seqBasis: row.querySelector('[id^="seqbasis-"]')?.textContent?.trim() || '',
        niBasis: row.querySelector('[id^="nibasis-"]')?.textContent?.trim() || '',
      };
    });
  }

  function collectCanonicalKd3Evidence(doc) {
    const bridge = kd3Bridge();
    if (!bridge) {
      if (doc.getElementById('userKd3Surface')) throw new Error('USER_CALCULATED_KD3 evidence bridge is not ready.');
      return [];
    }
    return bridge.collect(doc);
  }

  function tableSnapshot(doc, selector) {
    return [...doc.querySelectorAll(`${selector} tr`)].map((row) =>
      [...row.cells].map((cell) => cell.textContent.trim())
    );
  }

  function collectSnapshot(doc) {
    return {
      capturedAt: new Date().toISOString(),
      metrics: {
        requiredWall: doc.getElementById('requiredWall')?.textContent || '',
        minimumWall: doc.getElementById('minimumWall')?.textContent || '',
        nominalRequired: doc.getElementById('nominalRequired')?.textContent || '',
      },
      staticRows: tableSnapshot(doc, '#staticBody'),
      fatigueRows: tableSnapshot(doc, '#fatigueBody'),
      userCalculatedKd3Rows: tableSnapshot(doc, '#userKd3Body'),
      summaryRows: tableSnapshot(doc, '#summaryBody'),
    };
  }

  function buildPackage(doc) {
    return Core.createPackage({
      metadata: metadata(),
      inputs: collectInputs(doc),
      rowEvidence: collectRowEvidence(doc),
      userCalculatedKd3Evidence: collectCanonicalKd3Evidence(doc),
      snapshot: collectSnapshot(doc),
    });
  }

  function downloadJson(pkg) {
    const blob = new Blob([`${JSON.stringify(pkg, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = Core.safeFilename(pkg.metadata.packageId, pkg.metadata.revision);
    link.click();
    URL.revokeObjectURL(url);
  }

  function setValue(doc, id, value) {
    const element = doc.getElementById(id);
    if (element) element.value = value == null ? '' : String(value);
  }

  function setChecked(doc, id, value) {
    const element = doc.getElementById(id);
    if (element) element.checked = Boolean(value);
  }

  function addCell(row, child) {
    const cell = row.insertCell();
    if (typeof child === 'string') cell.textContent = child;
    else if (child) cell.appendChild(child);
    return cell;
  }

  function cycleInput(doc, className, value, type = 'number') {
    const input = doc.createElement('input');
    input.className = `table-input ${className}`;
    input.type = type;
    if (type === 'number') input.step = 'any';
    input.value = value == null ? '' : String(value);
    return input;
  }

  function appendCycle(doc, cycle) {
    const row = doc.createElement('tr');
    row.dataset.cycleId = cycle.id;
    addCell(row, cycleInput(doc, 'cycle-name', cycle.name, 'text'));
    addCell(row, cycleInput(doc, 'cycle-pmin', cycle.pMin));
    addCell(row, cycleInput(doc, 'cycle-pmax', cycle.pMax));
    addCell(row, cycleInput(doc, 'cycle-tmin', cycle.tMin));
    addCell(row, cycleInput(doc, 'cycle-tmax', cycle.tMax));
    const avg = Number.isFinite(cycle.tMin) && Number.isFinite(cycle.tMax)
      ? ((cycle.tMin + cycle.tMax) / 2).toFixed(1) : '-';
    const avgCell = addCell(row, avg);
    avgCell.className = 'cycle-avg';
    addCell(row, cycleInput(doc, 'cycle-syt', cycle.syt));
    addCell(row, cycleInput(doc, 'cycle-n', cycle.n));
    const button = doc.createElement('button');
    button.type = 'button'; button.className = 'remove-cycle small-button'; button.textContent = 'Remove';
    const action = addCell(row, button); action.className = 'center';
    doc.getElementById('cycleBody').appendChild(row);
  }

  function applyInputs(doc, inputs) {
    DESIGN_TEXT.forEach((id) => setValue(doc, id, inputs.design[id]));
    DESIGN_NUM.forEach((id) => setValue(doc, id, inputs.design[id]));
    AUTH_TEXT.forEach((id) => setValue(doc, id, inputs.authority[id]));
    AUTH_NUM.forEach((id) => setValue(doc, id, inputs.authority[id]));
    AUTH_CHECK.forEach((id) => setChecked(doc, id, inputs.authority[id]));
    const body = doc.getElementById('cycleBody');
    body.innerHTML = '';
    inputs.cycles.forEach((cycle) => appendCycle(doc, cycle));
  }

  function runCalculator(doc) {
    const win = appWindow();
    if (typeof win.calculate === 'function') win.calculate();
    else doc.getElementById('calculateButton')?.click();
  }

  function restoreRowEvidence(doc, payload) {
    const rows = [...doc.querySelectorAll('#fatigueBody tr')];
    const byKey = new Map(rows.map((row) => [row.dataset.key, row]));
    const match = Core.matchRowEvidence(payload.rowEvidence, [...byKey.keys()]);
    match.matched.forEach((item) => {
      const row = byKey.get(item.key);
      const seq = row.querySelector('input[id^="seq-"]');
      const ni = row.querySelector('input[id^="ni-"]');
      if (payload.inputs.authority.seqMode === 'manual' && item.seq !== null && item.seq !== undefined && seq) seq.value = item.seq;
      if (payload.inputs.authority.fatigueCurveMode === 'manual' && item.ni !== null && item.ni !== undefined && ni) ni.value = item.ni;
      const source = row.querySelector('input[id^="source-"]');
      const approved = row.querySelector('input[id^="approved-"]');
      if (source) source.value = item.source || '';
      if (approved) approved.checked = Boolean(item.approved);
    });
    return { restored: match.matched.length, expected: payload.rowEvidence.length, missing: match.missing };
  }

  async function restoreCanonicalKd3Evidence(doc, payload) {
    if (!payload.userCalculatedKd3Evidence?.length) return { restored: 0, expected: 0, missing: [] };
    const bridge = await waitForKd3Bridge(doc);
    if (!bridge?.ready?.(doc)) {
      return {
        restored: 0,
        expected: payload.userCalculatedKd3Evidence.length,
        missing: payload.userCalculatedKd3Evidence.map((item) => item.key),
      };
    }
    return bridge.apply(payload.userCalculatedKd3Evidence, doc);
  }

  function applyMetadata(pkg) {
    byId('packageId').value = pkg.metadata.packageId || '';
    byId('packageRevision').value = pkg.metadata.revision || '';
    byId('packageProjectRef').value = pkg.metadata.projectRef || '';
    byId('packagePreparedBy').value = pkg.metadata.preparedBy || '';
    byId('packageCheckedBy').value = pkg.metadata.checkedBy || '';
    byId('packageLifecycle').value = pkg.metadata.lifecycle || 'draft';
  }

  async function applyPackage(pkg) {
    const imported = Core.importPayload(pkg);
    if (!imported.ok) throw new Error(imported.errors.join(' '));
    const payload = imported.payload;
    const doc = appDocument();
    applyMetadata({ metadata: payload.metadata });
    applyInputs(doc, payload.inputs);
    runCalculator(doc);
    const legacy = restoreRowEvidence(doc, payload);
    const canonical = await restoreCanonicalKd3Evidence(doc, payload);
    if (canonical.expected !== canonical.restored) {
      throw new Error(`USER_CALCULATED_KD3 package restore incomplete: restored ${canonical.restored}/${canonical.expected}; missing ${canonical.missing.join(', ') || '(unknown keys)'}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { legacy, canonical };
  }

  async function importFile(file) {
    const raw = await file.text();
    let pkg;
    try { pkg = JSON.parse(raw); }
    catch (error) { throw new Error(`Invalid JSON: ${error.message}`); }
    return { pkg, restored: await applyPackage(pkg) };
  }

  function exportCurrent() {
    try {
      const doc = appDocument();
      const pkg = buildPackage(doc);
      const validation = Core.validatePackage(pkg);
      if (!validation.ok) throw new Error(validation.errors.join(' '));
      downloadJson(pkg);
      status(`Exported ${Core.safeFilename(pkg.metadata.packageId, pkg.metadata.revision)} with ${pkg.userCalculatedKd3Evidence.length} canonical USER_CALCULATED_KD3 evidence row(s). Snapshot is audit-only.`);
    } catch (error) {
      status(error.message, 'error');
    }
  }

  async function importSelected() {
    const input = byId('packageFile');
    if (!input.files?.length) return;
    status('Validating package before calculator mutation…');
    try {
      const { pkg, restored } = await importFile(input.files[0]);
      status(`Imported ${pkg.metadata.packageId} rev ${pkg.metadata.revision}; recalculated; restored ${restored.canonical.restored}/${restored.canonical.expected} canonical USER_CALCULATED_KD3 row(s) and ${restored.legacy.restored}/${restored.legacy.expected} legacy compatibility row(s).`);
    } catch (error) {
      status(`Import blocked: ${error.message}`, 'error');
    } finally {
      input.value = '';
    }
  }

  byId('exportPackageButton').addEventListener('click', exportCurrent);
  byId('importPackageButton').addEventListener('click', () => byId('packageFile').click());
  byId('packageFile').addEventListener('change', importSelected);
  appFrame().addEventListener('load', () => status('Calculator ready. Package import validates sources before changing engineering fields; canonical USER_CALCULATED_KD3 evidence is preserved when the product bridge is ready.'));
})();