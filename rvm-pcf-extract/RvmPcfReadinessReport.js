export function generateReadinessMarkdown(report) {
  if (!report || !report.summary) return '# PCF Readiness Report\n\nNo report data available.';

  const s = report.summary;

  return `# PCF Readiness Report

## Status: ${s.pcfReady ? '✅ READY' : '❌ BLOCKED'}
${report.allowPcfExport ? 'PCF Export is **ALLOWED**.' : 'PCF Export is **BLOCKED**. Please resolve errors before generating PCF.'}

## Row Readiness
- **Ready Rows**: ${s.readyRows}
- **Blocked Rows**: ${s.blockedRows}
- **Warning Rows**: ${s.warningRows}

## Readiness Skip Options
- **Skipped readiness errors**: ${s.skippedReadinessErrorCount ?? 0}
- **Skipped readiness codes**: ${(s.skippedReadinessErrorCodes || []).join(', ') || '-'}

## Topology Statistics
- **Components**: ${s.topoComponentCount}
- **Ports**: ${s.topoPortCount}
- **Pipe Segments**: ${s.pipeSegmentCount}
- **Exact Connections**: ${s.exactEndpointConnectionCount}
- **OLET Segment Taps**: ${s.oletSegmentTapCount}

## Gap & Overlap Candidates (at ${s.fixToleranceMm}mm tolerance)
- **Gap Candidates**: ${s.gapCandidateCount}
- **Overlap Candidates**: ${s.overlapCandidateCount}
- **Safe Fix Plans**: ${s.safeFixPlanCount}
- **Blocked Fix Plans**: ${s.blockedFixPlanCount}

## Known Issues
- **TEE Issues**: ${s.teeIssueCount}
- **OLET Issues**: ${s.oletIssueCount}
- **Unresolved Required Ports**: ${s.unresolvedRequiredPortCount}
- **Skipped readiness errors**: ${s.skippedReadinessErrorCount || 0}
- **Skipped readiness codes**: ${(s.skippedReadinessErrorCodes || []).join(', ') || '-'}
`;
}

export function generateReadinessHtml(report) {
  if (!report || !report.summary) return '<div class="rvm-pcf-extract-diagnostics empty">No report data available.</div>';

  const s = report.summary;
  const statusColor = s.pcfReady ? '#86efac' : '#fca5a5';

  return `
    <div class="rvm-pcf-extract-diagnostics" style="padding:12px;color:#e2e8f0;line-height:1.5;">
      <h3 style="margin-top:0;color:${statusColor};">PCF Readiness: ${s.pcfReady ? 'PASS' : 'FAIL'}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div style="background:#0f172a;padding:8px;border-radius:4px;border:1px solid #1e293b;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Row Status</div>
          <div style="font-size:16px;">
            <span style="color:#86efac;">${s.readyRows}</span> ready,
            <span style="color:#fca5a5;">${s.blockedRows}</span> blocked
          </div>
        </div>
        <div style="background:#0f172a;padding:8px;border-radius:4px;border:1px solid #1e293b;">
          <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Topology</div>
          <div style="font-size:12px;">
            ${s.topoComponentCount} comps, ${s.pipeSegmentCount} pipes<br>
            ${s.exactEndpointConnectionCount} exact connections
          </div>
        </div>
      </div>

      <div style="background:#0f172a;padding:8px;border-radius:4px;border:1px solid #1e293b;margin-bottom:12px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Gap/Overlap Auto-Fix (Tol: ${s.fixToleranceMm}mm)</div>
        <div style="display:flex;justify-content:space-between;font-size:12px;">
          <span>${s.gapCandidateCount} gaps</span>
          <span>${s.overlapCandidateCount} overlaps</span>
          <span style="color:#86efac;font-weight:600;">${s.safeFixPlanCount} safe fixes</span>
          <span style="color:#fca5a5;">${s.blockedFixPlanCount} blocked</span>
        </div>
      </div>

      <div style="background:#0f172a;padding:8px;border-radius:4px;border:1px solid #1e293b;margin-bottom:12px;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Skipped Readiness Errors</div>
        <div style="font-size:12px;">
          <span style="color:#fde047;">${s.skippedReadinessErrorCount ?? 0}</span> errors skipped<br>
          <span style="color:#64748b;">Codes:</span> ${(s.skippedReadinessErrorCodes || []).join(', ') || '-'}
        </div>
      </div>

      <div style="background:#0f172a;padding:8px;border-radius:4px;border:1px solid #1e293b;">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Outstanding Issues</div>
        <ul style="margin:0;padding-left:16px;font-size:12px;">
          <li>TEE issues: ${s.teeIssueCount}</li>
          <li>OLET issues: ${s.oletIssueCount}</li>
          <li>Unresolved required ports: ${s.unresolvedRequiredPortCount}</li>
          <li>Skipped readiness errors: ${s.skippedReadinessErrorCount || 0}</li>
          <li>Skipped readiness codes: ${(s.skippedReadinessErrorCodes || []).join(', ') || '-'}</li>
        </ul>
      </div>
    </div>
  `;
}
