'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {Worker:NodeWorker}=require('node:worker_threads');
const root=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(root,'public/attachment-ocr.js'),'utf8');
const fixture=()=>fs.readFileSync(path.join(__dirname,'fixtures/ocr-print.png'));
const imageFile=(data=fixture(),name='scan.png',type='image/png')=>({name,type,size:data.length,arrayBuffer:async()=>Uint8Array.from(data).buffer});
function imageHeader(width=800,height=400){const b=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(b);b.write('IHDR',12);b.writeUInt32BE(width,16);b.writeUInt32BE(height,20);return b;}
function harness(options={}){
  const state={workers:[],messages:[],bitmaps:[],canvases:[],assets:[],uploads:0,decodes:0};
  class MockWorker{
    constructor(url){this.url=url;this.terminated=false;state.assets.push(String(url));state.workers.push(this);}
    terminate(){this.terminated=true;}
    postMessage(value){state.messages.push(value);if(options.hang)return;const text=options.texts?options.texts[state.messages.filter(m=>m.action==='recognize').length-1]:options.text??'Mouse evidence requires careful review.';queueMicrotask(()=>this.onmessage?.({data:{jobId:value.jobId,action:value.action,status:'resolve',data:value.action==='recognize'?{text}:{}}}));}
  }
  const sandbox={window:{},document:{currentScript:{src:'https://pherogent.example/attachment-ocr.js'},createElement(tag){assert.equal(tag,'canvas');const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){}}),toBlob(fn){fn(new Blob([fixture()],{type:'image/png'}));}};state.canvases.push(canvas);return canvas;}},location:{href:'https://pherogent.example'},URL,TextDecoder,Uint8Array,DataView,Blob,Date,Promise,Number,Set,Map,Array,Object,String,Error,Math,WebAssembly,Worker:options.Worker||MockWorker,AbortController,
    setTimeout:options.fastTimeout?fn=>setTimeout(fn,5):setTimeout,clearTimeout,
    createImageBitmap:async(blob,settings)=>{state.decodes++;state.bitmapOptions=settings;const bitmap={width:settings.resizeWidth,height:settings.resizeHeight,closed:false,close(){this.closed=true;}};state.bitmaps.push(bitmap);return bitmap;},
    fetch:()=>{state.uploads++;throw Error('OCR must not upload a file.');}};
  // PDF.js is a separate integration boundary (also exercised in browser QA).
  // Inject only that module for a controlled multi-page OCR coverage test.
  sandbox.__testPDF=options.pdf;
  const source=options.pdf?script.replace("import(asset('vendor/pdf.min.mjs'))","Promise.resolve(__testPDF)"):script;
  vm.createContext(sandbox);vm.runInContext(source,sandbox);
  return {api:sandbox.window.PherogentOCR,state};
}

test('local OCR explicitly supports PDF/PNG/JPEG, MIME-only files and finite limits',()=>{
  const {api}=harness();assert.equal(api.supported({name:'scan.PDF '}),true);assert.equal(api.supported({name:'download',type:'application/pdf'}),true);
  assert.equal(api.supported({name:'scan',type:'image/png'}),true);assert.equal(api.supported({name:'drawing.svg',type:'image/svg+xml'}),false);
  assert.equal(api.LIMITS.maxPdfPages,3);assert.equal(api.LIMITS.maxPixels,3_000_000);assert.equal(api.LIMITS.maxCharacters,12000);assert.equal(api.LIMITS.timeoutMs,60000);
});

test('OCR checks magic bytes and original dimensions before decoding or allocating a worker',async()=>{
  const {api,state}=harness();
  await assert.rejects(api.read(imageFile(Buffer.from('<svg/>'))),/genuine PNG and JPEG/);
  await assert.rejects(api.read(imageFile(imageHeader(10000,10000))),/too large/);
  await assert.rejects(api.read(imageFile(imageHeader(0,500))),/too large/);
  await assert.rejects(api.read({name:'large.png',size:21*1024*1024,arrayBuffer(){throw Error('should not read');}}),/20 MB/);
  assert.equal(state.decodes,0);assert.equal(state.workers.length,0);assert.equal(state.uploads,0);
});

test('OCR uses only same-origin pinned assets, bounded text and a review warning',async()=>{
  const {api,state}=harness({text:'A'.repeat(13000)});const result=await api.read(imageFile());
  assert.equal(result.text.length,12000);assert.equal(result.clipped,true);assert.equal(result.kind,'IMAGE OCR');assert.match(result.note,/English printed text only/);assert.match(result.note,/may misread/);
  assert.deepEqual(state.messages.map(m=>m.action),['load','loadLanguage','initialize','setParameters','recognize']);
  assert.equal(state.assets[0],'https://pherogent.example/vendor/ocr/worker.min.js');
  assert.equal(state.messages[0].payload.options.corePath,'https://pherogent.example/vendor/ocr/');
  assert.equal(state.messages[1].payload.options.langPath,'https://pherogent.example/vendor/ocr/');
  assert.equal(state.messages[1].payload.options.cacheMethod,'none');assert.equal(state.messages[2].payload.oem,1);
  assert.equal(state.workers[0].terminated,true);assert.equal(state.bitmaps[0].closed,true);assert.equal(state.canvases[0].width,0);assert.equal(state.uploads,0);
});

test('source images are resized before OCR and empty output is not labeled as evidence',async()=>{
  const {api,state}=harness({text:'   '});
  await assert.rejects(api.read(imageFile(imageHeader(5000,4000))),/No printed English text/);
  assert.ok(state.bitmapOptions.resizeWidth<=1800);assert.ok(state.bitmapOptions.resizeHeight<=1800);assert.ok(state.bitmapOptions.resizeWidth*state.bitmapOptions.resizeHeight<=3_000_000);
  assert.equal(state.workers[0].terminated,true);
});

test('a PDF page with empty OCR is reported as missing coverage, not a fully read document',async()=>{
  const pdf={PDFWorker:class{destroy(){}},getDocument:()=>({destroy:async()=>{},promise:Promise.resolve({numPages:2,getPage:async()=>({getViewport:({scale})=>({width:500*scale,height:400*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}})})})};
  const {api}=harness({pdf,texts:['This page has readable study results.','   ']});
  const result=await api.read(imageFile(Buffer.from('%PDF-1.7\nfixture'),'scan.pdf','application/pdf'));
  assert.equal(result.pagesRead,1);assert.equal(result.totalPages,2);assert.equal(result.emptyPages,1);assert.equal(result.clipped,true);
  assert.match(result.note,/found text on 1 of 2 pages/);assert.match(result.note,/1 page\(s\) produced no readable text/);assert.doesNotMatch(result.text,/Page 2/);
});

test('abort kills a worker even during initialization and prevents concurrent OCR',async()=>{
  const {api,state}=harness({hang:true}),controller=new AbortController();
  const first=api.read(imageFile(),{signal:controller.signal});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(state.workers.length,1);
  await assert.rejects(api.read(imageFile()),/Another scan/);
  controller.abort();await assert.rejects(first,/cancelled/);assert.equal(state.workers[0].terminated,true);assert.equal(state.messages.length,1);
});

test('an observer cancelling at engine-start progress cannot leave a late worker running',async()=>{
  const {api,state}=harness(),controller=new AbortController();
  await assert.rejects(api.read(imageFile(),{signal:controller.signal,onProgress:message=>{if(message.includes('Loading local'))controller.abort();}}),/cancelled/);
  assert.equal(state.workers.length,0);assert.equal(state.bitmaps[0].closed,true);
});

test('hard timeout terminates pending initialization and late file reads create no workers',async()=>{
  const first=harness({hang:true,fastTimeout:true});await assert.rejects(first.api.read(imageFile()),/60-second limit/);assert.equal(first.state.workers[0].terminated,true);
  const second=harness({fastTimeout:true});let resolve;
  const data=fixture(),file={name:'late.png',size:data.length,arrayBuffer:()=>new Promise(r=>{resolve=r;})};
  await assert.rejects(second.api.read(file),/60-second limit/);resolve(Uint8Array.from(data).buffer);await new Promise(r=>setImmediate(r));assert.equal(second.state.workers.length,0);assert.equal(second.state.decodes,0);
});

test('pinned real Tesseract worker protocol reads the fixture without remote model downloads',async()=>{
  const actualWorkers=[],messages=[],core=path.dirname(require.resolve('tesseract.js-core/package.json'));
  const english=path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')),'4.0.0_best_int');
  const workerPath=path.join(path.dirname(require.resolve('tesseract.js/package.json')),'src/worker-script/node/index.js');
  class ActualWorker{
    constructor(url){assert.equal(url,'https://pherogent.example/vendor/ocr/worker.min.js');this.worker=new NodeWorker(workerPath);this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));actualWorkers.push(this);}
    postMessage(message){messages.push(message.action);if(message.action==='load')message.payload.options.corePath=core;if(message.action==='loadLanguage')message.payload.options.langPath=english;this.worker.postMessage(message);}
    terminate(){this.terminated=true;return this.worker.terminate();}
  }
  const {api}=harness({Worker:ActualWorker});
  const result=await api.read(imageFile());
  assert.match(result.text,/Mouse results do not prove human efficacy/i);assert.match(result.text,/Association alone does not establish causation/i);
  assert.deepEqual(messages,['load','loadLanguage','initialize','setParameters','recognize']);assert.equal(actualWorkers[0].terminated,true);
});
