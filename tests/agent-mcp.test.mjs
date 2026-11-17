import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {handleMCP,MCP_TOOLS,MCP_LIMITS,MCP_VERSION,reserveMCPFetches} from '../server/mcp.mjs';

const NOW=Date.parse('2026-10-25T12:00:00Z');
const schema=readFileSync(new URL('../drizzle/0001_curly_captain_midlands.sql',import.meta.url),'utf8').replace(/--> statement-breakpoint/g,'');
function database(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(schema);
  const db={prepare(sql){return {bind(...params){return {async run(){const r=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(r.changes)}};}};}};}};
  return {sqlite,db};
}
function request(method,params={},headers={},overrides={}){
  return new Request('https://www.pherogent.ai/mcp',{method:'POST',headers:{'content-type':'application/json','oai-authenticated-user-id':'test-author','MCP-Protocol-Version':MCP_VERSION,...headers},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),...overrides});
}
const content=value=>JSON.parse(value.result.content[0].text);
const paper={source:'MED',id:'123',title:'Mouse study',abstractText:'Mouse outcomes improved after intervention. This was not a human clinical trial.',authorString:'Example A',pubYear:'2024',isOpenAccess:'Y',pmcid:'PMC456'};
const searchResponse=()=>new Response(JSON.stringify({hitCount:1,resultList:{result:[paper]}}));
const invoke=async(req,env={},dependencies={})=>{const res=await handleMCP(req,env,dependencies);return {status:res.status,body:await res.json()};};

// Discovery is readable without identity; calls are authenticated and strict.
{
  const discovery=await invoke(request('server/discover',{}, {'oai-authenticated-user-id':''}));
  assert.deepEqual(discovery.body.result.supportedVersions,[MCP_VERSION]);
  assert.equal(discovery.body.result.resultType,'complete');
  const listed=await invoke(request('tools/list',{}, {'oai-authenticated-user-id':''}));
  assert.deepEqual(listed.body.result.tools.map(t=>t.name),['search_papers','read_paper','verify_quote']);
  assert.ok(MCP_TOOLS.every(t=>t.annotations.readOnlyHint&&t.inputSchema.additionalProperties===false));
  const unauthorized=await invoke(request('tools/call',{name:'verify_quote',arguments:{quote:'test',source_text:'test'}},{'oai-authenticated-user-id':''}));
  assert.equal(unauthorized.status,401);
  assert.equal((await invoke(request('tools/list',{}, {'MCP-Protocol-Version':'1900-01-01'}))).body.error.code,-32022);
  assert.equal((await invoke(request('tools/list',{_meta:{'io.modelcontextprotocol/protocolVersion':'2025-11-25'}}))).body.error.code,-32022);
  assert.equal((await invoke(request('initialize'))).body.error.code,-32601);
  assert.equal((await invoke(request('tools/call',{name:'start_paid_run',arguments:{}}))).body.error.code,-32602);
  assert.equal((await invoke(request('tools/list',{}, {}, {method:'GET',body:undefined}))).status,405);
  assert.equal((await invoke(request('tools/list',{}, {'content-type':'text/plain'}))).status,415);
  assert.equal((await invoke(request('tools/list',{}, {}, {body:'[{}]'}))).status,400);
  assert.equal((await invoke(request('tools/list',{}, {}, {body:'{bad json'}))).status,400);
  assert.equal((await invoke(request('tools/list',{}, {}, {body:' '.repeat(MCP_LIMITS.requestBytes+1)}))).status,413);
  assert.equal((await invoke(request('tools/list',{}, {}, {body:JSON.stringify({jsonrpc:'2.0',method:'tools/list'})}))).status,400);
}

// Exact matching is deliberately narrower than a source/claim judgement.
{
  const call=args=>invoke(request('tools/call',{name:'verify_quote',arguments:args}));
  assert.equal(content((await call({quote:'Mice improved.',source_text:'Findings: Mice improved. Humans were not tested.'})).body).match,true);
  assert.equal(content((await call({quote:'mice improved.',source_text:'Mice improved.'})).body).match,false);
  assert.equal(content((await call({quote:'Mice improved.',source_text:'Mice  improved.'})).body).match,false);
  const result=content((await call({quote:'Mice improved.',source_text:'Mice improved.'})).body);
  assert.equal(result.characterOffset,0);assert.match(result.source,/not independently verified/);
  for(const args of [{quote:' ',source_text:' '},{quote:'A',source_text:'a'.repeat(12001)},{quote:'A',source_text:'A',url:'https://attacker.invalid'}])assert.equal((await call(args)).body.result.isError,true);
}

// Fixed destinations, bounded source data, no credentials, no model calls.
{
  const {sqlite,db}=database();let calls=[];
  const fetchImpl=async(url,options)=>{
    calls.push({url,options});
    assert.equal(new URL(url).origin,'https://www.ebi.ac.uk');
    assert.equal(options.redirect,'manual');assert.equal(options.headers.Authorization,undefined);
    if(url.includes('fullTextXML'))return new Response('<article><body><sec><p>This first paragraph describes the mouse experiment and measured outcomes.</p><p>This second paragraph gives sufficient detail for the outcome analysis.</p></sec></body></article>');
    return searchResponse();
  };
  const run=(name,args,deps={})=>invoke(request('tools/call',{name,arguments:args}),{DB:db},{fetchImpl,now:()=>NOW,...deps});
  const search=content((await run('search_papers',{query:'mouse reprogramming',limit:5})).body);
  assert.equal(search.papersReturned,1);assert.equal(search.papers[0].id,'MED:123');assert.equal(calls.length,1);
  assert.equal(new URL(calls[0].url).searchParams.get('query'),'mouse reprogramming');
  const read=content((await run('read_paper',{paper_id:'MED:123',focus:'outcomes'})).body);
  assert.equal(read.paper.access,'full_text_excerpts');assert.equal(read.passages.length,2);assert.match(read.coverage,/not a complete-paper review/);assert.equal(calls.length,3);
  assert.match(new URL(calls[1].url).searchParams.get('query'),/^EXT_ID:123 AND SRC:MED$/);
  assert.equal(sqlite.prepare('SELECT SUM(reserved_fetches) n FROM mcp_requests').get().n,3);
  const before=calls.length;
  for(const [name,args] of [['search_papers',{query:'q',limit:6}],['search_papers',{query:'\nsecret'}],['search_papers',{query:'q',model:'paid'}],['read_paper',{paper_id:'https://attacker.invalid'}],['read_paper',{paper_id:'MED:123/../other'}]])assert.equal((await run(name,args)).body.result.isError,true);
  assert.equal(calls.length,before,'Invalid arguments cannot initiate a source request');
  const redirect=await run('search_papers',{query:'q'},{fetchImpl:async()=>new Response('',{status:307,headers:{Location:'https://attacker.invalid'}})});
  assert.equal(content(redirect.body).error,'source_redirect');
  const huge=await run('search_papers',{query:'q'},{fetchImpl:async()=>new Response('x',{headers:{'content-length':String(MCP_LIMITS.sourceBytes+1)}})});
  assert.equal(content(huge.body).error,'too_large');
  const streamed=await run('search_papers',{query:'q'},{fetchImpl:async()=>new Response('x'.repeat(MCP_LIMITS.sourceBytes+1))});
  assert.equal(content(streamed.body).error,'too_large');
  const timeout=await run('search_papers',{query:'q'},{sourceMs:10,fetchImpl:async(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}))});
  assert.equal(content(timeout.body).error,'timeout');
  const hangingBody=await run('search_papers',{query:'q'},{sourceMs:10,fetchImpl:async()=>new Response(new ReadableStream({start(){}}))});
  assert.equal(content(hangingBody.body).error,'timeout');
  const partial=await run('read_paper',{paper_id:'MED:123'},{fetchImpl:async url=>url.includes('fullTextXML')?new Response('',{status:403}):searchResponse()});
  assert.equal(content(partial.body).paper.access,'abstract_only');assert.match(content(partial.body).fullTextNote,/could not return/);
  const noPaper=await run('read_paper',{paper_id:'MED:999'});
  assert.equal(content(noPaper.body).error,'not_found');
  const unavailable=await invoke(request('tools/call',{name:'search_papers',arguments:{query:'q'}}),{}, {fetchImpl:()=>{throw Error('Must not fetch');}});
  assert.equal(content(unavailable.body).error,'limit_unavailable');
  sqlite.close();
}

// Reproduce the production failure shape: a DOI search can succeed while a
// quoted numeric PMID returns no hit. Use synthetic excerpts, never a paid API.
{
  const {sqlite,db}=database(),seen=[],doi='10.1038/s41586-026-10652-y';
  const robin={source:'MED',id:'42156546',title:'A multi-agent system for automating scientific discovery.',doi,isOpenAccess:'N',abstractText:'Local fixture abstract; the paper identity is real.'};
  const fetchImpl=async url=>{
    assert.equal(new URL(url).origin,'https://www.ebi.ac.uk');
    const q=new URL(url).searchParams.get('query');seen.push(q);
    if(q===null)return new Response('<article><body><p>This is a synthetic example of a bounded excerpt from an open paper.</p></body></article>');
    const rows=q==='DOI:"'+doi+'"'||q==='EXT_ID:42156546 AND SRC:MED'?[robin]:
      q==='PMCID:PMC456'?[paper]:q==='EXT_ID:666 AND SRC:MED'?[{source:'MED',id:'666',title:'Metadata only'}]:[];
    return new Response(JSON.stringify({hitCount:rows.length,resultList:{result:rows}}));
  };
  const run=async(name,args)=>content((await invoke(request('tools/call',{name,arguments:args}),{DB:db},{now:()=>NOW,fetchImpl})).body);
  const found=await run('search_papers',{query:'DOI:"'+doi+'"',limit:1});
  const read=await run('read_paper',{paper_id:found.papers[0].id});
  assert.equal(read.requestedPaperId,'MED:42156546');assert.equal(read.paper.doi,doi);assert.equal(read.paper.access,'abstract_only');assert.deepEqual(read.passages,[]);
  const meta=await run('read_paper',{paper_id:'MED:666'});
  assert.equal(meta.paper.access,'no_abstract');assert.match(meta.coverage,/Metadata only/);
  const alias=await run('read_paper',{paper_id:'PMC:PMC456'});
  assert.equal(alias.requestedPaperId,'PMC:PMC456');assert.equal(alias.paper.id,'MED:123');assert.equal(alias.paper.pmcid,'PMC456');
  assert.equal(alias.paper.access,'full_text_excerpts');assert.equal(alias.passages.length,1);
  assert.equal(seen.filter(q=>q===null).length,1,'Only the one OA record attempts full text');
  sqlite.close();
}

// Actual SQLite boundary and day rollover; reserving two reads can never cross.
{
  const {sqlite,db}=database();
  for(let n=0;n<30;n++)await reserveMCPFetches(db,'one-author',2,NOW);
  await assert.rejects(reserveMCPFetches(db,'one-author',1,NOW),e=>e.code==='daily_limit');
  for(let n=0;n<220;n++)await reserveMCPFetches(db,'author-'+n,2,NOW);
  await assert.rejects(reserveMCPFetches(db,'new-author',1,NOW),e=>e.code==='daily_limit');
  assert.equal(sqlite.prepare('SELECT SUM(reserved_fetches) n FROM mcp_requests').get().n,500);
  await reserveMCPFetches(db,'one-author',1,NOW+86_400_000);
  assert.equal(sqlite.prepare('SELECT SUM(reserved_fetches) n FROM mcp_requests').get().n,501);
  sqlite.close();
}

// Real Workers fetch + durable D1 serializes simultaneous calls from one user.
{
  const require=createRequire(import.meta.url),toolRequire=createRequire(require.resolve('wrangler/package.json'));
  const {Miniflare,Response:MockResponse}=toolRequire('miniflare'),{build}=toolRequire('esbuild');
  const bundled=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),sourcefile:'mcp-test-entry.mjs',contents:`import {handleMCP} from './server/mcp.mjs'; export default {fetch(request,env){return handleMCP(request,env,{now:()=>${NOW}});}};`},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
  let mode='normal',outbound=0;
  const mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-15',d1Databases:['DB'],outboundService:async req=>{
    outbound++;assert.equal(new URL(req.url).origin,'https://www.ebi.ac.uk');assert.equal(req.headers.get('authorization'),null);
    if(mode==='redirect')return new MockResponse('',{status:302,headers:{Location:'https://unexpected.invalid'}});
    return new MockResponse(JSON.stringify({hitCount:1,resultList:{result:[paper]}}));
  }});
  try{
    const db=await mf.getD1Database('DB');
    for(const statement of schema.split(';').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run();
    const requests=Array.from({length:70},()=>request('tools/call',{name:'search_papers',arguments:{query:'mouse'}}));
    const dispatch=async req=>mf.dispatchFetch(req.url,{method:req.method,headers:Object.fromEntries(req.headers),body:await req.text()});
    const values=await Promise.all(requests.map(async req=>{const res=await dispatch(req);return res.json();}));
    assert.equal(values.filter(v=>!v.result.isError).length,60);assert.equal(values.filter(v=>v.result.isError).length,10);assert.equal(outbound,60);
    assert.equal((await db.prepare('SELECT SUM(reserved_fetches) n FROM mcp_requests').first()).n,60);
    mode='redirect';
    const res=await dispatch(request('tools/call',{name:'search_papers',arguments:{query:'mouse'}},{'oai-authenticated-user-id':'another-author'}));
    assert.equal(content(await res.json()).error,'source_redirect');assert.equal(outbound,61,'Workers must not follow a source redirect');
  }finally{await mf.dispose();}
}
console.log('MCP passed: schemas/authentication, exact quotes, bounded fixed-origin paper reading, no AI calls, fail-closed quotas, real Workers/D1 concurrent limits.');
