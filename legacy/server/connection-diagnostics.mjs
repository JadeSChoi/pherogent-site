// No key values, provider bodies, exception messages, or user text are returned.
export function inspectApiCredential(raw) {
  const present=typeof raw==='string'&&raw.trim().length>0;
  const value=present?raw.trim():'';
  let shape='ready';
  if(!present)shape='missing';
  else if(value.length>4096)shape='too_long';
  else if(/\s/.test(value))shape='internal_whitespace';
  else if(/[^\x21-\x7e]/.test(value))shape='invalid_header';
  else if(/^["']|["']$/.test(value))shape='quoted_value';
  else if(value.includes('...')||value.includes('*'))shape='masked_value';
  if(shape==='ready'){
    try{new Headers({Authorization:'Bearer '+value});}catch{shape='invalid_header';}
  }
  return {value:shape==='ready'?value:'',diagnostics:{present,headerValid:shape==='ready',trimmed:present&&value!==raw,shape}};
}

export function classifyTransportError(error) {
  // Classification reads locally but never exposes or logs the exception text.
  const message=typeof error?.message==='string'?error.message.slice(0,2048):'';
  if(/invalid redirect value|unsupported (redirect|cache) mode/i.test(message))return 'unsupported_request_option';
  if(/illegal invocation|invalid receiver|incorrect.*this|does not implement interface/i.test(message))return 'fetch_binding';
  if(/outside.*request|request.*context|i\/o.*global|i\/o.*context/i.test(message))return 'request_context';
  if(/header.*invalid|invalid.*header|bytestring|latin.?1/i.test(message))return 'invalid_header';
  if(/blocked|not allowed|permission denied|egress|access denied|network.*restricted/i.test(message))return 'blocked_network';
  if(error?.name==='AbortError'||/timed? out|timeout/i.test(message))return 'timeout';
  return 'transport_failure';
}

// Fixed unauthenticated request: no model, input, API key, or Authorization.
// It cannot generate a completion. HTTP 401 is the expected transport result.
// Cache only completed plain data; pending I/O belongs to its Worker request.
export function createConnectionProbe(fetchImpl=fetch,now=Date.now) {
  let cached,expires=0,inFlight=false;
  return async function probe(){
    if(cached&&now()<expires)return {...cached};
    if(inFlight)return {category:'in_progress',status:null,expectedUnauthorized:false,authenticated:false};
    inFlight=true;
    const result=await (async()=>{
      const controller=new AbortController();let timer;
      try{
        const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new DOMException('Timeout','AbortError'));},3000);});
        const response=await Promise.race([fetchImpl('https://api.openai.com/v1/responses',{
          method:'POST',headers:{'Content-Type':'application/json'},body:'{}',redirect:'manual',signal:controller.signal
        }),timeout]);
        void response.body?.cancel().catch(()=>{});
        const status=Number.isInteger(response.status)&&response.status>=100&&response.status<=599?response.status:null;
        return {category:status===null?'transport_failure':status>=300&&status<400?'redirect_rejected':'http_response',status,expectedUnauthorized:status===401,authenticated:false};
      }catch(error){return {category:classifyTransportError(error),status:null,expectedUnauthorized:false,authenticated:false};}
      finally{clearTimeout(timer);inFlight=false;}
    })();
    cached=result;expires=now()+60_000;
    return {...cached};
  };
}
export const probeProviderConnection=createConnectionProbe();
