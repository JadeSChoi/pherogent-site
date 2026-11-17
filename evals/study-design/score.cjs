// Offline regression/paired replay. Neither command contacts a model or a paper service.
'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const packetsPath=path.join(__dirname,'packets.json'), promptPath=path.join(__dirname,'prompt.txt');
const packets=JSON.parse(fs.readFileSync(packetsPath,'utf8')), gold=require('./key.json');
const rule=require('../../public/study-design.js');
const kinds=new Set(['compatible','incompatible','unknown','not_applicable']);
const labels=new Set(['supports','partial','unsupported','indeterminate','contradicts']);
const positive=l=>l==='supports'||l==='partial';
function assert(ok,why){if(!ok)throw Error(why);}
function sha(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
const hashPackets=sha(packetsPath), hashPrompt=sha(promptPath);
function validateCases(){
  assert(packets.length>0&&packets.length===Object.keys(gold).length,'Packet/key count mismatch');
  const seen=new Set();
  for(const p of packets){
    assert(!seen.has(p.id)&&p.claim?.trim()&&p.passage?.trim(),'Duplicate id or incomplete packet');seen.add(p.id);
    assert(gold[p.id]&&kinds.has(gold[p.id].design)&&['answerable','unsupported'].includes(gold[p.id].endpoint),'Invalid answer key for '+p.id);
  }
}
function verifyRule(){
  const rows=packets.map(p=>{const r=rule.evaluate({claim:p.claim,passage:p.passage});
    return {id:p.id,expected:gold[p.id].design,observed:r.status,ok:r.status===gold[p.id].design};});
  return {scope:'Hand-labelled development fixtures; not model accuracy',passed:rows.filter(r=>r.ok).length,total:rows.length,rows};
}
function replay(input){
  assert(Array.isArray(input),'Expected an array of {id,label,reason}.');
  const ids=new Set(packets.map(p=>p.id));const lookup=new Map();
  for(const row of input){
    assert(row&&ids.has(row.id),'Unrecognized answer id; use the frozen packet IDs');
    assert(!lookup.has(row.id),'Duplicate answer '+row.id);lookup.set(row.id,row);
  }
  const rows=packets.map(p=>{
    const raw=lookup.get(p.id),valid=!!raw&&labels.has(raw.label)&&typeof raw.reason==='string'&&!!raw.reason.trim();
    const proposed=valid?raw.label:null,r=rule.evaluate({claim:p.claim,passage:p.passage});
    // Readout is whether the source may be shown as establishing this claim, not an independent
    // C-model run. A missing/invalid model judgment stays missing even if design is explicit.
    const block=valid&&positive(proposed)&&r.applies&&(r.status==='unknown'||r.status==='incompatible');
    return {id:p.id,endpoint:gold[p.id].endpoint,status:r.status,rawLabel:proposed,
      enforcedLabel:block?'indeterminate':proposed,overridden:!!block,failed:!valid};
  });
  const answers=rows.filter(r=>r.endpoint==='answerable'),unsupported=rows.filter(r=>r.endpoint==='unsupported');
  const score=(k)=>({
    unsupportedN:unsupported.length,unsupportedEndorsements:unsupported.filter(r=>positive(r[k])).length,
    unsupportedFailures:unsupported.filter(r=>r.failed).length,
    unsupportedEndorsementsOrFailures:unsupported.filter(r=>r.failed||positive(r[k])).length,
    unsupportedFalseContradictions:unsupported.filter(r=>r[k]==='contradicts').length,
    answerableN:answers.length,answerableCorrectLabels:answers.filter(r=>r[k]==='supports').length,
    answerableFailures:answers.filter(r=>r.failed).length,
  });
  return {scope:'Paired offline replay of the same saved proposals; label outcomes only, no independent C-agent or reason adjudication.',
    packetSha256:hashPackets,instructionSha256:hashPrompt,rows, writtenRules:score('rawLabel'),executedRules:score('enforcedLabel')};
}
if(require.main===module){try{
  validateCases();
  const [cmd='check',file,...rest]=process.argv.slice(2);
  assert(!rest.length&&((cmd==='check'&&!file)||(cmd==='replay'&&file)),'Usage: node evals/study-design/score.cjs check | replay saved-outputs.json');
  if(cmd==='check'){const report=verifyRule();console.log(JSON.stringify(report,null,2));if(report.passed!==report.total)process.exitCode=1;}
  else{const output=replay(JSON.parse(fs.readFileSync(file,'utf8')));output.outputSha256=sha(file);console.log(JSON.stringify(output,null,2));}
}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={validateCases,verifyRule,replay};
