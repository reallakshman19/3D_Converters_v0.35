/**
 * Gate A: unedited CII replay through the EXISTING converter only.
 * Caller must prove current run/engine identity independently of this module.
 * Nothing is published unless the regenerated CII is byte-identical.
 */
import { ciiSha256 } from '../xml-cii-final-property-reader.js';
import { parseFinalCiiRigidInventory } from '../xml-cii-final-rigid-inventory.js';
import { runXmlCii2019StandaloneEngineJob } from '../xml-cii-workflow-engine-client.js';
import { assertRoundtripSnapshotFresh } from './xml-cii-roundtrip-snapshot.js';

const encoded = (text) => new TextEncoder().encode(text);
function firstDifferentByte(a, b) {
  const left = encoded(a), right = encoded(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1)
    if (left[i] !== right[i]) return i;
  return left.length === right.length ? -1 : Math.min(left.length, right.length);
}
function hold(reason, details = {}) {
  return { schema: 'xml-cii-roundtrip-replay/v1', verdict: 'HOLD', reason, published: false, ...details };
}

export async function replayUneditedRoundtrip(snapshot, current, runtime = {}) {
  try {
    await assertRoundtripSnapshotFresh(snapshot, current);
  } catch (error) {
    return hold(error?.message || String(error));
  }
  const job = {
    sourceKind: 'xml', sourceText: snapshot.engineInputText, sourceName: snapshot.sourceName,
    supportConfigJson: snapshot.supportConfigJson, stagedJsonText: snapshot.stagedJsonText,
    options: { ...snapshot.options, outputMode: 'cii-only' },
  };
  let result;
  try {
    // Intentionally bypass runXmlCii2019WorkflowService: running JS parity
    // again would enrich already-enriched source XML a second time.
    result = await runXmlCii2019StandaloneEngineJob(job, runtime);
  } catch (error) {
    return hold('ENGINE_EXCEPTION', { error: error?.message || String(error) });
  }
  if (!result?.ok || typeof result.ciiText !== 'string')
    return hold('ENGINE_REEXTRACTION_FAILED', { error: result?.error || 'No CII output.' });
  const original = snapshot.originalCiiText, regenerated = result.ciiText;
  const regeneratedSha256 = await ciiSha256(regenerated);
  const originalBytes = encoded(original).length, regeneratedBytes = encoded(regenerated).length;
  const firstDifference = firstDifferentByte(original, regenerated);
  const report = {
    originalCiiSha256: snapshot.manifest.originalCiiSha256,
    regeneratedCiiSha256: regeneratedSha256,
    originalByteLength: originalBytes, regeneratedByteLength: regeneratedBytes,
    firstDifferentByte: firstDifference,
    byteIdentical: firstDifference === -1 &&
      regeneratedSha256 === snapshot.manifest.originalCiiSha256,
  };
  if (!report.byteIdentical) return hold('NO_EDIT_CII_BYTES_DIFFER', { report });
  try {
    const baseline = parseFinalCiiRigidInventory(original);
    const replay = parseFinalCiiRigidInventory(regenerated);
    if (baseline.declared.elements !== replay.declared.elements ||
        baseline.declared.rigids !== replay.declared.rigids) {
      return hold('NO_EDIT_SECTION_COUNTS_DIFFER', { report });
    }
    report.elements = replay.declared.elements;
    report.rigids = replay.declared.rigids;
    report.pointerRelationsVerified = true;
  } catch (error) {
    return hold('NO_EDIT_CII_STRUCTURE_INVALID', { report, error: error?.message || String(error) });
  }
  return { schema: 'xml-cii-roundtrip-replay/v1', verdict: 'PASS',
    reason: 'NO_EDIT_BYTE_IDENTICAL', published: false, report };
}
