/**
 * viewer-actions.js - Canonical action registry for 3D Viewer toolbar and shortcuts.
 */
import { ViewerCommand, dispatchViewerCommand } from './contracts/viewer-commands.js';
import { addTraceEvent } from './core/logger.js';

export const ACTIONS = {
  NAV_SELECT: 'NAV_SELECT',
  NAV_ORBIT: 'NAV_ORBIT',
  NAV_PAN: 'NAV_PAN',
  MEASURE_TOOL: 'MEASURE_TOOL',
  VIEW_MARQUEE_ZOOM: 'VIEW_MARQUEE_ZOOM',
  NAV_PLAN_X: 'NAV_PLAN_X',
  NAV_ROTATE_Y: 'NAV_ROTATE_Y',
  NAV_ROTATE_Z: 'NAV_ROTATE_Z',
  VIEW_FIT_ALL: 'VIEW_FIT_ALL',
  VIEW_FIT_SELECTION: 'VIEW_FIT_SELECTION',
  VIEW_TOGGLE_PROJECTION: 'VIEW_TOGGLE_PROJECTION',
  SNAP_ISO_NW: 'SNAP_ISO_NW',
  SNAP_ISO_NE: 'SNAP_ISO_NE',
  SNAP_ISO_SW: 'SNAP_ISO_SW',
  SNAP_ISO_SE: 'SNAP_ISO_SE',
  SECTION_BOX: 'SECTION_BOX',
  SECTION_PLANE_UP: 'SECTION_PLANE_UP',
  SECTION_DISABLE: 'SECTION_DISABLE',
};

export function executeViewerAction(viewer, actionId) {
  if (!viewer || !actionId) return;

  // We map the legacy viewer actions to the unified dispatchViewerCommand contract where appropriate.
  switch (actionId) {
    case ACTIONS.NAV_SELECT:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.SET_VIEW_MODE, payload: { mode: 'select' } });
      addTraceEvent({ type: 'NAV_MODE_CHANGED', category: 'viewer3d', payload: { mode: 'select' } });
      break;
    case ACTIONS.NAV_ORBIT:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.SET_VIEW_MODE, payload: { mode: 'orbit' } });
      addTraceEvent({ type: 'NAV_MODE_CHANGED', category: 'viewer3d', payload: { mode: 'orbit' } });
      break;
    case ACTIONS.MEASURE_TOOL:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.TOGGLE_MEASURE });
      addTraceEvent({ type: 'MEASURE_TOGGLED', category: 'viewer3d' });
      break;
    case ACTIONS.NAV_PLAN_X:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.SET_VIEW_MODE, payload: { mode: 'plan' } });
      addTraceEvent({ type: 'NAV_MODE_CHANGED', category: 'viewer3d', payload: { mode: 'plan' } });
      break;
    case ACTIONS.NAV_ROTATE_Y:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.SET_VIEW_MODE, payload: { mode: 'rotateY' } });
      addTraceEvent({ type: 'NAV_MODE_CHANGED', category: 'viewer3d', payload: { mode: 'rotateY' } });
      break;
    case ACTIONS.NAV_ROTATE_Z:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.SET_VIEW_MODE, payload: { mode: 'rotateZ' } });
      addTraceEvent({ type: 'NAV_MODE_CHANGED', category: 'viewer3d', payload: { mode: 'rotateZ' } });
      break;
    case ACTIONS.NAV_PAN:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.SET_VIEW_MODE, payload: { mode: 'pan' } });
      addTraceEvent({ type: 'NAV_MODE_CHANGED', category: 'viewer3d', payload: { mode: 'pan' } });
      break;
    case ACTIONS.VIEW_MARQUEE_ZOOM:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.TOGGLE_MARQUEE_ZOOM });
      addTraceEvent({ type: 'MARQUEE_ZOOM_TOGGLED', category: 'viewer3d' });
      break;
    case ACTIONS.VIEW_FIT_ALL:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.FIT_ALL });
      addTraceEvent({ type: 'FIT_ALL_EXECUTED', category: 'viewer3d', payload: { modelLoaded: !!viewer?.scene } });
      break;
    case ACTIONS.VIEW_FIT_SELECTION:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.FIT_SELECTION });
      addTraceEvent({ type: 'FIT_SELECTION_EXECUTED', category: 'viewer3d', payload: { selectionCount: viewer?.selection?.size || 0 } });
      break;
    case ACTIONS.VIEW_TOGGLE_PROJECTION:
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.TOGGLE_PROJECTION });
      addTraceEvent({ type: 'PROJECTION_TOGGLED', category: 'viewer3d' });
      break;
    case ACTIONS.SNAP_ISO_NW:
    case ACTIONS.SNAP_ISO_NE:
    case ACTIONS.SNAP_ISO_SW:
    case ACTIONS.SNAP_ISO_SE:
      const preset = actionId === ACTIONS.SNAP_ISO_NW ? 'isoNW' :
                     actionId === ACTIONS.SNAP_ISO_NE ? 'isoNE' :
                     actionId === ACTIONS.SNAP_ISO_SW ? 'isoSW' : 'isoSE';
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.SET_VIEW_MODE, payload: { mode: 'snap', preset } });
      addTraceEvent({ type: 'SNAP_PRESET_EXECUTED', category: 'viewer3d', payload: { preset } });
      break;
    case ACTIONS.SECTION_BOX:
    case ACTIONS.SECTION_PLANE_UP:
    case ACTIONS.SECTION_DISABLE:
      const secMode = actionId === ACTIONS.SECTION_BOX ? 'BOX' :
                      actionId === ACTIONS.SECTION_PLANE_UP ? 'PLANE_UP' : 'DISABLE';
      dispatchViewerCommand({ viewer }, { type: ViewerCommand.TOGGLE_SECTION, payload: { mode: secMode } });
      addTraceEvent({ type: 'SECTION_MODE_CHANGED', category: 'viewer3d', payload: { mode: secMode } });
      break;
    default:
      console.warn(`[executeViewerAction] Unknown action: ${actionId}`);
      break;
  }
}

export function resolveActionOrder(config) {
  const order = Array.isArray(config?.toolbar?.order) ? config.toolbar.order : [];
  const visible = new Set(Array.isArray(config?.toolbar?.visibleActions) ? config.toolbar.visibleActions : []);
  const actions = [];
  for (const id of order) {
    const enabled = config?.actions?.[id]?.enabled !== false;
    if (visible.has(id) && enabled) actions.push(id);
  }
  return actions;
}
