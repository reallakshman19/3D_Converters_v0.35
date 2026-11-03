export function compareText(left, right) {
  const a = String(left ?? ''), b = String(right ?? '');
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortedUnique(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))].sort(compareText);
}

function withoutNamespace(value) {
  return value.startsWith('Model::') ? value.slice('Model::'.length) : value;
}

export function sourceTokens(sourceObject) {
  return sortedUnique([sourceObject.displayName, sourceObject.domSourceName]
    .flatMap((value) => typeof value === 'string' && value ? [value, withoutNamespace(value)] : []));
}

export function benchmarkTokens(record) {
  return sortedUnique([record?.attributes?.NAME, record?.name]);
}

export function intersect(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value));
}

export function candidateComponents(left, right) {
  const leftEdges = left.map(() => new Set()), rightEdges = right.map(() => new Set());
  for (let i = 0; i < left.length; i += 1) for (let j = 0; j < right.length; j += 1) {
    if (!intersect(left[i].tokens, right[j].tokens).length) continue;
    leftEdges[i].add(j); rightEdges[j].add(i);
  }
  const seenLeft = new Set(), seenRight = new Set(), groups = [];
  for (let i = 0; i < left.length; i += 1) if (!seenLeft.has(i)) groups.push(walk(i, leftEdges, rightEdges, seenLeft, seenRight));
  for (let j = 0; j < right.length; j += 1) if (!seenRight.has(j)) groups.push({ left: [], right: [j] });
  return groups;
}

function walk(start, leftEdges, rightEdges, seenLeft, seenRight) {
  const left = [], right = [], queue = [['L', start]];
  while (queue.length) {
    const [side, index] = queue.shift();
    if (side === 'L') {
      if (seenLeft.has(index)) continue;
      seenLeft.add(index); left.push(index);
      for (const next of leftEdges[index]) queue.push(['R', next]);
    } else {
      if (seenRight.has(index)) continue;
      seenRight.add(index); right.push(index);
      for (const next of rightEdges[index]) queue.push(['L', next]);
    }
  }
  return { left, right };
}

export function groupState(group) {
  if (group.left.length === 1 && group.right.length === 1) return 'EXACT_ONE_TO_ONE';
  if (group.left.length && !group.right.length) return 'SOURCE_ONLY';
  if (!group.left.length && group.right.length) return 'BENCHMARK_ONLY';
  return 'AMBIGUOUS';
}

export function groupBy(values, keyOf) {
  const groups = new Map();
  for (const value of values) {
    const key = keyOf(value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  return groups;
}
