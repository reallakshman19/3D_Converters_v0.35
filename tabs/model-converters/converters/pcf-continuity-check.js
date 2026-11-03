import { decodeTextUtf8, baseNameWithoutExtension } from '../core/output-utils.js';

export async function run(context) {
  const primary = context.inputFiles.find(f => f.role === 'primary');
  if (!primary || !primary.bytes) {
    throw new Error('Primary PCF input is required for PCF Continuity Check.');
  }
  const pcfText = decodeTextUtf8(primary.bytes);
  const { analyzePcfTextContinuity } = await import('../../../rvm-pcf-extract/RvmPcfContinuityChecker.js');
  const report = analyzePcfTextContinuity(pcfText, context.options);
  const teeDisconnectCount = (report.teeDisconnections || []).length;
  
  const outputPayload = {
    schema: 'pcf-continuity-report/v1',
    sourceFile: primary.name,
    generatedAt: new Date().toISOString(),
    ...report,
  };
  const outputName = `${baseNameWithoutExtension(primary.name)}_pcf_continuity_report.json`;
  const outputText = JSON.stringify(outputPayload, null, 2);
  
  const logLines = [
    `Continuity report: ok=${report.ok}, maxDeviationMm=${report.maxDeviationMm}, fixable=${report.fixableCount}, fatal=${report.fatalCount}`
  ];
  if (teeDisconnectCount > 0) {
    logLines.push(`TEE branch disconnections (${teeDisconnectCount}):`);
    (report.teeDisconnections || []).forEach(d => logLines.push(`  [${d.issue}] ${d.id} — ${d.message}`));
  }

  const statusMsg = `Continuity check complete: ${report.fatalCount || 0} fatal mismatch(es), ${report.fixableCount || 0} fixable gap(s)` +
    (teeDisconnectCount > 0 ? `, ${teeDisconnectCount} TEE branch disconnection(s)` : '') + '.';
  context.setStatus(statusMsg, report.ok ? 'ok' : 'bad');

  return {
    ok: true,
    outputs: [
      {
        name: outputName,
        text: outputText,
        mime: 'application/json;charset=utf-8'
      }
    ],
    logs: {
      stdout: logLines,
      stderr: []
    }
  };
}
