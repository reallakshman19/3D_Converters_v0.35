/** Conservative browser source lineage adapter for first production R2 Weight edit.
 * Fully transformed / split / ambiguous source mappings stay HOLD. Nothing
 * here claims the complete Python R1 lineage ledger runs in the browser.
 */
import { inspectXmlWeightSources } from './xml-cii-source-weight-patch.js';
import { parseFinalCiiRigidInventory } from './xml-cii-final-rigid-inventory.js';
import { ciiSha256 } from './xml-cii-final-property-reader.js';

function hold(reason, pointer) { return { rigidPointer: pointer, status: 'HOLD',
  reason, sourceIdentity: null, sourceNode: null, writerSourceNode: null,
  expectedImpact: [], eligible: false }; }
const normalized = (value) => String(value ?? '').trim();
const eq = (a, b) => normalized(a) === normalized(b);
const noDup = (arr) => arr.length === 1;
const weightNumeric = (raw) => {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(raw || '').trim())) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const keyOf = (e) => [e.branchName, e.fromNode, e.toNode,
  Number(e.lengthMm).toFixed(6), String(e.outsideDiameterMm)].join('|');

export async function deriveSourceWeightEligibility({ result, inventory }) {
  const evidence = result?.finalRigidReviewEvidence;
  const rows = inventory?.rows || [];
  const refused = (reason) => rows.map(row => hold(reason, row.rigidPointer));
  if (!result?.ok || !result.ciiText || !evidence?.engineInputText ||
      !evidence?.supportConfigJson || !evidence?.effectiveOptions ||
      evidence?.sourceKind !== 'xml' || result?.ciiInputSource === 'topofix')
    return refused('Exact engine-input XML, effective options or conventional CII result not held.');
  const options = evidence.effectiveOptions;
  if (options.useTopoFixForCii || options.analyzeTopology || options.generateTopoFix)
    return refused('Topology/TopoFix execution changes input dependencies; this R2 path is not qualified.');
  const scale = evidence.weightScale;
  if (![1,10].includes(scale) ||
      (options.kgToNewton === false ? 1 : 10) !== scale)
    return refused('Weight scale/units not pinned to original converter invocation.');
  let config, source;
  try {
    config = JSON.parse(evidence.supportConfigJson);
    if (!config || typeof config !== 'object' || Array.isArray(config))
      return refused('Run-pinned support configuration is invalid.');
    if (Object.keys(config?.overrides?.rigidWeight || {}).length)
      return refused('Prior run contains rigidWeight overrides; converter may overwrite a source edit.');
    source = inspectXmlWeightSources(evidence.engineInputText);
  } catch (error) { return refused('Cannot parse source/config: ' + error.message); }
  const digest = await ciiSha256(evidence.engineInputText);
  if (evidence.engineInputSha256 && evidence.engineInputSha256 !== digest)
    return refused('Frozen engine-input SHA-256 disagrees with current source bytes.');
  const byBranch = new Map();
  const byComponent = new Map();
  for (const s of source) {
    const bucket = byBranch.get(s.branchOrdinal) || [];
    bucket.push(s); byBranch.set(s.branchOrdinal, bucket);
    if (s.componentRefNo) {
      const all = byComponent.get(s.componentRefNo) || [];
      all.push(s); byComponent.set(s.componentRefNo, all);
    }
  }
  // One pass over the frozen XML's direct adjacency, then O(1) lookups for
  // any number of RIGIDs. This cannot accidentally match across branches.
  const directEdges = new Map();
  for (const [branchOrdinal, arr] of byBranch) {
    for (let i=1;i<arr.length;i++) {
      const a=arr[i-1], b=arr[i];
      const key=[a.branchName,a.nodeNumber,b.nodeNumber].join('|');
      const matches=directEdges.get(key)||[];
      matches.push({a,b,branchOrdinal});
      directEdges.set(key,matches);
    }
  }
  const candidates = [];
  for (const row of rows) {
    if (row.linkedElements.length !== 1) {
      candidates.push(hold('Unreferenced or shared final CII RIGID pointer.', row.rigidPointer)); continue;
    }
    const edge = row.linkedElements[0];
    // This bounded adapter accepts only the unchanged two-node edge in the
    // current EnrichedXML, not negative-node renumbering or cleanup collapses.
    const pairs=directEdges.get([edge.branchName,edge.fromNode,edge.toNode].join('|'))||[];
    if (!noDup(pairs)) {
      candidates.push(hold('No uniquely verified direct original source edge (split/renumber/collapse or ambiguity).',
        row.rigidPointer)); continue;
    }
    const {a,b} = pairs[0];
    if (!a.position || !b.position ||
      Math.abs(Math.hypot(...a.position.map((v,i)=>v-b.position[i]))-edge.lengthMm) > 0.002) {
      candidates.push(hold('Source/CII edge length or coordinate mapping differs.',row.rigidPointer));
      continue;
    }
    // Exactly match the writer's selected source. A FROM RIGID with a FLAN TO
    // is written using FLAN's TO Weight, not carried from the FROM endpoint.
    const writer = normalized(b.rigid)==='2' ? b :
      normalized(a.rigid)==='2' && normalized(b.componentType).toUpperCase()==='FLAN' ? b : null;
    if (!writer || !writer.weightField) {
      candidates.push(hold('No unique writer-selected XML Node/Weight field.',row.rigidPointer));
      continue;
    }
    if (!writer.componentRefNo || (byComponent.get(writer.componentRefNo)||[]).length !== 1) {
      candidates.push(hold('Physical ComponentRefNo absent or shared by multiple source nodes; allocation unapproved.',
        row.rigidPointer)); continue;
    }
    if (a.componentRefNo && a.componentRefNo !== writer.componentRefNo &&
      (normalized(a.rigid)==='2' || /^(RIGID|FLAN|VALV|VLV|INST)/i.test(a.componentType))) {
      candidates.push(hold('Adjacent distinct weight-bearing components compete for physical ownership.',
        row.rigidPointer)); continue;
    }
    // Complete-impact fail-closed boundary: a second emitted RIGID even
    // *touching* the same source node may conceal an unresolved FROM/TO or
    // transformed ownership. Never authorize a one-pointer edit until the
    // entire potential output dependency set is exactly this one pointer.
    const potentiallyAffected = rows.filter(other =>
      other.linkedElements.some(link =>
        eq(link.branchName, writer.branchName) &&
        (eq(link.fromNode, writer.nodeNumber) ||
         eq(link.toNode, writer.nodeNumber))));
    if (potentiallyAffected.length !== 1 ||
        potentiallyAffected[0].rigidPointer !== row.rigidPointer) {
      candidates.push(hold('Source node touches multiple or unresolved final RIGID records; full allocation/dependency proof absent.',
        row.rigidPointer)); continue;
    }
    const observed = weightNumeric(writer.weightField.value);
    if (observed === null || Math.abs(observed*scale-row.weight) > 0.00001) {
      candidates.push(hold('Serialized CII Weight not identical to source Weight × pinned scale.',
        row.rigidPointer)); continue;
    }
    const sid = digest + ':' + writer.branchOrdinal + ':' + writer.nodeOrdinal;
    candidates.push({
      rigidPointer: row.rigidPointer, status:'SOURCE_MAPPING_VERIFIED_APPROVAL_REQUIRED',
      reason:'Unique direct source edge, writer Weight source and single source ComponentRefNo; physical approval required.',
      eligible:true, sourceIdentity:sid, writerSourceNode:writer,
      sourceNode: { branchName:writer.branchName,
        branchOrdinal:writer.branchOrdinal,nodeOrdinal:writer.nodeOrdinal,
        nodeNumber:writer.nodeNumber,componentRefNo:writer.componentRefNo,
        componentType:writer.componentType,originalWeightToken:writer.weightField.value,
        originalXmlWeight:observed },
      originalCiiWeight:row.weight, weightScale:scale, originalElement:edge,
      originalEdgeKey:keyOf(edge), sourceInputSha256:digest,
      expectedImpact:[{ elementIndex:edge.index, rigidPointer:row.rigidPointer,
        branchName:edge.branchName, fromNode:edge.fromNode,toNode:edge.toNode }],
    });
  }
  // A single source node may affect multiple generated RIGIDs, even where
  // each individual pointer looks unique. Without a full allocation contract,
  // the *whole* source node is not eligible for one-pointer edits.
  const byOwner = new Map();
  for (const row of candidates) if (row.sourceIdentity) {
    const owners = byOwner.get(row.sourceIdentity) || [];
    owners.push(row); byOwner.set(row.sourceIdentity,owners);
  }
  return candidates.map(row => (row.sourceIdentity && byOwner.get(row.sourceIdentity).length > 1)
    ? hold('Writer-selected XML node controls multiple RIGIDs; allocation plan not approved.',row.rigidPointer)
    : row);
}

export function verifyFrozenCiiEngineeringValues({ originalCiiText, inventory, entries }) {
  if (typeof originalCiiText !== 'string' || !originalCiiText.length)
    throw Error('HOLD_VALUE_CUSTODY: Missing independently retained frozen original CII text.');
  const actual = parseFinalCiiRigidInventory(originalCiiText);
  if (actual.rows.length !== inventory.rows.length ||
      actual.declared.elements !== inventory.declared.elements)
    throw Error('HOLD_VALUE_MISMATCH: CII declared structure differs from frozen evidence.');
  for (let i=0;i<actual.rows.length;i++) {
    const old=inventory.rows[i],now=actual.rows[i];
    if (now.rigidPointer!==old.rigidPointer || now.weight!==old.weight ||
        now.linkedElements.length!==old.linkedElements.length)
      throw Error('HOLD_VALUE_MISMATCH: Frozen RIGID weight/pointer mismatch.');
    for (let j=0;j<now.linkedElements.length;j++) {
      const x=now.linkedElements[j], y=old.linkedElements[j];
      if (x.index!==y.index || x.fromNode!==y.fromNode || x.toNode!==y.toNode ||
          x.rigidPointer!==y.rigidPointer || x.outsideDiameterMm!==y.outsideDiameterMm ||
          x.lengthMm!==y.lengthMm)
        throw Error('HOLD_VALUE_MISMATCH: Frozen ELEMENT OD/geometry mismatch.');
    }
  }
  for (const e of entries) {
    if (!e.eligible) continue;
    const row=actual.rows[e.rigidPointer-1];
    if (row?.weight!==e.originalCiiWeight ||
        row?.linkedElements?.[0]?.outsideDiameterMm!==e.originalElement.outsideDiameterMm ||
        row?.linkedElements?.[0]?.lengthMm!==e.originalElement.lengthMm)
      throw Error('HOLD_VALUE_MISMATCH: Ledger-only engineering values differ from CII.');
  }
  return { status:'SERIALIZED_VALUES_VERIFIED', fields:['RIGID.weight','ELEMENT.outsideDiameterMm',
    'ELEMENT.lengthMm'], rigidCount:actual.rows.length };
}
