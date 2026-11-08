/**
 * No-edit replay gate. Calls the REAL engine at the already-enriched boundary;
 * deliberately does not call runXmlCii2019WorkflowService (which re-enriches).
 * Test injection is always labelled TEST_ONLY, never engineering PASS.
 */
import { runXmlCii2019StandaloneEngineJob } from '../xml-cii-workflow-engine-client.js';
import { parseFinalCiiRigidInventory } from '../xml-cii-final-rigid-inventory.js';
import { byteLength, roundtripSha256, verifyRoundtripSnapshotCustody } from './xml-cii-roundtrip-snapshot.js';

const bytes = (value) => new TextEncoder().encode(value);
export function compareRoundtripBytes(original, revised) {
  const left = bytes(original), right = bytes(revised);
  let differences = Math.abs(left.length - right.length);
  let firstDifference = left.length === right.length ? null : Math.min(left.length, right.length);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) {
      differences += 1;
      if (firstDifference === null) firstDifference = i;
    }
  }
  return { originalByteLength: left.length, revisedByteLength: right.length,
    byteDifferences: differences, firstDifference };
}
export function createPinnedReplayJob(snapshot, revisedXmlText = snapshot.engineInputText) {
  if (typeof revisedXmlText !== 'string' || !revisedXmlText.trim())
    throw new Error('ROUNDTRIP_REPLAY_EMPTY_XML');
  if (snapshot.canonicalEditStage !== 'ENGINE_INPUT_XML')
    throw new Error('ROUNDTRIP_REPLAY_STAGE_NOT_QUALIFIED');
  return {
    sourceKind: 'xml', sourceName: snapshot.sourceName, sourceText: revisedXmlText,
    stagedJsonText: snapshot.stagedJsonText,
    supportConfigJson: snapshot.supportConfigJson,
    options: { ...snapshot.options, outputMode: 'cii-only',
      analyzeTopology: false, generateTopoFix: false, useTopoFixForCii: false },
  };
}
export async function verifyNoEditRoundtripReplay(snapshot, options = {}) {
  try {
    await verifyRoundtripSnapshotCustody(snapshot);
    if (options.currentEngineIdentity !== snapshot.engineIdentity)
      throw new Error('ROUNDTRIP_ENGINE_IDENTITY_MISMATCH');
    const job = createPinnedReplayJob(snapshot);
    const injected = typeof options.engineRunner === 'function';
    const runner = injected ? options.engineRunner
      : (engineJob) => runXmlCii2019StandaloneEngineJob(engineJob);
    const result = await runner(job);
    if (!result?.ok || typeof result.ciiText !== 'string' || !result.ciiText.trim())
      throw new Error('ROUNDTRIP_REAL_ENGINE_FAILED: ' + String(result?.error || 'no CII produced'));
    const baselineInventory = parseFinalCiiRigidInventory(snapshot.originalCiiText);
    const replayInventory = parseFinalCiiRigidInventory(result.ciiText);
    const originalDigest = await roundtripSha256(snapshot.originalCiiText);
    const replayDigest = await roundtripSha256(result.ciiText);
    const comparison = compareRoundtripBytes(snapshot.originalCiiText, result.ciiText);
    const sameCounts = JSON.stringify(baselineInventory.declared) === JSON.stringify(replayInventory.declared);
    const samePointers = baselineInventory.rows.length === replayInventory.rows.length &&
      baselineInventory.rows.every((row, index) => JSON.stringify(row.linkedElements.map((e) => e.index)) ===
        JSON.stringify(replayInventory.rows[index].linkedElements.map((e) => e.index)));
    const exact = originalDigest === replayDigest && comparison.byteDifferences === 0 && sameCounts && samePointers;
    return {
      schema: 'xml-cii-roundtrip-no-edit-replay/v1',
      verdict: exact ? (injected ? 'TEST_ONLY' : 'PASS') : 'HOLD',
      engineeringQualified: exact && !injected,
      replayEngine: injected ? 'INJECTED_TEST_RUNNER' : 'EXISTING_STANDALONE_ENGINE',
      runIdentity: snapshot.runIdentity, snapshotFingerprint: snapshot.fingerprint,
      originalCiiSha256: originalDigest, replayCiiSha256: replayDigest,
      ...comparison, sameCounts, samePointers,
      declared: replayInventory.declared,
      reason: exact ? (injected ? 'Only injected-runner parity; real engine not exercised.'
        : 'Exact real-engine byte parity.') : 'No-edit replay differs from baseline.',
    };
  } catch (error) {
    return { schema: 'xml-cii-roundtrip-no-edit-replay/v1', verdict: 'HOLD',
      engineeringQualified: false, runIdentity: snapshot?.runIdentity || null,
      reason: String(error?.message || error) };
  }
}
