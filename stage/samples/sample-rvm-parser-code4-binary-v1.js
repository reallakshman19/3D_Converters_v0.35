export const SAMPLE_RVM_PARSER_CODE4_BINARY_NOTE = 'Synthetic parser fixture only; not real AVEVA Review RVM and not GAS/RMSS evidence.';

export function createSampleRvmParserCode4BinaryV1() {
  const arrayBuffer = buildBinary();
  return createJob('synthetic-rvm-parser-code4-v1.rvm', 'sha256-synthetic-rvm-parser-code4-v1', arrayBuffer);
}

export function expectedSampleRvmParserCode4SummaryV1() {
  return { decodedCodes: { 4: 1 }, unsupportedCodes: { 99: 1 }, primitiveCount: 2, elbowCount: 1, diagnosticCount: 1 };
}

function createJob(fileName, fileHash, arrayBuffer) {
  return { jobId: 'job-synthetic-rvm-parser-code4-v1', kind: 'rvm-binary', fileName, fileHash, fileSize: arrayBuffer.byteLength, arrayBuffer, note: SAMPLE_RVM_PARSER_CODE4_BINARY_NOTE };
}

function buildBinary() {
  const code4PayloadLength = 88;
  const code99PayloadLength = 16;
  const buffer = new ArrayBuffer(4 + 12 + code4PayloadLength + 12 + code99PayloadLength + 4);
  const view = new DataView(buffer);
  let offset = 0;
  writeTag(view, offset, 'CNTB');
  offset += 4;
  writePrimHeader(view, offset, 4, code4PayloadLength);
  offset += 12;
  writeCode4Payload(view, offset);
  offset += code4PayloadLength;
  writePrimHeader(view, offset, 99, code99PayloadLength);
  offset += 12;
  writeF32Array(view, offset, [0, 0, 0, 1]);
  writeTag(view, buffer.byteLength - 4, 'CNTE');
  return buffer;
}

function writeCode4Payload(view, offset) {
  writeF32Array(view, offset, identity());
  writeF32Array(view, offset + 48, [0, 0, -0.25, 1.5, 1.5, 0.25]);
  writeF32Array(view, offset + 72, [0.25, 1.5, 90, Math.PI / 2]);
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
