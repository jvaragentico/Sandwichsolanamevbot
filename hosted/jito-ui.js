import {analyzeJitoCsv} from './jito-analysis.js';
import {formatSol} from './simulation.js';
const $=id=>document.getElementById(id);
const text=(tag,value)=>{const node=document.createElement(tag);node.textContent=value;return node;};
let report=null,revision=0;
$('jito-file').addEventListener('change',async()=>{
  const current=++revision;
  report=null;$('jito-export').disabled=true;$('jito-results').replaceChildren();$('jito-error').textContent='';
  const file=$('jito-file').files?.[0];if(!file)return;
  try{
    if(file.size>2_000_000)throw new Error('Choose a CSV file no larger than 2 MB.');
    const content=await file.text();if(current!==revision)return;
    const result=analyzeJitoCsv(content);
    report={...result,filename:file.name};
    const stats=text('div','');stats.className='jito-stats';
    for(const [label,value] of [['Records',result.records],['Reported accepted',result.reportedAccepted],['Reported landed',result.reportedLanded],['Reported rejected',result.reportedRejected]]){
      const cell=text('div','');cell.append(text('small',label),text('strong',String(value)));stats.append(cell);
    }
    $('jito-results').append(stats,text('p',`Reported tips on landed rows: ${formatSol(result.reportedLandedTipsLamports)} SOL. Repeated headers skipped: ${result.repeatedHeaders}.`),
      text('p','Realized profit: unavailable. CSV landing flags and expectedProfit have not been verified against on-chain receipts.'));
    for(const group of result.expectedByMint)$('jito-results').append(text('p',`Source mint ${group.mint}: ${group.expectedRaw} raw units of expected profit across ${group.rows} records. This is an estimate, not measured P&L.`));
    const wrap=text('div','');wrap.className='table-wrap';const table=text('table',''),head=text('thead',''),heading=text('tr','');
    for(const name of ['Transaction','Reported state','Tip estimate · SOL','Expected P&L','Actual cost / P&L'])heading.append(text('th',name));
    head.append(heading);table.append(head);const body=text('tbody','');
    for(const row of result.rows.slice(0,100)){
      const line=text('tr',''),signature=text('td','');
      if(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(row.signature)){
        const link=text('a',`${row.signature.slice(0,8)}…${row.signature.slice(-6)}`);
        link.href=`https://solscan.io/tx/${row.signature}`;link.target='_blank';link.rel='noopener noreferrer';signature.append(link);
      }else signature.append(text('span','No valid transaction signature'));
      const expected=text('td',row.sourceMint==='So11111111111111111111111111111111111111112'?`${formatSol(row.expectedProfitRaw)} WSOL`:`${row.expectedProfitRaw} raw units`);
      expected.append(text('small',row.sourceMint));
      line.append(signature,text('td',row.reportedLanded?'Landed (unverified)':row.reportedRejected?'Rejected (reported)':'Not landed (reported)'),text('td',formatSol(row.tipLamports)),expected,text('td','Unavailable / unverified'));body.append(line);
    }
    table.append(body);wrap.append(table);$('jito-results').append(text('p','Latest import, first 100 records. Tip values are log estimates, not verified payments. Expected P&L is not adjusted again for tips because the log does not establish cost accounting.'),wrap);$('jito-export').disabled=false;
  }catch(error){if(current===revision)$('jito-error').textContent=error.message;}
});
$('jito-export').addEventListener('click',()=>{
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='flowwatch-jito-log-report.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
