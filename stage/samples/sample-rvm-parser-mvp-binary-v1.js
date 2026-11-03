import { summarizeRvmBinaryParserReport } from '../parser/RvmBinaryStageParser.js';

export const SAMPLE_RVM_PARSER_MVP_BINARY_NOTE = 'Synthetic parser MVP fixture; not real AVEVA Review RVM and not RMSS/GAS compatibility evidence.';

export function createSampleRvmParserMvpBinaryV1() {
  const arrayBuffer = buildSyntheticBinary();
  return {
    jobId: 'job-synthetic-rvm-parser-mvp-v1',
    kind: 'rvm-binary',
    fileName: 'synthetic-rvm-parser-mvp-v1.rvm',
    fileHash: 'sha256-synthetic-rvm-parser-mvp-v1',
    fileSize: arrayBuffer.byteLength,
    arrayBuffer,
    note: SAMPLE_RVM_PARSER_MVP_BINARY_NOTE,
  };
}

export function expectedSampleRvmParserMvpSummary(report) {
  return summarizeRvmBinaryParserReport(report);
}

function buildSyntheticBinary() {
  const buffer = new ArrayBuffer(116);
  const view = new DataView(buffer);
  let offset = 0;
  writeTag(view, offset, 'CNTB');
  offset += 8;
  writePrimHeader(view, offset, 8, 80);
  offset += 12;
  writeF32Array(view, offset, identity());
  offset += 48;
  writeF32Array(view, offset, [0, -0.25, -0.25, 4, 0.25, 0.25]);
  offset += 24;
  view.setFloat32(offset, 0.25, true);
  offset += 4;
  view.setFloat32(offset, 4, true);
  offset += 4;
  writePrimHeader(view, offset, 99, 0);
  offset += 12;
  writeTag(view, offset, 'CNTE');
  return buffer;
}

function writePrimHeader(view, offset, code, payloadLength) {
  writeTag(view, offset, 'PRIM');
  view.setUint32(offset + 4, code, true);
  view.setUint32(offset + 8, payloadLength, true);
}

function writeTag(view, offset, tag) {
  for (let index = 0; index < 4; index += 1) view.setUint8(offset + index, tag.charCodeAt(index));
}

function writeF32Array(view, offset, values) {
  values.forEach((value, index) => view.setFloat32(offset + index * 4, value, true));
}

function identity() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
}
