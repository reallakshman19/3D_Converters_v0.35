export const SAMPLE_RVM_CODE4_ELBOW_BINARY_NOTE = 'Synthetic code-4 decoder fixture only; not real AVEVA/RMSS/GAS compatibility evidence.';

export function createSampleRvmCode4ElbowBinaryV1() {
  const arrayBuffer = buildBinary(88, true);
  return createJob('synthetic-rvm-code4-elbow-v1.rvm', 'sha256-synthetic-rvm-code4-elbow-v1', arrayBuffer);
}

export function createMalformedSampleRvmCode4ElbowBinaryV1() {
  const arrayBuffer = buildBinary(24, false);
  return createJob('synthetic-rvm-code4-elbow-malformed-v1.rvm', 'sha256-synthetic-rvm-code4-elbow-malformed-v1', arrayBuffer);
}

export function expectedSampleRvmCode4NativeParams() {
  return { radius: 0.25, bendRadius: 1.5, angleDeg: 90, sweepRadians: Math.PI / 2, layoutName: 'mvp-float32-transform-bbox-elbow-params-v1', provenance: 'code4-mvp-layout' };
}

export function expectedSampleRvmCode4PrimSlice() {
  return { offset: 4, endOffset: 104, candidateNativeCode: 4, candidatePayloadLength: 88, bounded: true, evidenceLevel: 'bounded-candidate', reasonCodes: ['PRIM_PAYLOAD_BOUNDED'] };
}

function createJob(fileName, fileHash, arrayBuffer) {
  return { jobId: 'job-synthetic-rvm-code4-elbow-v1', kind: 'rvm-binary', fileName, fileHash, fileSize: arrayBuffer.byteLength, arrayBuffer, note: SAMPLE_RVM_CODE4_ELBOW_BINARY_NOTE };
}

function buildBinary(payloadLength, completePayload) {
  const buffer = new ArrayBuffer(4 + 12 + payloadLength + 4);
  const view = new DataView(buffer);
  let offset = 0;
  writeTag(view, offset, 'CNTB');
  offset += 4;
  writePrimHeader(view, offset, 4, payloadLength);
  offset += 12;
  if (completePayload) writePayload(view, offset);
  else writeF32Array(view, offset, [1, 0, 0, 0, 1, 0]);
  writeTag(view, buffer.byteLength - 4, 'CNTE');
  return buffer;
}

function writePayload(view, offset) {
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
