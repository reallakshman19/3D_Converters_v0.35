const ALIAS = {
  branchName: ['branchname','branch','line','branch name'], lineKey: ['linekey','line key','lineno','line no','lineid','line id'],
  boreMm: ['bore','boremm','dn','nb','size'], outsideDiameter: ['outsidediameter','outside diameter','od','pipe od'],
  wallThickness: ['wall','wallthk','wall thickness','wallthickness','wt'],
  hydroPressure: ['hydro','hydropressure','hydro/test pressure','test pressure'],
  fluidDensity: ['density','fluiddensity','fluid density'], insulationDensity: ['insulationdensity','insulation density','insul density'],
  insulationThickness: ['insulation','insulationthickness','insul'], corrosionAllowance: ['corrosion','corrosionallowance','ca'],
  pipingClass: ['pipingclass','piping class','spec'], rating: ['rating','class'], materialName: ['material','materialname'], materialCode: ['materialcode','matcode'],
  x: ['x','east','e'], y: ['y','north','s'], z: ['z','elev','u'], pos: ['pos','position'],
  componentType: ['componenttype','type','component'], rigid: ['rigid'], endpoint: ['endpoint','end'], weight: ['weight','weightkg','wtkg'], componentRefNo: ['componentrefno','ref'],
  nodeName: ['nodename','node name','ps','support'], restraintType: ['restrainttype','restraint','supporttype','type'], gap: ['gap'], stiffness: ['stiffness'], friction: ['friction'], direction: ['direction','dir'],
  dtxr: ['dtxr','dtxr_pos','dtxr_ps','description']
};
for(let i=1;i<=9;i+=1){ALIAS[`p${i}`]=[`p${i}`,`pressure${i}`,`pressure ${i}`]; ALIAS[`t${i}`]=[`t${i}`,`temperature${i}`,`temperature ${i}`];}
function key(v){return String(v??'').trim().toLowerCase().replace(/[_\-.]+/g,' ').replace(/\s+/g,' ')}
function split(line){
  if(line.includes('\t')) return line.split('\t');
  const out=[]; let cur='', q=false;
  for(const ch of line){ if(ch==='"'){q=!q; continue} if(ch===','&&!q){out.push(cur); cur=''; continue} cur+=ch; }
  out.push(cur); return out;
}
function canonical(header){
  const h=key(header);
  for(const [name, aliases] of Object.entries(ALIAS)) if(aliases.some(a=>key(a)===h)) return name;
  return h.replace(/[^a-z0-9]+(.)/g,(_,c)=>c.toUpperCase()).replace(/[^a-zA-Z0-9]/g,'');
}
export function parseCustomInputTable(text,{defaultHeaders=[]}={}){
  const lines=String(text||'').split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return [];
  const first=split(lines[0]).map(s=>s.trim());
  const knownAliases=Object.values(ALIAS).flat().map(key);
  const hasHeader=first.some(c=>knownAliases.includes(key(c)));
  const headers=(hasHeader?first:defaultHeaders).map(canonical);
  const data=hasHeader?lines.slice(1):lines;
  return data.map((line, rowIndex)=>{
    const cells=split(line); const row={_rowIndex:rowIndex};
    headers.forEach((h,i)=>{ row[h]=String(cells[i]??'').trim(); });
    return row;
  }).filter(row=>Object.entries(row).some(([name,v])=>name!=='_rowIndex'&&String(v).trim()));
}
export function parseCustomInputTables(payload={}){
  return Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,Array.isArray(v)?v:parseCustomInputTable(v||'')]));
}
