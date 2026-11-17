// Bounded, deterministic LangGraph workflow. No model, remote tools, or retries.
// Retrieval is over supplied source summaries, not the underlying paper text.
import {Annotation, StateGraph, START, END} from '@langchain/langgraph';
import {queryStudy, listStudies} from './study-retrieval.mjs';

export const STUDY_WORKFLOW_LIMITS=Object.freeze({maxQuestionCharacters:2000,maxRequestBytes:12000,maxResults:5,maxSteps:4,timeoutMs:8000});
export class StudyWorkflowError extends Error {
  constructor(code,message,status=400){super(message);this.name='StudyWorkflowError';this.code=code;this.status=status;}
}
export function validateStudyRequest(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['study','question'].includes(k)))
    throw new StudyWorkflowError('invalid_request','Choose a study and enter a question. No other fields are accepted.');
  if(!listStudies().some(s=>s.id===value.study))throw new StudyWorkflowError('study_required','Choose RAG1 (Lu 2020) or RAG2 (GSE293381). Studies are never selected from ambiguous keywords.');
  if(typeof value.question!=='string'||!value.question.trim()||value.question.length>STUDY_WORKFLOW_LIMITS.maxQuestionCharacters)
    throw new StudyWorkflowError('invalid_question','Enter a question of 1–2,000 characters.');
  return {study:value.study,question:value.question.trim()};
}
const State=Annotation.Root({request:Annotation(),collection:Annotation(),retrieval:Annotation(),skills:Annotation(),result:Annotation()});
const limitations=Object.freeze([
  'These are summaries supplied with the research package, not independently checked quotations from the full papers.',
  'No primary numerical matrix is loaded for either collection. No numerical reanalysis, mechanism test, or same-cell trajectory was run.',
  'Similarity ranks matching words; it does not measure whether a claim is supported.',
  'The two studies remain separate. Mouse and human evidence, ATAC and DNA methylation, and assay records and independent biological units must not be conflated.'
]);
const skillNames=['EpiState-T state tensor','Rollup Sequencer','EpiState transition'];
function active(signal){if(signal?.aborted)throw new StudyWorkflowError('cancelled','The study workflow was stopped.',499);}

export async function runStudyWorkflow(input,{signal,onStep=()=>{},now=Date.now}={}){
  const request=validateStudyRequest(input),trace=[];
  const record=(step,status,detail)=>{
    active(signal);
    const event={step,status,detail,actor:'Code',at:new Date(now()).toISOString()};trace.push(event);
    try{onStep({...event});}catch{/* Observers cannot alter the computation. */}
  };
  const graph=new StateGraph(State)
    .addNode('select_study',state=>{
      const collection=listStudies().find(s=>s.id===state.request.study);
      record('Select collection','completed','Selected '+collection.label+'. No cross-study search or automatic rerouting.');
      return {collection};
    })
    .addNode('retrieve_sources',state=>{
      const retrieval=queryStudy(state.request.study,state.request.question,{limit:STUDY_WORKFLOW_LIMITS.maxResults});
      record('Retrieve summaries',retrieval.results.length?'completed':'no_matches',retrieval.results.length+' matching summaries from '+state.collection.recordCount+' indexed records. Zero-score matches are excluded.');
      return {retrieval};
    })
    .addNode('check_data',()=>{
      const skills=skillNames.map(name=>({name,status:'NOT_RUN',reason:'A validated primary numerical matrix and its study design are not bundled for this collection.'}));
      record('Check calculation inputs','blocked','All three numerical skills were withheld: source summaries cannot substitute for a validated matrix. The separate Lee example can run locally.');
      return {skills};
    })
    .addNode('check_provenance',state=>{
      const evidence=state.retrieval.results;
      // Empty retrieval must never become a positive provenance/claim verdict.
      const provenance=evidence.length>0&&evidence.every(e=>e.id&&e.locator&&typeof e.text==='string'&&e.score>0&&/^https:\/\//.test(e.sourceUrl));
      if(evidence.length&&!provenance)throw new StudyWorkflowError('invalid_provenance','The retrieved records have incomplete provenance. No result was released.',500);
      record('Check source records',provenance?'completed':'not_applicable',provenance?'Every returned summary has a source URL and package locator. This is not an exact-quote or scientific-support check.':'No matching records. No evidence or support verdict was created.');
      return {result:{schemaVersion:1,workflow:'langgraph-study-retrieval-v1',runtime:'LangGraph JS',study:request.study,question:request.question,
        collection:state.collection,status:evidence.length?'retrieved':'no_matches',evidence,skills:state.skills,
        summary:evidence.length?'Found '+evidence.length+' source summaries for review. Numerical analysis was not run.':'No matching summaries found in '+state.collection.recordCount+' indexed records. This does not establish that no relevant paper exists.',
        provenanceChecked:provenance,quoteVerified:false,numericAnalysis:'NOT_RUN',claimSupport:'NOT_ASSESSED',
        limitations:[...limitations],usage:{modelCalls:0,totalTokens:0,estimatedCostUsd:0},trace}};
    })
    .addEdge(START,'select_study').addEdge('select_study','retrieve_sources').addEdge('retrieve_sources','check_data')
    .addEdge('check_data','check_provenance').addEdge('check_provenance',END).compile();
  const result=await graph.invoke({request},{recursionLimit:6,signal,callbacks:[],configurable:{}});
  active(signal);return result.result;
}

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
async function bodyJSON(request){
  if(!request.body)throw new StudyWorkflowError('invalid_request','Send a study and question.');
  const length=request.headers.get('content-length');
  if(length!==null&&(!/^\d+$/.test(length)||Number(length)>STUDY_WORKFLOW_LIMITS.maxRequestBytes))throw new StudyWorkflowError('request_too_large','Use a question of at most 2,000 characters.',413);
  const reader=request.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>STUDY_WORKFLOW_LIMITS.maxRequestBytes){await reader.cancel();throw new StudyWorkflowError('request_too_large','Use a shorter question.',413);}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new StudyWorkflowError('invalid_json','Send valid JSON.');}
}
export async function handleStudyWorkflow(request){
  let timer;const controller=new AbortController(),cancel=()=>controller.abort();
  try{
    if(request.method!=='POST')throw new StudyWorkflowError('method_not_allowed','Use POST.',405);
    if(request.headers.get('origin')!==new URL(request.url).origin)throw new StudyWorkflowError('origin_rejected','Run study search from Pherogent.',403);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))throw new StudyWorkflowError('invalid_content_type','Send JSON.',415);
    active(request.signal);request.signal.addEventListener('abort',cancel,{once:true});
    const input=await bodyJSON(request);active(request.signal);
    timer=setTimeout(cancel,STUDY_WORKFLOW_LIMITS.timeoutMs);
    return json(await runStudyWorkflow(input,{signal:controller.signal}));
  }catch(error){
    if(controller.signal.aborted)return json({error:{code:'cancelled',message:'The study workflow stopped. No model call was made.'}},408);
    if(error instanceof StudyWorkflowError)return json({error:{code:error.code,message:error.message}},error.status);
    return json({error:{code:'study_workflow_failed',message:'The study workflow could not finish. No AI call or manuscript change was made.'}},500);
  }finally{clearTimeout(timer);request.signal.removeEventListener('abort',cancel);}
}
