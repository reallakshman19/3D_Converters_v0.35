export const XML_COMPARE_GRAPH_LAYOUT_SCHEMA='xml-compare-graph-layout/v1';
const clean=(v)=>String(v??'').trim();
export function createXmlCompareGraphNodeLayout({records=[],side='source',limit=96}={}){
  const safeRecords=Array.isArray(records)?records.slice(0,limit):[];
  const count=safeRecords.length;
  const columns=Math.min(4,Math.max(1,Math.ceil(Math.sqrt(Math.max(1,count)))));
  const rows=Math.max(1,Math.ceil(count/columns));
  return Object.freeze(safeRecords.map((record,index)=>{
    const col=index%columns,row=Math.floor(index/columns);
    const rawX=columns<=1?50:14+(col*(72/Math.max(1,columns-1)));
    const y=rows<=1?50:16+(row*(68/Math.max(1,rows-1)));
    const x=side==='source'?Math.min(82,rawX):Math.max(18,rawX);
    return Object.freeze({uid:clean(record.uid),index,side:clean(side)||'source',x,y,record:Object.freeze(record)});
  }));
}
export const _test=Object.freeze({clean});
