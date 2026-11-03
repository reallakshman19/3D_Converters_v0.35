const assert = require('assert');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.resolve(__dirname, '..');

(async () => {
  const mod = await import(pathToFileURL(path.join(root, 'tabs/model-converters/converters/inputxml2019_helper/inputxml-branch-preview.js')).href);

  const defaults = {
    defaultDiameter: 50,
    defaultWallThickness: 0.01,
    defaultInsulationThickness: 0,
    defaultCorrosionAllowance: 0,
    defaultPressure1: 0,
    defaultTemperature1: 0,
    defaultTemperature2: 0,
    defaultTemperature3: 0,
  };

  // Empty/unparsable input never throws; returns an empty, ok:false result.
  {
    const result = mod.parseInputXmlForBranchPreview('<Root></Root>', defaults);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.branches.length, 0);
    assert(Array.isArray(result.diagnostics) && result.diagnostics.length > 0);
  }

  // Verified directly against inputxml_to_cii2019.py's _parse_model() with
  // this exact XML and these exact defaults: element index 2 (100->110,
  // no DIAMETER attribute at all) carries forward 219.1 from element 1, it
  // does NOT fall back to defaultDiameter=50 - carry-forward runs across
  // the whole file in PIPINGELEMENT order, independent of branch grouping,
  // matching carry_diameter/carry_wall/... in _parse_model().
  const source = `<?xml version="1.0"?><CAESARII XML_TYPE="Input"><PIPINGMODEL>
    <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DIAMETER="219.1" WALL_THICK="8.18">
      <RESTRAINT NUM="1" NODE="20" TYPE="17"/>
      <RESTRAINT NUM="2" NODE="20" TYPE="9"/>
    </PIPINGELEMENT>
    <PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DIAMETER="219.1">
      <RESTRAINT NODE="30" TYPE="1"/>
    </PIPINGELEMENT>
    <PIPINGELEMENT FROM_NODE="100" TO_NODE="110" WALL_THICK="6"></PIPINGELEMENT>
    <PIPINGELEMENT FROM_NODE="200" TO_NODE="210" DIAMETER="100"/>
  </PIPINGMODEL></CAESARII>`;

  // Self-closing PIPINGELEMENT/RESTRAINT tags must not truncate block extraction
  // (a naive non-greedy "open...close" regex would stop at the first nested />).
  {
    const result = mod.parseInputXmlForBranchPreview(source, defaults);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.stats.elementCount, 4, 'all 4 PIPINGELEMENT entries must be found');
    assert.strictEqual(result.stats.restraintCount, 3, 'all 3 nested RESTRAINT entries must be found, including the second one in the first element');
    assert.deepStrictEqual(result.restraints.map((r) => r.type), ['17', '9', '1']);
  }

  // Contiguous FROM/TO chains group into branches; a gap in the node sequence starts a new branch.
  {
    const result = mod.parseInputXmlForBranchPreview(source, defaults);
    assert.strictEqual(result.stats.branchCount, 3);
    assert.strictEqual(result.branches[0].fromNode, '10');
    assert.strictEqual(result.branches[0].toNode, '30');
    assert.strictEqual(result.branches[0].elements.length, 2);
    assert.strictEqual(result.branches[1].fromNode, '100');
    assert.strictEqual(result.branches[2].fromNode, '200');
  }

  // Fields present in the source are marked as not defaulted and not
  // carried forward. A field missing on the very first element of the file
  // (nothing to carry forward from yet) falls back to the Tab 2 default.
  {
    const result = mod.parseInputXmlForBranchPreview(source, defaults);
    const first = result.elements[0];
    const diameter = first.fields.find((f) => f.key === 'diameter');
    const insulation = first.fields.find((f) => f.key === 'insulationThickness');
    assert.strictEqual(diameter.usedDefault, false);
    assert.strictEqual(diameter.usedCarryForward, false);
    assert.strictEqual(diameter.sourceValue, 219.1);
    assert.strictEqual(insulation.usedDefault, true);
    assert.strictEqual(insulation.usedCarryForward, false);
    assert.strictEqual(insulation.appliedValue, 0);
  }

  // A field missing on a later element carries forward the last real value
  // seen anywhere earlier in the file (not the Tab 2 default), matching the
  // real engine (verified directly against _parse_model() - see comment above).
  {
    const result = mod.parseInputXmlForBranchPreview(source, defaults);
    const third = result.elements[2]; // 100->110, WALL_THICK="6", no DIAMETER
    const thirdDiameter = third.fields.find((f) => f.key === 'diameter');
    assert.strictEqual(thirdDiameter.usedDefault, false);
    assert.strictEqual(thirdDiameter.usedCarryForward, true);
    assert.strictEqual(thirdDiameter.appliedValue, 219.1);
    assert.strictEqual(thirdDiameter.missingFromSource, true);

    const thirdWall = third.fields.find((f) => f.key === 'wallThickness');
    assert.strictEqual(thirdWall.usedDefault, false);
    assert.strictEqual(thirdWall.usedCarryForward, false);
    assert.strictEqual(thirdWall.sourceValue, 6);
  }

  // CAESAR's own -1.010100 "not applicable / inherit previous" sentinel is
  // treated identically to a fully-absent attribute: SENTINEL_MISSING in
  // inputxml_to_cii2019.py, not a real value.
  {
    const sentinelSource = `<?xml version="1.0"?><CAESARII XML_TYPE="Input"><PIPINGMODEL>
      <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DIAMETER="219.1" CORR_ALLOW="1.5"/>
      <PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DIAMETER="-1.010100" CORR_ALLOW="-1.010100"/>
    </PIPINGMODEL></CAESARII>`;
    const result = mod.parseInputXmlForBranchPreview(sentinelSource, defaults);
    const second = result.elements[1];
    const diameter = second.fields.find((f) => f.key === 'diameter');
    assert.strictEqual(diameter.missingFromSource, true, 'a -1.0101 sentinel must be treated as missing, not as a real -1.0101 value');
    assert.strictEqual(diameter.usedCarryForward, true);
    assert.strictEqual(diameter.appliedValue, 219.1);

    // corrosionAllowance is carryForward too, and the previous element had
    // a real value (1.5), so the sentinel on this element carries it
    // forward rather than falling back to the Tab 2 default (0).
    const corrosion = second.fields.find((f) => f.key === 'corrosionAllowance');
    assert.strictEqual(corrosion.missingFromSource, true);
    assert.strictEqual(corrosion.usedCarryForward, true);
    assert.strictEqual(corrosion.appliedValue, 1.5);

    // A branch is "allSourced" only when nothing on any of its elements was
    // defaulted or carried forward.
    assert.strictEqual(result.branches[0].allSourced, false);
  }

  // pressure1 (PRESSURE_C1) IS carry-forward in the real engine
  // (carry_pressure1 in _parse_model() - verified directly below), same as
  // diameter/wall/insulation/corrosion/temperature1-9/pressure1-9/
  // insulation density/fluid density/hydro pressure.
  {
    const pressureSource = `<?xml version="1.0"?><CAESARII XML_TYPE="Input"><PIPINGMODEL>
      <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DIAMETER="219.1" PRESSURE_C1="700"/>
      <PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DIAMETER="219.1"/>
    </PIPINGMODEL></CAESARII>`;
    const result = mod.parseInputXmlForBranchPreview(pressureSource, defaults);
    const second = result.elements[1];
    const pressure = second.fields.find((f) => f.key === 'pressure1');
    assert.strictEqual(pressure.usedCarryForward, true);
    assert.strictEqual(pressure.usedDefault, false);
    assert.strictEqual(pressure.appliedValue, 700);
  }

  // Attributes present in the source that aren't one of the known,
  // always-shown fields are surfaced (deduped, sorted) as "other" data,
  // e.g. TEMP_EXP_C4 when a file happens to populate a less-common case.
  {
    const otherSource = `<?xml version="1.0"?><CAESARII XML_TYPE="Input"><PIPINGMODEL>
      <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DIAMETER="219.1" TEMP_EXP_C4="55" HYDRO_PRESSURE="1500"/>
    </PIPINGMODEL></CAESARII>`;
    const result = mod.parseInputXmlForBranchPreview(otherSource, defaults);
    assert.deepStrictEqual(result.otherFieldNames, ['HYDRO_PRESSURE', 'TEMP_EXP_C4']);
    const otherFields = result.elements[0].otherFields;
    assert.deepStrictEqual(otherFields.map((f) => f.attr), ['HYDRO_PRESSURE', 'TEMP_EXP_C4']);
    assert.strictEqual(otherFields.find((f) => f.attr === 'TEMP_EXP_C4').value, '55');
  }

  // applyElementFieldEdits: rewrites an existing attribute in place on the
  // Nth <PIPINGELEMENT> (0-based, file order), leaving everything else
  // byte-identical, and the result re-parses back to the edited value.
  {
    const editSource = `<?xml version="1.0"?><CAESARII XML_TYPE="Input"><PIPINGMODEL>
      <PIPINGELEMENT FROM_NODE="10" TO_NODE="20" DIAMETER="219.1" WALL_THICK="-1.010100"/>
      <PIPINGELEMENT FROM_NODE="20" TO_NODE="30" DIAMETER="219.1"/>
    </PIPINGMODEL></CAESARII>`;
    const edited = mod.applyElementFieldEdits(editSource, [
      { elementIndex: 0, attr: 'WALL_THICK', value: 8.18 },
      { elementIndex: 1, attr: 'CORR_ALLOW', value: 1.5 }, // attribute not present yet - must be added
    ]);
    assert(edited.includes('WALL_THICK="8.18"'), 'existing attribute must be rewritten');
    assert(!edited.includes('WALL_THICK="-1.010100"'), 'old sentinel value must be gone');
    assert(edited.includes('CORR_ALLOW="1.5"'), 'missing attribute must be added');
    assert(edited.includes('DIAMETER="219.1"'), 'untouched attributes on the edited element must survive');

    const reparsed = mod.parseInputXmlForBranchPreview(edited, defaults);
    const wall = reparsed.elements[0].fields.find((f) => f.key === 'wallThickness');
    assert.strictEqual(wall.missingFromSource, false);
    assert.strictEqual(wall.appliedValue, 8.18);
    const corrosion = reparsed.elements[1].fields.find((f) => f.key === 'corrosionAllowance');
    assert.strictEqual(corrosion.missingFromSource, false);
    assert.strictEqual(corrosion.appliedValue, 1.5);
  }

  // No edits -> byte-identical passthrough.
  {
    const original = '<CAESARII><PIPINGMODEL><PIPINGELEMENT FROM_NODE="10" TO_NODE="20"/></PIPINGMODEL></CAESARII>';
    assert.strictEqual(mod.applyElementFieldEdits(original, []), original);
    assert.strictEqual(mod.applyElementFieldEdits(original, undefined), original);
  }

  console.log('InputXML branch/restraint preview parser checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
