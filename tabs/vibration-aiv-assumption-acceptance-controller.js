import { createAivAssumptionAcceptance } from './vibration-aiv-assumption-acceptance.js';

function openAssumptionReview(container) {
  const disclosure = [...(container?.querySelectorAll?.('[data-aiv-disclosure-key]') ?? [])]
    .find((element) => element.dataset?.aivDisclosureKey === 'benchmark-assumptions');
  if (disclosure) disclosure.open = true;
  container?.querySelector?.('.aivq-assumption-card')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
}

export function createAivAssumptionAcceptanceController({ state, render, container }) {
  function accept() {
    const acceptance = createAivAssumptionAcceptance(state.assumptionResolution);
    if (!acceptance) return false;
    state.assumptionAcceptance = acceptance;
    state.error = null;
    render();
    return true;
  }

  function handleAction(action) {
    if (action === 'review-assumptions') {
      openAssumptionReview(container);
      return true;
    }
    if (action === 'accept-assumptions') return accept();
    return false;
  }

  return Object.freeze({ handleAction });
}
