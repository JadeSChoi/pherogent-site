'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url');
const {zipSync,strToU8}=require('fflate');
const root=path.resolve(__dirname,'..');
function reader(){
  let requests=0;
  const sandbox={window:{},document:{currentScript:{src:pathToFileURL(path.join(root,'public/attachments.js')).href}},location:{href:'https://pherogent.example/'},URL,TextDecoder,Uint8Array,Date,Promise,Number,Set,Array,Object,String,Error,setTimeout,clearTimeout,
    fetch:()=>{requests++;throw Error('Attachment parsing must not send a file anywhere.');}};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'public/attachments.js'),'utf8'),sandbox);
  return {...sandbox.window.PherogentAttachments,requests:()=>requests};
}
const file=(name,value)=>{const data=typeof value==='string'?Buffer.from(value):Buffer.from(value);return {name,size:data.length,arrayBuffer:async()=>Uint8Array.from(data).buffer};};
const xml=(content)=>'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+content+'</w:body></w:document>';
const paragraph=value=>'<w:p><w:r><w:t>'+value+'</w:t></w:r></w:p>';
const docx=(content,others={})=>zipSync({'word/document.xml':strToU8(xml(content)),...others});
const worker=async()=>import(pathToFileURL(path.join(root,'public/attachment-worker.mjs')));
const readDocx=async(data)=>(await worker()).extractDocx(data);

// A minimal genuine PDF with a font, page tree, stream, xref and trailer.
function pdfFixture(text='Mouse evidence is not proof of human efficacy.',pages=1){
  if(Array.isArray(text))pages=text.length;
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids=[];
  for(let i=0;i<pages;i++){
    const page=objects.length+1,stream=page+1;kids.push(page+' 0 R');
    const value=Array.isArray(text)?text[i]:text;
    const content=value===null?'':'BT /F1 12 Tf 40 750 Td ('+value.replace(/[\\()]/g,'\\$&')+') Tj ET';
    objects.push(value===null?'null':'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents '+stream+' 0 R >>');
    objects.push('<< /Length '+Buffer.byteLength(content)+' >>\nstream\n'+content+'\nendstream');
  }
  objects[1]='<< /Type /Pages /Kids ['+kids.join(' ')+'] /Count '+pages+' >>';
  let result='%PDF-1.4\n',offsets=[0];
  objects.forEach((value,i)=>{offsets.push(Buffer.byteLength(result));result+=(i+1)+' 0 obj\n'+value+'\nendobj\n';});
  const start=Buffer.byteLength(result);result+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n';
  result+=offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('');
  result+='trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+start+'\n%%EOF\n';
  return new Uint8Array(Buffer.from(result));
}

test('common research text/code/data remains inert, bounded and local',async()=>{
  const r=reader();
  for(const name of ['paper.txt','notes.md','data.csv','results.tsv','metadata.json','analysis.py','bibliography.bib','notebook.ipynb','table.html']){
    const result=await r.read(file(name,'<script>neverExecute()</script>\r\nThis is local context.'));
    assert.equal(result.text,'<script>neverExecute()</script>\nThis is local context.');assert.equal(result.clipped,false);
  }
  assert.equal(r.requests(),0);assert.equal(r.LIMITS.maxFiles,3);assert.equal(r.LIMITS.maxFileBytes,20*1024*1024);
  assert.match(r.ACCEPT,/\.pdf/);assert.match(r.ACCEPT,/\.docx/);
});

test('long text is clipped honestly; unsupported, empty, binary and oversize files fail before processing',async()=>{
  const r=reader(),long=await r.read(file('long.md','A'.repeat(13000)));
  assert.equal(long.text.length,12000);assert.equal(long.clipped,true);assert.match(long.note,/First 12,000/);
  for(const name of ['bundle.zip','program.exe'])await assert.rejects(r.read(file(name,'data')),/file type cannot be read/);
  await assert.rejects(r.read(file('empty.txt','')),/empty/);
  await assert.rejects(r.read(file('blank.txt','   ')),/No readable text/);
  await assert.rejects(r.read(file('binary.txt',Buffer.from([0xff,0xfe,0x80]))),/UTF-16/);
  for(const name of ['scan.png','photo.jpg'])await assert.rejects(r.read(file(name,'image bytes')),/Read scan \(OCR\)/);
  for(const name of ['old.doc','old.xls','old.ppt'])await assert.rejects(r.read(file(name,'old bytes')),/older Office format/);
  await assert.rejects(r.read(file('binary.txt','abc\u0000def')),/binary/);
  let touched=false;await assert.rejects(r.read({name:'large.pdf',size:r.LIMITS.maxFileBytes+1,arrayBuffer(){touched=true;}}),/20 MB/);assert.equal(touched,false);
  await assert.rejects(r.read(file('fake.pdf','not PDF')),/does not appear/);assert.equal(r.requests(),0);
});

test('file read timeout fails visibly without uploading or starting later work',async()=>{
  const sandbox={window:{},document:{currentScript:{src:'https://pherogent.example/attachments.js'}},location:{href:'https://pherogent.example'},URL,TextDecoder,Uint8Array,Date,Promise,Number,Set,Array,Object,String,Error,setTimeout:fn=>setTimeout(fn,1),clearTimeout};
  vm.createContext(sandbox);vm.runInContext(fs.readFileSync(path.join(root,'public/attachments.js'),'utf8'),sandbox);
  await assert.rejects(sandbox.window.PherogentAttachments.read({name:'pending.txt',size:4,arrayBuffer:()=>new Promise(()=>{})}),/took too long/);
  let started=0; sandbox.Worker=class {constructor(){started++;}};
  await assert.rejects(sandbox.window.PherogentAttachments.read({name:'late.docx',size:4,arrayBuffer:()=>new Promise(resolve=>setTimeout(()=>resolve(new Uint8Array([80,75,3,4]).buffer),10))}),/took too long/);
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(started,0,'late file reads must not start a worker after the visible timeout');
});

test('real compressed DOCX keeps paragraph/cell text, decodes entities, and ignores external objects',async()=>{
  const result=await readDocx(docx(paragraph('Mouse &amp; human &#x3b1;')+'<w:tbl><w:tr><w:tc>'+paragraph('Cell one')+'</w:tc><w:tc>'+paragraph('&lt;script&gt;inert&lt;/script&gt;')+'</w:tc></w:tr></w:tbl>',{'word/_rels/document.xml.rels':strToU8('<Relationship Target="https://example.invalid/private"/>'),'word/vbaProject.bin':strToU8('DO NOT RUN')}));
  assert.match(result.text,/Mouse & human α/);assert.match(result.text,/Cell one/);assert.match(result.text,/<script>inert<\/script>/);assert.doesNotMatch(result.text,/private|DO NOT RUN/);
  assert.equal((await readDocx(docx('<!-- > '+paragraph('Ignored comment')+' -->'+paragraph('Visible')))).text,'Visible');
  assert.equal(result.kind,'DOCX');assert.equal(result.clipped,false);
  const clipped=await readDocx(docx(paragraph('B'.repeat(13000))));assert.equal(clipped.text.length,12000);assert.equal(clipped.clipped,true);
});

test('DOCX rejects corrupt, empty, entity-bearing and oversized uncompressed XML',async()=>{
  await assert.rejects(readDocx(Buffer.from('not zip')),/not a readable DOCX/);
  await assert.rejects(readDocx(zipSync({'not-word.xml':strToU8('hello')})),/main document/);
  await assert.rejects(readDocx(docx('<w:p/>')),/No readable text/);
  await assert.rejects(readDocx(docx('<!DOCTYPE foo [<!ENTITY x "secret">]>'+paragraph('&x;'))),/unsupported document structure/);
  await assert.rejects(readDocx(docx(paragraph('A'.repeat(2_100_000)))),/too large after extraction/);
  const hugeOther=await readDocx(docx(paragraph('Safe excerpt'),{'word/media/unused.bin':new Uint8Array(4_000_000)}));assert.equal(hugeOther.text,'Safe excerpt');
});

test('vendored real PDF.js extracts genuine PDF text with the bundled worker',async()=>{
  const pdf=await import(pathToFileURL(path.join(root,'public/vendor/pdf.min.mjs')));
  pdf.GlobalWorkerOptions.workerSrc=pathToFileURL(path.join(root,'public/vendor/pdf.worker.min.mjs')).href;
  const task=pdf.getDocument({data:pdfFixture(),isEvalSupported:false,disableFontFace:true,useSystemFonts:false,useWasm:false,verbosity:0});
  try{const doc=await task.promise;assert.equal(doc.numPages,1);const page=await doc.getPage(1);const text=await page.getTextContent();assert.match(text.items.map(x=>x.str||'').join(' '),/Mouse evidence is not proof of human efficacy/);}finally{await task.destroy();}
  const bad=pdf.getDocument({data:new Uint8Array(Buffer.from('%PDF-1.4\nbroken')),verbosity:0});await assert.rejects(bad.promise);await bad.destroy();
});

const relationshipsXml=parts=>'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+parts+'</Relationships>';
function pptxFixture(){return zipSync({
  'ppt/presentation.xml':strToU8('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="1" r:id="rId2"/><p:sldId id="2" r:id="rId1"/></p:sldIdLst></p:presentation>'),
  'ppt/_rels/presentation.xml.rels':strToU8(relationshipsXml('<Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/><Relationship Id="bad" TargetMode="External" Target="https://private.invalid/data"/>')),
  'ppt/slides/slide1.xml':strToU8('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>Second slide: validation required.</a:t></a:r></a:p></p:cSld></p:sld>'),
  'ppt/slides/slide2.xml':strToU8('<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:p><a:r><a:t>First slide: mouse &amp; human evidence.</a:t></a:r></a:p></p:cSld></p:sld>'),
  'ppt/notesSlides/notesSlide1.xml':strToU8('<a:t>Do not include private speaker notes.</a:t>'),
});}
function xlsxFixture(worksheet='<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>Age</t></is></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>24</v></c><c r="C2"><f>B2*2</f><v>48</v></c><c r="D2"><f>HYPERLINK(&quot;https://private.invalid&quot;)</f></c></row>'){return zipSync({
  'xl/workbook.xml':strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Study &amp; cohort" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels':strToU8(relationshipsXml('<Relationship Id="rId1" Target="/xl/worksheets/sheet1.xml"/>')),
  'xl/sharedStrings.xml':strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Animal</t></si><si><r><t>Mouse </t></r><r><t>A</t></r></si></sst>'),
  'xl/worksheets/sheet1.xml':strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+worksheet+'</sheetData></worksheet>'),
  'xl/externalLinks/externalLink1.xml':strToU8('<external>Do not follow external data</external>'),
});}
const utf16Fixture=(text,bigEndian=false)=>{const bytes=Buffer.from('\ufeff'+text,'utf16le');if(bigEndian)bytes.swap16();return bytes;};

test('UTF-16 BOM and legacy Windows text export correctly without accepting binary control data',async()=>{
  const r=reader();
  for(const bigEndian of [false,true]){
    const result=await r.read(file('research.txt',utf16Fixture('Research α → evidence\r\nMouse cohort',bigEndian)));
    assert.equal(result.text,'Research α → evidence\nMouse cohort');assert.match(result.note,/UTF-16/);
  }
  const result=await r.read(file('legacy.csv',Buffer.from([0x93,...Buffer.from('Caf'),0xe9,0x94,0x2c,0x32,0x34])));
  assert.equal(result.text,'“Café”,24');assert.match(result.note,/Windows-1252/);
  for(const bytes of [[0x80,0x00,0x81],[0xff,0x01,0xfe],[0x7f,0xff],[0xc2,0x85]])await assert.rejects(r.read(file('binary.txt',Buffer.from(bytes))),/binary|unsupported text/);
  const noExtension=file('research notes','plain text');noExtension.type='text/plain';assert.equal((await r.read(noExtension)).text,'plain text');
  assert.equal((await r.read(file('UPPER.TXT ','Text'))).text,'Text');
});

test('strict OOXML Word namespace is readable and unknown namespaces are rejected',async()=>{
  const strict=xml(paragraph('Strict Word export: α')).replace('http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main');
  assert.equal((await readDocx(zipSync({'word/document.xml':strToU8(strict)}))).text,'Strict Word export: α');
  assert.equal((await readDocx(zipSync({'word/document.xml':utf16Fixture(strict.replace('xmlns:w=','xmlns:w = '))}))).text,'Strict Word export: α');
  await assert.rejects(readDocx(zipSync({'word/document.xml':strToU8(strict.replace('http://purl.oclc.org/ooxml/wordprocessingml/main','https://unknown.invalid/namespace'))})),/namespace/);
});

test('PPTX follows presentation slide order and ignores notes/external links',async()=>{
  const result=(await worker()).extractPptx(pptxFixture());
  assert.equal(result.kind,'PPTX');assert.equal(result.clipped,false);
  assert.match(result.text,/\[Slide 1\]\nFirst slide: mouse & human evidence/);assert.match(result.text,/\[Slide 2\]\nSecond slide: validation required/);
  assert.doesNotMatch(result.text,/speaker notes|private\.invalid/);assert.match(result.note,/2 of 2 slides/);
});

test('XLSX reads shared/rich/inline text and labels cached formulas without calculation',async()=>{
  const result=(await worker()).extractXlsx(xlsxFixture());
  assert.equal(result.kind,'XLSX');assert.match(result.text,/\[Sheet: Study & cohort\]/);
  assert.match(result.text,/A1: Animal\tB1: Age/);assert.match(result.text,/A2: Mouse A\tB2: 24\tC2: 48 \[cached formula value\]\tD2: \[formula without cached value\]/);
  assert.doesNotMatch(result.text,/private\.invalid|HYPERLINK|external data/);assert.match(result.note,/formulas are never calculated/);
  const missing=(await worker()).extractXlsx(xlsxFixture('<row><c r="A1" t="s"><v>9999</v></c></row>'));
  assert.equal(missing.partial,true);assert.match(missing.text,/unresolved shared text/);assert.match(missing.note,/could not be resolved/);
});

test('Office archives keep decompression, structure, row and character limits',async()=>{
  const w=await worker();
  assert.throws(()=>w.extractPptx(zipSync({'ppt/presentation.xml':strToU8('<!DOCTYPE data><presentation></presentation>')})),/structure/);
  const rows=Array.from({length:501},(_,i)=>'<row><c r="A'+i+'"><v>1</v></c></row>').join('');
  const result=w.extractXlsx(xlsxFixture(rows));assert.equal(result.clipped,true);assert.doesNotMatch(result.text,/A500:/);
  const long=w.extractXlsx(xlsxFixture('<row><c t="inlineStr"><is><t>'+'A'.repeat(14000)+'</t></is></c></row>'));
  assert.equal(long.clipped,true);assert.ok(long.text.length<=12000);
  assert.throws(()=>w.extractXlsx(xlsxFixture('<row><c t="inlineStr"><is><t>'+'A'.repeat(2100000)+'</t></is></c></row>')),/too large after extraction/);
});

test('production PDF reader recovers xrefs, skips unreadable/blank pages and preserves bounds',async()=>{
  // Native message ports run the actual bundled PDF worker protocol in Node.
  // Browser UI/worker loading is checked separately; this exercises read() itself.
  const {MessageChannel}=require('node:worker_threads');
  const {WorkerMessageHandler}=await import(pathToFileURL(path.join(root,'public/vendor/pdf.worker.min.mjs')));
  const previous={window:global.window,document:global.document,location:global.location,Worker:global.Worker};
  let terminated=0;
  global.window={};global.document={currentScript:{src:pathToFileURL(path.join(root,'public/attachments.js')).href}};global.location={href:'https://example.invalid'};
  global.Worker=class{constructor(){const {port1,port2}=new MessageChannel();WorkerMessageHandler.initializeFromPort(port2);port1.terminate=()=>{terminated++;port1.close();port2.close();};return port1;}};
  try{
    await import(pathToFileURL(path.join(root,'public/attachments.js')).href+'?test=compat');const r=global.window.PherogentAttachments;
    const recovered=Buffer.from(pdfFixture()).toString().replace(/startxref\n\d+/,'startxref\n0');
    assert.match((await r.read(file('recovered.pdf',recovered))).text,/Mouse evidence/);
    const mixed=await r.read(file('mixed.pdf',pdfFixture(['First readable page','','Last readable page'])));
    assert.match(mixed.text,/First readable page/);assert.match(mixed.text,/Last readable page/);assert.equal(mixed.partial,true);assert.match(mixed.note,/No selectable text on pages 2/);
    const damaged=await r.read(file('damaged-page.pdf',pdfFixture(['First readable page',null,'Last readable page'])));
    assert.match(damaged.text,/First readable page/);assert.equal(damaged.partial,true);assert.match(damaged.note,/Could not read pages/);
    await assert.rejects(r.read(file('scan.pdf',pdfFixture(''))),/Read scan \(OCR\)/);
    const limited=await r.read(file('long.pdf',pdfFixture('Readable page',25)));assert.equal(limited.pagesChecked,20);assert.equal(limited.clipped,true);assert.match(limited.note,/20 pages/);
    assert.equal(terminated,5);
  }finally{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete global[key];else global[key]=value;}}
});

// Browser QA uses these same small, non-sensitive fixtures.
if(process.env.PHEROGENT_WRITE_ATTACHMENT_FIXTURES==='1'){
  const dir='/workspace/scratch/pherogent-attachment-fixtures';fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'research-note.pdf'),pdfFixture());
  fs.writeFileSync(path.join(dir,'research-note.docx'),docx(paragraph('Local Word attachment: mouse experiments alone do not establish human efficacy.')));
  fs.writeFileSync(path.join(dir,'research-notes.txt'),'Research notes\nMouse evidence does not establish human efficacy.\n');
  fs.writeFileSync(path.join(dir,'research-slides.pptx'),pptxFixture());
  fs.writeFileSync(path.join(dir,'research-data.xlsx'),xlsxFixture());
  fs.writeFileSync(path.join(dir,'utf16-research.txt'),utf16Fixture('UTF-16 export: mouse α cohort'));
  fs.writeFileSync(path.join(dir,'research-mixed-pages.pdf'),pdfFixture(['First readable page','','Last readable page']));
  fs.writeFileSync(path.join(dir,'research-damaged-page.pdf'),pdfFixture(['First readable page',null,'Last readable page']));
  fs.writeFileSync(path.join(dir,'research-recovered-xref.pdf'),Buffer.from(pdfFixture()).toString().replace(/startxref\n\d+/,'startxref\n0'));
  fs.writeFileSync(path.join(dir,'research-strict.docx'),zipSync({'word/document.xml':strToU8(xml(paragraph('Strict OOXML: mouse evidence needs validation.')).replace('http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'))}));
}
