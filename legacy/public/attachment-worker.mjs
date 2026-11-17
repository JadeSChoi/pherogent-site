import {unzipSync} from './vendor/fflate.mjs';

// Office ZIPs are read in a disposable worker. Only allowlisted text XML parts
// are inflated; external links, macros, images and embedded files are ignored.
const MAX_XML_BYTES=2_000_000,MAX_TOTAL_XML_BYTES=6_000_000,MAX_ZIP_ENTRIES=2048,MAX_CHARS=12000;
const NS={word:['http://schemas.openxmlformats.org/wordprocessingml/2006/main','http://purl.oclc.org/ooxml/wordprocessingml/main'],sheet:['http://schemas.openxmlformats.org/spreadsheetml/2006/main','http://purl.oclc.org/ooxml/spreadsheetml/main'],presentation:['http://schemas.openxmlformats.org/presentationml/2006/main','http://purl.oclc.org/ooxml/presentationml/main']};
function decodeEntities(value){
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,entity)=>{
    if(entity[0]==='#'){
      const code=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):parseInt(entity.slice(1),10);
      return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'\ufffd';
    }
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity.toLowerCase()];
  });
}
const attr=(tag,name)=>decodeEntities(tag.match(new RegExp('(?:^|\\s)'+name+'\\s*=\\s*["\']([^"\']*)["\']'))?.[1]||'');
function xmlText(bytes,kind,root,namespace){
  if(!bytes||bytes.length>MAX_XML_BYTES)throw Error('No readable '+root+' data was found in this '+kind+'.');
  let xml;try{const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';xml=new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw Error('This '+kind+' has an unsupported text encoding.');}
  if(/<!DOCTYPE|<!ENTITY|<!\[CDATA\[/i.test(xml))throw Error('This '+kind+' has an unsupported document structure.');
  xml=xml.replace(/<!--[\s\S]*?-->/g,'').replace(/<\?[\s\S]*?\?>/g,'').trim();
  if(!new RegExp('^<(?:[\\w.-]+:)?'+root+'(?:\\s|>)').test(xml)||!new RegExp('</(?:[\\w.-]+:)?'+root+'\\s*>$').test(xml))throw Error('This '+kind+' has an unsupported document structure.');
  if(namespace&&!namespace.some(ns=>new RegExp('\\bxmlns(?::[\\w.-]+)?\\s*=\\s*["\']'+ns.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'["\']').test(xml)))throw Error('This '+kind+' has an unsupported document namespace.');
  return xml;
}
function archive(buffer,kind){
  const data=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
  if(data.length<22||data[0]!==0x50||data[1]!==0x4b)throw Error('This is not a readable '+kind+' file. Export it as PDF or plain text.');
  let end=-1;for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){if(data[i]===0x50&&data[i+1]===0x4b&&data[i+2]===5&&data[i+3]===6){end=i;break;}}
  if(end<0)throw Error('This '+kind+' file is damaged or incomplete.');
  const view=new DataView(data.buffer,data.byteOffset,data.byteLength),entries=view.getUint16(end+10,true);
  if(entries>MAX_ZIP_ENTRIES||view.getUint16(end+8,true)!==entries||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)throw Error('This '+kind+' archive is too complex. Export a shorter PDF or text excerpt.');
  let total=0;
  return {read(select){
    const selected=new Set();total=0;
    return unzipSync(data,{filter(file){
      if(!select(file.name))return false;
      if(selected.has(file.name))throw Error('This '+kind+' contains duplicate document data.');selected.add(file.name);
      if(!Number.isSafeInteger(file.originalSize)||file.originalSize<1||file.originalSize>MAX_XML_BYTES||file.size>MAX_XML_BYTES||![0,8].includes(file.compression)||(total+=file.originalSize)>MAX_TOTAL_XML_BYTES)throw Error('This '+kind+' is too large after extraction. Export a shorter text excerpt.');
      return true;
    }});
  }};
}
function textTags(xml,kind,max=MAX_CHARS){
  let text='',insideText=false,depth=0,tokens=0,clipped=false;
  const parts=xml.match(/<[^>]*>|[^<]+/g)||[];
  for(const part of parts){
    if(++tokens>100000)throw Error('This '+kind+' is too complex. Export a shorter excerpt.');
    if(part[0]==='<'){
      if(/^<\//.test(part))depth=Math.max(0,depth-1);else if(!/^<[!?]/.test(part)&&!/\/>$/.test(part))depth++;
      if(depth>256)throw Error('This '+kind+' has an unsupported nested structure.');
      if(/^<([\w.-]+:)?t(?:\s|>)/.test(part))insideText=true;
      else if(/^<\/([\w.-]+:)?t\s*>/.test(part))insideText=false;
      else if(/^<(?:[\w.-]+:)?(?:tab|br|cr)(?:\s|\/?>)/.test(part))text+='\n';
      else if(/^<\/(?:[\w.-]+:)?(?:p|tc|tr)\s*>/.test(part))text+='\n';
    }else if(insideText)text+=decodeEntities(part);
    if(text.length>max){text=text.slice(0,max);clipped=true;break;}
  }
  return {text:text.replace(/\r/g,'').replace(/\n[\t ]*\n+/g,'\n\n').trim(),clipped};
}
export function extractDocx(buffer){
  const files=archive(buffer,'DOCX').read(name=>name==='word/document.xml');
  if(!files['word/document.xml'])throw Error('No readable main document was found in this DOCX.');
  const xml=xmlText(files['word/document.xml'],'DOCX','document',NS.word),{text,clipped}=textTags(xml,'DOCX');
  if(!text)throw Error('No readable text was found. Images and scanned pages need OCR; paste a text excerpt instead.');
  return {text,kind:'DOCX',clipped,note:(clipped?'First 12,000 characters extracted. ':'')+'Main document text only; images, comments and tracked-change meaning are not interpreted.'};
}
function relationships(bytes,kind,base,partPattern){
  const xml=xmlText(bytes,kind,'Relationships');const map=new Map();
  for(const match of xml.matchAll(/<(?:[\w.-]+:)?Relationship(?:\s[^>]*?)?\/?>/g)){
    const tag=match[0],id=attr(tag,'Id'),target=attr(tag,'Target');
    if(attr(tag,'TargetMode').toLowerCase()==='external')continue;
    const path=target.startsWith('/')?target.slice(1):base+'/'+target.replace(/^\.\//,'');
    if(id&&partPattern.test(path)&&!map.has(id))map.set(id,path);
  }
  return map;
}
export function extractPptx(buffer){
  const zip=archive(buffer,'PPTX'),meta=zip.read(name=>['ppt/presentation.xml','ppt/_rels/presentation.xml.rels'].includes(name));
  const xml=xmlText(meta['ppt/presentation.xml'],'PPTX','presentation',NS.presentation);
  const rels=relationships(meta['ppt/_rels/presentation.xml.rels'],'PPTX','ppt',/^ppt\/slides\/slide\d+\.xml$/);
  const slides=[...xml.matchAll(/<(?:[\w.-]+:)?sldId(?:\s[^>]*?)?\/?>/g)].map(m=>rels.get(attr(m[0],'r:id'))).filter(Boolean);
  if(!slides.length)throw Error('No readable slides were found in this PPTX.');
  const selected=new Set(slides.slice(0,30)),files=zip.read(name=>selected.has(name));
  let text='',clipped=slides.length>30,read=0,empty=0;
  for(const [i,name] of slides.slice(0,30).entries()){
    const slide=xmlText(files[name],'PPTX','sld',NS.presentation),part=textTags(slide,'PPTX');
    if(part.text){text+='\n\n[Slide '+(i+1)+']\n'+part.text;read++;}else empty++;
    if(part.clipped||text.length>MAX_CHARS){text=text.slice(0,MAX_CHARS);clipped=true;break;}
  }
  if(!text.trim())throw Error('No readable slide text was found. Export image-only slides as a searchable PDF or paste an excerpt.');
  return {text:text.trim(),kind:'PPTX',clipped,note:`Text from ${read} of ${slides.length} slides. `+(clipped?'Limited to 30 slides or 12,000 characters. ':'')+(empty?`${empty} inspected slides had no selectable text. `:'')+'Slide text only; images, charts, speaker notes, animation and reading order within a slide are not interpreted.'};
}
export function extractXlsx(buffer){
  const zip=archive(buffer,'XLSX'),meta=zip.read(name=>['xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/sharedStrings.xml'].includes(name));
  const xml=xmlText(meta['xl/workbook.xml'],'XLSX','workbook',NS.sheet),rels=relationships(meta['xl/_rels/workbook.xml.rels'],'XLSX','xl',/^xl\/worksheets\/sheet\d+\.xml$/);
  const sheets=[...xml.matchAll(/<(?:[\w.-]+:)?sheet(?:\s[^>]*?)?\/?>/g)].map(m=>({name:attr(m[0],'name'),path:rels.get(attr(m[0],'r:id'))})).filter(x=>x.path);
  if(!sheets.length)throw Error('No readable worksheets were found in this XLSX.');
  const strings=[];
  if(meta['xl/sharedStrings.xml']){
    const shared=xmlText(meta['xl/sharedStrings.xml'],'XLSX','sst',NS.sheet);
    for(const match of shared.matchAll(/<(?:[\w.-]+:)?si(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?si\s*>/g)){
      if(strings.length>=50000)throw Error('This spreadsheet has too many text values. Export the relevant sheet as CSV.');
      strings.push(textTags(match[1],'XLSX',MAX_CHARS).text);
    }
  }
  const selected=new Set(sheets.slice(0,5).map(x=>x.path)),files=zip.read(name=>selected.has(name));
  let text='',clipped=sheets.length>5,formulas=0,cells=0,missing=0;
  outer:for(const sheet of sheets.slice(0,5)){
    const data=xmlText(files[sheet.path],'XLSX','worksheet',NS.sheet);text+='\n\n[Sheet: '+(sheet.name||sheet.path)+']\n';let rowCount=0;
    for(const row of data.matchAll(/<(?:[\w.-]+:)?row(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?row\s*>/g)){
      if(++rowCount>500){clipped=true;break;}
      let cellCount=0;const rowText=[];
      for(const cell of row[1].matchAll(/<(?:[\w.-]+:)?c(\s[^>]*|)>([\s\S]*?)<\/(?:[\w.-]+:)?c\s*>/g)){
        if(++cellCount>100){clipped=true;break;}
        const type=attr(cell[1],'t'),ref=attr(cell[1],'r'),body=cell[2],raw=decodeEntities(body.match(/<(?:[\w.-]+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w.-]+:)?v\s*>/)?.[1]||'');
        const formula=/<(?:[\w.-]+:)?f(?:\s|>)/.test(body);if(formula)formulas++;
        let value=type==='inlineStr'?textTags(body,'XLSX').text:type==='s'?(/^\d+$/.test(raw)&&strings[Number(raw)]!==undefined?strings[Number(raw)]:'[unresolved shared text]'):type==='b'?(raw==='1'?'TRUE':raw==='0'?'FALSE':raw):raw;
        if(value==='[unresolved shared text]')missing++;
        if(formula&&!value)value='[formula without cached value]';
        if(value){rowText.push((ref?ref+': ':'')+value+(formula&&value!=='[formula without cached value]'?' [cached formula value]':''));cells++;}
      }
      if(rowText.length)text+=rowText.join('\t')+'\n';
      if(text.length>MAX_CHARS){text=text.slice(0,MAX_CHARS);clipped=true;break outer;}
    }
  }
  if(!cells)throw Error('No readable cell values were found in this XLSX. Export the relevant sheet as CSV.');
  return {text:text.trim(),kind:'XLSX',clipped,partial:missing>0,note:(clipped?'Limited to 5 sheets, 500 rows per sheet, 100 cells per row or 12,000 characters. ':'')+(formulas?`${formulas} formula cells use saved values only; formulas are never calculated. `:'')+(missing?`${missing} shared text values could not be resolved. `:'')+'Cell text and saved values only. Formatting, dates as serial numbers, charts, images, links and hidden-cell status are not interpreted. Review the excerpt.'};
}
export function extractOffice(buffer,kind='docx'){
  if(kind==='docx')return extractDocx(buffer);if(kind==='pptx')return extractPptx(buffer);if(kind==='xlsx')return extractXlsx(buffer);
  throw Error('This Office format is not supported. Export it as PDF or text.');
}
if(typeof self!=='undefined'&&typeof self.postMessage==='function')self.onmessage=event=>{
  try{const value=event.data;self.postMessage({ok:true,result:extractOffice(value?.buffer instanceof ArrayBuffer?value.buffer:value,value?.kind||'docx')});}catch(error){self.postMessage({ok:false,error:error?.message||'This document could not be read. Export it as plain text.'});}
};
