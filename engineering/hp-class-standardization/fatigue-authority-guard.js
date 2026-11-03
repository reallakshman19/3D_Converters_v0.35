(function (root) {
  'use strict';

  const POLICY = Object.freeze({
    calculationMode: 'USER_CALCULATED_KD3',
    nativeCoreKd3Qualified: false,
    canUseForDesignAuthority: false,
    codeCompliance: false,
    reason: 'CONTROLLED_KD320_FORMULATION_AND_CUSTODY_NOT_ESTABLISHED',
  });

  const NATIVE_SEQ_BLOCK = 'CORE KD-3 Seq is not qualified — supply externally calculated Seq and N';
  const NATIVE_CURVE_BLOCK = 'CORE fatigue-curve Ni evaluation is not authorized — supply permissible cycles N externally';

  function externalSeqGate(authority) {
    const mode = authority?.seqMode || 'manual';
    if (mode === 'manual') {
      return { ok: true, label: 'Manual licensed Seq', css: 'good', mode: 'manual', saRef: NaN, points: [] };
    }
    return { ok: false, label: NATIVE_SEQ_BLOCK, css: 'blocked', mode, saRef: NaN, points: [] };
  }

  function externalCurveGate(authority) {
    const mode = authority?.fatigueCurveMode || 'manual';
    if (mode === 'manual') return { ok: true, label: 'Manual Ni mode', css: 'good', points: [] };
    return { ok: false, label: NATIVE_CURVE_BLOCK, css: 'blocked', points: [] };
  }

  function blockedAutomaticSeq() {
    return {
      ok: false,
      seq: NaN,
      pair: '',
      basis: NATIVE_SEQ_BLOCK,
      pairs: [],
      saRef: NaN,
      canUseForDesignAuthority: false,
    };
  }

  function blockedCurveParser() {
    return { ok: false, points: [], error: NATIVE_CURVE_BLOCK, canUseForDesignAuthority: false };
  }

  function blockedFatigueLife() {
    return { ok: false, N: NaN, status: NATIVE_CURVE_BLOCK, canUseForDesignAuthority: false };
  }

  function blockedCurveStress() {
    return { ok: false, Sa: NaN, status: NATIVE_SEQ_BLOCK, canUseForDesignAuthority: false };
  }

  function installCalculationGuards() {
    root.seqGate = externalSeqGate;
    root.curveGate = externalCurveGate;
    root.calculateAutomaticSeq = blockedAutomaticSeq;
    root.parseFatigueCurvePoints = blockedCurveParser;
    root.interpolateFatigueLife = blockedFatigueLife;
    root.interpolateCurveStressAtCycles = blockedCurveStress;

    if (typeof root.wallStatus === 'function' && !root.wallStatus.__userKd3Guarded) {
      const original = root.wallStatus;
      const guarded = function guardedWallStatus(input, wall) {
        const status = original(input, wall);
        if (status?.label === 'Eligible for class-release review') {
          return {
            ...status,
            label: 'Review only — KD-3 design authority not established',
            css: 'blocked',
          };
        }
        return status;
      };
      guarded.__userKd3Guarded = true;
      root.wallStatus = guarded;
    }
  }

  function replaceSelectOptions() {
    const seqMode = document.getElementById('seqMode');
    if (seqMode) {
      seqMode.innerHTML = [
        '<option value="manual">User-calculated KD-3 — supply Seq and N</option>',
        '<option value="core-kd3" disabled>CORE KD-3 — not qualified</option>',
      ].join('');
      seqMode.value = 'manual';
      seqMode.dataset.authorityMode = POLICY.calculationMode;
    }

    const niMode = document.getElementById('fatigueCurveMode');
    if (niMode) {
      niMode.innerHTML = [
        '<option value="manual">User-supplied permissible cycles N</option>',
        '<option value="core-curve" disabled>CORE fatigue-curve evaluation — not qualified</option>',
      ].join('');
      niMode.value = 'manual';
      niMode.dataset.authorityMode = POLICY.calculationMode;
    }
  }

  function removeLegacyNativeInputs() {
    [
      'seqMeanBasis',
      'seqBeta',
      'seqReferenceCycles',
      'seqMeanTermLimit',
      'fatigueCurveSourceRef',
      'fatigueCurveData',
      'fatigueInterpolation',
      'fatigueInterpolationApproved',
      'fatigueCurveApproved',
    ].forEach((id) => {
      const element = document.getElementById(id);
      if (!element) return;
      const label = element.closest?.('label');
      if (label) label.remove();
      else element.remove();
    });
  }

  function enforceStatusText() {
    const workflowKd = document.querySelector('[data-workflow-status="kd"]');
    if (workflowKd && /complete/i.test(workflowKd.textContent || '')) {
      workflowKd.className = 'workflow-status blocked';
      workflowKd.textContent = 'Review only';
    }

    const kd3Chip = document.getElementById('kd3StatusChip');
    if (kd3Chip && /ready|complete|manual ni|auto/i.test(kd3Chip.textContent || '')) {
      kd3Chip.className = 'status-chip blocked';
      kd3Chip.textContent = 'External KD-3 · not authorized';
    }

    const railKd3 = document.getElementById('rail-kd3');
    if (railKd3 && /ready|complete|manual ni|manual seq|auto/i.test(railKd3.textContent || '')) {
      railKd3.textContent = 'External KD-3 · not authorized';
      railKd3.dataset.state = 'blocked';
      railKd3.style.color = '#59636d';
    }

    const summary = document.getElementById('summaryBody');
    summary?.querySelectorAll('.badge').forEach((badge) => {
      if (badge.textContent?.includes('Eligible for class-release review')) {
        badge.textContent = 'Review only — KD-3 design authority not established';
        badge.className = 'badge blocked';
      }
    });

    const blockerList = document.getElementById('blockingReasons');
    if (blockerList && !blockerList.querySelector('[data-native-kd3-blocker="true"]')) {
      const item = document.createElement('li');
      item.dataset.nativeKd3Blocker = 'true';
      item.textContent = 'Native CORE KD-3 is not qualified. USER_CALCULATED_KD3 remains review-only and cannot establish Code/design authority.';
      blockerList.appendChild(item);
      const count = document.getElementById('blockerCount');
      if (count) count.textContent = String(blockerList.children.length);
    }
  }

  function loadCanonicalProductSurface() {
    if (!document.querySelector('link[data-user-kd3-product-style="true"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'user-calculated-fatigue-product.css';
      link.dataset.userKd3ProductStyle = 'true';
      document.head.appendChild(link);
    }
    if (root.__hpUserKd3ProductLoadStarted) return;
    root.__hpUserKd3ProductLoadStarted = true;
    import('./user-calculated-fatigue-product.js').catch((error) => {
      root.__hpUserKd3ProductLoadError = String(error?.message || error);
      const box = document.getElementById('seqStatusBox');
      if (box) {
        box.className = 'notice error';
        box.textContent = `USER_CALCULATED_KD3 product integration failed to load: ${root.__hpUserKd3ProductLoadError}`;
      }
    });
  }

  function enforce() {
    installCalculationGuards();
    replaceSelectOptions();
    removeLegacyNativeInputs();
    enforceStatusText();
    loadCanonicalProductSurface();
  }

  function observe() {
    const targets = [
      document.getElementById('summaryBody'),
      document.getElementById('blockingReasons'),
      document.getElementById('kd3StatusChip'),
      document.querySelector('[data-workflow-status="kd"]'),
      document.getElementById('rail-kd3'),
    ].filter(Boolean);
    const observer = new MutationObserver(() => enforceStatusText());
    targets.forEach((target) => observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    }));
    return observer;
  }

  root.HpFatigueAuthorityGuard = Object.freeze({
    POLICY,
    enforce,
    runtimeHardBlocks: Object.freeze({
      calculateAutomaticSeq: true,
      parseFatigueCurvePoints: true,
      interpolateFatigueLife: true,
      interpolateCurveStressAtCycles: true,
    }),
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enforce();
      observe();
    }, { once: true });
  } else {
    enforce();
    observe();
  }
})(globalThis);
