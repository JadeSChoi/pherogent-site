// The provider adapter: the one interface for the bounded strict-JSON-schema
// completion this server performs. OpenAI is the sole implementation; tests
// fake the provider at this interface. An adapter exposes:
//   model                       - the configured model ID it will enforce
//   estimateInputTokens(call)   - conservative input-token bound for a call,
//                                 computed before any network traffic
//   complete(call)              - perform the completion; resolves to
//                                 {value, inputTokens, outputTokens} or throws
//                                 a ProviderError whose code matches the fixed
//                                 classification set. Errors thrown after the
//                                 provider reported valid usage carry
//                                 inputTokens/outputTokens so callers can keep
//                                 honest accounting.
// A call is {name, instructions, input, schema, maxOutputTokens, signal?}.
import {PROVIDER_ERROR_MESSAGES, classifyProviderError} from './provider-errors.mjs';

const API = 'https://api.openai.com/v1/responses';
const MAX_RESPONSE_BYTES = 80_000;
const REQUEST_TIMEOUT_MS = 25_000;
const encoder = new TextEncoder();

export class ProviderError extends Error {
  constructor(code, message, usage) {
    super(message);
    this.name = 'ProviderError';
    this.code = code;
    if (usage) { this.inputTokens = usage.inputTokens; this.outputTokens = usage.outputTokens; }
  }
}

async function readBody(response, signal) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    await response.body?.cancel();
    throw new ProviderError('response_too_large', 'The model response exceeded the reading limit.');
  }
  if (!response.body) throw new ProviderError('invalid_output', 'The model returned an empty response.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new ProviderError('cancelled', 'The model request was stopped.');
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new ProviderError('response_too_large', 'The model response exceeded the reading limit.');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const joined = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder('utf-8', {fatal:true}).decode(joined);
}

export function createOpenAIProvider({apiKey, model, fetchImpl = fetch}) {
  const serialize = ({name, instructions, input, schema, maxOutputTokens}) => JSON.stringify({
    model, service_tier:'default', store:false, background:false, truncation:'disabled',
    reasoning:{effort:'none'}, max_output_tokens:maxOutputTokens, instructions, input,
    text:{format:{type:'json_schema', name, strict:true, schema}}
  });
  // A deliberately conservative bound: the entire serialized body, one token
  // per UTF-8 byte, plus hidden-format overhead.
  const bound = body => encoder.encode(body).byteLength + 512;
  return {
    model,
    estimateInputTokens(call) { return bound(serialize(call)); },
    async complete(call) {
      const {maxOutputTokens, signal} = call;
      const body = serialize(call);
      const inputBound = bound(body);
      const controller = new AbortController(), abort = () => controller.abort();
      signal?.addEventListener('abort', abort, {once:true});
      if (signal?.aborted) controller.abort();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let raw;
      try {
        // Workers supports manual/follow, not Fetch's "error" mode. Reject every
        // redirect ourselves so the credential can never follow a Location header.
        const response = await fetchImpl(API, {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + apiKey}, body, signal:controller.signal, redirect:'manual'});
        if (response.status >= 300 && response.status < 400) {
          void response.body?.cancel().catch(() => {});
          throw new ProviderError('provider_redirect', PROVIDER_ERROR_MESSAGES.provider_redirect);
        }
        if (!response.ok) {
          const failure = await classifyProviderError(response, controller.signal);
          throw new ProviderError(failure.code, failure.message);
        }
        raw = await readBody(response, controller.signal);
      } catch (error) {
        if (signal?.aborted) throw new ProviderError('cancelled', 'The model request was stopped. A call already sent may still be billed.');
        if (error instanceof ProviderError) throw error;
        if (controller.signal.aborted) throw new ProviderError('timeout', PROVIDER_ERROR_MESSAGES.timeout);
        throw new ProviderError('connection_failed', PROVIDER_ERROR_MESSAGES.connection_failed);
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }

      let response;
      try { response = JSON.parse(raw); } catch { throw new ProviderError('invalid_output', 'The model service returned unreadable data.'); }
      // Reject an unrecognized pricing basis before the caller permits any next call.
      if (response.model !== model) throw new ProviderError('model_mismatch', PROVIDER_ERROR_MESSAGES.model_mismatch);
      if (response.service_tier !== 'default') throw new ProviderError('pricing_tier_mismatch', PROVIDER_ERROR_MESSAGES.pricing_tier_mismatch);
      const inputTokens = response.usage?.input_tokens, outputTokens = response.usage?.output_tokens;
      if (!Number.isSafeInteger(inputTokens) || inputTokens < 0 || !Number.isSafeInteger(outputTokens) || outputTokens < 0) {
        throw new ProviderError('missing_usage', PROVIDER_ERROR_MESSAGES.missing_usage);
      }
      const usage = {inputTokens, outputTokens};
      if (inputTokens > inputBound || outputTokens > maxOutputTokens) throw new ProviderError('usage_mismatch', PROVIDER_ERROR_MESSAGES.usage_mismatch, usage);
      if (response.status !== 'completed') throw new ProviderError('incomplete_output', PROVIDER_ERROR_MESSAGES.incomplete_output, usage);
      if (!Array.isArray(response.output)) throw new ProviderError('invalid_output', 'The model returned an unreadable response.', usage);
      const texts = [];
      for (const item of response.output) if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const part of item.content) {
          if (part.type === 'refusal') throw new ProviderError('model_refusal', 'The model declined this request.', usage);
          if (part.type === 'output_text' && typeof part.text === 'string') texts.push(part.text);
        }
      }
      let value;
      try { value = JSON.parse(texts.join('')); } catch { throw new ProviderError('invalid_output', PROVIDER_ERROR_MESSAGES.invalid_output, usage); }
      return {value, inputTokens, outputTokens};
    }
  };
}
