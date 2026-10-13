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
    const table=text('div','');table.className='jito-links';
    for(const row of result.rows.slice(0,20)){
      const line=text('p',`${row.reportedLanded?'Reported landed':'Not reported landed'} · `);
      if(/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(row.signature)){
        const link=text('a',`${row.signature.slice(0,8)}…${row.signature.slice(-6)}`);
        link.href=`https://solscan.io/tx/${row.signature}`;link.target='_blank';link.rel='noopener noreferrer';line.append(link);
      }else line.append(text('span','No valid transaction signature'));
      table.append(line);
    }
    $('jito-results').append(table);$('jito-export').disabled=false;
  }catch(error){if(current===revision)$('jito-error').textContent=error.message;}
});
$('jito-export').addEventListener('click',()=>{
  if(!report)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='flowwatch-jito-log-report.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
