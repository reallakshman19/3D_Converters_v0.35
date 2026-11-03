import { normalizedNumber } from './compare.js';

const EPSILON = 1e-12;
const AXES = Object.freeze([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
const PAIRS = Object.freeze([[0, 1], [0, 2], [1, 2]]);

function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, factor) { return a.map((value) => value * factor); }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function length(a) { return Math.sqrt(dot(a, a)); }
function normalize(a) { const size = length(a); return size > EPSILON ? scale(a, 1 / size) : null; }
function finiteVector(value) { return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite); }
function cleanVector(value) { return value.map(normalizedNumber); }

function centroid(points) {
  return scale(points.reduce(add, [0, 0, 0]), 1 / points.length);
}

function newell(points) {
  const result = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index], b = points[(index + 1) % points.length];
    result[0] += (a[1] - b[1]) * (a[2] + b[2]);
    result[1] += (a[2] - b[2]) * (a[0] + b[0]);
    result[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return normalize(result);
}

function covariance(points, centre) {
  const matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const point of points) {
    const delta = subtract(point, centre);
    for (let row = 0; row < 3; row += 1) for (let column = row; column < 3; column += 1) {
      matrix[row][column] += delta[row] * delta[column];
      matrix[column][row] = matrix[row][column];
    }
  }
  return matrix;
}

function identity3() { return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; }

function rotateJacobi(matrix, vectors, p, q) {
  const value = matrix[p][q];
  if (Math.abs(value) <= EPSILON) return;
  const angle = 0.5 * Math.atan2(2 * value, matrix[q][q] - matrix[p][p]);
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  for (let index = 0; index < 3; index += 1) {
    const left = matrix[index][p], right = matrix[index][q];
    matrix[index][p] = cosine * left - sine * right;
    matrix[index][q] = sine * left + cosine * right;
  }
  for (let index = 0; index < 3; index += 1) {
    const left = matrix[p][index], right = matrix[q][index];
    matrix[p][index] = cosine * left - sine * right;
    matrix[q][index] = sine * left + cosine * right;
    const vectorLeft = vectors[index][p], vectorRight = vectors[index][q];
    vectors[index][p] = cosine * vectorLeft - sine * vectorRight;
    vectors[index][q] = sine * vectorLeft + cosine * vectorRight;
  }
}

function smallestEigenvector(input) {
  const matrix = input.map((row) => [...row]), vectors = identity3();
  for (let sweep = 0; sweep < 12; sweep += 1) for (const [p, q] of PAIRS) {
    rotateJacobi(matrix, vectors, p, q);
  }
  let index = 0;
  for (let candidate = 1; candidate < 3; candidate += 1) {
    if (matrix[candidate][candidate] < matrix[index][index]) index = candidate;
  }
  return normalize([vectors[0][index], vectors[1][index], vectors[2][index]]);
}

function planeBasis(normal) {
  const axis = AXES.map((value, index) => ({ index, alignment: Math.abs(dot(value, normal)) }))
    .sort((a, b) => a.alignment - b.alignment || a.index - b.index)[0].index;
  const first = normalize(cross(AXES[axis], normal));
  return first ? { first, second: normalize(cross(normal, first)) } : null;
}

function solve3(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) <= EPSILON) return null;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let item = column; item < 4; item += 1) rows[column][item] /= divisor;
    for (let row = 0; row < 3; row += 1) if (row !== column) {
      const factor = rows[row][column];
      for (let item = column; item < 4; item += 1) rows[row][item] -= factor * rows[column][item];
    }
  }
  return rows.map((row) => row[3]);
}

function fitProjectedCircle(points) {
  const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], vector = [0, 0, 0];
  for (const [x, y] of points) {
    const row = [2 * x, 2 * y, 1], target = x * x + y * y;
    for (let a = 0; a < 3; a += 1) {
      vector[a] += row[a] * target;
      for (let b = 0; b < 3; b += 1) normal[a][b] += row[a] * row[b];
    }
  }
  const solution = solve3(normal, vector);
  if (!solution) return null;
  const radiusSquared = solution[2] + solution[0] ** 2 + solution[1] ** 2;
  return radiusSquared > 0 ? { x: solution[0], y: solution[1], radius: Math.sqrt(radiusSquared) } : null;
}

export function fitBoundaryCircleLocal(points) {
  if (!Array.isArray(points) || points.length < 3 || points.some((point) => !finiteVector(point))) {
    return { rejectionReasons: ['DEGENERATE_LOOP'] };
  }
  const unique = new Set(points.map((point) => point.join('\0')));
  const zeroEdge = points.some((point, index) => length(subtract(
    point, points[(index + 1) % points.length],
  )) <= EPSILON);
  if (unique.size < 3 || zeroEdge) return { rejectionReasons: ['DEGENERATE_LOOP'] };
  const windingNormal = newell(points);
  if (!windingNormal) return { rejectionReasons: ['LOCAL_WINDING_DEGENERATE'] };
  const mean = centroid(points), eigenNormal = smallestEigenvector(covariance(points, mean));
  if (!eigenNormal) return { rejectionReasons: ['LOCAL_FIT_SINGULAR'] };
  const planeNormal = dot(eigenNormal, windingNormal) < 0 ? scale(eigenNormal, -1) : eigenNormal;
  const basis = planeBasis(planeNormal);
  if (!basis?.second) return { rejectionReasons: ['LOCAL_FIT_SINGULAR'] };
  const projected = points.map((point) => {
    const delta = subtract(point, mean);
    return [dot(delta, basis.first), dot(delta, basis.second)];
  });
  const circle = fitProjectedCircle(projected);
  if (!circle || !Number.isFinite(circle.radius)) return { rejectionReasons: ['LOCAL_FIT_SINGULAR'] };
  const centre = add(mean, add(scale(basis.first, circle.x), scale(basis.second, circle.y)));
  const planarityResidual = Math.max(...points.map((point) => Math.abs(dot(subtract(point, mean), planeNormal))));
  const circularResidual = Math.max(...projected.map(([x, y]) => Math.abs(Math.hypot(x - circle.x, y - circle.y) - circle.radius)));
  return { centre: cleanVector(centre), normal: cleanVector(planeNormal), radius: normalizedNumber(circle.radius),
    planarityResidual: normalizedNumber(planarityResidual), circularResidual: normalizedNumber(circularResidual),
    rejectionReasons: [] };
}

export function windingNormalForPoints(points) {
  return newell(points);
}
