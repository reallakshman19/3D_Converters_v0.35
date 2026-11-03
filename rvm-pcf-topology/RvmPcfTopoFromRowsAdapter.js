import {
  clean,
  upper,
  isFinitePoint,
  clonePoint,
  componentType,
  componentId,
  pipelineRef,
  rowPoint,
  rowIdentity,
  isPipe,
  isSupport,
  isIgnored,
  isFitting,
  distance,
  topoDiagnostic,
} from './RvmPcfTopoTypes.js';

/**
 * Converts PCF extraction rows into read-only PCF topology components, ports, and pipe segments.
 * This does not mutate input rows.
 */

function makeTopoId(row, index) {
  return `TC-${String(row?.rowNo ?? index + 1).padStart(6, '0')}`;
}

function makePort({
  component,
  role,
  pointKey,
  point,
  required = true,
  connectsToSegment = false,
  futureMovable = false,
  mutableNow = false,
}) {
  if (!isFinitePoint(point)) return null;

  return {
    portId: `${component.topoId}:${role}`,
    topoId: component.topoId,
    rowNo: component.rowNo,
    sourceCanonicalId: component.sourceCanonicalId,
    componentType: component.type,
    pipelineRef: component.pipelineRef,

    refNo: component.refNo,
    seqNo: component.seqNo,
    lineNo: component.lineNo,
    name: component.name,
    identity: component.identity,

    role,
    pointKey,
    point: clonePoint(point),

    bore: component.bore,
    required,
    connectsToSegment,
    futureMovable,
    mutableNow,

    isPipeEndpoint: component.isPipe && (pointKey === 'ep1' || pointKey === 'ep2'),
    isFittingPort: component.isFitting,
    maxDegree: 1,
  };
}

function addPort(out, port) {
  if (port) out.ports.push(port);
}

function makeSegment(component) {
  const a = clonePoint(component.points.ep1);
  const b = clonePoint(component.points.ep2);

  if (!isFinitePoint(a) || !isFinitePoint(b)) return null;

  return {
    segmentId: `${component.topoId}:SEGMENT`,
    topoId: component.topoId,
    rowNo: component.rowNo,
    sourceCanonicalId: component.sourceCanonicalId,
    pipelineRef: component.pipelineRef,
    componentType: component.type,
    a,
    b,
    lengthMm: distance(a, b),
    bore: component.bore,
  };
}

function numericBore(row) {
  const candidates = [
    row?.convertedBore,
    row?.bore,
    row?.nominalBore,
    row?.ep1?.bore,
    row?.ep2?.bore,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

export function buildPcfTopoFromRows(rows = [], options = {}) {
  const out = {
    schema: 'rvm-pcf-topology/from-rows/v1',
    components: [],
    ports: [],
    segments: [],
    diagnostics: [],
    stats: {
      rowCount: rows.length,
      includedRows: 0,
      skippedRows: 0,
      pipeCount: 0,
      teeCount: 0,
      oletCount: 0,
      valveCount: 0,
      flangeCount: 0,
      supportCount: 0,
      supportPipeContinuityPorts: 0,
      topoComponentCount: 0,
      topoPortCount: 0,
      pipeSegmentCount: 0,
      rowMutationCount: 0,
    },
  };

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    if (!row || row.include === false) {
      out.stats.skippedRows += 1;
      continue;
    }

    const type = componentType(row);

    if (isIgnored(type)) {
      out.stats.skippedRows += 1;
      continue;
    }

    out.stats.includedRows += 1;

    if (isSupport(type)) {
      out.stats.supportCount += 1;
      continue;
    }

    const identity = rowIdentity(row, {
      rowNo: row.rowNo ?? index + 1,
      type,
    });

    const component = {
      topoId: makeTopoId(row, index),
      rowIndex: index,
      rowNo: row.rowNo ?? index + 1,
      sourceCanonicalId: componentId(row, index),
      type,
      pipelineRef: pipelineRef(row),

      identity,
      refNo: identity.refNo,
      seqNo: identity.seqNo,
      lineNo: identity.lineNo,
      name: identity.name,

      lineKey: clean(row.lineKey || row.lineNoKey || row.pipelineRef || ''),
      include: row.include !== false,
      bore: numericBore(row),
      branchBore: Number.isFinite(Number(row.branchConvertedBore))
        ? Number(row.branchConvertedBore)
        : null,
      points: {
        ep1: rowPoint(row, 'ep1'),
        ep2: rowPoint(row, 'ep2'),
        cp: rowPoint(row, 'cp'),
        bp: rowPoint(row, 'bp'),
        coOrds: rowPoint(row, 'coOrds'),
        supportCoor: rowPoint(row, 'supportCoor'),
      },
      isPipe: isPipe(type),
      isFitting: isFitting(type),
      rawRow: row,
      diagnostics: [],
    };

    out.components.push(component);

    if (component.isPipe) {
      out.stats.pipeCount += 1;

      addPort(
        out,
        makePort({
          component,
          role: 'PIPE_END_1',
          pointKey: 'ep1',
          point: component.points.ep1,
          futureMovable: true,
          mutableNow: false,
        })
      );

      addPort(
        out,
        makePort({
          component,
          role: 'PIPE_END_2',
          pointKey: 'ep2',
          point: component.points.ep2,
          futureMovable: true,
          mutableNow: false,
        })
      );

      const segment = makeSegment(component);

      if (segment) {
        out.segments.push(segment);
      } else {
        out.diagnostics.push(
          topoDiagnostic({
            severity: 'ERROR',
            code: 'TOPO-PIPE-SEGMENT-MISSING',
            message: `PIPE row ${component.rowNo} missing valid ep1/ep2 segment.`,
            row,
          })
        );
      }

      continue;
    }

    if (type === 'BEND' || type === 'ELBO' || type === 'ELBOW') {
      addPort(out, makePort({ component, role: 'BEND_END_1', pointKey: 'ep1', point: component.points.ep1 }));
      addPort(out, makePort({ component, role: 'BEND_END_2', pointKey: 'ep2', point: component.points.ep2 }));
      continue;
    }

    if (type === 'TEE') {
      out.stats.teeCount += 1;

      addPort(out, makePort({ component, role: 'TEE_MAIN_1', pointKey: 'ep1', point: component.points.ep1 }));
      addPort(out, makePort({ component, role: 'TEE_MAIN_2', pointKey: 'ep2', point: component.points.ep2 }));

      if (isFinitePoint(component.points.bp)) {
        addPort(out, makePort({ component, role: 'TEE_BRANCH', pointKey: 'bp', point: component.points.bp }));
      } else if (isFinitePoint(component.points.cp)) {
        out.diagnostics.push(
          topoDiagnostic({
            severity: 'WARNING',
            code: 'TOPO-TEE-BRANCH-USING-CP-FALLBACK',
            message: `TEE row ${component.rowNo} has no bp; using cp as branch candidate.`,
            row,
          })
        );

        addPort(out, makePort({ component, role: 'TEE_BRANCH', pointKey: 'cp', point: component.points.cp }));
      } else {
        out.diagnostics.push(
          topoDiagnostic({
            severity: 'ERROR',
            code: 'TOPO-TEE-BRANCH-MISSING',
            message: `TEE row ${component.rowNo} missing branch point bp/cp.`,
            row,
          })
        );
      }

      continue;
    }

    if (['OLET', 'WELDOLET', 'SOCKOLET'].includes(type)) {
      out.stats.oletCount += 1;

      if (isFinitePoint(component.points.cp)) {
        addPort(
          out,
          makePort({
            component,
            role: 'OLET_HEADER_TAP',
            pointKey: 'cp',
            point: component.points.cp,
            connectsToSegment: true,
          })
        );
      } else {
        out.diagnostics.push(
          topoDiagnostic({
            severity: 'ERROR',
            code: 'TOPO-OLET-HEADER-TAP-MISSING',
            message: `OLET row ${component.rowNo} missing cp/header tap.`,
            row,
          })
        );
      }

      if (isFinitePoint(component.points.bp)) {
        addPort(out, makePort({ component, role: 'OLET_BRANCH', pointKey: 'bp', point: component.points.bp }));
      } else if (isFinitePoint(component.points.ep2)) {
        out.diagnostics.push(
          topoDiagnostic({
            severity: 'WARNING',
            code: 'TOPO-OLET-BRANCH-USING-EP2-FALLBACK',
            message: `OLET row ${component.rowNo} has no bp; using ep2 as branch candidate.`,
            row,
          })
        );

        addPort(out, makePort({ component, role: 'OLET_BRANCH', pointKey: 'ep2', point: component.points.ep2 }));
      } else {
        out.diagnostics.push(
          topoDiagnostic({
            severity: 'ERROR',
            code: 'TOPO-OLET-BRANCH-MISSING',
            message: `OLET row ${component.rowNo} missing bp/branch point.`,
            row,
          })
        );
      }

      continue;
    }

    if (type === 'VALVE' || type === 'VALV') {
      out.stats.valveCount += 1;
      addPort(out, makePort({ component, role: 'VALVE_END_1', pointKey: 'ep1', point: component.points.ep1 }));
      addPort(out, makePort({ component, role: 'VALVE_END_2', pointKey: 'ep2', point: component.points.ep2 }));
      continue;
    }

    if (type === 'FLANGE' || type === 'FLAN' || type === 'FBLI') {
      out.stats.flangeCount += 1;
      addPort(out, makePort({ component, role: 'FLANGE_END_1', pointKey: 'ep1', point: component.points.ep1 }));
      addPort(out, makePort({ component, role: 'FLANGE_END_2', pointKey: 'ep2', point: component.points.ep2 }));
      continue;
    }

    if (type === 'GASK' || type === 'GASKET') {
      addPort(out, makePort({ component, role: 'GASKET_END_1', pointKey: 'ep1', point: component.points.ep1 }));
      addPort(out, makePort({ component, role: 'GASKET_END_2', pointKey: 'ep2', point: component.points.ep2 }));
      continue;
    }

    if (type.includes('REDUCER') || type === 'REDU') {
      addPort(out, makePort({ component, role: 'REDUCER_END_1', pointKey: 'ep1', point: component.points.ep1 }));
      addPort(out, makePort({ component, role: 'REDUCER_END_2', pointKey: 'ep2', point: component.points.ep2 }));
      continue;
    }

    addPort(out, makePort({ component, role: `${type}_END_1`, pointKey: 'ep1', point: component.points.ep1 }));
    addPort(out, makePort({ component, role: `${type}_END_2`, pointKey: 'ep2', point: component.points.ep2 }));
  }

  out.stats.topoComponentCount = out.components.length;
  out.stats.topoPortCount = out.ports.length;
  out.stats.pipeSegmentCount = out.segments.length;

  return out;
}