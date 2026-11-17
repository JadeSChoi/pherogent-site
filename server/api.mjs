import {LIMITS, BudgetError, readBudget, blockedReason, reserveRun, completeRun, readUsage, cleanUsage} from './budget.mjs';
import {CHAT_STAGES, runSectionReply} from './chat.mjs';
import {PROVIDER_ERROR_MESSAGES} from './provider-errors.mjs';
import {inspectApiCredential,probeProviderConnection} from './connection-diagnostics.mjs';
import {validClaimInput} from './research.mjs';

const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
const errorResponse = (code, message, status) => json({error:{code,message}},status);
const VISITOR_COOKIE = '__Host-pherogent-visitor';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Cookie identity is a fairness bucket, not authentication. Replacing it cannot
// raise the shared durable token/dollar limits. Signed-in users keep their history.
function visitor(request, create = false) {
  const account = request.headers.get('oai-authenticated-user-id');
  if (account && account.length <= 512) return {id:account,signedIn:true,cookie:null};
  const matches = (request.headers.get('cookie') || '').split(';').map(v=>v.trim()).filter(v=>v.startsWith(VISITOR_COOKIE+'='));
  const candidate = matches.length === 1 ? matches[0].slice(VISITOR_COOKIE.length+1) : '';
  if (UUID_V4.test(candidate)) return {id:'anonymous:'+candidate.toLowerCase(),signedIn:false,cookie:null};
  if (!create) return {id:null,signedIn:false,cookie:null};
  const id = crypto.randomUUID();
  return {id:'anonymous:'+id,signedIn:false,cookie:VISITOR_COOKIE+'='+id+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000'};
}
const publicLimits = () => ({perRunUsd:LIMITS.perRunUsd,dailyUsd:LIMITS.dailyUsd,lifetimeUsd:LIMITS.lifetimeUsd,
  perRunTokens:LIMITS.perRunTokens,lifetimeTokens:LIMITS.lifetimeTokens,
  userRunsPerDay:LIMITS.userRunsPerDay,maxSeconds:LIMITS.maxSeconds,maxPapers:LIMITS.maxPapers,
  maxQueries:LIMITS.maxQueries,maxModelCalls:LIMITS.maxModelCalls,pricingValidUntil:LIMITS.pricingValidUntil});
function configurationProblem(env, now = Date.now()) {
  if (!env?.OPENAI_API_KEY || env.PHEROGENT_AI_ENABLED !== 'true') return ['not_configured','The AI connection is not enabled. The prepared demo and manual search are available.'];
  if (!inspectApiCredential(env.OPENAI_API_KEY).diagnostics.headerValid) return ['invalid_credential_format','The saved API key contains an invalid header value, quotes, masking, or internal whitespace. The site owner must save the full secret key without those additions. No AI request was started.'];
  if (!env.DB?.prepare) return ['budget_unavailable','The spending ledger is unavailable. AI requests are disabled.'];
  if (now >= Date.parse(LIMITS.pricingValidUntil)) return ['pricing_review_required','AI runs are paused until the owner reviews the model pricing and spending safeguards.'];
  return null;
}

export async function getStatus(request, env, dependencies = {}) {
  const current = visitor(request,true), userId = current.id, problem = configurationProblem(env);
  const respond = (data,status=200) => {
    const response=json(data,status);
    if(current.cookie)response.headers.set('set-cookie',current.cookie);
    return response;
  };
  const base={signedIn:current.signedIn,needsSignIn:false,publicAccess:true,limits:publicLimits(),credential:inspectApiCredential(env?.OPENAI_API_KEY).diagnostics};
  if(request.method==='GET'&&new URL(request.url).searchParams.get('connection_check')==='1'){
    base.connectionDiagnostic=env?.PHEROGENT_AI_ENABLED==='true'
      ?{category:'disabled_only',status:null,expectedUnauthorized:false,authenticated:false}
      :await (dependencies.probeConnection||probeProviderConnection)();
  }
  let budget = null, usage = null;
  // This endpoint reports shared allowance plus only this visitor's usage.
  // A missing/unavailable ledger is unknown, never an invented zero.
  if (env.DB?.prepare) {
    try { budget = await readBudget(env.DB,userId); usage = await readUsage(env.DB,userId); }
    catch { return respond({...base,enabled:false,canRun:false,reason:'budget_unavailable',message:'The spending ledger is unavailable. No AI request can start.',budget:null,usage:null},503); }
  }
  const reason = problem || (budget && blockedReason(budget));
  return respond({...base,enabled:!problem,canRun:!reason,reason:reason?.[0]||null,message:reason?.[1]||'Open to everyone while the shared allowance lasts.',budget,usage});
}

async function readBodyJSON(request, maxBytes = 12_000) {
  if (!request.body) throw new BudgetError('invalid_request','Provide a research question.',400);
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) throw new BudgetError('request_too_large','Send a shorter research question.',413);
  const reader = request.body.getReader(), chunks = []; let bytes = 0;
  try {
    while (true) {
      const {value,done} = await reader.read(); if(done)break;
      bytes += value.byteLength;
      if(bytes > maxBytes){await reader.cancel();throw new BudgetError('request_too_large','Send a shorter research question.',413);}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  const joined = new Uint8Array(bytes);let offset=0;for(const c of chunks){joined.set(c,offset);offset+=c.byteLength;}
  let value;try{value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));}catch{throw new BudgetError('invalid_request','The request must contain valid JSON.',400);}
  if(!value||typeof value!=='object'||Array.isArray(value))throw new BudgetError('invalid_request','Provide a JSON object.',400);
  return value;
}
function validateEnvelope(value,fields) {
  if(Object.keys(value).some(k=>!fields.includes(k)))throw new BudgetError('invalid_request','The request contains unsupported fields.',400);
  if(value.consent!==true)throw new BudgetError('consent_required','Confirm that the selected text may be sent to the AI provider.',400);
  if(typeof value.requestId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.requestId))throw new BudgetError('invalid_request','A unique request ID is required.',400);
}
function readStudyDesign(value, eligible) {
  if (!Object.hasOwn(value,'studyDesign')) return false;
  if (typeof value.studyDesign!=='boolean' || (value.studyDesign && !eligible))
    throw new BudgetError('invalid_study_design','The study-design preview applies only to sentence checks and the Results or References workspace.',400);
  return value.studyDesign;
}
async function readSmallJSON(request) {
  // A bound check carries the same sentence in question and claim.text. Leave
  // room for 2,000 Unicode code units in both fields without relaxing either
  // sentence limit or the independent model-byte/spending bounds.
  const value=await readBodyJSON(request,16_000);
  validateEnvelope(value,['requestId','question','consent','claim','citedPaperIds','studyDesign']);
  if(typeof value.question!=='string'||!value.question.trim()||value.question.length>LIMITS.maxQuestionCharacters)throw new BudgetError('invalid_question','Use a question or paragraph of 1–2,000 characters.',400);
  if((Object.hasOwn(value,'claim')&&value.claim==null)||(!Object.hasOwn(value,'claim')&&Object.hasOwn(value,'citedPaperIds'))||!validClaimInput(value.question,value.claim,value.citedPaperIds))throw new BudgetError('invalid_claim','Send the unchanged sentence and its claim ID, with at most three unique valid source IDs.',400);
  return {requestId:value.requestId.toLowerCase(),studyDesign:readStudyDesign(value,!!value.claim),question:value.claim?value.question:value.question.trim(),...(value.claim?{claim:{id:value.claim.id,text:value.claim.text},citedPaperIds:value.citedPaperIds?[...value.citedPaperIds]:[]}: {})};
}

async function readSectionJSON(request) {
  const value=await readBodyJSON(request,48_000);
  validateEnvelope(value,['requestId','consent','stage','message','context','studyDesign']);
  if(typeof value.stage!=='string'||!CHAT_STAGES.includes(value.stage))throw new BudgetError('invalid_stage','Choose an existing research workspace.',400);
  if(typeof value.message!=='string'||!value.message.trim()||value.message.length>4000)throw new BudgetError('invalid_message','Use a message of 1–4,000 characters.',400);
  if(typeof value.context!=='string'||value.context.length>6000)throw new BudgetError('invalid_context','Use at most 6,000 characters of selected context.',400);
  return {requestId:value.requestId.toLowerCase(),studyDesign:readStudyDesign(value,['results','references'].includes(value.stage)),stage:value.stage,message:value.message.trim(),context:value.context};
}

// Optional dependency injection is for server tests, never read from the request.
// Both public routes share one durable reservation ledger and visitor identity.
export function runCheck(request, env, dependencies = {}) {
  return runBounded(request,env,dependencies,'research');
}
export function runSectionChat(request, env, dependencies = {}) {
  return runBounded(request,env,dependencies,'chat');
}
async function runBounded(request, env, dependencies, kind) {
  if(request.method!=='POST')return errorResponse('method_not_allowed','Use POST to start a check.',405);
  const origin=request.headers.get('origin');
  if(!origin||origin!==new URL(request.url).origin)return errorResponse('origin_rejected','Start the research check from this website.',403);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')||''))return errorResponse('invalid_content_type','Send JSON to start a check.',415);
  const userId=visitor(request).id;if(!userId)return errorResponse('visitor_session_required','Refresh the AI connection and allow this site’s cookies before starting a check. No account is required.',400);
  const problem=configurationProblem(env);if(problem)return errorResponse(problem[0],problem[1],503);
  let input,reservation;
  try{
    input=await (kind==='chat'?readSectionJSON:readSmallJSON)(request);
    if(request.signal.aborted)return errorResponse('cancelled','This request was cancelled before starting.',499);
    reservation=await reserveRun(env.DB,userId,input.requestId);
  }catch(error){return error instanceof BudgetError?errorResponse(error.code,error.message,error.status):errorResponse('budget_unavailable','The spending ledger could not authorize this request. No AI call was started.',503);}

  const runAbort = new AbortController();let disconnected=false,usage=cleanUsage({}),streamClosed=false;
  const abortFromRequest=()=>runAbort.abort(new Error('Client disconnected'));
  request.signal.addEventListener('abort',abortFromRequest,{once:true});
  if(request.signal.aborted)abortFromRequest();
  const timeout=setTimeout(()=>runAbort.abort(new Error('Run time limit reached')),LIMITS.maxSeconds*1000);
  const encoder=new TextEncoder();
  const body=new ReadableStream({
    async start(controller){
      const emit=value=>{if(streamClosed||disconnected)return;try{controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));}catch{disconnected=true;runAbort.abort(new Error('Client disconnected'));}};
      emit({type:'start',runId:reservation.runId,limits:publicLimits(),reservedUsd:reservation.reservedUsd,reservedTokens:reservation.reservedTokens});
      let runStatus='failed',runnerStarted=false,receivedUsage=false;
      try{
        if(runAbort.signal.aborted)throw runAbort.signal.reason;
        const runner=kind==='chat'?(dependencies.runSectionReply || runSectionReply):(dependencies.runResearch || (await import('./research.mjs')).runResearch);
        const abortPromise=new Promise((_,reject)=>{
          if(runAbort.signal.aborted)reject(runAbort.signal.reason);
          else runAbort.signal.addEventListener('abort',()=>reject(runAbort.signal.reason),{once:true});
        });
        runnerStarted=true;
        const result=await Promise.race([runner({...input,apiKey:inspectApiCredential(env.OPENAI_API_KEY).value,signal:runAbort.signal,onEvent:event=>{
          if(event?.type==='usage'){usage=cleanUsage(event.usage);receivedUsage=true;}
          if(!runAbort.signal.aborted)emit(event?.type==='usage'?{type:'usage',usage}:{type:'step',step:event});
        }}),abortPromise]);
        if(runAbort.signal.aborted)throw runAbort.signal.reason;
        usage=cleanUsage(result.usage);runStatus='completed';
        await completeRun(env.DB,reservation.runId,userId,runStatus,usage);
        emit({type:'result',result:{...result,usage},reservedUsd:reservation.reservedUsd,reservedTokens:reservation.reservedTokens});
      }catch(error){
        runStatus=runAbort.signal.aborted?'cancelled':'failed';
        if(error?.usage)usage=cleanUsage(error.usage);
        else if(runnerStarted&&!receivedUsage)usage=cleanUsage({...usage,unknownCalls:Math.max(1,usage.unknownCalls)});
        try{await completeRun(env.DB,reservation.runId,userId,runStatus,usage);}catch{/* Reservation stays consumed even if completion cannot be saved. */}
        const allowed=new Set(['no_evidence','provider_unavailable','invalid_model_output','run_budget_exceeded','pricing_review_required','literature_unavailable','token_budget',...Object.keys(PROVIDER_ERROR_MESSAGES)]);
        const code=runAbort.signal.aborted?'cancelled':allowed.has(error?.code)?error.code:'research_failed';
        const message=runAbort.signal.aborted?'The run stopped. Its allowance remains reserved because a submitted call may still be billed.':(PROVIDER_ERROR_MESSAGES[code]||'The AI request could not finish safely.')+' Its allowance remains reserved; no automatic retry was made.';
        emit({type:'error',error:{code,message},usage,reservedUsd:reservation.reservedUsd,reservedTokens:reservation.reservedTokens});
      }finally{
        clearTimeout(timeout);request.signal.removeEventListener('abort',abortFromRequest);
        if(!streamClosed&&!disconnected){streamClosed=true;try{controller.close();}catch{}}
      }
    },
    cancel(){disconnected=true;runAbort.abort(new Error('Client disconnected'));}
  });
  return new Response(body,{headers:{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
}
