function userDataOf(object) {
  return object?.userData || {};
}

function layerKey(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s/-]+/g, '.');
}

const BARE_PLANT_LAYER_ALIASES = new Map([
  ['pipe', 'plant.pipe'],
  ['pipes', 'plant.pipe'],
  ['bend', 'plant.bend'],
  ['bends', 'plant.bend'],
  ['elbow', 'plant.bend'],
  ['elbows', 'plant.bend'],
  ['pipe.trimmed.for.bend', 'plant.pipe_trimmed_for_bend'],
  ['pipe.trimmed.for.bends', 'plant.pipe_trimmed_for_bend'],
  ['pipe.trimmed.for.bend', 'plant.pipe_trimmed_for_bend'],
  ['pipe.trimmed', 'plant.pipe_trimmed_for_bend'],
  ['pipe_trimmed_for_bend', 'plant.pipe_trimmed_for_bend'],
  ['pipe.trimmed.for.bend', 'plant.pipe_trimmed_for_bend'],
  ['flange', 'plant.flange'],
  ['flanges', 'plant.flange'],
  ['flange.pair', 'plant.flange_pair'],
  ['flangepair', 'plant.flange_pair'],
  ['valve', 'plant.valve'],
  ['valves', 'plant.valve'],
  ['valve.flanged', 'plant.valve_flanged'],
  ['valveflanged', 'plant.valve_flanged'],
  ['rigid', 'plant.rigid'],
  ['rigids', 'plant.rigid'],
  ['rigid.unspecified', 'plant.rigid_unspecified'],
  ['rigidunspecified', 'plant.rigid_unspecified'],
  ['olet', 'plant.olet'],
  ['olets', 'plant.olet'],
  ['tee', 'plant.tee_olet'],
  ['tee.olet', 'plant.tee_olet'],
  ['teeolet', 'plant.tee_olet'],
  ['reducer', 'plant.reducer'],
  ['reducers', 'plant.reducer'],
  ['cap', 'plant.cap'],
  ['caps', 'plant.cap'],
  ['terminal', 'plant.cap'],
  ['annotations', 'plant.annotations'],
]);

const BARE_RESTRAINT_LAYER_ALIASES = new Map([
  ['restraints', 'plant.restraints'],
  ['support', 'plant.restraints'],
  ['supports', 'plant.restraints'],
  ['support.restraints', 'plant.restraints'],
  ['inputxml', 'restraints.inputxml'],
  ['input.xml', 'restraints.inputxml'],
  ['isonote', 'restraints.isonote'],
  ['iso.note', 'restraints.isonote'],
  ['rest', 'restraints.rest'],
  ['guide', 'restraints.guide'],
  ['line.stop', 'restraints.linestop'],
  ['linestop', 'restraints.linestop'],
  ['limit', 'restraints.limit'],
  ['spring', 'restraints.spring'],
  ['hanger', 'restraints.hanger'],
  ['anchor', 'restraints.anchor'],
  ['unknown', 'restraints.unknown'],
  ['unknown.type0', 'restraints.unknown'],
  ['type0', 'restraints.unknown'],
]);

const BARE_ANNOTATION_LAYER_ALIASES = new Map([
  ['annotation', 'annotation.all'],
  ['annotations', 'annotation.all'],
  ['node', 'annotation.node'],
  ['nodes', 'annotation.node'],
  ['node.annotation', 'annotation.node'],
  ['node.annotations', 'annotation.node'],
  ['node.marker', 'annotation.node_marker'],
  ['node.markers', 'annotation.node_marker'],
  ['node.leader', 'annotation.node_leader'],
  ['node.leaders', 'annotation.node_leader'],
  ['node.label', 'annotation.node_label'],
  ['node.labels', 'annotation.node_label'],
  ['callout', 'annotation.callout'],
  ['callouts', 'annotation.callout'],
]);

function canonicalLayerId(rawId = '') {
  const id = String(rawId || '').trim();
  if (!id) return '';
  const key = layerKey(id);

  if (key.startsWith('plant.')) return key;
  if (key.startsWith('restraints.')) return key.replace('restraints.line.stop', 'restraints.linestop');
  if (key.startsWith('annotation.')) return key;
  if (key.startsWith('axis.')) return key;
  if (key.startsWith('source.')) return key;
  if (key.startsWith('debug.')) return key;

  if (BARE_PLANT_LAYER_ALIASES.has(key)) return BARE_PLANT_LAYER_ALIASES.get(key);
  if (BARE_RESTRAINT_LAYER_ALIASES.has(key)) return BARE_RESTRAINT_LAYER_ALIASES.get(key);
  if (BARE_ANNOTATION_LAYER_ALIASES.has(key)) return BARE_ANNOTATION_LAYER_ALIASES.get(key);

  return id;
}

function normalizeLayerIds(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  const seen = new Set();
  for (const rawId of ids) {
    const id = canonicalLayerId(rawId);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function layerIdsOf(object) {
  const data = userDataOf(object);
  const ids = data.bmCiiLayer?.layerIds || data.bmCiiLayerIds || data.extras?.bmCiiLayer?.layerIds || [];
  return normalizeLayerIds(ids);
}

function objectLayerMeta(object) {
  const data = userDataOf(object);
  return data.bmCiiLayer || data.extras?.bmCiiLayer || null;
}

function isAnnotationLayerId(id = '') {
  return String(id).startsWith('annotation.');
}

function isDebugLayerId(id = '') {
  return String(id).startsWith('debug.');
}

function normalizedDefaultVisible(layer = {}) {
  const id = canonicalLayerId(layer.id || '');
  if (!id) return false;

  // Native Basic GLB-PCF default review mode must match direct GLB viewing:
  // plant geometry ON, support/annotation/debug layers OFF until explicitly enabled.
  if (id === 'plant.restraints') return false;
  if (id.startsWith('restraints.')) return false;
  if (id === 'plant.annotations') return false;
  if (isAnnotationLayerId(id)) return false;
  if (isDebugLayerId(id)) return false;
  return layer.defaultVisible !== false;
}

function normalizeManifestLayer(layer = {}) {
  const id = canonicalLayerId(layer.id || '');
  if (!id) return null;
  return {
    ...layer,
    id,
    label: labelFromLayerId(id),
    // Always derive the group from the layer id for known BM_CII layers. Older
    // generated GLBs sometimes stamped plant geometry with the support group,
    // which made Pipe/Bend/Valve/Flange appear under Supports / Restraints.
    group: groupFromLayerId(id, layer.group),
    defaultVisible: normalizedDefaultVisible({ ...layer, id }),
  };
}

export function normalizeLayerManifest(manifest = {}) {
  const seen = new Set();
  const layers = [];
  for (const rawLayer of manifest.layers || []) {
    const layer = normalizeManifestLayer(rawLayer);
    if (!layer || seen.has(layer.id)) continue;
    seen.add(layer.id);
    layers.push(layer);
  }
  return {
    ...manifest,
    schema: manifest.schema || 'bm-cii-layer-manifest/normalized-v2-canonical',
    layers,
  };
}

export function layerManifestOf(gltfOrScene) {
  const scene = gltfOrScene?.scene || gltfOrScene;
  const candidates = [scene, ...(scene?.children || [])];
  for (const candidate of candidates) {
    const manifest = candidate?.userData?.bmCiiLayerManifest || candidate?.userData?.extras?.bmCiiLayerManifest;
    if (manifest?.layers?.length) return normalizeLayerManifest(manifest);
  }

  // Fallback: build a manifest from layer IDs stamped directly on mesh nodes.
  const ids = new Set();
  scene?.traverse?.((object) => {
    for (const id of layerIdsOf(object)) ids.add(id);
  });
  if (ids.size > 0) {
    return normalizeLayerManifest({
      schema: 'bm-cii-layer-manifest/generated-from-node-layers-v2-canonical',
      layers: Array.from(ids).sort().map((id) => ({
        id,
        label: labelFromLayerId(id),
        group: groupFromLayerId(id),
        defaultVisible: normalizedDefaultVisible({ id }),
      })),
    });
  }

  return { schema: 'bm-cii-layer-manifest/generated-v1', layers: [] };
}

export function collectLayerRegistry(scene) {
  const registry = new Map();
  scene?.traverse?.((object) => {
    for (const layerId of layerIdsOf(object)) {
      if (!registry.has(layerId)) registry.set(layerId, []);
      registry.get(layerId).push(object);
    }
  });
  return registry;
}

export function createLayerStateFromManifest(manifest = {}) {
  const state = {};
  for (const layer of normalizeLayerManifest(manifest).layers || []) {
    state[layer.id] = layer.defaultVisible !== false;
  }
  return state;
}

function hasAny(ids, predicate) {
  for (const id of ids) if (predicate(id)) return true;
  return false;
}

function hasLayer(ids, id) {
  return ids.has(id);
}

function isRestraintObject(ids, meta = {}) {
  return hasLayer(ids, 'plant.restraints')
    || hasAny(ids, (id) => id.startsWith('restraints.'))
    || meta.category === 'support';
}

function isAnnotationObject(ids, meta = {}) {
  return hasLayer(ids, 'plant.annotations')
    || hasLayer(ids, 'annotation.all')
    || hasAny(ids, (id) => id.startsWith('annotation.'))
    || meta.category === 'annotation';
}

export function isObjectVisibleByLayerState(object, state = {}) {
  const ids = new Set(layerIdsOf(object));
  const meta = objectLayerMeta(object) || {};
  if (ids.size === 0) return true;

  // Strict AND semantics for restraints. The parent semantic layer controls all
  // restraint sublayers even if a generated GLB forgot to include plant.restraints
  // on an individual support mesh.
  if (isRestraintObject(ids, meta)) {
    if (state['plant.restraints'] !== true) return false;

    const hasInputXml = hasLayer(ids, 'restraints.inputxml') || meta.source === 'inputxml';
    const hasIsonote = hasLayer(ids, 'restraints.isonote') || meta.source === 'isonote';
    if (hasInputXml && state['restraints.inputxml'] !== true) return false;
    if (hasIsonote && state['restraints.isonote'] !== true) return false;

    const subtypeLayers = Array.from(ids).filter((id) => (
      id.startsWith('restraints.')
      && id !== 'restraints.inputxml'
      && id !== 'restraints.isonote'
    ));
    for (const id of subtypeLayers) if (state[id] !== true) return false;

    const axisLayers = Array.from(ids).filter((id) => id.startsWith('axis.'));
    for (const id of axisLayers) if (state[id] !== true) return false;

    return true;
  }

  // Strict AND semantics for annotations. In visual-recovery mode annotations are
  // default-off in the normalized manifest, but when enabled the sublayers are
  // still independent and predictable.
  if (isAnnotationObject(ids, meta)) {
    if (state['plant.annotations'] !== true) return false;
    if (state['annotation.all'] !== true) return false;
    for (const id of ids) {
      if (id.startsWith('annotation.') && id !== 'annotation.all' && state[id] !== true) return false;
    }
    return true;
  }

  for (const id of ids) {
    if (state[id] === false) return false;
  }
  return true;
}

export function applyLayerState(scene, state = {}) {
  scene?.traverse?.((object) => {
    if (!object.isMesh && object.type !== 'Group') return;
    object.visible = isObjectVisibleByLayerState(object, state);
  });
}

export function labelFromLayerId(id = '') {
  const value = canonicalLayerId(id);
  if (value === 'plant.pipe_trimmed_for_bend') return 'Pipe Trimmed For Bend';
  if (value === 'plant.flange_pair') return 'Flange Pair';
  if (value === 'plant.valve_flanged') return 'Valve Flanged';
  if (value === 'plant.rigid_unspecified') return 'Rigid Unspecified';
  if (value === 'restraints.inputxml') return 'InputXML';
  if (value === 'restraints.isonote') return 'ISONOTE';
  if (value === 'restraints.linestop') return 'LINESTOP';
  if (value === 'plant.annotations') return 'Annotations';
  if (value === 'annotation.all') return 'All Annotations';
  if (value === 'annotation.node') return 'Node Annotations';
  if (value === 'annotation.node_marker') return 'Node Markers';
  if (value === 'annotation.node_leader') return 'Node Leaders';
  if (value === 'annotation.node_label') return 'Node Labels';
  const tail = String(value).split('.').pop() || value;
  return tail
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .replace('Inputxml', 'InputXML')
    .replace('Isonote', 'ISONOTE')
    .replace('Linestop', 'LINESTOP')
    .replace('Tee Olet', 'Tee / Olet');
}

export function groupFromLayerId(id = '', fallback = 'Layers') {
  const value = canonicalLayerId(id);
  if (value === 'plant.restraints') return 'Supports / Restraints';
  if (value === 'plant.annotations') return 'Annotations';
  if (value.startsWith('plant.')) return 'Plant Geometry';
  if (value.startsWith('restraints.')) return 'Supports / Restraints';
  if (value.startsWith('annotation.')) return 'Annotations';
  if (value.startsWith('axis.')) return 'Direction / Axis';
  if (value.startsWith('source.')) return 'Source';
  if (value.startsWith('debug.')) return 'Debug / QC';
  return fallback || 'Layers';
}

function groupWeight(group = '') {
  const order = [
    'Plant Geometry',
    'Supports / Restraints',
    'Annotations',
    'Direction / Axis',
    'Source',
    'Debug / QC',
    'Layers',
  ];
  const idx = order.indexOf(group);
  return idx >= 0 ? idx : order.length + String(group).localeCompare('');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function checkboxId(layerId) {
  return `glb-layer-${String(layerId).replace(/[^a-z0-9_-]+/gi, '-')}`;
}

export function renderLayerControls(manifest = {}, state = {}, onToggle = () => {}) {
  const layers = normalizeLayerManifest(manifest).layers || [];
  if (!layers.length) return null;

  const container = document.createElement('div');
  container.className = 'glb-layer-controls';
  const byGroup = new Map();
  for (const layer of layers) {
    const group = layer.group || groupFromLayerId(layer.id);
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(layer);
  }

  Array.from(byGroup.entries())
    .sort(([a], [b]) => groupWeight(a) - groupWeight(b))
    .forEach(([group, groupLayers]) => {
      const section = document.createElement('details');
      section.className = 'glb-layer-group';
      section.open = ['Plant Geometry', 'Supports / Restraints', 'Annotations'].includes(group);
      const summary = document.createElement('summary');
      summary.textContent = group;
      section.appendChild(summary);

      groupLayers
        .sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)))
        .forEach((layer) => {
          const id = checkboxId(layer.id);
          const label = document.createElement('label');
          label.className = 'glb-layer-row';
          label.setAttribute('for', id);

          const input = document.createElement('input');
          input.type = 'checkbox';
          input.id = id;
          input.checked = state[layer.id] !== false;
          input.addEventListener('change', () => onToggle(layer.id, input.checked));

          const span = document.createElement('span');
          span.textContent = layer.label || labelFromLayerId(layer.id);

          label.appendChild(input);
          label.appendChild(span);
          section.appendChild(label);
        });

      container.appendChild(section);
    });

  return container;
}

export function mountLayerPanel(host, scene, manifest = {}, options = {}) {
  const normalizedManifest = normalizeLayerManifest(manifest?.layers ? manifest : layerManifestOf(scene));
  let state = createLayerStateFromManifest(normalizedManifest);

  const render = () => {
    if (!host) return;
    host.replaceChildren?.();
    const controls = renderLayerControls(normalizedManifest, state, (layerId, checked) => {
      state = { ...state, [layerId]: !!checked };
      applyLayerState(scene, state);
      options.onChange?.({ layerId, checked: !!checked, state: { ...state }, manifest: normalizedManifest });
      render();
    });
    if (controls) host.appendChild(controls);
  };

  applyLayerState(scene, state);
  render();

  return {
    manifest: normalizedManifest,
    getState: () => ({ ...state }),
    setState: (nextState = {}) => {
      state = { ...state, ...nextState };
      applyLayerState(scene, state);
      render();
    },
    setLayer: (layerId, checked) => {
      state = { ...state, [layerId]: !!checked };
      applyLayerState(scene, state);
      options.onChange?.({ layerId, checked: !!checked, state: { ...state }, manifest: normalizedManifest });
      render();
    },
    dispose: () => {
      host?.replaceChildren?.();
    },
  };
}
