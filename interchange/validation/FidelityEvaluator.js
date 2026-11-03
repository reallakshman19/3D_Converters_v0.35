import { FidelityClass, worstFidelity } from '../canonical/FidelityClass.js';

export function summarizeProjectFidelity(project) {
  const items = [
    ...(project.segments || []),
    ...(project.components || []),
    ...(project.supports || []),
    ...(project.annotations || []),
  ];
  return items.reduce((acc, item) => {
    const f = item.fidelity || FidelityClass.NOT_EXPORTABLE;
    acc.counts[f] = (acc.counts[f] || 0) + 1;
    acc.worst = worstFidelity(acc.worst, f);
    return acc;
  }, { counts: {}, worst: FidelityClass.LOSSLESS });
}
