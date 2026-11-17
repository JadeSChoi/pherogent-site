'use strict';
// Isolated API/error handling tests. Browser DOMParser/layout are checked in UI QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../public/literature.js'), 'utf8');

function harness(fetchImpl) {
  const parsed = [];
  class TextParser {
    parseFromString(markup) {
      parsed.push(markup);
      return { querySelectorAll: () => [], body: { textContent: markup.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&') } };
    }
  }
  const sandbox = { window: {}, DOMParser: TextParser, URL, URLSearchParams, AbortController, Error, TypeError, setTimeout, clearTimeout, fetch: fetchImpl };
  vm.runInNewContext(source, sandbox);
  return { api: sandbox.window.PherogentLiterature, parsed };
}
const rawPaper = { id: '33268865', source: 'MED', title: 'An <i>example</i> title', pubYear: '2020', doi: '10.1038/s41586-020-2975-4', abstractText: 'A <b>mouse</b> finding.', authorList: { author: [{ fullName: 'Lu Y' }] }, journalInfo: { journal: { title: 'Nature' } }, isOpenAccess: 'Y', pmcid: 'PMC7752134' };
const response = (hitCount, result) => ({ ok: true, json: async () => ({ hitCount, resultList: { result } }) });

(async () => {
  let calls = [];
  const { api, parsed } = harness(async (url, options) => { calls.push({ url, options }); return response(1, [rawPaper]); });
  const result = await api.search('OSK glaucoma');
  assert.equal(result.total, 1);
  assert.equal(result.papers[0].id, 'MED:33268865');
  assert.equal(result.papers[0].title, 'An example title');
  assert.equal(result.papers[0].abstract, 'A mouse finding.');
  assert.equal(result.papers[0].pmid, '33268865');
  assert.equal(result.papers[0].openAccess, true);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.referrerPolicy, 'no-referrer');
  const url = new URL(calls[0].url);
  assert.equal(url.origin, 'https://www.ebi.ac.uk');
  assert.equal(url.searchParams.get('pageSize'), '8');
  assert.equal(url.searchParams.get('resultType'), 'core');
  assert.equal(url.searchParams.get('query'), 'OSK glaucoma');

  await assert.rejects(api.search(' '), /Enter a topic/);
  await assert.rejects(api.search('x'.repeat(301)), /300 characters/);
  await assert.rejects(api.search('a\nb'), /single line/);
  await assert.rejects(api.getPaper('MED:1 OR SRC:PMC'), /valid Europe PMC identifier/);
  assert.equal(calls.length, 1, 'Invalid inputs must not perform a request');

  const selected = await api.getPaper('MED:33268865');
  assert.equal(selected.id, 'MED:33268865');
  assert.equal(new URL(calls[1].url).searchParams.get('query'), 'EXT_ID:33268865 AND SRC:MED');
  assert.equal(new URL(calls[1].url).searchParams.get('pageSize'), '1');

  const viaPmc=await api.getPaper('PMC:PMC7752134');
  assert.equal(viaPmc.id,selected.id,'A PubMed-indexed article is also reachable by its verified PMCID');
  assert.equal(new URL(calls.at(-1).url).searchParams.get('query'),'PMCID:PMC7752134');
  assert.equal(await api.getPaper('PMC:PMC99'),null,'A different PMCID cannot establish identity');
  const requests=calls.length;
  for(const id of ['MED:foo','MED:0','PMC:123','PMC:OTHER'])await assert.rejects(api.getPaper(id), /valid Europe PMC identifier/);
  assert.equal(calls.length,requests);
  api.stripMarkup('<img src="https://example.invalid"><p onclick="bad()">safe</p><script>bad()</script>');
  assert.equal(parsed.at(-1), '<p>safe</p>', 'Resource-bearing tags/attributes removed before DOMParser');

  assert.equal((await harness(async () => response(0, [])).api.search('nothing')).papers.length, 0);
  assert.equal(await harness(async () => response(0, [])).api.getPaper('MED:999'), null);
  assert.equal(await harness(async () => response(1, [rawPaper])).api.getPaper('MED:999'), null, 'A different record is never substituted');
  await assert.rejects(harness(async () => ({ ok: false, status: 429 })).api.search('x'), /too many requests/);
  await assert.rejects(harness(async () => ({ ok: false, status: 503 })).api.search('x'), /HTTP 503/);
  await assert.rejects(harness(async () => ({ ok: true, json: async () => { throw Error('bad'); } })).api.search('x'), /unreadable response/);
  await assert.rejects(harness(async () => ({ ok: true, json: async () => ({ error: 'bad query' }) })).api.search('x'), /unexpected response/);
  await assert.rejects(harness(async () => response(1, [{ id: 'x', source: 'javascript:bad', title: 'unsafe' }])).api.search('x'), /usable paper metadata/);
  await assert.rejects(harness(async () => { throw new TypeError('Failed to fetch'); }).api.search('x'), /Could not reach/);

  const alreadyCancelled = new AbortController();
  alreadyCancelled.abort();
  await assert.rejects(api.search('x', { signal: alreadyCancelled.signal }), error => error.name === 'AbortError');
  const pending = new AbortController();
  const pendingApi = harness(async (_, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => { const error = Error('aborted'); error.name = 'AbortError'; reject(error); });
  })).api;
  const pendingSearch = pendingApi.search('x', { signal: pending.signal });
  pending.abort();
  await assert.rejects(pendingSearch, error => error.name === 'AbortError');
  console.log('Literature API tests passed: normalization, request scope, invalid inputs, failures, empty results, identity, cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
