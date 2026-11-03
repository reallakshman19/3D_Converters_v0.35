const POSITIVE = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const quantile = (values, q) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0];
  const index = (sorted.length - 1) * q;
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo);
};

function readTypeDesc(row) {
  return String(row?.TypeDesc ?? row?.typeDesc ?? row?.valveType ?? '').trim();
}

function readSize(row) {
  return POSITIVE(row?.NS ?? row?.ns) ?? POSITIVE(row?.DN ?? row?.dn);
}

function readRating(row) {
  return POSITIVE(row?.Rating ?? row?.rating);
}

function readTarget(row, target) {
  if (target === 'BW KG') return POSITIVE(row?.['BW KG'] ?? row?.bwKg ?? row?.bwWeightKg);
  return POSITIVE(row?.['RF/RTJ KG'] ?? row?.rfRtjKg ?? row?.rfWeightKg);
}

export function buildEmpiricalWeightCatalog(masterRows = []) {
  const buckets = new Map();
  const dnNsBuckets = new Map();

  for (const row of Array.isArray(masterRows) ? masterRows : []) {
    const typeDesc = readTypeDesc(row);
    const size = readSize(row);
    const rating = readRating(row);
    if (!typeDesc || !size || !rating) continue;

    const ns = POSITIVE(row?.NS ?? row?.ns);
    const dn = POSITIVE(row?.DN ?? row?.dn);
    if (ns && dn) {
      if (!dnNsBuckets.has(dn)) dnNsBuckets.set(dn, []);
      dnNsBuckets.get(dn).push(ns);
    }

    for (const target of ['RF/RTJ KG', 'BW KG']) {
      const weight = readTarget(row, target);
      if (!weight) continue;
      const key = `${target}|||${typeDesc}|||${size}|||${rating}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(weight);
    }
  }

  const byTarget = new Map();
  for (const [key, values] of buckets) {
    const [target, typeDesc, sizeText, ratingText] = key.split('|||');
    if (!byTarget.has(target)) byTarget.set(target, new Map());
    const byType = byTarget.get(target);
    if (!byType.has(typeDesc)) byType.set(typeDesc, new Map());
    const matrix = byType.get(typeDesc);
    const size = Number(sizeText);
    const rating = Number(ratingText);
    if (!matrix.has(size)) matrix.set(size, new Map());
    matrix.get(size).set(rating, median(values));
  }

  const dnToNs = new Map([...dnNsBuckets].map(([dn, values]) => [dn, median(values)]));
  return { byTarget, dnToNs };
}

function matrixFor(catalog, target, typeDesc) {
  return catalog?.byTarget?.get(target)?.get(typeDesc) ?? null;
}

function cell(matrix, size, rating) {
  return matrix?.get(size)?.get(rating) ?? null;
}

function sortedSizes(matrix) {
  return [...(matrix?.keys?.() ?? [])].sort((a, b) => a - b);
}

function sortedRatings(matrix) {
  const set = new Set();
  for (const row of matrix?.values?.() ?? []) for (const rating of row.keys()) set.add(rating);
  return [...set].sort((a, b) => a - b);
}

function linearFit(xs, ys, ridgeSlope = 0) {
  if (xs.length !== ys.length || !xs.length) return null;
  const n = xs.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sx += xs[i]; sy += ys[i]; sxx += xs[i] * xs[i]; sxy += xs[i] * ys[i];
  }
  const a00 = n;
  const a01 = sx;
  const a11 = sxx + ridgeSlope;
  const det = a00 * a11 - a01 * a01;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return { intercept: sy / n, slope: 0 };
  return {
    intercept: (sy * a11 - a01 * sxy) / det,
    slope: (a00 * sxy - a01 * sy) / det,
  };
}

function weightedGeometricMean(items) {
  const valid = items.filter((item) => POSITIVE(item?.prediction) && POSITIVE(item?.weight));
  if (!valid.length) return null;
  const total = valid.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) return null;
  return Math.exp(valid.reduce((sum, item) => sum + item.weight * Math.log(item.prediction), 0) / total);
}

function interpolateLogSize(points, targetSize) {
  if (!points.length) return null;
  const ordered = [...points].sort((a, b) => a.size - b.size);
  const exact = ordered.find((point) => point.size === targetSize);
  if (exact) return exact.value;
  const lower = ordered.filter((point) => point.size < targetSize).at(-1);
  const upper = ordered.find((point) => point.size > targetSize);
  if (!lower || !upper) return null;
  const x = Math.log(targetSize);
  const x0 = Math.log(lower.size);
  const x1 = Math.log(upper.size);
  return lower.value + (upper.value - lower.value) * ((x - x0) / (x1 - x0));
}

function oneSidedRatio(points, targetSize, constants) {
  if (!points.length) return null;
  const ordered = [...points].sort((a, b) => Math.abs(Math.log(a.size / targetSize)) - Math.abs(Math.log(b.size / targetSize)));
  const side = ordered.filter((point) => point.size < targetSize || point.size > targetSize)
    .slice(0, constants.ratioOneSidedMaxPoints);
  if (!side.length) return null;
  if (side.length === 1) return side[0].value;
  const fit = linearFit(side.map((point) => Math.log(point.size)), side.map((point) => point.value), constants.ratioRidgeSlope);
  if (!fit) return median(side.map((point) => point.value));
  const regression = fit.intercept + fit.slope * Math.log(targetSize);
  return constants.ratioRegressionWeight * regression
    + constants.ratioSideMedianWeight * median(side.map((point) => point.value));
}

function sameRatingFallback(matrix, size, rating, constants) {
  const points = sortedSizes(matrix)
    .map((candidateSize) => ({ size: candidateSize, weight: cell(matrix, candidateSize, rating) }))
    .filter((point) => POSITIVE(point.weight) && point.size !== size);
  if (!points.length) return null;

  const logs = points.map((point) => ({ size: point.size, value: Math.log(point.weight) }));
  const bracketed = interpolateLogSize(logs, size);
  if (Number.isFinite(bracketed)) return Math.exp(bracketed);

  const sameSide = points
    .filter((point) => (point.size < size) === (points[0]?.size < size))
    .sort((a, b) => Math.abs(Math.log(a.size / size)) - Math.abs(Math.log(b.size / size)))
    .slice(0, constants.sameRatingNearestPoints);
  if (sameSide.length < 2) return null;
  const fit = linearFit(sameSide.map((point) => Math.log(point.size)), sameSide.map((point) => Math.log(point.weight)), 0);
  return fit ? Math.exp(fit.intercept + fit.slope * Math.log(size)) : null;
}

export function estimateCollaborativeRatio(catalog, target, typeDesc, size, rating, constants) {
  const matrix = matrixFor(catalog, target, typeDesc);
  if (!matrix) return null;
  const anchors = [];

  for (const r0 of sortedRatings(matrix)) {
    if (r0 === rating) continue;
    const sameSizeAnchor = cell(matrix, size, r0);
    if (!POSITIVE(sameSizeAnchor)) continue;

    const ratioBySize = [];
    for (const candidateSize of sortedSizes(matrix)) {
      const wr = cell(matrix, candidateSize, rating);
      const w0 = cell(matrix, candidateSize, r0);
      if (POSITIVE(wr) && POSITIVE(w0)) ratioBySize.push({ size: candidateSize, value: Math.log(wr / w0) });
    }
    if (!ratioBySize.length) continue;

    let logRatio = interpolateLogSize(ratioBySize, size);
    if (!Number.isFinite(logRatio)) logRatio = oneSidedRatio(ratioBySize, size, constants);
    if (!Number.isFinite(logRatio)) continue;

    const distance = Math.abs(Math.log(rating / r0));
    const support = Math.max(1, ratioBySize.length) ** constants.ratioSupportExponent;
    anchors.push({
      prediction: sameSizeAnchor * Math.exp(logRatio),
      weight: (1 / (constants.ratioAnchorOffset + distance)) * support,
    });
  }

  const prediction = weightedGeometricMean(anchors);
  if (POSITIVE(prediction)) return { prediction, anchorCount: anchors.length, method: 'rating-ratio' };
  const fallback = sameRatingFallback(matrix, size, rating, constants);
  return POSITIVE(fallback) ? { prediction: fallback, anchorCount: 0, method: 'same-rating-fallback' } : null;
}

export function estimateCrossRatio(catalog, target, typeDesc, size, rating, constants) {
  const matrix = matrixFor(catalog, target, typeDesc);
  if (!matrix) return null;
  const rectangles = [];

  for (const s0 of sortedSizes(matrix)) {
    if (s0 === size) continue;
    const wS0R = cell(matrix, s0, rating);
    if (!POSITIVE(wS0R)) continue;
    for (const r0 of sortedRatings(matrix)) {
      if (r0 === rating) continue;
      const wSR0 = cell(matrix, size, r0);
      const wS0R0 = cell(matrix, s0, r0);
      if (!POSITIVE(wSR0) || !POSITIVE(wS0R0)) continue;
      const prediction = wSR0 * wS0R / wS0R0;
      if (!POSITIVE(prediction)) continue;
      const distance = Math.hypot(Math.log(size / s0), Math.log(rating / r0));
      rectangles.push({ prediction, distance, logPrediction: Math.log(prediction) });
    }
  }

  rectangles.sort((a, b) => a.distance - b.distance);
  let selected = rectangles.slice(0, constants.crossNearestRectangles);
  if (selected.length >= 5) {
    const center = median(selected.map((item) => item.logPrediction));
    const deviations = selected.map((item) => Math.abs(item.logPrediction - center));
    const threshold = quantile(deviations, constants.crossTrimQuantile);
    selected = selected.filter((item) => Math.abs(item.logPrediction - center) <= threshold);
  }
  const prediction = weightedGeometricMean(selected.map((item) => ({
    prediction: item.prediction,
    weight: 1 / ((constants.crossDistanceOffset + item.distance) ** constants.crossDistancePower),
  })));
  return POSITIVE(prediction) ? { prediction, rectangleCount: selected.length, method: 'cross-ratio' } : null;
}

export function lookupExactCatalogWeight(catalog, target, typeDesc, size, rating) {
  return cell(matrixFor(catalog, target, typeDesc), size, rating);
}
