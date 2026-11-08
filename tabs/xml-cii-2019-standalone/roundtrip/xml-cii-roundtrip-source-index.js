/**
 * Read-only census of engine-input XML source nodes.
 * This is deliberately NOT a reverse mapping into original uploaded XML.
 * Ordinals are stable only within the pinned engine-input digest.
 */
const local = (node) => String(node?.localName || node?.nodeName || '').replace(/^.*:/, '');
const elements = (node) => [...(node?.childNodes || [])].filter((n) => n.nodeType === 1);
const child = (node, name) => elements(node).find((n) => local(n) === name);
const value = (node, name) => child(node, name)?.textContent?.trim() ?? '';
const normalizedRef = (v) => String(v || '').trim().replace(/^=/, '').toUpperCase();

export function collectRoundtripEngineSourceNodes(snapshot, parserFactory = () => new DOMParser()) {
  if (snapshot?.schema !== 'xml-cii-roundtrip-snapshot/v1') throw new Error('ROUNDTRIP_INVALID_SNAPSHOT');
  if (typeof parserFactory !== 'function') throw new Error('ROUNDTRIP_DOM_PARSER_UNAVAILABLE');
  const doc = parserFactory().parseFromString(snapshot.engineInputText, 'application/xml');
  if (!doc || doc.getElementsByTagName('parsererror').length)
    throw new Error('ROUNDTRIP_ENGINE_INPUT_XML_MALFORMED');
  const branches = [...doc.getElementsByTagName('*')].filter((n) => local(n) === 'Branch');
  const records = [];
  branches.forEach((branch, branchOrdinal) => {
    const branchName = value(branch, 'Branchname');
    const nodes = elements(branch).filter((n) => local(n) === 'Node');
    nodes.forEach((node, nodeOrdinal) => {
      const fields = {};
      for (const key of ['NodeNumber', 'NodeName', 'ComponentRefNo', 'ComponentType',
        'Weight', 'Rigid', 'BoreMm', 'Rating', 'DTXR_POS', 'DTXR_PS']) {
        fields[key] = value(node, key);
      }
      records.push({
        kind: 'ENRICHEDXML_SOURCE', stage: 'ENGINE_INPUT',
        runIdentity: snapshot.runIdentity,
        engineInputSha256: snapshot.hashes.engineInputSha256,
        branchName, branchOrdinal, nodeOrdinal,
        selector: { branchOrdinal, nodeOrdinal },
        sourceNodeIdentity: JSON.stringify([snapshot.hashes.engineInputSha256, branchOrdinal, nodeOrdinal]),
        nodeNumber: fields.NodeNumber,
        componentRefNo: normalizedRef(fields.ComponentRefNo),
        componentType: fields.ComponentType,
        fields,
        // A logical selector, not an independently verified byte-span location.
        sourceSelector: 'Branch[' + (branchOrdinal + 1) + ']/Node[' + (nodeOrdinal + 1) + ']',
        originalUploadedXmlIdentity: null,
        patchable: false,
      });
    });
  });
  return records;
}
