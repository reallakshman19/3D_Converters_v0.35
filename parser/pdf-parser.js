import { pipeLength } from '../utils/formatter.js?v=20260610-format-1';

export function parsePdfElements(rawText, fileName, log) {
  const elements = [];
  const nodes = {};
  const bends = [];
  const restraints = [];
  const rigids = [];

  const blocks = rawText.split(/From\s+(\d+)\s+To\s+(\d+)\s+/);

  let pOd = 0, pWall = 0, pInsul = 0, pDens = 7.833e-3, pInsulDens = 0, pFluidDens = 0, pMat = 'CS', pCorr = 0, pPhyd = 0;
  const pT = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const pP = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  for (let i = 1; i < blocks.length; i += 3) {
    const from = parseInt(blocks[i]);
    const to = parseInt(blocks[i+1]);
    const content = blocks[i+2];

    // Extract DX, DY, DZ
    const dxMatch = content.match(/DX=\s*(-?[\d,\.]+)/);
    const dyMatch = content.match(/DY=\s*(-?[\d,\.]+)/);
    const dzMatch = content.match(/DZ=\s*(-?[\d,\.]+)/);
    const dx = dxMatch ? parseFloat(dxMatch[1].replace(/,/g, '')) : 0;
    const dy = dyMatch ? parseFloat(dyMatch[1].replace(/,/g, '')) : 0;
    const dz = dzMatch ? parseFloat(dzMatch[1].replace(/,/g, '')) : 0;

    // Dia= 168.275 mm. Wall= 10.973 mm. Cor= 1.0000 mm.
    const diaMatch = content.match(/Dia=\s*([\d,\.]+)/);
    if (diaMatch) pOd = parseFloat(diaMatch[1].replace(/,/g, ''));

    const wallMatch = content.match(/Wall=\s*([\d,\.]+)/);
    if (wallMatch) pWall = parseFloat(wallMatch[1].replace(/,/g, ''));

    const corMatch = content.match(/Cor=\s*([\d,\.]+)/);
    if (corMatch) pCorr = parseFloat(corMatch[1].replace(/,/g, ''));

    // T1= 325 C T2= 303 C T3= 5 C P1=11,600.0000 KPa PHyd=22,035.0000 KPa
    for (let j = 1; j <= 9; j++) {
      const tMatch = content.match(new RegExp(`T${j}=\\s*([\\d,\\.]+)`));
      if (tMatch) pT[j] = parseFloat(tMatch[1].replace(/,/g, ''));

      const prMatch = content.match(new RegExp(`P${j}=\\s*([\\d,\\.]+)`));
      if (prMatch) pP[j] = parseFloat(prMatch[1].replace(/,/g, '')) / 100;
    }

    const phydMatch = content.match(/PHyd=\s*([\d,\.]+)/);
    if (phydMatch) pPhyd = parseFloat(phydMatch[1].replace(/,/g, '')) / 100;

    // Mat= (106)A106 Grade B (Stop at E= to clean it up)
    const matMatch = content.match(/Mat=\s*(.*?)(?:\s+E=|\n)/);
    if (matMatch) pMat = matMatch[1].trim();

    // Pipe Den= .0078334 kg./cu.cm. Fluid Den= .0007068 kg./cu.cm.
    const pipeDenMatch = content.match(/Pipe\s+Den=\s*([\d,\.]+)/);
    if (pipeDenMatch) pDens = parseFloat(pipeDenMatch[1].replace(/,/g, ''));

    const fluidDenMatch = content.match(/Fluid\s+Den=\s*([\d,\.]+)/);
    if (fluidDenMatch) pFluidDens = parseFloat(fluidDenMatch[1].replace(/,/g, ''));

    // Insul Thk= 80.000 mm. Insul Den= .0001400 kg./cu.cm.
    const insulThkMatch = content.match(/Insul\s+Thk=\s*([\d,\.]+)/);
    if (insulThkMatch) pInsul = parseFloat(insulThkMatch[1].replace(/,/g, ''));

    const insulDenMatch = content.match(/Insul\s+Den=\s*([\d,\.]+)/);
    if (insulDenMatch) pInsulDens = parseFloat(insulDenMatch[1].replace(/,/g, ''));

    if (i === 1) {
       nodes[from] = { x: 0, y: 0, z: 0 };
    }

    if (!nodes[from]) nodes[from] = { x: 0, y: 0, z: 0 };
    const origin = nodes[from];
    const toPos  = { x: origin.x + dx, y: origin.y + dy, z: origin.z + dz };
    if (!nodes[to]) nodes[to] = toPos;

    const len = pipeLength(dx, dy, dz);

    const elIndex = elements.length;
    const element = {
      index: elIndex, from, to, dx, dy, dz,
      od: pOd, wall: pWall, insul: pInsul, corrosion: pCorr,
      T1: pT[1], T2: pT[2], T3: pT[3], T4: pT[4], T5: pT[5], T6: pT[6], T7: pT[7], T8: pT[8], T9: pT[9],
      P1: pP[1], P2: pP[2], P3: pP[3], P4: pP[4], P5: pP[5], P6: pP[6], P7: pP[7], P8: pP[8], P9: pP[9],
      P_hydro: pPhyd,
      E_cold: 203390.7, E_hot: 178960.6,
      density: pDens, insulDensity: pInsulDens, fluidDensity: pFluidDens, poisson: 0.292,
      material: pMat,
      length: len,
      fromPos: { ...origin },
      toPos:   { ...toPos },
      hasBend: false,
    };
    elements.push(element);

    // Extract RIGID
    const rigidMatch = content.match(/RIGID\s+Weight=\s*([\d,\.]+)[^\n]*Type=([^\s]+)/i);
    if (rigidMatch) {
       const weight = parseFloat(rigidMatch[1].replace(/,/g, '')) * 0.1019716; // N to kg
       const type = rigidMatch[2];
       const rPtr = rigids.length + 1;
       rigids.push({ id: rPtr, ptr: rPtr, node: from, mass: weight, weight: weight, type });
       element.rigidPtr = rPtr;
    }

    // Extract BEND
    const bendMatch = content.match(/Radius=\s*([\d,\.]+)/i);
    if (bendMatch) {
       element.hasBend = true;
       const radius = parseFloat(bendMatch[1].replace(/,/g, ''));
       const bPtr = bends.length + 1;
       bends.push({ ptr: bPtr, elementIndex: elIndex, radius, nearNode: to });
       element.bendPtr = bPtr;
    }

    // Extract RESTRAINTS
    const restMatches = [...content.matchAll(/Node\s+(\d+)\s+([A-Za-z\+]+)(.*?Tag\s*=\s*([^\n\r]+))?/gi)];
    for (let rm of restMatches) {
       const node = parseInt(rm[1]);
       const type = rm[2];
       let tag = rm[4] ? rm[4].trim() : type;

       let unifiedType = 'Support (PDF)';
       if (type.includes('+Y')) unifiedType = 'RST';
       if (type.includes('GUI') || type.includes('GDE')) unifiedType = 'GDE';
       if (type.includes('ANC') || type.includes('FIX')) unifiedType = 'ANC';

       const rPtr = restraints.length + 1;
       restraints.push({ ptr: rPtr, node, type: unifiedType, rawType: type, supportBlock: tag, supportDescription: tag, isAnchor: unifiedType === 'ANC', dofs: [], stiffness: 1e13 });
       if (element.to === node || element.from === node) {
          element.restPtr = rPtr;
       }
    }
  }

  log.push({ level: 'INFO', msg: `PDF Extract: Parsed ${elements.length} elements.` });

  return { elements, nodes, bends, restraints, forces: [], rigids, units: {}, meta: {}, format: 'PDF-EXTRACT' };
}