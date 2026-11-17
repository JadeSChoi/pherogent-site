'use strict';
(() => {
  const LIMITS=Object.freeze({maxFileBytes:20*1024*1024,maxFiles:3,maxCharacters:12000,maxPdfPages:20,timeoutMs:45000});
  const textExtensions=new Set(['txt','md','markdown','csv','tsv','json','jsonl','ndjson','log','yaml','yml','xml','html','htm','tex','bib','py','r','js','ts','jsx','tsx','css','sql','ipynb']);
  const officeExtensions=new Set(['docx','pptx','xlsx']);
  const ACCEPT=['.pdf','.png','.jpg','.jpeg',...Array.from(officeExtensions,x=>'.'+x),...Array.from(textExtensions,x=>'.'+x)].join(',');
  const scriptURL=document.currentScript?.src||new URL('/attachments.js',location.href).href;
  const asset=file=>new URL(file,scriptURL).href;
  let pdfLibrary;
  const cleanText=value=>String(value).replace(/\u0000/g,'').replace(/\r\n?/g,'\n').trim();
  const timeoutError=()=>Error('Reading this file took too long. Try a smaller file or paste a text excerpt.');
  const passwordError=()=>Error('This PDF is password-protected. Attach an unlocked copy or paste a text excerpt.');
  const readableError=error=>error?.name==='PasswordException'?passwordError():error;
  async function readPdf(bytes,deadline){
    // The bundled legacy build supports older browsers; the worker has the exact same version.
    pdfLibrary ||= import(asset('vendor/pdf.min.mjs')).catch(error=>{pdfLibrary=null;throw error;});
    const pdf=await pdfLibrary;
    if(Date.now()>deadline)throw timeoutError();
    if(typeof Worker!=='function')throw Error('This browser cannot open PDF attachments. Use an up-to-date browser or paste a text excerpt.');
    const nativeWorker=new Worker(asset('vendor/pdf.worker.min.mjs'),{type:'module'});
    const worker=new pdf.PDFWorker({port:nativeWorker});let task,stopped=false,timer,passwordProtected=false,rejectPassword;
    const passwordFailure=new Promise((_,reject)=>{rejectPassword=reject;});
    const stop=()=>{if(stopped)return;stopped=true;try{task?.destroy()?.catch?.(()=>{});}catch{}try{worker.destroy();}catch{}nativeWorker.terminate();};
    const work=(async()=>{
      task=pdf.getDocument({data:bytes,worker,isEvalSupported:false,disableFontFace:true,useSystemFonts:false,enableXfa:false,useWasm:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,maxImageSize:0,disableAutoFetch:true,disableStream:true,stopAtErrors:false,verbosity:0,cMapUrl:asset('vendor/cmaps/'),cMapPacked:true,standardFontDataUrl:asset('vendor/standard_fonts/'),useWorkerFetch:true});
      task.onPassword=()=>{passwordProtected=true;rejectPassword(passwordError());stop();};
      const doc=await task.promise;let text='',pagesRead=0,pagesChecked=0,clipped=false;const emptyPages=[],failedPages=[];
      for(let n=1;n<=Math.min(doc.numPages,LIMITS.maxPdfPages);n++){
        if(Date.now()>deadline)throw timeoutError();
        let page,reader,pageText='';
        try{
          page=await doc.getPage(n);reader=page.streamTextContent({includeMarkedContent:false}).getReader();
          for(;;){const {value,done}=await reader.read();if(done)break;for(const item of value.items||[]){if(typeof item.str!=='string')continue;pageText+=item.str+(item.hasEOL?'\n':' ');if(text.length+pageText.length+20>LIMITS.maxCharacters){clipped=true;break;}}if(clipped){await reader.cancel().catch(()=>{});break;}}
          if(pageText.trim()){text+='\n\n[Page '+n+']\n'+pageText;pagesRead++;}else emptyPages.push(n);
        }catch(error){
          if(stopped||Date.now()>deadline)throw timeoutError();
          // A damaged page must not hide readable text on the remaining pages.
          failedPages.push(n);
        }finally{if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}page?.cleanup();}
        pagesChecked=n;if(clipped){text=text.slice(0,LIMITS.maxCharacters);break;}
      }
      if(!text.trim())throw Error(emptyPages.length?'No selectable PDF text was found. This may be a scanned PDF. Choose Read scan (OCR), or paste the relevant text.':'The PDF pages could not be read. Try exporting a new PDF or paste the relevant text.');
      clipped ||= pagesChecked<doc.numPages;
      const partial=failedPages.length>0||emptyPages.length>0;
      const notes=[`Text extracted from ${pagesRead} of ${doc.numPages} pages.`];
      if(clipped)notes.push('Limited to the first 20 pages or 12,000 characters.');
      if(failedPages.length)notes.push('Could not read pages '+failedPages.join(', ')+'.');
      if(emptyPages.length)notes.push('No selectable text on pages '+emptyPages.join(', ')+' (possibly scanned or blank).');
      notes.push('Images, charts and scanned text are not interpreted. Review the excerpt before sending.');
      return {text:cleanText(text),kind:'PDF',pagesRead,pagesChecked,totalPages:doc.numPages,clipped,partial,note:notes.join(' ')};
    })();
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{stop();reject(timeoutError());},Math.max(1,deadline-Date.now()));});
    try{return await Promise.race([work,timeout,passwordFailure]);}catch(error){throw passwordProtected?passwordError():readableError(error);}finally{clearTimeout(timer);stop();}
  }
  function readOffice(bytes,extension,deadline){
    if(typeof Worker!=='function')return Promise.reject(Error('This browser cannot open Office attachments. Paste a text excerpt instead.'));
    return new Promise((resolve,reject)=>{
      const worker=new Worker(asset('attachment-worker.mjs'),{type:'module'});let finished=false;
      const finish=(error,result)=>{if(finished)return;finished=true;clearTimeout(timer);worker.terminate();error?reject(error):resolve(result);};
      const timer=setTimeout(()=>finish(timeoutError()),Math.max(1,deadline-Date.now()));
      worker.onmessage=event=>event.data?.ok?finish(null,event.data.result):finish(Error(event.data?.error||'This document could not be read. Export it as PDF or plain text.'));
      worker.onerror=()=>finish(Error('This document could not be read. Export it as PDF or plain text.'));
      worker.postMessage({buffer:bytes.buffer,kind:extension},[bytes.buffer]);
    });
  }
  function decodeText(bytes){
    let text,encoding='UTF-8';
    const utf16LE=bytes[0]===0xff&&bytes[1]===0xfe,utf16BE=bytes[0]===0xfe&&bytes[1]===0xff;
    if(utf16LE||utf16BE){
      if(bytes.length%2!==0)throw Error('This UTF-16 text file is incomplete. Save it again as UTF-8.');
      encoding=utf16LE?'UTF-16 LE':'UTF-16 BE';
      try{text=new TextDecoder(utf16LE?'utf-16le':'utf-16be',{fatal:true}).decode(bytes);}catch{throw Error('This UTF-16 text file is damaged. Save it again as UTF-8.');}
    }else{
      try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{
        // Legacy research exports commonly use Windows-1252. Only fall back for
        // otherwise text-like bytes; never silently decode arbitrary binaries.
        if(bytes.some(byte=>byte===0||byte<0x20&&![9,10,12,13].includes(byte)||[0x7f,0x81,0x8d,0x8f,0x90,0x9d].includes(byte)))throw Error('This appears to be a binary file or an unsupported text encoding. Export it as UTF-8 text.');
        encoding='Windows-1252';text=new TextDecoder('windows-1252',{fatal:true}).decode(bytes);
      }
    }
    if(/[\u0000-\u0008\u000b\u000e-\u001f\u007f-\u009f]/.test(text))throw Error('This appears to be a binary file. Use PDF, DOCX, PPTX, XLSX or text.');
    text=cleanText(text);if(!text)throw Error('No readable text was found in this file.');
    return {text,encoding};
  }
  async function read(file){
    if(!file||typeof file.name!=='string'||!Number.isSafeInteger(file.size)||file.size<1)throw Error('This file is empty or unavailable.');
    if(file.size>LIMITS.maxFileBytes)throw Error('Each attachment must be 20 MB or smaller.');
    let extension=file.name.trim().toLowerCase().split('.').at(-1);
    const mime=String(file.type||'').toLowerCase().split(';')[0];
    if(!file.name.includes('.'))extension=({'application/pdf':'pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/vnd.openxmlformats-officedocument.presentationml.presentation':'pptx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','text/plain':'txt','text/csv':'csv'})[mime]||extension;
    if(['png','jpg','jpeg'].includes(extension))throw Error('This image needs text recognition. Choose Read scan (OCR), or paste its text.');
    if(!textExtensions.has(extension)&&!officeExtensions.has(extension)&&extension!=='pdf')throw Error(['doc','xls','ppt'].includes(extension)?'This older Office format is not supported. Save it as DOCX, XLSX or PPTX, or export a PDF.':'This file type cannot be read yet. Use PDF, DOCX, PPTX, XLSX or text. Images and scans need a searchable PDF or a text excerpt.');
    const deadline=Date.now()+LIMITS.timeoutMs;let timer,expired=false;
    const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(timeoutError());},LIMITS.timeoutMs);});
    try{return await Promise.race([(async()=>{
      const buffer=await file.arrayBuffer();if(expired||Date.now()>deadline)throw timeoutError();
      if(buffer.byteLength>LIMITS.maxFileBytes)throw Error('Each attachment must be 20 MB or smaller.');
      const bytes=new Uint8Array(buffer);
      if(extension==='pdf'){
        if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))throw Error('This does not appear to be a PDF. Export the document again or paste text.');
        return readPdf(bytes,deadline);
      }
      if(officeExtensions.has(extension))return readOffice(bytes,extension,deadline);
      const {text:full,encoding}=decodeText(bytes),clipped=full.length>LIMITS.maxCharacters;
      return {text:full.slice(0,LIMITS.maxCharacters),kind:extension.toUpperCase(),clipped,note:(clipped?'First 12,000 characters extracted. Choose the relevant excerpt before sending. ':'')+(encoding==='UTF-8'?'Plain text extracted locally.':encoding+' text decoded locally; check symbols in the preview.')+' Code, formulas and markup are not executed.'};
    })(),timeout]);}finally{clearTimeout(timer);}
  }
  window.PherogentAttachments=Object.freeze({ACCEPT,LIMITS,read});
})();
