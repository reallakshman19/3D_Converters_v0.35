(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const tabs = [...document.querySelectorAll('[data-workflow-target]')];
  const panels = [...document.querySelectorAll('[data-workflow-panel]')];
  const statusEls = new Map(
    [...document.querySelectorAll('[data-workflow-status]')].map((el) => [el.dataset.workflowStatus, el])
  );
  const stageTitles = {
    design: 'Design Basis',
    static: 'Static Wall',
    cycles: 'Pressure Cycles',
    kd: 'KD Qualification',
    envelope: 'Class Envelope',
  };

  function nonBlank(id) {
    return Boolean((byId(id)?.value || '').trim());
  }

  function finitePositive(id) {
    const value = Number(byId(id)?.value);
    return Number.isFinite(value) && value > 0;
  }

  function year(value) {
    const match = String(value || '').match(/\b(19|20)\d{2}\b/);
    return match ? match[0] : '';
  }

  function setStatus(key, state, label) {
    const el = statusEls.get(key);
    if (!el) return;
    el.className = `workflow-status ${state}`;
    el.textContent = label;
  }

  function railState(id, state, label) {
    const el = byId(id);
    if (!el) return;
    el.textContent = label;
    el.dataset.state = state;
    el.style.color =
      state === 'complete' ? '#274e13' :
      state === 'special' ? '#7a2e16' :
      state === 'pending' ? '#765800' : '#59636d';
  }

  function stageDesign() {
    const engineering =
      finitePositive('diameter') &&
      finitePositive('designPressure') &&
      finitePositive('allowableStress') &&
      Number(byId('ci')?.value) >= 0 &&
      Number(byId('co')?.value) >= 0 &&
      Number(byId('tolerance')?.value) >= 0 &&
      nonBlank('candidateWalls');

    const evidence =
      nonBlank('viii3Edition') &&
      nonBlank('materialSpec') &&
      nonBlank('materialGrade') &&
      nonBlank('productSpec') &&
      nonBlank('toleranceSource');

    if (engineering && evidence) return ['complete', 'Complete'];
    if (engineering) return ['pending', 'Evidence pending'];
    return ['pending', 'Pending'];
  }

  function stageStatic() {
    const rows = [...document.querySelectorAll('#staticBody tr')];
    if (!rows.length) return ['pending', 'Pending'];
    const passes = rows.filter((row) => row.querySelector('.badge.good')).length;
    return passes > 0 ? ['complete', `${passes} pass`] : ['special', 'Blocked'];
  }

  function cycleRowsValid() {
    const rows = [...document.querySelectorAll('#cycleBody tr')];
    if (!rows.length) return false;
    return rows.every((row) => {
      const pmin = Number(row.querySelector('.cycle-pmin')?.value);
      const pmax = Number(row.querySelector('.cycle-pmax')?.value);
      const tmin = Number(row.querySelector('.cycle-tmin')?.value);
      const tmax = Number(row.querySelector('.cycle-tmax')?.value);
      const syt = Number(row.querySelector('.cycle-syt')?.value);
      const n = Number(row.querySelector('.cycle-n')?.value);
      return [pmin,pmax,tmin,tmax,syt,n].every(Number.isFinite) &&
        pmin >= 0 && pmax >= pmin && tmax >= tmin && syt > 0 && n > 0;
    });
  }

  function stageCycles() {
    const rows = [...document.querySelectorAll('#cycleBody tr')];
    if (!rows.length) return ['pending', 'Pending'];
    return cycleRowsValid()
      ? ['complete', `${rows.length} block${rows.length === 1 ? '' : 's'}`]
      : ['pending', 'Incomplete'];
  }

  function kd2State() {
    if (!nonBlank('kd2Edition')) return ['blocked', 'Edition missing'];
    const route = byId('kd2AnalysisMethod')?.value;
    if (route === 'unassessed') return ['blocked', 'Route pending'];
    if (route === 'inelastic' || route === 'special') return ['special', 'Special route'];
    if (byId('kd2StressModel')?.value !== 'pressure-analytic') return ['special', 'External model'];
    if (byId('kd2Geometry')?.value !== 'uniform') return ['special', 'Local geometry'];
    if (!nonBlank('kd2LimitCalcId')) return ['blocked', 'Limit check pending'];
    if (!byId('kd2Approved')?.checked) return ['blocked', 'Approval pending'];
    return ['complete', 'Approved'];
  }

  function kd3SourceState() {
    if (!nonBlank('viii3Edition')) return ['blocked', 'Project edition missing'];
    if (!nonBlank('kd3SourceEdition')) return ['blocked', 'Source edition missing'];
    if (!byId('kd3SourceConfirmed')?.checked) return ['blocked', 'Source verification pending'];
    const projectYear = year(byId('viii3Edition')?.value);
    const sourceYear = year(byId('kd3SourceEdition')?.value);
    if (projectYear && sourceYear && projectYear !== sourceYear) {
      return ['special', `Edition mismatch ${sourceYear}/${projectYear}`];
    }
    if (!byId('kd3CompatibilityConfirmed')?.checked) return ['blocked', 'Compatibility review pending'];
    return ['complete', 'Source verified'];
  }

  function seqState() {
    const mode = byId('seqMode')?.value || 'manual';
    if (mode === 'manual') return ['complete', 'Manual Seq'];
    const source = kd3SourceState();
    if (source[0] !== 'complete') return source;
    if (!nonBlank('kdRoute')) return ['blocked', 'KD-312 route missing'];
    if (!nonBlank('seqRouteSourceRef')) return ['blocked', 'Seq source missing'];
    if (!byId('seqRouteApproved')?.checked) return ['blocked', 'Seq route approval pending'];
    if (mode === 'mean-embedded') return ['complete', 'Auto Seq ready'];
    if (mode === 'explicit-mean') {
      if (byId('fatigueCurveMode')?.value !== 'curve') return ['blocked', 'Curve mode required'];
      if (!finitePositive('seqReferenceCycles')) return ['blocked', 'Nref missing'];
      const beta = Number(byId('seqBeta')?.value);
      const limit = Number(byId('seqMeanTermLimit')?.value);
      if (!(Number.isFinite(beta) && beta >= 0)) return ['blocked', 'Beta missing'];
      if (!(Number.isFinite(limit) && limit >= 0 && limit < 1)) return ['blocked', 'Term limit invalid'];
      const box = byId('seqStatusBox');
      if (box?.classList.contains('error')) return ['blocked', 'Seq route blocked'];
      if (box?.classList.contains('warning')) return ['special', 'Seq route review'];
      return ['complete', 'Auto Seq ready'];
    }
    return ['blocked', 'Unsupported Seq route'];
  }

  function curveState() {
    const mode = byId('fatigueCurveMode')?.value;
    if (mode !== 'curve') return ['complete', 'Manual Ni'];
    if (!nonBlank('fatigueCurveId')) return ['blocked', 'Curve ID missing'];
    if (!nonBlank('fatigueCurveSourceRef')) return ['blocked', 'Curve source missing'];
    if (!byId('fatigueInterpolationApproved')?.checked) return ['blocked', 'Interpolation unapproved'];
    if (!byId('fatigueCurveApproved')?.checked) return ['blocked', 'Curve data unapproved'];
    if (!nonBlank('fatigueCurveData')) return ['blocked', 'Curve points missing'];

    const box = byId('curveStatusBox');
    if (box?.classList.contains('error')) return ['blocked', 'Curve data invalid'];
    if (box?.classList.contains('warning')) return ['special', 'Curve review'];
    return ['complete', 'Curve ready'];
  }

  function kdRowsState() {
    const rows = [...document.querySelectorAll('#fatigueBody tr')];
    if (!rows.length) return ['blocked', 'No results'];
    const complete = rows.every((row) => {
      const seq = Number(row.querySelector('input[id^="seq-"]')?.value);
      const ni = Number(row.querySelector('input[id^="ni-"]')?.value);
      const source = (row.querySelector('input[id^="source-"]')?.value || '').trim();
      const approved = row.querySelector('input[id^="approved-"]')?.checked;
      return seq > 0 && ni > 0 && source && approved;
    });
    return complete ? ['complete', 'Rows approved'] : ['blocked', 'Seq / Ni pending'];
  }

  function fractureState() {
    const status = byId('fractureStatus')?.value;
    if (status === 'special') return ['special', 'Special route'];
    if (!status || status === 'unassessed') return ['blocked', 'Unassessed'];
    if (!nonBlank('fractureEvidence')) return ['blocked', 'Evidence missing'];
    return ['complete', status === 'kd4-approved' ? 'KD-4 approved' : 'Cleared'];
  }

  function stageKd() {
    const states = [kd2State(), kd3SourceState(), seqState(), curveState(), kdRowsState(), fractureState()];
    if (states.some(([state]) => state === 'special')) return ['special', 'Special route'];
    if (states.every(([state]) => state === 'complete')) return ['complete', 'Complete'];
    return ['blocked', 'Blocked'];
  }

  function stageEnvelope() {
    const rows = [...document.querySelectorAll('#summaryBody tr')];
    if (!rows.length) return ['blocked', 'Blocked'];
    const text = rows.map((row) => row.textContent || '').join(' ');
    if (text.includes('Eligible for class-release review')) return ['complete', 'Review ready'];
    if (text.includes('Static fail') || text.includes('Cumulative fatigue usage > 1.0')) return ['special', 'Failed'];
    return ['blocked', 'Blocked'];
  }

  function currentContext() {
    const D = byId('diameter')?.value || '—';
    const walls = (byId('candidateWalls')?.value || '').split(',').map((v) => v.trim()).filter(Boolean);
    const cycles = document.querySelectorAll('#cycleBody tr').length;
    const seqMode = byId('seqMode')?.value === 'manual' ? 'manual Seq' : 'auto Seq';
    const niMode = byId('fatigueCurveMode')?.value === 'curve' ? 'curve Ni' : 'manual Ni';
    return `D ${D} mm · ${walls.length} wall${walls.length === 1 ? '' : 's'} · ${cycles} cycle block${cycles === 1 ? '' : 's'} · ${seqMode} · ${niMode}`;
  }

  function evidenceState(id, complete, good = 'Complete', bad = 'Missing') {
    const el = byId(id);
    if (!el) return;
    el.textContent = complete ? good : bad;
    el.className = complete ? 'evidence-ok' : '';
  }

  function blockers() {
    const items = [];

    if (!nonBlank('viii3Edition')) items.push('Confirm project BPVC VIII-3 edition / addenda.');
    if (!(nonBlank('materialSpec') && nonBlank('materialGrade'))) items.push('Complete material specification / grade identity.');
    if (!(nonBlank('productSpec') && nonBlank('toleranceSource'))) items.push('Complete product specification and dimensional tolerance source.');

    const k2 = kd2State();
    if (k2[0] !== 'complete') items.push(`KD-2: ${k2[1]}.`);

    const source = kd3SourceState();
    if (source[0] !== 'complete') items.push(`KD-3 source: ${source[1]}.`);

    const seq = seqState();
    if (seq[0] !== 'complete') items.push(`Seq route: ${seq[1]}.`);

    const curve = curveState();
    if (curve[0] !== 'complete') items.push(`Fatigue curve: ${curve[1]}.`);

    const rows = kdRowsState();
    if (rows[0] !== 'complete') items.push(`KD-3 rows: ${rows[1]}.`);

    const fm = fractureState();
    if (fm[0] !== 'complete') items.push(`Fracture / KD-4 gate: ${fm[1]}.`);

    const staticState = stageStatic();
    if (staticState[0] === 'special') items.push('No candidate wall currently passes the static pressure gate.');

    const inelastic = [...document.querySelectorAll('#fatigueBody .badge.warn')].length;
    if (inelastic) items.push(`${inelastic} wall × cycle case(s) require an inelastic/special route.`);

    return items;
  }

  function updateReviewUi() {
    const states = {
      design: stageDesign(),
      static: stageStatic(),
      cycles: stageCycles(),
      kd: stageKd(),
      envelope: stageEnvelope(),
    };
    Object.entries(states).forEach(([key,[state,label]]) => setStatus(key,state,label));

    const k2 = kd2State();
    const source = kd3SourceState();
    const seq = seqState();
    const curve = curveState();
    const fm = fractureState();

    const kd2Chip = byId('kd2StatusChip');
    if (kd2Chip) {
      kd2Chip.className = `status-chip ${k2[0]}`;
      kd2Chip.textContent = k2[1];
    }
    const kd3Chip = byId('kd3StatusChip');
    if (kd3Chip) {
      const combined = source[0] !== 'complete' ? source : seq[0] !== 'complete' ? seq : curve;
      kd3Chip.className = `status-chip ${combined[0]}`;
      kd3Chip.textContent = combined[1];
    }
    const fmChip = byId('fractureStatusChip');
    if (fmChip) {
      fmChip.className = `status-chip ${fm[0]}`;
      fmChip.textContent = fm[1];
    }

    railState('rail-design', states.design[0], states.design[1]);
    railState('rail-static', states.static[0], states.static[1]);
    railState('rail-cycles', states.cycles[0], states.cycles[1]);
    railState('rail-kd2', k2[0], k2[1]);
    const kd3Combined = source[0] !== 'complete' ? source : seq[0] !== 'complete' ? seq : curve;
    railState('rail-kd3', kd3Combined[0], kd3Combined[1]);
    railState('rail-fracture', fm[0], fm[1]);

    evidenceState('evidence-viii3', nonBlank('viii3Edition'));
    evidenceState('evidence-material', nonBlank('materialSpec') && nonBlank('materialGrade') && nonBlank('productSpec') && nonBlank('toleranceSource'));
    evidenceState('evidence-kd3source', source[0] === 'complete', 'Verified', 'Missing');
    evidenceState(
      'evidence-kd3',
      nonBlank('kdRoute') &&
        seqState()[0] === 'complete' &&
        (byId('fatigueCurveMode')?.value === 'manual' ||
          (nonBlank('fatigueCurveId') && nonBlank('fatigueCurveSourceRef') && byId('fatigueCurveApproved')?.checked)),
      'Ready',
      'Missing'
    );

    const context = byId('railContext');
    if (context) context.textContent = currentContext();

    const blockersNow = blockers();
    const count = byId('blockerCount');
    if (count) count.textContent = String(blockersNow.length);

    const list = byId('blockingReasons');
    if (list) {
      list.innerHTML = blockersNow.length
        ? blockersNow.map((item) => `<li>${item}</li>`).join('')
        : '<li>No current class-release blockers.</li>';
    }
  }

  function activateStage(key, push = false) {
    panels.forEach((panel) => {
      const active = panel.dataset.workflowPanel === key;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });
    tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.workflowTarget === key));
    const title = byId('railStageTitle');
    if (title) title.textContent = stageTitles[key] || 'Qualification';
    if (push && history.replaceState) history.replaceState(null, '', `#${key}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    updateReviewUi();
  }

  tabs.forEach((tab) => tab.addEventListener('click', () => activateStage(tab.dataset.workflowTarget, true)));
  document.querySelectorAll('[data-go-to]').forEach((button) => {
    button.addEventListener('click', () => activateStage(button.dataset.goTo, true));
  });

  document.addEventListener('input', () => setTimeout(updateReviewUi, 0));
  document.addEventListener('change', () => setTimeout(updateReviewUi, 0));
  document.addEventListener('click', () => setTimeout(updateReviewUi, 0));

  ['staticBody','cycleBody','kd2Body','fatigueBody','summaryBody','seqStatusBox','curveStatusBox'].forEach((id) => {
    const target = byId(id);
    if (target) {
      new MutationObserver(() => updateReviewUi()).observe(target, {
        childList:true,
        subtree:true,
        characterData:true,
        attributes:true,
        attributeFilter:['class'],
      });
    }
  });

  const requested = location.hash.replace('#','');
  activateStage(stageTitles[requested] ? requested : 'design');
  setTimeout(updateReviewUi, 0);
})();
