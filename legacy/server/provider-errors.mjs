// Only fixed classifications leave this module. Provider messages can contain
// credentials or submitted text, so never return, log or persist the raw body.
export const PROVIDER_ERROR_MESSAGES = Object.freeze({
  provider_redirect:'The AI provider returned an unexpected redirect. It was not followed, and no credential was forwarded.',
  provider_authentication:'OpenAI rejected the API credential. The site owner must check the saved API key.',
  provider_quota:'OpenAI reports exhausted API credits or an API spending limit. The site owner must review API billing and limits; a ChatGPT subscription does not provide API credits.',
  provider_rate_limit:'OpenAI temporarily rate-limited this request. No automatic retry was made.',
  provider_access:'The API key does not have access to the configured model or project. The site owner must review model and key permissions.',
  provider_invalid_request:'OpenAI rejected the request settings. The site owner must review the model request configuration.',
  provider_service_tier:'OpenAI rejected the configured service tier. The site owner must review the project service-tier settings.',
  model_unavailable:'The model service could not complete the request. No automatic retry was made.',
  connection_failed:'The server could not reach the AI provider. No automatic retry was made.',
  timeout:'The AI request timed out. No automatic retry was made.',
  model_mismatch:'The provider returned an unrecognized model identity. The run stopped to protect the spending limit.',
  pricing_tier_mismatch:'The provider did not confirm the configured pricing tier. The run stopped to protect the spending limit.',
  missing_usage:'The provider did not report valid token usage. The run stopped to protect the spending limit.',
  usage_mismatch:'The provider reported usage outside the expected bounds. Further calls were stopped.',
  invalid_output:'The AI response did not match the required format. No draft or evidence was applied.',
  incomplete_output:'The AI response did not finish within its output limit. No automatic retry was made.'
});

const QUOTA_CODES = new Set(['insufficient_quota','credit_balance_exhausted','organization_spend_limit_exceeded','project_spend_limit_exceeded','organization_usage_limit_exceeded']);
const ACCESS_CODES = new Set(['model_not_found','permission_denied','insufficient_permissions','organization_restricted','project_not_found']);
const MAX_BYTES = 8192;
const READ_TIMEOUT_MS = 1500;

async function boundedErrorJSON(response, signal) {
  if (!response.body || signal?.aborted) return null;
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) {
    void response.body.cancel().catch(()=>{}); return null;
  }
  const reader = response.body.getReader();
  let timer, abort;
  const stopped = new Promise((_,reject)=>{
    abort=()=>reject(new Error('stopped'));
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(abort,READ_TIMEOUT_MS);
    if(signal?.aborted)abort();
  });
  const chunks=[]; let size=0;
  try {
    for (;;) {
      const {done,value}=await Promise.race([reader.read(),stopped]);
      if(done)break;
      size+=value.byteLength;
      if(size>MAX_BYTES)return null;
      chunks.push(value);
    }
    const bytes=new Uint8Array(size);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch { return null; }
  finally {
    clearTimeout(timer);signal?.removeEventListener('abort',abort);
    // Do not let a stalled provider's cancellation delay the bounded failure.
    void reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

export async function classifyProviderError(response, signal) {
  const data=await boundedErrorJSON(response,signal),error=data?.error;
  const providerCode=typeof error?.code==='string'?error.code:'';
  const providerType=typeof error?.type==='string'?error.type:'';
  let code='model_unavailable';
  if(response.status===401||providerCode==='invalid_api_key')code='provider_authentication';
  else if(QUOTA_CODES.has(providerCode)||QUOTA_CODES.has(providerType))code='provider_quota';
  else if(response.status===429||providerCode==='rate_limit_exceeded')code='provider_rate_limit';
  else if(response.status===403||response.status===404||ACCESS_CODES.has(providerCode))code='provider_access';
  else if(response.status===400||response.status===422)code=error?.param==='service_tier'?'provider_service_tier':'provider_invalid_request';
  return {code,message:PROVIDER_ERROR_MESSAGES[code]};
}
