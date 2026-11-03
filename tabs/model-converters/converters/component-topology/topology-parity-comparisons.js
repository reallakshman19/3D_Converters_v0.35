/** Aggregates focused topology parity comparison modules without report coupling. */
import { compareCanonicalEdgeNodeToInputXml, compareCanonicalEdgeNodeToSvgScene, compareInputXmlEdgeNodeToSvgScene } from './topology-parity-edge-node.js';
import { compareDeferredToInput, compareDeferredToScene, compareRigidsToInput, compareRigidsToScene, compareSupportsToInput, compareSupportsToScene } from './topology-parity-support-rigid.js';
import { compareBoundariesToInput, compareBoundariesToScene, compareJunctionsToInput, compareJunctionsToScene, comparePointFeaturesToScene } from './topology-parity-junction-boundary.js';

export function compareCanonicalToInputXml(canonical, parsed, ledger = { records: [] }) {
  return [
    ...compareCanonicalEdgeNodeToInputXml(canonical, parsed, ledger),
    ...compareSupportsToInput(canonical, parsed, ledger),
    ...compareRigidsToInput(canonical, parsed, ledger),
    ...compareJunctionsToInput(canonical, parsed, ledger),
    ...compareBoundariesToInput(canonical, parsed, ledger),
    ...compareDeferredToInput(canonical, parsed, ledger),
  ];
}

export function compareCanonicalToSvgScene(canonical, scene, ledger = { records: [] }) {
  return [
    ...compareCanonicalEdgeNodeToSvgScene(canonical, scene, ledger),
    ...compareSupportsToScene(canonical, scene, ledger),
    ...compareRigidsToScene(canonical, scene, ledger),
    ...compareJunctionsToScene(canonical, scene, ledger),
    ...compareBoundariesToScene(canonical, scene, ledger),
    ...comparePointFeaturesToScene(canonical, scene, ledger),
    ...compareDeferredToScene(canonical, scene, ledger),
  ];
}

export function compareInputXmlToSvgScene(parsed, scene) {
  return compareInputXmlEdgeNodeToSvgScene(parsed, scene);
}
