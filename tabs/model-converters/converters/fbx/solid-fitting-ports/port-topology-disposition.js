import { PORT_TOPOLOGY_DISPOSITION } from './constants.js';

function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function length(a) { return Math.sqrt(dot(a, a)); }

function twoPortDisposition(a, b, profile) {
  const antiParallel = dot(a.normal, b.normal) <= -1 + profile.coAxialDotTolerance;
  if (!antiParallel) return PORT_TOPOLOGY_DISPOSITION.BENT_TWO_PORT;
  const span = length(subtract(b.centreMm, a.centreMm));
  const radiusRatio = Math.abs(a.radiusMm - b.radiusMm) / Math.max(a.radiusMm, b.radiusMm);
  if (radiusRatio > profile.radiusTaperRatio) return PORT_TOPOLOGY_DISPOSITION.TAPERED_TWO_PORT;
  const meanRadius = (a.radiusMm + b.radiusMm) / 2;
  if (span / meanRadius < profile.shortSpanRadiusRatio) return PORT_TOPOLOGY_DISPOSITION.SHORT_TWO_PORT;
  return PORT_TOPOLOGY_DISPOSITION.STRAIGHT_TWO_PORT;
}

export function classifyPortTopology(admittedCandidates, profile) {
  const count = admittedCandidates.length;
  if (count < 2) return { disposition: PORT_TOPOLOGY_DISPOSITION.REJECTED, reason: 'ZERO_OR_ONE_PORT' };
  if (count > 3) return { disposition: PORT_TOPOLOGY_DISPOSITION.REJECTED, reason: 'FOUR_PLUS_PORT' };
  if (count === 3) return { disposition: PORT_TOPOLOGY_DISPOSITION.THREE_PORT };
  const [a, b] = admittedCandidates;
  return { disposition: twoPortDisposition(a, b, profile) };
}
