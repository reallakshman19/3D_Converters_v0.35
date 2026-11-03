import { installModeAConsolidatedWeightEasyUi } from './xml-cii-adapted-mode-a-consolidated-easy-weight-ui.js?v=20260814-weight-clarity-1';
import { installModeAConsolidatedWeightTools } from './xml-cii-adapted-mode-a-weight-tools.js?v=20260814-weight-tools-1';
import { modeARawState } from './xml-cii-adapted-mode-a-propagation.js?v=20260813-mode-a-easy-weight-1';

export function installModeAConsolidatedWeightEasyUiFromWorkspace(workspace,stateRef) {
  const state=modeARawState(stateRef);
  if(state.activePhaseId!=='weight-match') return false;
  const result=state.modeAConsolidatedWeightResult;
  const panels=[...(workspace?.querySelectorAll?.('.xml-cii-mode-a-consolidated')||[])];
  const panel=panels.find((node)=>/Consolidated Weight Match/i.test(node.querySelector?.('h3')?.textContent||''));
  if(!panel) return false;
  const build=[...panel.querySelectorAll('button')].find((button)=>/Consolidated Weight Match|Build Weight Data/i.test(button.textContent||''));
  if(build){
    build.dataset.modeAConsolidatedBuild='weight';
    build.textContent='Build Weight Data — All XML';
    build.title='Compute consolidated Weight Match data for every enabled XML while preserving source-local engineering state.';
  }
  if(!result) return true;
  const body=panel.querySelector('table.xml-cii-audit-table tbody');
  if(body) body.dataset.modeAWeightConsolidatedBody='true';
  const installed=installModeAConsolidatedWeightEasyUi(panel,result,stateRef);
  installModeAConsolidatedWeightTools(panel,result,stateRef);
  return installed;
}
