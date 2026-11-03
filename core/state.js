import { emit } from './event-bus.js';
import { RuntimeEvents } from '../contracts/runtime-events.js';
/**
 * state.js - Shared singleton state for the viewer app.
 * All modules read/write through this object; changes are broadcast via event-bus.
 */

import { DEFAULT_VIEWER3D_CONFIG } from '../viewer-3d-defaults.js';

function _isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function _deepMerge(base, patch) {
  if (!_isObj(base)) return JSON.parse(JSON.stringify(patch));
  const out = JSON.parse(JSON.stringify(base));
  if (!_isObj(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (Array.isArray(v)) out[k] = v.slice();
    else if (_isObj(v) && _isObj(out[k])) out[k] = _deepMerge(out[k], v);
    else out[k] = v;
  }
  return out;
}

function _ensureAppMountElement() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('app')) return;
  const tabContent = document.getElementById('tab-content');
  if (!tabContent) return;
  const mount = document.createElement('div');
  mount.id = 'app';
  mount.className = 'app-tab-mount';
  tabContent.appendChild(mount);
}

const DEFAULT_SUPPORT_BLOCKS = [
  { supportKind: 'RST', friction: 0.3, gap: 'empty', name: 'CA150', description: 'Rest' },
  { supportKind: 'GDE', friction: 0.15, gap: 'any', name: 'CA100', description: 'Guide' },
];

const DEFAULT_PCFX_DEFAULTS = {
  producerApp: 'GLB Viewers',
  producerVersion: '1.0.0',
  metadataProject: 'Petroleum Development Oman-PDO',
  metadataFacility: 'Inlet Separation and Boosting Facility, Ohanet',
  metadataDocumentNo: 'XX-XX-PFEED-',
  metadataRevision: 'Rev 0',
  metadataCode: 'ASME B31.3 - 2016',
  metadataUnitsBore: 'INCH',
  metadataUnitsCoords: 'MM',
  defaultPipelineRef: 'PCFX-LINE',
  defaultLineNoKey: 'PCFX-LINE',
  defaultMaterial: 'CS',
  defaultPipingClass: 'CS150',
  defaultRating: '150',
  refPrefix: 'PCFX-',
  seqStart: 10,
  seqStep: 10,
  supportKind: 'RST',
  supportName: 'CA150',
  supportDescription: 'Rest / Anchor',
  supportFriction: 0.3,
  supportGap: 'empty',
};

const DEFAULT_RVM_ROUTING = {
  topologyMethod: 'topology_legacy',
  routeThroughInstEnabled: false,
};

function _clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function _normalizeSupportBlocks(rows) {
  const src = Array.isArray(rows) ? rows : [];
  const normalized = src.map((row) => ({
    supportKind: String(row?.supportKind || row?.kind || '').toUpperCase() || 'RST',
    friction: Number.isFinite(Number(row?.friction)) ? Number(row.friction) : 0.3,
    gap: String(row?.gap ?? 'any'),
    name: String(row?.name || '').toUpperCase(),
    description: String(row?.description || ''),
  }));
  return normalized.filter((row) => row.name);
}

function _isLegacyDefaultSupportBlocks(rows) {
  if (!Array.isArray(rows) || rows.length !== 3) return false;
  const names = rows.map((row) => String(row?.name || '').toUpperCase()).join('|');
  const descriptions = rows.map((row) => String(row?.description || '').toUpperCase()).join('|');
  return names === 'CA150|CA100|CA250' && descriptions.includes('REST / ANCHOR');
}

function _normalizePcfxDefaults(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    producerApp: String(src.producerApp || DEFAULT_PCFX_DEFAULTS.producerApp),
    producerVersion: String(src.producerVersion || DEFAULT_PCFX_DEFAULTS.producerVersion),
    metadataProject: String(src.metadataProject || DEFAULT_PCFX_DEFAULTS.metadataProject),
    metadataFacility: String(src.metadataFacility || DEFAULT_PCFX_DEFAULTS.metadataFacility),
    metadataDocumentNo: String(src.metadataDocumentNo || DEFAULT_PCFX_DEFAULTS.metadataDocumentNo),
    metadataRevision: String(src.metadataRevision || DEFAULT_PCFX_DEFAULTS.metadataRevision),
    metadataCode: String(src.metadataCode || DEFAULT_PCFX_DEFAULTS.metadataCode),
    metadataUnitsBore: String(src.metadataUnitsBore || DEFAULT_PCFX_DEFAULTS.metadataUnitsBore).toUpperCase(),
    metadataUnitsCoords: String(src.metadataUnitsCoords || DEFAULT_PCFX_DEFAULTS.metadataUnitsCoords).toUpperCase(),
    defaultPipelineRef: String(src.defaultPipelineRef || DEFAULT_PCFX_DEFAULTS.defaultPipelineRef),
    defaultLineNoKey: String(src.defaultLineNoKey || DEFAULT_PCFX_DEFAULTS.defaultLineNoKey),
    defaultMaterial: String(src.defaultMaterial || DEFAULT_PCFX_DEFAULTS.defaultMaterial),
    defaultPipingClass: String(src.defaultPipingClass || DEFAULT_PCFX_DEFAULTS.defaultPipingClass),
    defaultRating: String(src.defaultRating || DEFAULT_PCFX_DEFAULTS.defaultRating),
    refPrefix: String(src.refPrefix || DEFAULT_PCFX_DEFAULTS.refPrefix),
    seqStart: Number.isFinite(Number(src.seqStart)) ? Number(src.seqStart) : DEFAULT_PCFX_DEFAULTS.seqStart,
    seqStep: Number.isFinite(Number(src.seqStep)) && Number(src.seqStep) !== 0 ? Number(src.seqStep) : DEFAULT_PCFX_DEFAULTS.seqStep,
    supportKind: String(src.supportKind || DEFAULT_PCFX_DEFAULTS.supportKind).toUpperCase(),
    supportName: String(src.supportName || DEFAULT_PCFX_DEFAULTS.supportName).toUpperCase(),
    supportDescription: String(src.supportDescription || DEFAULT_PCFX_DEFAULTS.supportDescription),
    supportFriction: Number.isFinite(Number(src.supportFriction)) ? Number(src.supportFriction) : DEFAULT_PCFX_DEFAULTS.supportFriction,
    supportGap: String(src.supportGap || DEFAULT_PCFX_DEFAULTS.supportGap),
  };
}

function _migrateLegacyViewerSettingsToViewer3DConfig(legacySettings, targetConfig) {
  if (!legacySettings || !targetConfig) return;

  if (legacySettings.projection) targetConfig.camera.projection = legacySettings.projection;
  if (legacySettings.fov) targetConfig.camera.fov = Number(legacySettings.fov) || targetConfig.camera.fov;
  if (legacySettings.rotateSpeed) targetConfig.controls.rotateSpeed = Number(legacySettings.rotateSpeed) || targetConfig.controls.rotateSpeed;
  if (legacySettings.panSpeed) targetConfig.controls.panSpeed = Number(legacySettings.panSpeed) || targetConfig.controls.panSpeed;
  if (legacySettings.zoomSpeed) targetConfig.controls.zoomSpeed = Number(legacySettings.zoomSpeed) || targetConfig.controls.zoomSpeed;
  if (legacySettings.dampingFactor) targetConfig.controls.dampingFactor = Number(legacySettings.dampingFactor) || targetConfig.controls.dampingFactor;
  if (legacySettings.showGrid === false) targetConfig.helpers.showGrid = false;
  if (legacySettings.showAxisGizmo === false) targetConfig.helpers.showAxisGizmo = false;
  if (legacySettings.showViewCube === false) targetConfig.helpers.showViewCube = false;
  if (legacySettings.viewCubeSize) targetConfig.overlay.viewCubeSize = Number(legacySettings.viewCubeSize) || targetConfig.overlay.viewCubeSize;
  if (legacySettings.viewCubePosition) targetConfig.overlay.viewCubePosition = String(legacySettings.viewCubePosition);
  if (legacySettings.viewCubeOpacity !== undefined) targetConfig.overlay.viewCubeOpacity = Number(legacySettings.viewCubeOpacity) || targetConfig.overlay.viewCubeOpacity;
  if (legacySettings.axisConvention === 'Y-up') {
    targetConfig.coordinateMap.verticalAxis = 'Y';
    targetConfig.coordinateMap.axisConvention = 'Y-up';
  }
  if (legacySettings.selectionColor) targetConfig.componentPanel.selectionColor = String(legacySettings.selectionColor);
  if (legacySettings.hoverColor) targetConfig.componentPanel.hoverColor = String(legacySettings.hoverColor);
}

export const state = {
  sticky: {
    code: 'ASME B31.3 - 2016',
    project: 'Petroleum Development Oman-PDO',
    facility: 'Inlet Separation and Boosting Facility, Ohanet',
    docNo: 'XX-XX-PFEED-',
    revision: 'Rev 0',
    references: [],
    assumptions: [],
    notes: [],
    supportMappings: _clone(DEFAULT_SUPPORT_BLOCKS),
    pcfxDefaults: _clone(DEFAULT_PCFX_DEFAULTS),
  },

  engineMode: (typeof localStorage !== 'undefined' ? localStorage.getItem('pcfStudio.engineMode') : null) || 'legacy',
  rawText: null,
  fileName: null,
  parsed: null,
  geometryDirectData: null,
  log: [],
  errors: [],
  activeTab: 'summary',
  tableToggles: {},
  scopeToggles: {
    code: true,
    nozzle: true,
    support: true,
    hydro: false,
    flange: true,
  },
  pinnedLoadNodes: [],
  legendField: 'none',
  viewer3dComponents: [],
  geoToggles: {
    nodeLabels: true,
    supports: true,
    maxLegendLabels: 3,
  },
  inputToggles: {
    props: [],
    classes: [],
  },

  // Existing Geometry tab settings (legacy, retained)
  viewerSettings: {
    cameraMode: 'orbit',
    projection: 'perspective',
    fov: 60,
    nearPlane: 0.1,
    farPlane: 1000000,
    rotateSpeed: 1.0,
    panSpeed: 1.0,
    zoomSpeed: 1.0,
    dampingFactor: 0.08,
    invertX: false,
    invertY: false,
    zoomToCursor: true,
    autoNearFar: true,
    axisConvention: 'Z-up',
    upAxis: 'Z',
    northAxis: 'Y',
    eastAxis: 'X',
    showAxisGizmo: true,
    gizmoSize: 80,
    gizmoPosition: 'bottom-left',
    showViewCube: true,
    viewCubeSize: 120,
    viewCubePosition: 'top-right',
    viewCubeOpacity: 0.85,
    viewCubeAnimDuration: 400,
    showLabels: true,
    labelMode: 'smart-density',
    labelDensity: 0.5,
    labelFontSize: 12,
    labelBackground: true,
    labelLeaderLines: true,
    labelCollisionMode: 'hide',
    labelPinning: false,
    labelPrecision: 2,
    showRestraints: true,
    showOnlySelectedRestraints: false,
    showActiveRestraints: false,
    showRestraintNames: false,
    showRestraintGUIDs: false,
    restraintSymbolScale: 1.0,
    filterSupportType: 'all',
    highlightFiredState: true,
    sectionEnabled: false,
    sectionAxis: 'X',
    sectionOffset: 0,
    sectionCap: true,
    clipIntersection: false,
    themePreset: 'NavisDark',
    renderStyle: 'iso',
    backgroundColor: null,
    antialias: true,
    showGrid: true,
    showLegend: true,
    showTransparency: false,
    selectionColor: '#FFA500',
    hoverColor: '#88CCFF',
    showProperties: true,
    propertyGroups: 'all',
  },

  // Dedicated 3D Viewer config (new)
  viewer3DConfig: _clone(DEFAULT_VIEWER3D_CONFIG),

  // RVM Viewer tab state
  rvm: {
    deploymentMode: 'static',
    capabilities: null,
    activeBundle: null,
    manifest: null,
    index: null,
    identityMap: null,
    tags: [],
    selection: { canonicalObjectId: null, canonicalObjectIds: [], renderObjectIds: [] },
    savedViews: [],
    diagnostics: [],
    asyncLoad: { loadId: null, status: 'idle', phase: null, progress: 0, error: null },
    routing: { ...DEFAULT_RVM_ROUTING },
  },

  rvmPcfExtract: {
    source: null,
    sourceLabel: null,
    scope: 'full',
    selectedCanonicalIds: [],
    selectedRenderObjectIds: [],
    sourceStatus: 'idle',
    sourceDiagnostics: [],
    pipelineGroups: {},
    rows: [],
    masters: {
      linelist: {
        rows: [],
        sourceName: '',
        autoMatch: true
      },
      weight: {
        autoMode: true,
        mode: 'legacy-valve-ca8',
        lookupKey: ['boreMm', 'ratingClass', 'lengthMm'],
        lengthToleranceMm: 6,
        rows: []
      },
      pipingClass: {
        autoMode: true,
        boreBasis: 'Converted Bore DN/NB mm',
        lazyLoadByBore: true,
        baseUrl: './Docs/Masters/piping_class/size_wise/',
        rows: []
      },
      materialMap: {
        rows: []
      },
      lineDump: {
        rows: []
      },
      supportMapping: {
        guidPrefix: 'UCI:',
        fallbackName: 'CA150',
        blocks: [
          { id: 1, frictionMatch: ['', '0.3'], gapCondition: 'empty', name: 'CA150', desc: 'Rest' },
          { id: 2, frictionMatch: ['0.15'], gapCondition: 'any', name: 'CA100', desc: 'Guide' },
        ]
      },
      branchGeometry: {
        rows: []
      },
      continuity: {
        continuityAutoAdjustEnabled: true,
        continuityMismatchToleranceMm: 6,
        continuityMovePriority: 'PIPE, FLANGE, VALVE, BEND, TEE',
        preferUpstreamComponent: true,
      },
      singlePcfForMultiLineSelection: true,
      pcfHeader: {
        isogenFiles: 'ISOGEN.FLS',
        unitsBore: 'MM',
        unitsCoords: 'MM',
        unitsWeight: 'KGS',
        unitsBoltDia: 'MM',
        unitsBoltLength: 'MM',
        projectIdentifier: 'P1',
        area: 'A1',
        fallbackPipelineReference: 'RVM-EXTRACT'
      }
    },
    diagnostics: [],
    continuityReport: null,
    pcfTextByPipelineRef: {},
    lastRequestedAt: null,
    lastBuiltAt: null,
  },
};

export function resetParsedState() {
  state.rawText = null;
  state.fileName = null;
  state.parsed = null;
  state.geometryDirectData = null;
  state.log = [];
  state.errors = [];
  state.pinnedLoadNodes = [];
  state.viewer3dComponents = [];
  state.inputToggles.props = [];
  state.inputToggles.classes = [];
}

export function loadStickyState() {
  try {
    const savedSticky = localStorage.getItem('concise-viewer-sticky');
    if (savedSticky) {
      const parsed = JSON.parse(savedSticky);
      Object.assign(state.sticky, parsed || {});
    }
    const mappedBlocks = _isLegacyDefaultSupportBlocks(state.sticky.supportMappings)
      ? _clone(DEFAULT_SUPPORT_BLOCKS)
      : _normalizeSupportBlocks(state.sticky.supportMappings);
    state.sticky.supportMappings = mappedBlocks.length ? mappedBlocks : _clone(DEFAULT_SUPPORT_BLOCKS);
    state.sticky.pcfxDefaults = _normalizePcfxDefaults(state.sticky.pcfxDefaults);

    const savedViewer = localStorage.getItem('viewer3d_settings');
    let legacyViewerObj = null;
    if (savedViewer) {
      legacyViewerObj = JSON.parse(savedViewer);
      Object.assign(state.viewerSettings, legacyViewerObj || {});
      if (state.viewerSettings.themePreset === 'IsoTheme') state.viewerSettings.themePreset = 'DrawLight';
      if (state.viewerSettings.themePreset === '3DTheme') state.viewerSettings.themePreset = 'NavisDark';
      state.viewerSettings.backgroundColor = null;
    }

    const savedViewer3DConfig = localStorage.getItem('viewer3d_config_v2');
    if (savedViewer3DConfig) {
      const parsed = JSON.parse(savedViewer3DConfig);
      // Deep merge so a saved config with only partial nested objects (e.g. camera.fov)
      // doesn't clobber the rest of the camera defaults on load.
      state.viewer3DConfig = _deepMerge(_clone(DEFAULT_VIEWER3D_CONFIG), parsed || {});
    } else {
      state.viewer3DConfig = _clone(DEFAULT_VIEWER3D_CONFIG);
      _migrateLegacyViewerSettingsToViewer3DConfig(legacyViewerObj, state.viewer3DConfig);
    }

    const savedRvm = localStorage.getItem('viewer3d_rvm_v1');
    if (savedRvm) {
      const parsedRvm = JSON.parse(savedRvm);
      if (parsedRvm && typeof parsedRvm === 'object') {
        if (parsedRvm.deploymentMode) state.rvm.deploymentMode = parsedRvm.deploymentMode;
        if (Array.isArray(parsedRvm.savedViews)) state.rvm.savedViews = parsedRvm.savedViews;
        if (Array.isArray(parsedRvm.tags)) state.rvm.tags = parsedRvm.tags;
        if (parsedRvm.routing && typeof parsedRvm.routing === 'object') {
          state.rvm.routing = {
            ...DEFAULT_RVM_ROUTING,
            ...parsedRvm.routing,
          };
        } else {
          state.rvm.routing = { ...DEFAULT_RVM_ROUTING };
        }
      }
    }
  } catch (e) {
    // keep defaults
    state.sticky.pcfxDefaults = _clone(DEFAULT_PCFX_DEFAULTS);
  }
}

export function saveStickyState() {
  try {
    localStorage.setItem('concise-viewer-sticky', JSON.stringify(state.sticky));
    localStorage.setItem('viewer3d_settings', JSON.stringify(state.viewerSettings));
    localStorage.setItem('viewer3d_config_v2', JSON.stringify(state.viewer3DConfig));
    const rvmPersist = {
      deploymentMode: state.rvm.deploymentMode,
      savedViews: state.rvm.savedViews,
      tags: state.rvm.tags,
      routing: state.rvm.routing,
    };
    localStorage.setItem('viewer3d_rvm_v1', JSON.stringify(rvmPersist));
  } catch (e) {
    // no-op
  }
}

// -- State Mutation Discipline (A1) --

export function setActiveTab(tabId) {
  emit(RuntimeEvents.TAB_CHANGED, { tabId });
}

export function updateViewer3DConfig(patch, reason = 'update') {
  if (typeof patch === 'function') {
    state.viewer3DConfig = patch(state.viewer3DConfig);
  } else {
    // Deep merge so partial nested patches (e.g. { camera: { fov: 45 } }) don't
    // clobber sibling keys like camera.near, camera.far, etc.
    state.viewer3DConfig = _deepMerge(state.viewer3DConfig, patch);
  }
  emit(RuntimeEvents.VIEWER3D_CONFIG_CHANGED, { source: 'state-mutation', reason });
}

export function setSourceMetadata(metadata) {
  Object.assign(state.sticky, metadata);
  saveStickyState();
  emit(RuntimeEvents.DOCNO_CHANGED, state.sticky.docNo);
}

export function updateModelExchangeSelection(selection) {
  if (!state.editorState) {
    state.editorState = { selection: { ids: [] } };
  }
  state.editorState.selection.ids = selection;
}

export function updateDiagnosticSnapshot(name, data) {
  if (!state.editorState.diagnostics) {
    state.editorState.diagnostics = { traces: [], metrics: {} };
  }
  state.editorState.diagnostics.metrics[name] = data;
}

export function updateRvmPcfExtractState(patch, reason = 'update') {
  if (typeof patch === 'function') {
    Object.assign(state.rvmPcfExtract, patch(state.rvmPcfExtract));
  } else {
    Object.assign(state.rvmPcfExtract, patch);
  }
  emit(RuntimeEvents.RVM_PCF_EXTRACT_STATE_CHANGED, { source: 'state-mutation', reason });
}
