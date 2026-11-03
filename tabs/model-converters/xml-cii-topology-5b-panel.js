const XML_SCAN_LIMIT = 200;
const POS_TOL = 0.5;
const RAY_TUBE_MM = 50;
const MAX_RAY_MM = 20000;
const EPS = 1e-9;
const PANEL_STATE_KEY = '__xmlCiiTopology5BNativeState';
const ROUTE_EXCLUDED_TYPES = new Set(['GASK']);

function text(value) { return value === undefined || value === null ? '' : String(value).trim(); }
function esc(value) { return text(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function maybeNumber(value) { const n = Number(text(value)); return Number.isFinite(n) ? n : null; }
function fmt(value, places = 2) { return Number.isFinite(Number(value)) ? Number(value).toFixed(places) : ''; }
function posLabel(p) { return p ? `${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}` : ''; }
function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
function add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }
function mul(a, k) { return { x: a.x * k, y: a.y * k, z: a.z * k }; }
function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
function mag(v) { return Math.hypot(v.x, v.y, v.z); }
function dist(a, b) { return mag(sub(a, b)); }
function norm(v) { const m = mag(v); return m > EPS ? mul(v, 1 / m) : null; }
function localName(node) { return text(node?.localName || node?.nodeName).replace(/^.*:/, ''); }
function children(node, name) { return [...(node?.childNodes || [])].filter((child) => child.nodeType === 1 && localName(child) === name); }
function childText(node, name) { return text(children(node, name)[0]?.textContent); }
function parsePos(value) {
  const parts = text(value).split(/\s+/).map(Number);
  return parts.length >= 3 && parts.every(Number.isFinite) ? { x: parts[0], y: parts[1], z: parts[2] } : null;
}
function uniquePositions(points) {
  const out = [];
  for (const p of points.filter(Boolean)) {
    const prev = out[out.length - 1];
    if (!prev || dist(prev, p) > POS_TOL) out.push(p);
  }
  return out;
}
function lastDirection(points) {
  for (let i = points.length - 1; i > 0; i -= 1) {
    const d = norm(sub(points[i], points[i - 1]));
    if (d) return d;
  }
  return null;
}
function dominantType(run) {
  const types = [...run.types];
  const conns = [...run.connections];
  if (types.includes('OLET')) return 'OLET';
  if (types.includes('TEE')) return 'TEE';
  if (types.includes('BRAN') && conns.includes('OLET')) return 'BRAN/OLET';
  if (types.includes('BRAN') && conns.includes('TEE')) return 'BRAN/TEE';
  for (const item of ['ELBO', 'REDU', 'VALV', 'RIGID', 'FLAN', 'GASK', 'ATTA', 'PCOM', 'BRAN']) {
    if (types.includes(item)) return types.includes('FLAN') && types.includes('RIGID') ? 'FLAN/RIGID' : item;
  }
  return types[0] || 'UNKNOWN';
}
function hubIndex(points) {
  let bestIndex = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i += 1) {
    let score = 0;
    for (let j = 0; j < points.length; j += 1) {
      if (i !== j) score += dist(points[i], points[j]);
    }
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}
function rayHit(origin, direction, target) {
  if (!origin || !direction || !target) return null;
  const v = sub(target, origin);
  const distanceAlongRayMm = dot(v, direction);
  if (distanceAlongRayMm <= EPS) return null;
  const closest = add(origin, mul(direction, distanceAlongRayMm));
  return {
    distanceAlongRayMm,
    perpendicularMissMm: dist(target, closest),
    srssMm: mag(v),
  };
}
function isSupportReferenceRow(row) {
  return row?.componentType === 'ATTA' && /\/SREF/i.test(row?.nodeName || '');
}
function isRouteRow(row) {
  return !!row?.transformedPos
    && Number(row.nodeNumber) > 0
    && !ROUTE_EXCLUDED_TYPES.has(row.componentType)
    && !isSupportReferenceRow(row);
}
function parseBranches(xmlText) {
  const doc = new DOMParser().parseFromString(text(xmlText), 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Workflow XML parse failed.');
  const branchNodes = [...doc.getElementsByTagName('*')].filter((node) => localName(node) === 'Branch');
  if (!branchNodes.length) throw new Error('No <Branch> elements found in XML.');
  return branchNodes.map((branchNode, branchIndex) => {
    const branchName = childText(branchNode, 'Branchname') || `(branch ${branchIndex + 1})`;
    const nodes = children(branchNode, 'Node').map((nodeEl, nodeIndex) => {
      const nodeNumberRaw = childText(nodeEl, 'NodeNumber');
      const pos = parsePos(childText(nodeEl, 'Position'));
      return {
        branchIndex,
        branchName,
        nodeIndex,
        nodeNumberRaw,
        nodeNumber: maybeNumber(nodeNumberRaw),
        nodeName: childText(nodeEl, 'NodeName'),
        endpoint: childText(nodeEl, 'Endpoint'),
        componentType: childText(nodeEl, 'ComponentType').toUpperCase(),
        connectionType: childText(nodeEl, 'ConnectionType').toUpperCase(),
        refNo: childText(nodeEl, 'ComponentRefNo'),
        od: num(childText(nodeEl, 'OutsideDiameter')),
        originalPos: pos,
        transformedPos: null,
      };
    });
    return { branchIndex, branchName, nodes, routeRows: [], routePoints: [], components: [], edges: [], openPorts: [] };
  });
}
function chooseAnchor(branches, requested) {
  const wanted = text(requested);
  if (wanted) {
    for (const branch of branches) for (const row of branch.nodes) if (row.nodeNumberRaw === wanted && row.originalPos) return row;
  }
  for (const branch of branches) for (const row of branch.nodes) if (Number(row.nodeNumber) > 0 && row.originalPos) return row;
  return null;
}
function makePorts(run) {
  const points = run.points;
  const out = [];
  const addPort = (kind, index, direction) => {
    if (!points[index]) return;
    out.push({
      portId: `${run.id}:${kind}:${index}`,
      run,
      kind,
      point: points[index],
      direction,
      bore: run.bore,
      lockedTo: null,
    });
  };
  if (!points.length) return out;
  if (run.branchCapable && points.length >= 3) {
    const hub = hubIndex(points);
    const hubPoint = points[hub];
    points.forEach((point, index) => {
      if (index !== hub) addPort(`branch-port-${index}`, index, norm(sub(point, hubPoint)));
    });
    return out;
  }
  if (points.length === 1) {
    addPort('single', 0, null);
    return out;
  }
  addPort('entry', 0, norm(sub(points[0], points[1])));
  addPort('exit', points.length - 1, norm(sub(points[points.length - 1], points[points.length - 2])));
  return out;
}
function splitComponentRuns(branch) {
  const runs = [];
  let current = null;
  for (const row of branch.nodes) {
    const ref = row.refNo || `__NO_REF_${row.nodeIndex}`;
    if (!current || current.refKey !== ref) {
      current = {
        id: `${branch.branchIndex + 1}.${runs.length + 1}`,
        refKey: ref,
        branchName: branch.branchName,
        branchIndex: branch.branchIndex,
        refNo: row.refNo || '',
        rows: [],
        types: new Set(),
        connections: new Set(),
        positiveLabels: [],
        bore: 0,
        points: [],
        entry: null,
        exit: null,
        direction: null,
        type: '',
        branchCapable: false,
        ports: [],
      };
      runs.push(current);
    }
    current.rows.push(row);
    if (row.componentType) current.types.add(row.componentType);
    if (row.connectionType) current.connections.add(row.connectionType);
    if (Number(row.nodeNumber) > 0) current.positiveLabels.push(row.nodeNumberRaw);
    if (row.od > 0) current.bore = Math.max(current.bore, row.od);
  }
  for (const run of runs) {
    run.type = dominantType(run);
    run.points = uniquePositions(run.rows.map((row) => row.transformedPos));
    run.entry = run.points[0] || null;
    run.exit = run.points[run.points.length - 1] || run.entry;
    run.direction = lastDirection(run.points);
    run.branchCapable = run.type.includes('OLET') || run.type.includes('TEE');
    run.ports = makePorts(run);
  }
  return runs;
}
function lockPorts(a, b, edges, method, metrics = {}) {
  a.lockedTo = b.portId;
  b.lockedTo = a.portId;
  edges.push({
    id: `E-${edges.length + 1}`,
    a,
    b,
    method,
    distanceAlongRayMm: metrics.distanceAlongRayMm || 0,
    perpendicularMissMm: metrics.perpendicularMissMm || 0,
    srssMm: metrics.srssMm || 0,
    limitMm: metrics.limitMm || 0,
  });
}
function buildTopology(branches) {
  const components = branches.flatMap((branch) => branch.components);
  const ports = components.flatMap((component) => component.ports);
  const edges = [];
  const openPorts = [];

  for (let i = 0; i < ports.length; i += 1) {
    const a = ports[i];
    if (a.lockedTo) continue;
    for (let j = i + 1; j < ports.length; j += 1) {
      const b = ports[j];
      if (b.lockedTo || b.run === a.run) continue;
      if (dist(a.point, b.point) <= POS_TOL) {
        lockPorts(a, b, edges, 'exact-pos-contact');
        break;
      }
    }
  }

  for (const source of ports.filter((port) => port.run.branchCapable && !port.lockedTo)) {
    const direction = source.direction || source.run.direction;
    if (!direction) {
      openPorts.push({ source, reason: 'no POS direction' });
      continue;
    }
    const hits = [];
    for (const target of ports) {
      if (target === source || target.lockedTo || target.run === source.run) continue;
      const hit = rayHit(source.point, direction, target.point);
      if (!hit || hit.distanceAlongRayMm > MAX_RAY_MM || hit.perpendicularMissMm > RAY_TUBE_MM) continue;
      const limitMm = 3 * Math.max(source.bore || 0, target.bore || 0);
      if (limitMm > 0 && hit.srssMm > limitMm) continue;
      hits.push({ target, limitMm, ...hit });
    }
    hits.sort((a, b) => a.distanceAlongRayMm - b.distanceAlongRayMm || a.perpendicularMissMm - b.perpendicularMissMm || a.srssMm - b.srssMm || String(a.target.portId).localeCompare(String(b.target.portId)));
    if (hits[0]) lockPorts(source, hits[0].target, edges, 'global-ray-shortest-hit', hits[0]);
    else openPorts.push({ source, reason: 'no valid target within ray tube and 3×max-bore gate' });
  }

  for (const branch of branches) {
    branch.edges = edges.filter((edge) => edge.a.run.branchIndex === branch.branchIndex || edge.b.run.branchIndex === branch.branchIndex);
    branch.openPorts = openPorts.filter((item) => item.source.run.branchIndex === branch.branchIndex);
  }
  return { components, ports, edges, openPorts };
}
function buildModel(xmlText, anchorNode) {
  const branches = parseBranches(xmlText);
  const anchor = chooseAnchor(branches, anchorNode);
  if (!anchor) throw new Error('No anchor node with POS found in workflow XML.');
  for (const branch of branches) {
    for (const row of branch.nodes) row.transformedPos = row.originalPos ? sub(row.originalPos, anchor.originalPos) : null;
    branch.routeRows = branch.nodes.filter(isRouteRow);
    branch.routePoints = uniquePositions(branch.routeRows.map((row) => row.transformedPos));
    branch.components = splitComponentRuns(branch);
  }
  return { branches, anchor, topology: buildTopology(branches) };
}
function candidateWorkflowXml(root) {
  const candidates = [];
  const push = (source, value) => {
    const raw = text(value);
    if (raw.includes('<Branch') && raw.includes('<Node') && raw.length > 200) candidates.push({ source, xmlText: raw });
  };
  const scope = root || document;
  scope.querySelectorAll?.('textarea,input[type="hidden"]').forEach((el, index) => {
    push(`workflow-dom-${index}`, el.value || el.textContent);
  });
  try {
    const payload = JSON.parse(localStorage.getItem('xmlCii2019.matchedPreview.lastDiagnostics.v1') || '{}');
    push('latest-diagnostics.xmlText', payload.xmlText || payload.enrichedXmlText || payload.enrichedXml || payload.inputXml || payload.sourceXml);
  } catch {}
  try {
    for (let i = 0; i < Math.min(localStorage.length, XML_SCAN_LIMIT); i += 1) {
      const key = localStorage.key(i);
      if (!key || !/xml|cii|workflow|preview|diagnostic|source|input/i.test(key)) continue;
      push(`localStorage:${key}`, localStorage.getItem(key));
    }
  } catch {}
  candidates.sort((a, b) => b.xmlText.length - a.xmlText.length);
  return candidates[0] || null;
}
function ensureState(target, options = {}) {
  const state = target[PANEL_STATE_KEY] || {};
  target[PANEL_STATE_KEY] = state;
  if (!state.view) state.view = { zoom: 1, panX: 0, panY: 0, yaw: -0.18, pitch: 0.08, dragging: false, mode: 'pan', x: 0, y: 0 };
  if (state.anchorNode == null) state.anchorNode = options.anchorNode || '210';
  if (state.showHelpers == null) state.showHelpers = true;
  if (state.showBranchLabels == null) state.showBranchLabels = true;
  if (state.showNodeLabels == null) state.showNodeLabels = true;
  if (state.showComponentLabels == null) state.showComponentLabels = false;
  if (state.showEdges == null) state.showEdges = true;
  if (state.fitMode == null) state.fitMode = 'route';
  if (state.navMode == null) state.navMode = 'pan';
  return state;
}
function sourceForState(root, state) {
  if (text(state.manualXml)) return { source: state.manualSourceName || 'manual paste/upload', xmlText: state.manualXml };
  return candidateWorkflowXml(root);
}
function edgeText(edge) {
  if (!edge) return '';
  const target = `${edge.a.run.id}:${edge.a.kind} ↔ ${edge.b.run.id}:${edge.b.kind}`;
  if (edge.method === 'exact-pos-contact') return `${target} / exact POS`;
  return `${target} / ray t=${fmt(edge.distanceAlongRayMm, 1)} miss=${fmt(edge.perpendicularMissMm, 1)} srss=${fmt(edge.srssMm, 1)}`;
}
function renderInputBranch(branch, showHelpers) {
  const rows = branch.nodes.filter((row) => showHelpers || Number(row.nodeNumber) > 0);
  return `<details class="xml-cii-native-card" ${branch.branchIndex < 2 ? 'open' : ''}><summary><strong>${esc(branch.branchName)}</strong> <span style="color:#9aa8ba;">${rows.length}/${branch.nodes.length} node rows · ${branch.routePoints.length} route points</span></summary><div class="xml-cii-native-table-wrap"><table class="xml-cii-native-table"><thead><tr><th>Node</th><th>NodeName</th><th>Route</th><th>Component type</th><th>Bore / OD mm</th><th>Transformed X</th><th>Transformed Y</th><th>Transformed Z</th><th>Original POS</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.nodeNumberRaw)}</td><td>${esc(row.nodeName)}</td><td>${isRouteRow(row) ? 'YES' : ''}</td><td>${esc(row.componentType)}${row.connectionType ? ` / ${esc(row.connectionType)}` : ''}</td><td>${fmt(row.od, 1)}</td><td>${fmt(row.transformedPos?.x)}</td><td>${fmt(row.transformedPos?.y)}</td><td>${fmt(row.transformedPos?.z)}</td><td><code>${esc(posLabel(row.originalPos))}</code></td></tr>`).join('')}</tbody></table></div></details>`;
}
function renderCalcBranch(branch) {
  return `<details class="xml-cii-native-card" ${branch.branchIndex < 2 ? 'open' : ''}><summary><strong>${esc(branch.branchName)}</strong> <span style="color:#9aa8ba;">${branch.components.length} components · ${branch.routePoints.length} route points · ${branch.edges.length} edges · ${branch.openPorts.length} open ports</span></summary><div class="xml-cii-native-table-wrap"><table class="xml-cii-native-table"><thead><tr><th>Component instance</th><th>RefNo</th><th>Type</th><th>Positive node label</th><th>Entry XYZ</th><th>Exit XYZ</th><th>Internal direction</th><th>Topology edges</th><th>Open ports</th></tr></thead><tbody>${branch.components.map((run) => {
    const edges = branch.edges.filter((edge) => edge.a.run === run || edge.b.run === run).map(edgeText).join('<br>');
    const open = branch.openPorts.filter((item) => item.source.run === run).map((item) => `${esc(item.source.kind)}: ${esc(item.reason)}`).join('<br>');
    return `<tr class="${run.branchCapable ? 'xml-cii-5b-branch-capable' : ''}"><td>${esc(run.id)}</td><td><code>${esc(run.refNo)}</code></td><td>${esc(run.type)}</td><td>${esc(run.positiveLabels.join(', ') || '-')}</td><td><code>${esc(posLabel(run.entry))}</code></td><td><code>${esc(posLabel(run.exit))}</code></td><td><code>${run.direction ? `${fmt(run.direction.x, 3)}, ${fmt(run.direction.y, 3)}, ${fmt(run.direction.z, 3)}` : '-'}</code></td><td>${edges || '-'}</td><td>${open || '-'}</td></tr>`;
  }).join('')}</tbody></table></div></details>`;
}
function boundPoints(model, fitMode) {
  if (fitMode === 'all') {
    const all = model.branches.flatMap((branch) => branch.nodes.map((row) => row.transformedPos).filter(Boolean));
    if (all.length) return all;
  }
  const route = model.branches.flatMap((branch) => branch.routePoints);
  if (route.length) return route;
  const positive = model.branches.flatMap((branch) => branch.nodes.filter((row) => Number(row.nodeNumber) > 0).map((row) => row.transformedPos).filter(Boolean));
  return positive.length ? positive : model.branches.flatMap((branch) => branch.nodes.map((row) => row.transformedPos).filter(Boolean));
}
function modelBounds(model, fitMode = 'route') {
  const points = boundPoints(model, fitMode);
  if (!points.length) return null;
  const min = { x: Math.min(...points.map((p) => p.x)), y: Math.min(...points.map((p) => p.y)), z: Math.min(...points.map((p) => p.z)) };
  const max = { x: Math.max(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)), z: Math.max(...points.map((p) => p.z)) };
  const center = { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
  const span = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1);
  return { min, max, center, span };
}
function makeProjector(canvas, model, state) {
  const rect = canvas.getBoundingClientRect();
  const bounds = modelBounds(model, state.fitMode || 'route');
  if (!bounds) return null;
  const width = Math.max(400, rect.width || 400);
  const height = Math.max(300, rect.height || 300);
  const baseScale = Math.min(width, height) * 0.78 / bounds.span;
  const cy = Math.cos(state.view.yaw);
  const sy = Math.sin(state.view.yaw);
  const cp = Math.cos(state.view.pitch);
  const sp = Math.sin(state.view.pitch);
  return (point) => {
    const dx = point.x - bounds.center.x;
    const dy = point.y - bounds.center.y;
    const dz = point.z - bounds.center.z;
    const rx = dx * cy - dy * sy;
    const ry = dx * sy + dy * cy;
    const rz = dz;
    const py = ry * cp - rz * sp;
    return {
      x: width / 2 + state.view.panX + rx * baseScale * state.view.zoom,
      y: height / 2 + state.view.panY - py * baseScale * state.view.zoom,
    };
  };
}
function drawPolyline(ctx, points, project) {
  if (!points || points.length < 2) return;
  ctx.beginPath();
  points.forEach((point, index) => {
    const p = project(point);
    if (index) ctx.lineTo(p.x, p.y);
    else ctx.moveTo(p.x, p.y);
  });
  ctx.stroke();
}
function drawGraph(canvas, model, state) {
  const ctx = canvas.getContext('2d');
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(400, rect.width || 400);
  const height = Math.max(300, rect.height || 300);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#07101f';
  ctx.fillRect(0, 0, width, height);
  const project = makeProjector(canvas, model, state);
  if (!project) return;
  const colors = ['#60a5fa', '#34d399', '#fbbf24', '#f472b6', '#a78bfa', '#fb7185', '#2dd4bf', '#c084fc'];

  model.branches.forEach((branch) => {
    const color = colors[branch.branchIndex % colors.length];
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.8;
    ctx.setLineDash([]);
    drawPolyline(ctx, branch.routePoints, project);
  });

  if (state.showComponentLabels) {
    model.branches.forEach((branch) => {
      ctx.strokeStyle = 'rgba(226,232,240,.28)';
      ctx.lineWidth = 1;
      for (const run of branch.components) drawPolyline(ctx, run.points, project);
    });
  }

  if (state.showEdges) {
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    for (const edge of model.topology.edges) {
      if (!edge.a.point || !edge.b.point) continue;
      const a = project(edge.a.point);
      const b = project(edge.b.point);
      ctx.strokeStyle = edge.method === 'exact-pos-contact' ? 'rgba(148, 163, 184, .75)' : 'rgba(251, 191, 36, .9)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  model.branches.forEach((branch) => {
    const color = colors[branch.branchIndex % colors.length];
    const labelPoint = branch.routePoints[0] || branch.nodes.find((row) => row.transformedPos)?.transformedPos;
    if (state.showBranchLabels && labelPoint) {
      const p = project(labelPoint);
      ctx.font = '11px system-ui';
      ctx.fillStyle = color;
      ctx.fillText(branch.branchName, p.x + 7, p.y + 12);
    }
    for (const row of branch.nodes) {
      if (!row.transformedPos) continue;
      const route = isRouteRow(row);
      const positive = Number(row.nodeNumber) > 0;
      if (!route && !state.showHelpers) continue;
      const p = project(row.transformedPos);
      ctx.beginPath();
      ctx.arc(p.x, p.y, route ? 3.4 : 2.1, 0, Math.PI * 2);
      ctx.fillStyle = route ? color : 'rgba(148, 163, 184, .62)';
      ctx.fill();
      if (state.showNodeLabels && route && positive) {
        ctx.font = '10px system-ui';
        ctx.fillStyle = color;
        ctx.fillText(`${row.nodeNumberRaw} | ${row.componentType}`, p.x + 5, p.y - 5);
      }
    }
    if (state.showComponentLabels) {
      for (const run of branch.components) {
        if (!run.entry) continue;
        const p = project(run.entry);
        ctx.font = '10px system-ui';
        ctx.fillStyle = 'rgba(226,232,240,.82)';
        ctx.fillText(`${run.id} ${run.type}`, p.x + 6, p.y + 13);
      }
    }
  });

  ctx.fillStyle = 'rgba(2,6,23,.76)';
  ctx.fillRect(12, height - 32, 610, 22);
  ctx.fillStyle = '#cbd5e1';
  ctx.font = '11px system-ui';
  ctx.fillText(`Wheel = zoom · drag = ${state.navMode || 'pan'} · Shift/middle-drag = orbit · fit=${state.fitMode || 'route'}`, 20, height - 17);
}
function resetView(state, fitMode = 'route') {
  state.fitMode = fitMode;
  state.view = { zoom: 1, panX: 0, panY: 0, yaw: -0.18, pitch: 0.08, dragging: false, mode: 'pan', x: 0, y: 0 };
}
function setViewPreset(state, preset) {
  const presets = {
    iso: { yaw: -0.65, pitch: 0.55 },
    top: { yaw: 0, pitch: 1.2 },
    front: { yaw: 0, pitch: 0 },
    right: { yaw: Math.PI / 2, pitch: 0 },
  };
  const view = presets[preset] || presets.iso;
  state.view = { ...state.view, ...view, panX: 0, panY: 0, dragging: false };
}
function zoomView(state, factor) {
  state.view.zoom = Math.max(0.05, Math.min(80, state.view.zoom * factor));
}
function bindCanvas(canvas, model, state) {
  if (state.resizeObserver) {
    try { state.resizeObserver.disconnect(); } catch {}
  }
  if (state.canvasMouseMove) window.removeEventListener('mousemove', state.canvasMouseMove);
  if (state.canvasMouseUp) window.removeEventListener('mouseup', state.canvasMouseUp);
  const redraw = () => drawGraph(canvas, model, state);
  canvas.onwheel = (event) => {
    event.preventDefault();
    zoomView(state, event.deltaY < 0 ? 1.12 : 0.89);
    redraw();
  };
  canvas.onmousedown = (event) => {
    state.view.dragging = true;
    state.view.mode = event.shiftKey || event.button === 1 ? 'orbit' : state.navMode || 'pan';
    state.view.x = event.clientX;
    state.view.y = event.clientY;
    canvas.style.cursor = state.view.mode === 'orbit' ? 'crosshair' : 'grabbing';
  };
  state.canvasMouseMove = (event) => {
    if (!state.view.dragging) return;
    const dx = event.clientX - state.view.x;
    const dy = event.clientY - state.view.y;
    state.view.x = event.clientX;
    state.view.y = event.clientY;
    if (state.view.mode === 'orbit') {
      state.view.yaw += dx * 0.008;
      state.view.pitch = Math.max(-1.2, Math.min(1.2, state.view.pitch + dy * 0.006));
    } else {
      state.view.panX += dx;
      state.view.panY += dy;
    }
    redraw();
  };
  state.canvasMouseUp = () => {
    state.view.dragging = false;
    canvas.style.cursor = state.navMode === 'orbit' ? 'crosshair' : 'grab';
  };
  window.addEventListener('mousemove', state.canvasMouseMove);
  window.addEventListener('mouseup', state.canvasMouseUp);
  if (typeof ResizeObserver !== 'undefined') {
    state.resizeObserver = new ResizeObserver(redraw);
    state.resizeObserver.observe(canvas);
  }
  canvas.style.cursor = state.navMode === 'orbit' ? 'crosshair' : 'grab';
  redraw();
}
function sourcePickerHtml(state, source, message = '') {
  return `
    <section class="xml-cii-native-card">
      <div class="model-converters-workflow-section-title">5B POS Topology Workbench</div>
      <div class="model-converters-workflow-detail-note" style="margin-bottom:8px;">Source: ${esc(source?.source || 'none')} | Anchor node := <input data-xml-cii-5b-anchor value="${esc(state.anchorNode || '210')}" style="width:80px;background:#07101f;color:#e6edf5;border:1px solid rgba(148,163,184,.35);border-radius:6px;padding:4px 6px;"> ${message ? `<span style="color:#ffb4b4;">${esc(message)}</span>` : ''}</div>
      <div class="xml-cii-native-toolbar" style="margin-bottom:8px;gap:8px;flex-wrap:wrap;">
        <input data-xml-cii-5b-file type="file" accept=".xml,.XML,text/xml,application/xml">
        <button type="button" class="model-converters-run-btn" data-xml-cii-5b-build-paste>Build from paste/upload</button>
        <button type="button" class="model-converters-download-btn" data-xml-cii-5b-reset-source>Use workflow XML</button>
      </div>
      <textarea data-xml-cii-5b-paste spellcheck="false" placeholder="Optional: paste uploaded/enriched XML here to override workflow XML for this 5B view." style="width:100%;min-height:74px;background:#07101f;color:#e6edf5;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:8px;font:11px ui-monospace,Consolas,monospace;">${esc(state.manualXml || '')}</textarea>
    </section>`;
}
function bindSourceControls(target, root, state, options) {
  const rerender = () => renderXmlCiiTopology5BPanel(target, options);
  target.querySelector('[data-xml-cii-5b-anchor]')?.addEventListener('change', (event) => {
    state.anchorNode = text(event.target.value || '210') || '210';
    rerender();
  });
  target.querySelector('[data-xml-cii-5b-build-paste]')?.addEventListener('click', () => {
    const value = target.querySelector('[data-xml-cii-5b-paste]')?.value || '';
    if (text(value)) {
      state.manualXml = value;
      state.manualSourceName = 'manual paste';
    }
    rerender();
  });
  target.querySelector('[data-xml-cii-5b-reset-source]')?.addEventListener('click', () => {
    state.manualXml = '';
    state.manualSourceName = '';
    rerender();
  });
  target.querySelector('[data-xml-cii-5b-file]')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    state.manualXml = await file.text();
    state.manualSourceName = `upload:${file.name}`;
    rerender();
  });
}
function bindPanelControls(target, model, state) {
  const canvas = target.querySelector('[data-xml-cii-5b-canvas]');
  const redraw = () => { if (canvas) drawGraph(canvas, model, state); };
  target.querySelector('[data-xml-cii-5b-show-helpers]')?.addEventListener('change', (event) => {
    state.showHelpers = !!event.target.checked;
    renderXmlCiiTopology5BPanel(target, { root: target.__xmlCii5bRoot || document, anchorNode: state.anchorNode });
  });
  target.querySelector('[data-xml-cii-5b-show-branches]')?.addEventListener('change', (event) => { state.showBranchLabels = !!event.target.checked; redraw(); });
  target.querySelector('[data-xml-cii-5b-show-nodes]')?.addEventListener('change', (event) => { state.showNodeLabels = !!event.target.checked; redraw(); });
  target.querySelector('[data-xml-cii-5b-show-components]')?.addEventListener('change', (event) => { state.showComponentLabels = !!event.target.checked; redraw(); });
  target.querySelector('[data-xml-cii-5b-show-edges]')?.addEventListener('change', (event) => { state.showEdges = !!event.target.checked; redraw(); });
  target.querySelector('[data-xml-cii-5b-nav-pan]')?.addEventListener('click', () => { state.navMode = 'pan'; if (canvas) canvas.style.cursor = 'grab'; redraw(); });
  target.querySelector('[data-xml-cii-5b-nav-orbit]')?.addEventListener('click', () => { state.navMode = 'orbit'; if (canvas) canvas.style.cursor = 'crosshair'; redraw(); });
  target.querySelector('[data-xml-cii-5b-zoom-in]')?.addEventListener('click', () => { zoomView(state, 1.2); redraw(); });
  target.querySelector('[data-xml-cii-5b-zoom-out]')?.addEventListener('click', () => { zoomView(state, 1 / 1.2); redraw(); });
  target.querySelector('[data-xml-cii-5b-view-iso]')?.addEventListener('click', () => { setViewPreset(state, 'iso'); redraw(); });
  target.querySelector('[data-xml-cii-5b-view-top]')?.addEventListener('click', () => { setViewPreset(state, 'top'); redraw(); });
  target.querySelector('[data-xml-cii-5b-view-front]')?.addEventListener('click', () => { setViewPreset(state, 'front'); redraw(); });
  target.querySelector('[data-xml-cii-5b-view-right]')?.addEventListener('click', () => { setViewPreset(state, 'right'); redraw(); });
  target.querySelector('[data-xml-cii-5b-fit-route]')?.addEventListener('click', () => {
    resetView(state, 'route');
    redraw();
  });
  target.querySelector('[data-xml-cii-5b-fit-all]')?.addEventListener('click', () => {
    resetView(state, 'all');
    redraw();
  });
  target.querySelector('[data-xml-cii-5b-reset-view]')?.addEventListener('click', () => {
    resetView(state, 'route');
    redraw();
  });
  if (canvas) bindCanvas(canvas, model, state);
}
export function renderXmlCiiTopology5BPanel(target, options = {}) {
  if (!target) return null;
  const root = options.root || target.closest?.('[data-xml-cii-workflow-root]') || document;
  target.__xmlCii5bRoot = root;
  const state = ensureState(target, options);
  const source = sourceForState(root, state);
  if (!source) {
    target.innerHTML = sourcePickerHtml(state, null, 'No current workflow XML was found. Load/import XML in the workflow or upload/paste XML here.');
    bindSourceControls(target, root, state, options);
    return null;
  }

  let model;
  try { model = buildModel(source.xmlText, state.anchorNode || options.anchorNode || '210'); }
  catch (error) {
    target.innerHTML = sourcePickerHtml(state, source, error?.message || String(error));
    bindSourceControls(target, root, state, options);
    return null;
  }

  const branchCount = model.branches.length;
  const compCount = model.topology.components.length;
  const nodeCount = model.branches.reduce((sum, branch) => sum + branch.nodes.length, 0);
  const routeCount = model.branches.reduce((sum, branch) => sum + branch.routePoints.length, 0);
  const edgeCount = model.topology.edges.length;
  const openCount = model.topology.openPorts.length;
  target.innerHTML = `
    ${sourcePickerHtml(state, source)}
    <section class="xml-cii-native-card">
      <div class="model-converters-workflow-detail-note">Anchor node chosen := ${esc(model.anchor.nodeNumberRaw)} | Branches: ${branchCount} | Nodes: ${nodeCount} | Route points: ${routeCount} | Components: ${compCount} | Edges: ${edgeCount} | Open Tee/Olet ports: ${openCount}</div>
    </section>
    <section class="xml-cii-native-card" style="display:grid;grid-template-columns:minmax(420px,50%) minmax(420px,50%);gap:10px;align-items:start;">
      <div>
        <div class="model-converters-workflow-section-title">Input panel — branch-wise XML rows</div>
        <label class="model-converters-workflow-detail-note" style="display:inline-flex;align-items:center;gap:6px;margin-bottom:8px;"><input data-xml-cii-5b-show-helpers type="checkbox" ${state.showHelpers ? 'checked' : ''}>show helper / non-route rows</label>
        ${model.branches.map((branch) => renderInputBranch(branch, state.showHelpers)).join('')}
      </div>
      <div>
        <div class="model-converters-workflow-section-title">Calc panel — component instances and topology ports</div>
        ${model.branches.map(renderCalcBranch).join('')}
      </div>
    </section>
    <section class="xml-cii-native-card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        <div class="model-converters-workflow-section-title">BRANCH GRAPH</div>
        <div class="xml-cii-native-toolbar" style="gap:8px;flex-wrap:wrap;">
          <label class="model-converters-workflow-detail-note"><input data-xml-cii-5b-show-branches type="checkbox" ${state.showBranchLabels ? 'checked' : ''}> branch name</label>
          <label class="model-converters-workflow-detail-note"><input data-xml-cii-5b-show-nodes type="checkbox" ${state.showNodeLabels ? 'checked' : ''}> node label</label>
          <label class="model-converters-workflow-detail-note"><input data-xml-cii-5b-show-components type="checkbox" ${state.showComponentLabels ? 'checked' : ''}> component helper labels</label>
          <label class="model-converters-workflow-detail-note"><input data-xml-cii-5b-show-edges type="checkbox" ${state.showEdges ? 'checked' : ''}> topology edges</label>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-nav-pan>Pan</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-nav-orbit>Orbit</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-zoom-in>Zoom +</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-zoom-out>Zoom -</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-view-iso>Iso</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-view-top>Top</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-view-front>Front</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-view-right>Right</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-fit-route>Fit route</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-fit-all>Fit all</button>
          <button type="button" class="model-converters-download-btn" data-xml-cii-5b-reset-view>Reset view</button>
        </div>
      </div>
      <canvas data-xml-cii-5b-canvas style="width:100%;height:640px;border:1px solid rgba(148,163,184,.28);border-radius:10px;background:#07101f;cursor:grab;"></canvas>
    </section>`;
  bindSourceControls(target, root, state, options);
  bindPanelControls(target, model, state);
  return model;
}
