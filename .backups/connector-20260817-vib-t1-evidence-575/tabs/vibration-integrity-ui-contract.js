import { VIBRATION_INTEGRITY_WORKFLOW_STATES } from './vibration-integrity-workflow-state.js';

export const VIBRATION_INTEGRITY_UI_CONTRACT = Object.freeze({
  schema: 'VibrationIntegrityUiContract.v1',
  version: 1,
  workspaceTabs: Object.freeze([
    Object.freeze({ id: 'screening', label: 'Screening workspace' }),
    Object.freeze({ id: 'mechanical', label: 'Mechanical T2.3' }),
    Object.freeze({ id: 'user-data', label: 'User Engineering Data' }),
    Object.freeze({ id: 'activity', label: 'Activity & workflow' }),
  ]),
  workflowStates: VIBRATION_INTEGRITY_WORKFLOW_STATES,
  selectors: Object.freeze({
    workspaceTab: 'data-vi-workspace-tab',
    workflowState: 'data-vi-workflow-state',
    auditLog: 'data-vi-audit-log',
    auditEvent: 'data-vi-audit-event',
    exportAuditAction: 'data-vi-action="export-audit"',
  }),
  authorityVocabulary: Object.freeze([
    'SCREENING',
    'CANDIDATE MASTER',
    'CANDIDATE USER INPUT',
    'PROJECT INPUT',
    'NOT AUTHORIZED',
    'DESIGN AUTHORITY FALSE',
  ]),
});
