import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAivQualificationWorkspaceHtml } from '../tabs/vibration-aiv-qualification-view.js';
import { createInitialAivQualificationState } from '../tabs/vibration-aiv-state.js';

test('qualification evidence distinguishes graph authoring from geometry authority', () => {
  const html = renderAivQualificationWorkspaceHtml(createInitialAivQualificationState());

  assert.match(html, /No 3D\/CAD geometry authority is created here/u);
  assert.match(html, /Flare-network graph authoring governs connectivity and explicit segment lengths only/u);
  assert.match(html, /SVG layout remains presentation-only/u);
  assert.match(html, /No pixel-derived distance or click-to-calculate flow/u);
  assert.doesNotMatch(html, /No 3D viewer, geometry editor/u);
});
