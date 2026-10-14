// Adapted analytics from jito-labs/mev-bot, Apache-2.0.
// Pinned upstream notebook and license: vendor/jito-mev-bot/.
export const JITO_SOURCE={repository:'https://github.com/jito-labs/mev-bot',commit:'f02016bb646a99a3542cfd54cb7e13160d96289e'};
const REQUIRED=['timestamp','landed','accepted','rejected','expectedProfit','sourceMint','tipLamports','txn2Signature'];
const BASE58=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function parseCsv(text){
  if(typeof text!=='string'||text.length>2_000_000)throw new Error('CSV must be at most 2 MB.');
  const rows=[];let row=[],field='',quoted=false,closed=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(quoted){if(char==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=char;continue;}
    if(char==='"'){if(field||closed)throw new Error('Unexpected quote in CSV.');quoted=true;}
    else if(char===','){row.push(field);field='';closed=false;}
    else if(char==='\n'||char==='\r'){
      if(char==='\r'&&text[i+1]==='\n')i++;
      row.push(field);if(row.some(value=>value!==''))rows.push(row);row=[];field='';closed=false;
    }else{if(closed)throw new Error('Unexpected text after quoted CSV field.');field+=char;}
  }
  if(quoted)throw new Error('Unclosed quoted CSV field.');
  row.push(field);if(row.some(value=>value!==''))rows.push(row);
  return rows;
}
function bool(value,label){if(value==='true'||value==='1')return true;if(value==='false'||value==='0')return false;throw new Error(`Invalid ${label} boolean.`);}
function integer(value,label,signed=false){if(!(signed?/^-?\d{1,30}$/:/^\d{1,30}$/).test(value))throw new Error(`Invalid ${label} integer.`);return BigInt(value);}
export function analyzeJitoCsv(text){
  const [header,...records]=parseCsv(text);
  if(!header||REQUIRED.some(key=>!header.includes(key)))throw new Error(`Required Jito CSV columns: ${REQUIRED.join(', ')}.`);
  if(new Set(header).size!==header.length)throw new Error('Duplicate CSV column names.');
  if(records.length>10000)throw new Error('Use at most 10,000 rows.');
  const byMint=new Map(),errors=new Map(),rows=[];let repeatedHeaders=0,accepted=0,landed=0,rejected=0,tips=0n;
  for(const [index,cells] of records.entries()){
    if(cells.length===header.length&&cells.every((value,i)=>value===header[i])){repeatedHeaders++;continue;}
    if(cells.length!==header.length)throw new Error(`CSV row ${index+2} has the wrong number of fields.`);
    const row=Object.fromEntries(header.map((key,i)=>[key,cells[i]]));
    const isLanded=bool(row.landed,'landed'),isRejected=bool(row.rejected,'rejected');
    const isAccepted=integer(row.accepted,'accepted')>0n;
    integer(row.timestamp,'timestamp');
    const expected=integer(row.expectedProfit,'expectedProfit',true),tip=integer(row.tipLamports,'tipLamports');
    if(!BASE58.test(row.sourceMint))throw new Error(`Invalid source mint in row ${index+2}.`);
    const group=byMint.get(row.sourceMint)??{mint:row.sourceMint,rows:0,expectedRaw:0n};
    group.rows++;group.expectedRaw+=expected;byMint.set(row.sourceMint,group);
    if(isAccepted)accepted++;
    if(isLanded){landed++;tips+=tip;}
    if(isRejected)rejected++;
    if(row.errorType)errors.set(row.errorType,(errors.get(row.errorType)??0)+1);
    rows.push({signature:row.txn2Signature,timestamp:row.timestamp,expectedProfitRaw:expected.toString(),sourceMint:row.sourceMint,tipLamports:tip.toString(),reportedLanded:isLanded,reportedAccepted:isAccepted,reportedRejected:isRejected});
  }
  if(!rows.length)throw new Error('CSV has no trade records.');
  return {schemaVersion:1,source:'imported-jito-csv',upstream:JITO_SOURCE,records:rows.length,repeatedHeaders,
    reportedAccepted:accepted,reportedLanded:landed,reportedRejected:rejected,
    reportedLandedRate:landed/rows.length,reportedLandedTipsLamports:tips.toString(),
    expectedByMint:[...byMint.values()].map(group=>({...group,expectedRaw:group.expectedRaw.toString()})),
    errors:[...errors].map(([type,count])=>({type,count})),rows,
    realizedProfit:null,liveProfitability:'UNPROVEN',verification:'CSV claims only; no chain receipt verification',
    limitations:['expectedProfit is an estimate in source-token raw units, not realized profit',
      'Different source mints are not combined into a profit total',
      'Reported landing does not establish successful execution or a positive balance change',
      'Tip totals cover CSV-reported landed rows only; paid costs require chain reconciliation']};
}
