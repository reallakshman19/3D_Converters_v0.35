/**
 * Functionality: builds PSI-116 compliant XML output from enriched
 * component records. Emits the schema consumed by xml_to_cii2019.py:
 * PipeStressExport > Pipe > Branch > Node.
 * Component cardinality and endpoint semantics are delegated to explicit
 * node contracts; the writer only serializes normalized node specifications.
 */

import { formatRestraintXml } from './sj-restraint-resolver.js';
import { formatPosition, bestPosition } from './sj-point-resolver.js';
import { isSupportType, rigidValue } from './sj-type-mapper.js';
import {
  isXmlBoundaryComponent,
  projectBoundaryNodeContract,
  resolveXmlEngineeringValues,
} from './sj-node-contract.js';

const XML_NS = 'http://aveva.com/pipeStress116.xsd';
const NULL_TEMP = '-100000';

export function buildEnrichedXml(branchMap, config = {}) {
  const lines = [];
  lines.push(`<?xml version="1.0" encoding="utf-8"?>`);
  lines.push(`<PipeStressExport xmlns="${XML_NS}">`);

  const now = new Date();
  lines.push(`<DateTime>${now.toLocaleString('en-GB')}</DateTime>`);
  lines.push(`<Source>StagedJSON→EnrichXML</Source>`);
  lines.push(`<Version>1.0</Version>`);
  lines.push(`<Purpose>StagedJSON enrichment output</Purpose>`);
  lines.push(`<ProjectName>${esc(config.projectName || '')}</ProjectName>`);
  lines.push(`<MDBName>${esc(config.mdbName || '/')}</MDBName>`);
  lines.push(`<TitleLine>StagedJSON Enriched Export</TitleLine>`);
  lines.push(`<Units>`);
  lines.push(`  <DistanceUnits>mm</DistanceUnits>`);
  lines.push(`  <BoreUnits>mm</BoreUnits>`);
  lines.push(`  <PressureUnits>pascal</PressureUnits>`);
  lines.push(`  <TemperatureUnits>degC</TemperatureUnits>`);
  lines.push(`  <WeightUnits>kg</WeightUnits>`);
  lines.push(`  <ForceUnits>newton</ForceUnits>`);
  lines.push(`  <WallThicknessUnits>mm</WallThicknessUnits>`);
  lines.push(`  <FluidDensityUnits>kg/m3</FluidDensityUnits>`);
  lines.push(`</Units>`);
  lines.push(`<RestrainOpenEnds>Yes</RestrainOpenEnds>`);
  lines.push(`<AmbientTemperature>21</AmbientTemperature>`);

  lines.push(`<Pipe>`);
  lines.push(`<FullName>${esc(config.pipeName || '/STAGEDJSON-EXPORT')}</FullName>`);

  let nodeCounter = 10;
  for (const [branchName, records] of branchMap) {
    const branchBlock = buildBranchBlock(branchName, records, config, nodeCounter);
    lines.push(...branchBlock.lines);
    nodeCounter += branchBlock.numberingSpan * 10;
  }

  lines.push(`</Pipe>`);
  lines.push(`</PipeStressExport>`);
  return lines.join('\n');
}

function buildBranchBlock(branchName, records, config, startNum) {
  const lines = [`<Branch>`];
  lines.push(`<Branchname>${esc(branchName)}</Branchname>`);

  let t1 = NULL_TEMP, t2 = NULL_TEMP, t3 = NULL_TEMP;
  let p1 = '0', p2 = '0', p3 = '0';

  for (const rec of records) {
    const ea = rec.enrichedAttributes || {};
    const attrs = rec.attrs || {};
    if (t1 === NULL_TEMP && (ea.designTemperatureC !== undefined || attrs.T1 !== undefined)) {
      t1 = ea.designTemperatureC ?? attrs.T1 ?? attrs.T ?? NULL_TEMP;
    }
    if (t2 === NULL_TEMP && (ea.operatingTemperatureC !== undefined || attrs.T2 !== undefined)) {
      t2 = ea.operatingTemperatureC ?? attrs.T2 ?? NULL_TEMP;
    }
    if (t3 === NULL_TEMP && (ea.minimumTemperatureC !== undefined || attrs.T3 !== undefined)) {
      t3 = ea.minimumTemperatureC ?? attrs.T3 ?? NULL_TEMP;
    }

    if (p1 === '0') {
      if (ea.designPressureMpa !== undefined && ea.designPressureMpa !== null) p1 = ea.designPressureMpa * 1000000;
      else if (attrs.P1 !== undefined) p1 = attrs.P1;
      else if (attrs.P !== undefined) p1 = attrs.P;
    }
    if (p2 === '0') p2 = attrs.P2 ?? '0';
    if (p3 === '0') p3 = attrs.P3 ?? '0';
  }

  lines.push(`<Temperature>`);
  lines.push(`  <Temperature1>${t1}</Temperature1>`);
  lines.push(`  <Temperature2>${t2}</Temperature2>`);
  lines.push(`  <Temperature3>${t3}</Temperature3>`);
  for (let i = 4; i <= 9; i += 1) lines.push(`  <Temperature${i}>${NULL_TEMP}</Temperature${i}>`);
  lines.push(`</Temperature>`);

  lines.push(`<Pressure>`);
  lines.push(`  <Pressure1>${p1}</Pressure1>`);
  lines.push(`  <Pressure2>${p2}</Pressure2>`);
  lines.push(`  <Pressure3>${p3}</Pressure3>`);
  for (let i = 4; i <= 9; i += 1) lines.push(`  <Pressure${i}>0</Pressure${i}>`);
  lines.push(`</Pressure>`);

  lines.push(`<MaterialNumber>0</MaterialNumber>`);
  lines.push(`<InsulationDensity>0</InsulationDensity>`);
  lines.push(`<FluidDensity>0</FluidDensity>`);

  let numberingSpan = 0;
  for (const rec of records) {
    const allocationStart = startNum + numberingSpan * 10;
    const nodeXml = buildNodeBlocks(rec, allocationStart, config);
    rec.xmlNodeNum = nodeXml.primaryNodeNumber ?? allocationStart;
    lines.push(...nodeXml.lines);
    numberingSpan += nodeXml.numberingSpan;
  }

  lines.push(`</Branch>`);
  return { lines, numberingSpan };
}

function buildNodeBlocks(rec, nodeNum, config) {
  const type = rec.componentType;

  if (isSupportType(type)) {
    return {
      lines: buildSupportNode(rec, nodeNum, config),
      numberingSpan: 1,
      primaryNodeNumber: nodeNum,
    };
  }

  if (isXmlBoundaryComponent(type)) {
    const projection = projectBoundaryNodeContract(rec, nodeNum);
    return {
      lines: projection.nodes.flatMap(buildProjectedNode),
      numberingSpan: projection.numberingSpan,
      primaryNodeNumber: projection.primaryNodeNumber,
    };
  }

  return {
    lines: buildRigidNode(rec, nodeNum, config),
    numberingSpan: 1,
    primaryNodeNumber: nodeNum,
  };
}

function buildSupportNode(rec, nodeNum, config) {
  const resolved = rec.resolved || {};
  const position = bestPosition(rec.attrs);
  const dimensions = resolveXmlEngineeringValues(rec);

  const lines = [`<Node>`];
  lines.push(`  <NodeNumber>${nodeNum}</NodeNumber>`);
  lines.push(`  <NodeName>${esc(rec.supportTag || rec.name)}</NodeName>`);
  lines.push(`  <Endpoint>1</Endpoint>`);
  lines.push(`  <Rigid>0</Rigid>`);
  lines.push(`  <ComponentType>ATTA</ComponentType>`);
  lines.push(`  <Weight>0</Weight>`);
  lines.push(`  <ComponentRefNo>${esc(rec.ref || rec.name)}</ComponentRefNo>`);
  lines.push(`  <ConnectionType>${esc(resolved.connectionType || 'SUPPORT')}</ConnectionType>`);
  lines.push(...buildMandatoryDims(dimensions));
  if (position) lines.push(`  <Position>${formatPosition(position)}</Position>`);
  lines.push(`  <BendRadius>0</BendRadius>`);
  lines.push(`  <SIF>0</SIF>`);

  const restraints = Array.isArray(resolved.restraint)
    ? resolved.restraint
    : (resolved.restraint ? [resolved.restraint] : []);
  for (const restraint of restraints) {
    if (restraint && (restraint.type || restraint.kind)) {
      lines.push(`  ${formatRestraintXml(restraint).split('\n').join('\n  ')}`);
    }
  }

  const dtxrPs = rec.cmpStressN || rec.supportTag || rec.dtxr;
  if (dtxrPs) lines.push(`  <DTXR_PS>${esc(dtxrPs)}</DTXR_PS>`);
  if (dtxrPs) lines.push(`  <DTXR_SOURCE>staged-json-ps-fallback</DTXR_SOURCE>`);

  lines.push(`</Node>`);
  return lines;
}

function buildProjectedNode(spec) {
  const lines = [`<Node>`];
  lines.push(`  <NodeNumber>${spec.nodeNumber}</NodeNumber>`);
  lines.push(`  <NodeName>${esc(spec.nodeName || '')}</NodeName>`);
  lines.push(`  <Endpoint>${spec.endpoint}</Endpoint>`);
  if (spec.includeRigid !== false) lines.push(`  <Rigid>${spec.rigid ?? 0}</Rigid>`);
  lines.push(`  <ComponentType>${esc(spec.componentType)}</ComponentType>`);
  lines.push(`  <Weight>${spec.weight ?? 0}</Weight>`);
  lines.push(`  <ComponentRefNo>${esc(spec.componentRefNo)}</ComponentRefNo>`);
  lines.push(`  <ConnectionType>${esc(spec.connectionType || '')}</ConnectionType>`);
  lines.push(...buildMandatoryDims(spec.dimensions));
  if (spec.position) lines.push(`  <Position>${formatPosition(spec.position)}</Position>`);
  lines.push(`  <BendRadius>${spec.bendRadius ?? 0}</BendRadius>`);
  if (spec.bendType !== undefined && spec.bendType !== null) {
    lines.push(`  <BendType>${spec.bendType}</BendType>`);
  }
  if (spec.alphaAngle !== undefined && spec.alphaAngle !== null) {
    lines.push(`  <AlphaAngle>${spec.alphaAngle}</AlphaAngle>`);
  }
  lines.push(`  <SIF>${spec.sif ?? 0}</SIF>`);
  if (spec.dtxrPos) lines.push(`  <DTXR_POS>${esc(spec.dtxrPos)}</DTXR_POS>`);
  if (spec.dtxrSource) lines.push(`  <DTXR_SOURCE>${esc(spec.dtxrSource)}</DTXR_SOURCE>`);
  lines.push(`</Node>`);
  return lines;
}

function buildRigidNode(rec, nodeNum, config) {
  const position = bestPosition(rec.attrs);
  const engineering = resolveXmlEngineeringValues(rec);
  const weight = engineering.weightKg ?? rec.sourceWeightKg ?? 0;

  const lines = [`<Node>`];
  lines.push(`  <NodeNumber>${nodeNum}</NodeNumber>`);
  lines.push(`  <NodeName>${esc(rec.name)}</NodeName>`);
  lines.push(`  <Endpoint>1</Endpoint>`);
  lines.push(`  <Rigid>${rigidValue(rec.componentType)}</Rigid>`);
  lines.push(`  <ComponentType>${esc(rec.componentType)}</ComponentType>`);
  lines.push(`  <Weight>${Number(weight).toFixed(2)}</Weight>`);
  lines.push(`  <ComponentRefNo>${esc(rec.ref || rec.name)}</ComponentRefNo>`);
  lines.push(`  <ConnectionType></ConnectionType>`);
  lines.push(...buildMandatoryDims(engineering));
  if (position) lines.push(`  <Position>${formatPosition(position)}</Position>`);
  lines.push(`  <BendRadius>0</BendRadius>`);
  lines.push(`  <SIF>0</SIF>`);
  if (rec.dtxr) lines.push(`  <DTXR_POS>${esc(rec.dtxr)}</DTXR_POS>`);
  if (rec.dtxr) lines.push(`  <DTXR_SOURCE>staged-json-position-group</DTXR_SOURCE>`);
  lines.push(`</Node>`);
  return lines;
}

function buildMandatoryDims(values = {}) {
  return [
    `  <OutsideDiameter>${values.odMm ?? 0}</OutsideDiameter>`,
    `  <WallThickness>${values.wallMm ?? 0}</WallThickness>`,
    `  <CorrosionAllowance>${values.corrMm ?? 0}</CorrosionAllowance>`,
    `  <InsulationThickness>${values.insulationMm ?? 0}</InsulationThickness>`,
  ];
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
