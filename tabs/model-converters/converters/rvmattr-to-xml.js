import { decodeTextUtf8, encodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';
import { tryNativeRvmTextMode } from './rvm-to-rev.js';
import { _buildXmlFromStagedJsonText } from './stagedjson-to-xml.js';
import { parseRmssAttributes, parseRmssStructuralMembers } from '../../../converters/rmss-attribute-parser.js';
import { _looksLikeStagedHierarchy, _filterStagedHierarchyByScope, _buildPsiXmlFromRmssHierarchy } from './stagedjson-xml-helpers.js';
import { resolveXmlCiiSupportKind, buildStagedSupportIndex, xmlCiiTypeEntriesFromSupportKind, xmlCiiTypeEntryFromExistingRestraint, applyXmlRestraints } from '../../../converters/xml-cii2019-core/support-mapping.js';

// File-type helpers used by run() to detect RVM vs ATT/TXT by extension and role
function extOf(name = '') {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
}

function isRvmFile(file = {}) {
  return extOf(file.name) === 'rvm';
}

function isAttFile(file = {}) {
  const ext = extOf(file.name);
  return ext === 'att' || ext === 'txt';
}

// Read text from a file object that may carry either .text (test fixture) or .bytes (UI)
function fileText(file) {
  if (typeof file?.text === 'string') return file.text;
  if (file?.bytes) return decodeTextUtf8(file.bytes);
  return '';
}

// Helpers
function toText(value) {
  if (value === undefined || value === null) return '';
  return String(value);
}

function toFiniteNumber(value, fallback) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return fallback;
}

function isObjectRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function looksLikeBranchNode(entry) {
  if (!isObjectRecord(entry)) return false;
  const typeToken = toText(entry?.type || entry?.attributes?.TYPE || '').toUpperCase();
  const hasBranchType = typeToken === 'BRANCH' || typeToken === 'BRAN';
  const hasChildren = Array.isArray(entry.children);
  return hasBranchType && hasChildren;
}

function collectBboxLeafCount(payload) {
  let count = 0;
  const stack = [payload];
  while (stack.length > 0) {
    const current = stack.pop();
    if (Array.isArray(current)) {
      for (const child of current) stack.push(child);
      continue;
    }
    if (!isObjectRecord(current)) continue;
    const children = Array.isArray(current.children) ? current.children : null;
    const bbox = Array.isArray(current.bbox) ? current.bbox : null;
    const isLeaf = !children || children.length === 0;
    if (isLeaf && bbox && bbox.length === 6) count += 1;
    if (children) {
      for (const child of children) stack.push(child);
    }
  }
  return count;
}

const STP_STUB_HALF_MM = 75;

function stpFmtCoord(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

function stpPointDist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function buildStpTextFromMembers(rawMembers, outputName) {
  if (!Array.isArray(rawMembers) || !rawMembers.length) return null;
  const timestamp = new Date().toISOString().slice(0, 19) + 'Z';
  const escapedName = toText(outputName).replace(/'/g, "''");
  const header = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ATT support members exported as STEP polylines'),'2;1');",
    `FILE_NAME('${escapedName}','${timestamp}',('browser-runtime'),('browser-runtime'),'browser-runtime','browser-runtime','');`,
    "FILE_SCHEMA(('CIS2'));",
    'ENDSEC;',
    'DATA;',
  ];
  const dataLines = [];
  let entityId = 1;
  const polylineIds = [];

  for (const member of rawMembers) {
    let { start, end } = member;
    if (!start || !end) continue;
    if (stpPointDist(start, end) < 1) {
      start = { x: start.x, y: start.y, z: start.z - STP_STUB_HALF_MM };
      end   = { x: end.x,   y: end.y,   z: end.z   + STP_STUB_HALF_MM };
    }
    const kind = toText(member.kind || '').trim().toUpperCase();
    const rawLabel = toText(member.label || '');
    const labelText = kind && !rawLabel.toUpperCase().startsWith(`${kind}:`)
      ? `${kind}:${rawLabel}`
      : rawLabel;
    const label = labelText.replace(/'/g, "''");
    const s = entityId++;
    dataLines.push(`#${s}=CARTESIAN_POINT('',(${stpFmtCoord(start.x)},${stpFmtCoord(start.y)},${stpFmtCoord(start.z)}));`);
    const e = entityId++;
    dataLines.push(`#${e}=CARTESIAN_POINT('',(${stpFmtCoord(end.x)},${stpFmtCoord(end.y)},${stpFmtCoord(end.z)}));`);
    const p = entityId++;
    dataLines.push(`#${p}=POLYLINE('${label}',(#${s},#${e}));`);
    polylineIds.push(p);
  }

  if (!polylineIds.length) return null;
  const refs = polylineIds.map((id) => `#${id}`).join(',');
  dataLines.push(`#${entityId}=PRESENTATION_LAYER_ASSIGNMENT('SUPPORT_MEMBERS','',(${refs}));`);
  return [...header, ...dataLines, 'ENDSEC;', 'END-ISO-10303-21;'].join('\n') + '\n';
}

function normalizePoint(point) {
  if (point === undefined || point === null || point === '') return null;
  if (Array.isArray(point) && point.length >= 3) {
    const x = Number(point[0]), y = Number(point[1]), z = Number(point[2]);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }
  if (typeof point === 'object') {
    const x = Number(point.x ?? point.X), y = Number(point.y ?? point.Y), z = Number(point.z ?? point.Z);
    return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
  }
  const tokens = String(point).trim().split(/\s+/);
  if (tokens.length < 3) return null;
  const x = Number(tokens[0]), y = Number(tokens[1]), z = Number(tokens[2]);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? { x, y, z } : null;
}

function buildStpTextFromRmssHierarchy(hierarchy, outputName) {
  const normalized = Array.isArray(hierarchy) ? hierarchy : [];
  const rawMembers = [];
  let idx = 0;
  for (const branch of normalized) {
    if (!looksLikeBranchNode(branch)) continue;
    for (const child of Array.isArray(branch.children) ? branch.children : []) {
      const type = toText(child?.type || child?.attributes?.TYPE || '').toUpperCase();
      if (type !== 'SUPPORT') continue;
      const attrs = child?.attributes || {};
      const apos = normalizePoint(attrs.APOS);
      const lpos = normalizePoint(attrs.LPOS);
      const bpos = normalizePoint(attrs.BPOS);
      const hpos = normalizePoint(attrs.HPOS);
      const tpos = normalizePoint(attrs.TPOS);
      const pos  = normalizePoint(attrs.POS);
      const pairs = [[apos, lpos], [hpos, bpos], [apos, hpos], [apos, tpos]];
      let start = null, end = null;
      for (const [a, b] of pairs) {
        if (a && b && stpPointDist(a, b) > 1) { start = a; end = b; break; }
      }
      if (!start) {
        const anchor = pos || apos || lpos || hpos || bpos || tpos;
        if (!anchor) continue;
        start = { x: anchor.x, y: anchor.y, z: anchor.z };
        end   = { x: anchor.x, y: anchor.y, z: anchor.z };
      }
      const kind = toText(attrs.SUPPORT_TYPE || attrs.SUPPORT_KIND || '').trim().toUpperCase();
      rawMembers.push({
        label: toText(`${kind || 'SUPPORT'}:${attrs.NAME || child?.name || `SUPPORT:${++idx}`}`),
        start,
        end,
      });
    }
  }
  return buildStpTextFromMembers(rawMembers, outputName);
}

function normalizeRvmScopePattern(pattern) {
  return toText(pattern).trim();
}

function normalizeRvmScope(scope) {
  if (typeof scope === 'string') {
    const wildcard = normalizeRvmScopePattern(scope);
    return { wildcard, selectedIds: [], enabled: !!wildcard };
  }
  const wildcard = normalizeRvmScopePattern(scope?.wildcard ?? scope?.pattern ?? '');
  const selectedIds = Array.isArray(scope?.selectedIds)
    ? scope.selectedIds.map((id) => toText(id)).filter(Boolean)
    : [];
  return { wildcard, selectedIds, enabled: !!wildcard || selectedIds.length > 0 };
}

function rvmScopeRegex(pattern) {
  const normalized = normalizeRvmScopePattern(pattern);
  if (!normalized) return null;
  const escaped = normalized
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const source = normalized.includes('*') ? `^${escaped}$` : escaped;
  return new RegExp(source, 'i');
}

function filterStpMembersByScope(members, rawScope) {
  const scope = normalizeRvmScope(rawScope);
  const source = Array.isArray(members) ? members : [];
  if (!scope.enabled) return source;
  if (!scope.wildcard) return [];
  const regex = rvmScopeRegex(scope.wildcard);
  if (!regex) return source;
  return source.filter((member) => regex.test([member?.label, member?.kind].map((part) => toText(part)).join(' ')));
}

function rvmScopeLogLine(scopeStats) {
  if (!scopeStats?.enabled) return '';
  const selected = Number(scopeStats.selectedCount || 0) > 0 ? `, selected=${scopeStats.selectedCount}` : '';
  const wildcard = scopeStats.wildcard ? `, wildcard=${scopeStats.wildcard}` : '';
  return `Scope filter applied: ${scopeStats.keptBranchCount}/${scopeStats.originalBranchCount} branch(es) matched${selected}${wildcard}.`;
}

function mergeStageLogs(stages) {
  const stdout = [];
  const stderr = [];
  for (const s of stages) {
    if (s.title) {
      stdout.push(`--- ${s.title} ---`);
    }
    if (Array.isArray(s.logs?.stdout)) stdout.push(...s.logs.stdout);
    if (Array.isArray(s.logs?.stderr)) stderr.push(...s.logs.stderr);
  }
  return { stdout, stderr };
}

function buildRvmAttrResponseFromAttText(attText, inputName, options) {
  const stem = baseNameWithoutExtension(inputName || 'RMSS_ATTRIBUTE');
  const parsedHierarchy = parseRmssAttributes(attText, options.rvmRouting);
  const scope = _filterStagedHierarchyByScope(parsedHierarchy, options?.rvmScope);
  const hierarchy = scope.hierarchy;
  if (!hierarchy.length) {
    throw new Error(`Scope filter ${JSON.stringify(scope.pattern)} did not match any ATT/RVM branch/site.`);
  }
  const xmlFromAtt = _buildPsiXmlFromRmssHierarchy(hierarchy, inputName, options);
  let attStpText = null;
  const structMembers = filterStpMembersByScope(parseRmssStructuralMembers(attText), scope.scope);
  if (structMembers.length > 0) {
    attStpText = buildStpTextFromMembers(structMembers, `${stem}_supports.stp`);
  } else {
    attStpText = buildStpTextFromRmssHierarchy(hierarchy, `${stem}_supports.stp`);
  }
  const attOutputs = [
    {
      name: `${stem}_rvmattr_to_xml.xml`,
      text: xmlFromAtt.xmlText,
      mime: 'text/xml;charset=utf-8',
    },
    {
      name: `${stem}_managed_stage.json`,
      text: JSON.stringify(hierarchy, null, 2),
      mime: 'application/json;charset=utf-8',
    },
  ];
  if (attStpText) attOutputs.push({ name: `${stem}_supports.stp`, text: attStpText, mime: 'text/plain;charset=utf-8' });
  return {
    outputs: attOutputs,
    logs: {
      stdout: [
        rvmScopeLogLine(scope.stats),
        `ATT/TXT parsed into ${xmlFromAtt.branchCount} branch(es).`,
        `Generated ${xmlFromAtt.nodeCount} node(s) into PSI-style XML.`,
        `Support mapper conversion pass: scanned=${xmlFromAtt.supportMapperStats?.scanned || 0}, mapped=${xmlFromAtt.supportMapperStats?.mapped || 0}.`,
        ...(attStpText ? [`Generated STP for ${structMembers.length > 0 ? 'structural' : 'pipeline support'} members.`] : []),
      ].filter(Boolean),
      stderr: xmlFromAtt.skippedComponents > 0
        ? [`Skipped ${xmlFromAtt.skippedComponents} component(s) with incomplete coordinates.`]
        : [],
    },
  };
}

export async function run(context) {
  const inputFiles = Array.isArray(context.inputFiles) ? context.inputFiles : [];

  // Detect RVM and ATT/TXT files by extension + role, independent of role ordering
  const rvmFile =
    inputFiles.find((f) => f.role === 'primary' && isRvmFile(f)) ||
    inputFiles.find(isRvmFile) ||
    null;

  const attFile =
    inputFiles.find((f) => f.role === 'secondary' && isAttFile(f)) ||
    inputFiles.find(isAttFile) ||
    null;

  if (!rvmFile && !attFile) {
    return {
      ok: false,
      outputs: [],
      logs: {
        stdout: [],
        stderr: ['Select an RVM file or an ATT/TXT attribute file first.'],
      },
    };
  }

  const runValues = { ...context.options };

  // ATT/TXT-only mode: produce XML+JSON from attributes; STP skipped (no geometry)
  if (!rvmFile && attFile) {
    const attText = fileText(attFile);
    const attResult = buildRvmAttrResponseFromAttText(attText, attFile.name || 'conversion', runValues);
    return { ok: true, ...attResult };
  }

  // RVM mode — map to legacy variable names used by the rest of the function
  const primary = rvmFile;
  const secondary = attFile;
  const secondaryBytes = secondary?.bytes ?? null;

  if (!primary.name.toLowerCase().endsWith('.rvm')) {
    throw new Error(`Selected file "${primary.name}" is not .rvm. Use RVM input for ${context.converterId}.`);
  }

  const stem = baseNameWithoutExtension(primary.name);
  const primaryBytes = primary.bytes ?? null;
  const stages = [];
  const scope = normalizeRvmScope(runValues?.rvmScope);

  if (scope.enabled && secondary) {
    const attText = fileText(secondary) || (secondaryBytes ? decodeTextUtf8(secondaryBytes) : '');
    return buildRvmAttrResponseFromAttText(attText, secondary.name || primary.name, runValues);
  }

  if (runValues.preferJsonToXml !== false) {
    try {
      const nativeJson = await tryNativeRvmTextMode(primary, primaryBytes, secondary, secondaryBytes, 'rvm_to_json', '_rvm_to_json.json');
      if (nativeJson) {
        const jsonOutput = nativeJson.outputs?.[0];
        if (jsonOutput && typeof jsonOutput.text === 'string') {
          let usedJsonPath = false;
          try {
            const stagedResult = _buildXmlFromStagedJsonText(jsonOutput.text, jsonOutput.name, runValues);
            stages.push({ title: `Native JSON bridge ${nativeJson.endpoint || ''}`.trim(), logs: nativeJson.logs });
            stages.push({
              title: 'StagedJSON -> XML',
              logs: {
                stdout: [
                  rvmScopeLogLine(stagedResult.scopeStats),
                  `Staged hierarchy detected: ${stagedResult.branchCount} branch(es), ${stagedResult.nodeCount} node(s).`,
                  `Support mapper conversion pass: scanned=${stagedResult.supportMapperStats?.scanned || 0}, mapped=${stagedResult.supportMapperStats?.mapped || 0}.`,
                ].filter(Boolean),
                stderr: stagedResult.skippedComponents > 0
                  ? [`Skipped ${stagedResult.skippedComponents} component(s) with incomplete coordinates.`]
                  : [],
              },
            });
            const pathAOutputs = [
              {
                name: `${stem}_rvmattr_to_xml.xml`,
                text: stagedResult.xmlText,
                mime: 'text/xml;charset=utf-8',
              },
              {
                name: `${stem}_managed_stage.json`,
                text: stagedResult.stageJsonText,
                mime: 'application/json;charset=utf-8',
              },
            ];
            try {
              let stpText = null;
              if (secondary && secondaryBytes) {
                const attText = decodeTextUtf8(secondaryBytes);
                const structMembers = filterStpMembersByScope(parseRmssStructuralMembers(attText), stagedResult.rvmScope || stagedResult.scopePattern);
                if (structMembers.length > 0) {
                  stpText = buildStpTextFromMembers(structMembers, `${stem}_supports.stp`);
                }
              }
              if (!stpText) {
                const hier = JSON.parse(stagedResult.stageJsonText);
                stpText = buildStpTextFromRmssHierarchy(hier, `${stem}_supports.stp`);
              }
              if (stpText) pathAOutputs.push({ name: `${stem}_supports.stp`, text: stpText, mime: 'text/plain;charset=utf-8' });
            } catch {}
            return {
              outputs: pathAOutputs,
              logs: mergeStageLogs(stages),
              endpoint: nativeJson.endpoint,
            };
          } catch {}

          try {
            const parsedPayload = JSON.parse(jsonOutput.text);
            const bboxLeafCount = collectBboxLeafCount(parsedPayload);
            if (bboxLeafCount > 0 && context.workerRunner) {
              const jsonToXmlResponse = await context.workerRunner.runJob({
                converterId: 'json_to_xml',
                inputFiles: [{ role: 'primary', name: jsonOutput.name, bytes: encodeTextUtf8(jsonOutput.text) }],
                options: {
                  coordFactor: runValues?.coordFactor,
                  nodeStart: runValues?.nodeStart,
                  nodeStep: runValues?.nodeStep,
                  defaultDiameter: runValues?.defaultDiameter,
                  defaultWallThickness: runValues?.defaultWallThickness,
                  defaultCorrosionAllowance: runValues?.defaultCorrosionAllowance,
                  defaultInsulationThickness: runValues?.defaultInsulationThickness,
                },
              });
              const jsonXmlOutput = jsonToXmlResponse.outputs?.[0];
              if (jsonXmlOutput && typeof jsonXmlOutput.text === 'string') {
                usedJsonPath = true;
                stages.push({ title: `Native JSON bridge ${nativeJson.endpoint || ''}`.trim(), logs: nativeJson.logs });
                stages.push({ title: 'JSON -> XML', logs: jsonToXmlResponse.logs });
                return {
                  outputs: [
                    {
                      name: `${stem}_rvmattr_to_xml.xml`,
                      text: jsonXmlOutput.text,
                      mime: 'text/xml;charset=utf-8',
                    },
                    {
                      name: `${stem}_managed_stage.json`,
                      text: jsonOutput.text,
                      mime: 'application/json;charset=utf-8',
                    },
                  ],
                  logs: mergeStageLogs(stages),
                  endpoint: nativeJson.endpoint,
                };
              }
            }
          } catch {}

          if (!usedJsonPath) {
            stages.push({
              title: 'JSON -> XML fallback note',
              logs: {
                stdout: [],
                stderr: ['Native JSON payload did not match staged hierarchy or bbox-leaf JSON; falling back to REV -> XML.'],
              },
            });
          }
        }
      }
    } catch (error) {
      stages.push({ title: 'JSON -> XML fallback note', logs: { stdout: [], stderr: [toText(error?.message || error)] } });
    }
  }

  if (scope.enabled) {
    throw new Error('Scoped ATT/RVM conversion requires an ATT/TXT sidecar or a staged JSON bridge response; aborting instead of producing an unfiltered REV fallback.');
  }

  const nativeRev = await tryNativeRvmTextMode(primary, primaryBytes, secondary, secondaryBytes, 'rvm_to_rev', '_rvm_to_rev.rev');
  if (!nativeRev) {
    throw new Error(
      'Native RVM bridge is not reachable. Start local server (node test_server.js) so /api/native/rvm-to-rev can run rvmparser-windows-bin.exe.'
    );
  }
  const revOutput = nativeRev.outputs?.[0];
  if (!revOutput || typeof revOutput.text !== 'string') {
    throw new Error('Native bridge did not return REV text output.');
  }
  if (!context.workerRunner) {
    throw new Error('Python worker runtime is not available.');
  }
  const revToXmlResponse = await context.workerRunner.runJob({
    converterId: 'rev_to_xml',
    inputFiles: [{ role: 'primary', name: revOutput.name, bytes: encodeTextUtf8(revOutput.text) }],
    options: {
      coordFactor: runValues?.coordFactor,
      nodeStart: runValues?.nodeStart,
      nodeStep: runValues?.nodeStep,
      nodeMergeTolerance: runValues?.nodeMergeTolerance,
      source: runValues?.source,
      purpose: runValues?.purpose,
      titleLine: runValues?.titleLine,
      enablePsiRigidLogic: !!runValues?.enablePsiRigidLogic,
    },
  });
  const xmlOutput = revToXmlResponse.outputs?.[0];
  if (!xmlOutput || typeof xmlOutput.text !== 'string') {
    throw new Error('REV -> XML stage did not return XML text output.');
  }
  stages.push({ title: `Native REV bridge ${nativeRev.endpoint || ''}`.trim(), logs: nativeRev.logs });
  stages.push({ title: 'REV -> XML', logs: revToXmlResponse.logs });

  const finalOutputs = [
    {
      name: `${stem}_rvmattr_to_xml.xml`,
      text: xmlOutput.text,
      mime: 'text/xml;charset=utf-8',
    },
    {
      name: `${stem}_managed_stage.rev`,
      text: revOutput.text,
      mime: 'text/plain;charset=utf-8',
    },
  ];

  try {
    const revToStpResponse = await context.workerRunner.runJob({
      converterId: 'rev_to_stp',
      inputFiles: [{ role: 'primary', name: revOutput.name, bytes: encodeTextUtf8(revOutput.text) }],
      options: {
        coordFactor: toFiniteNumber(runValues?.coordFactor, 1000),
        supportPathContains: toText(runValues?.supportPathContains) || 'RRIMS-PIPESUPP',
        includeGenericSupportGroups: !!runValues?.includeGenericSupportGroups,
        schemaName: toText(runValues?.schemaName) || 'CIS2',
      },
    });
    const stpOutput = revToStpResponse.outputs?.[0];
    if (stpOutput && typeof stpOutput.text === 'string' && stpOutput.text.trim()) {
      finalOutputs.push({
        name: `${stem}_supports.stp`,
        text: stpOutput.text,
        mime: 'text/plain;charset=utf-8',
      });
      stages.push({ title: 'REV -> STP', logs: revToStpResponse.logs });
    }
  } catch {
    // STEP generation is best-effort
  }

  return {
    outputs: finalOutputs,
    logs: mergeStageLogs(stages),
    endpoint: nativeRev.endpoint,
  };
}
