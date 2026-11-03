import { AUTO_PIPE_CONNECTIVITY_PROFILE, scaledTolerance } from './profile.js';
import { distance, dot } from './vector.js';

function radiusMatch(left, right, profile) {
  const scale = Math.max(left.radiusMm, right.radiusMm);
  return Math.abs(left.radiusMm - right.radiusMm)
    <= scaledTolerance(profile.radiusAbsoluteMm, profile.radiusRatio, scale);
}

function candidate(left, right, profile) {
  return left.componentId !== right.componentId
    && distance(left.centreMm, right.centreMm) <= profile.centreAbsoluteMm
    && dot(left.normal, right.normal) <= -1 + profile.normalDotTolerance
    && radiusMatch(left, right, profile);
}

function portKey(port) {
  return `${port.componentId}:${port.portId}`;
}

export function derivePipeConnectivity(ports, profile = AUTO_PIPE_CONNECTIVITY_PROFILE) {
  const matches = new Map(ports.map((port) => [portKey(port), []]));
  for (let leftIndex = 0; leftIndex < ports.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ports.length; rightIndex += 1) {
      const left = ports[leftIndex], right = ports[rightIndex];
      if (!candidate(left, right, profile)) continue;
      matches.get(portKey(left)).push(right);
      matches.get(portKey(right)).push(left);
    }
  }
  for (const [key, values] of matches) {
    if (values.length > 1) throw new Error(`BLOCKED_AUTO_PIPE_CONNECTIVITY ambiguous matches for ${key}.`);
  }
  const links = [], seen = new Set();
  for (const port of ports) {
    const target = matches.get(portKey(port))[0];
    if (!target) continue;
    const endpoints = [portKey(port), portKey(target)].sort();
    const pairKey = endpoints.join('|');
    if (!seen.has(pairKey)) {
      seen.add(pairKey);
      links.push({ pairKey, endpoints });
    }
  }
  return links.sort((left, right) => left.pairKey < right.pairKey ? -1 : left.pairKey > right.pairKey ? 1 : 0);
}
