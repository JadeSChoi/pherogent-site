'use strict';
(() => {
  // OCR is opt-in and entirely local. Only its reviewed text excerpt can later
  // be submitted through the existing AI consent flow.
  const LIMITS=Object.freeze({maxFileBytes:20*1024*1024,maxPdfPages:3,maxCharacters:12000,maxPixels:3_000_000,maxSide:1800,maxSourcePixels:25_000_000,timeoutMs:60000});
  const scriptURL=document.currentScript?.src||new URL('/attachment-ocr.js',location.href).href;
  const asset=file=>new URL(file,scriptURL).href;
  let pdfLibrary,active=false;
  const normalized=value=>String(value||'').replace(/\u0000/g,'').replace(/\r\n?/g,'\n').trim();
  const supported=file=>!!file&&(/\.(?:pdf|png|jpe?g)$/i.test(String(file.name||'').trim())||['application/pdf','image/png','image/jpeg'].includes(String(file.type||'').toLowerCase()));
  function dimensions(bytes){
    if(bytes.length>=24&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71&&bytes[4]===13&&bytes[5]===10&&bytes[6]===26&&bytes[7]===10){
      if(String.fromCharCode(...bytes.subarray(12,16))!=='IHDR')throw Error('This PNG has an invalid image header.');
      const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
      return {width:view.getUint32(16),height:view.getUint32(20),type:'image/png'};
    }
    if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216){
      let at=2,segments=0;
      while(at+4<=bytes.length&&++segments<2048){
        if(bytes[at++]!==255)throw Error('This JPEG has an invalid image header.');
        while(bytes[at]===255)at++;
        const marker=bytes[at++];if(marker===217||marker===218)break;
        if(marker===1||(marker>=208&&marker<=215))continue;
        if(at+2>bytes.length)break;
        const length=(bytes[at]<<8)|bytes[at+1];
        if(length<2||at+length>bytes.length)break;
        if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=8)return {height:(bytes[at+3]<<8)|bytes[at+4],width:(bytes[at+5]<<8)|bytes[at+6],type:'image/jpeg'};
        at+=length;
      }
    }
    throw Error('OCR supports genuine PNG and JPEG images, or PDF files. Export this image as PNG or JPEG.');
  }
  function checkDimensions(width,height){
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>10000||height>10000||width*height>LIMITS.maxSourcePixels)throw Error('This image is too large to read safely. Resize it below 25 megapixels and 10,000 pixels per side.');
  }
  function fit(width,height){
    const scale=Math.min(1,LIMITS.maxSide/Math.max(width,height),Math.sqrt(LIMITS.maxPixels/(width*height)));
    return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale)),scale};
  }
  async function read(file,{onProgress=()=>{},signal}={}){
    if(active)throw Error('Another scan is being read. Wait for it to finish or cancel it first.');
    if(!supported(file))throw Error('OCR supports PDF, PNG and JPEG files.');
    if(!Number.isSafeInteger(file.size)||file.size<1||file.size>LIMITS.maxFileBytes)throw Error('Choose a non-empty file of 20 MB or smaller.');
    if(typeof Worker!=='function'||typeof WebAssembly!=='object')throw Error('This browser cannot run local OCR. Use an up-to-date browser or paste an excerpt.');
    if(signal?.aborted)throw Error('Local OCR was cancelled.');
    active=true;
    let stopped=false,timer,stopError,rejectStop,nativeOCR,pdfTask,pdfWorker,nativePDF,renderTask;
    const cleanups=new Set(),pending=new Map();let job=0;
    const cleanup=fn=>{if(stopped)fn();else cleanups.add(fn);return()=>cleanups.delete(fn);};
    const progress=text=>{if(!stopped)try{onProgress(text);}catch{/* Observers cannot change OCR. */}};
    const alive=()=>{if(stopped)throw stopError||Error('Local OCR was cancelled.');};
    const stop=(reason)=>{
      if(stopped)return;stopped=true;stopError=reason||Error('Local OCR finished.');
      for(const p of pending.values())p.reject(stopError);pending.clear();
      try{nativeOCR?.terminate();}catch{}
      try{renderTask?.cancel();}catch{}
      try{pdfTask?.destroy()?.catch?.(()=>{});}catch{}
      try{pdfWorker?.destroy();}catch{}
      try{nativePDF?.terminate();}catch{}
      for(const fn of cleanups)try{fn();}catch{}cleanups.clear();
      if(reason)rejectStop?.(reason);
    };
    const abort=()=>stop(Error('Local OCR was cancelled.'));
    const stoppedPromise=new Promise((_,reject)=>{rejectStop=reject;});
    signal?.addEventListener('abort',abort,{once:true});
    timer=setTimeout(()=>stop(Error('Local OCR reached its 60-second limit. Try a smaller image or a one-page PDF.')),LIMITS.timeoutMs);
    const call=(action,payload)=>{
      alive();const jobId=String(++job);
      return new Promise((resolve,reject)=>{pending.set(jobId,{resolve,reject});nativeOCR.postMessage({workerId:'pherogent-local-ocr',jobId,action,payload});});
    };
    const startEngine=async()=>{
      alive();progress('Loading local English OCR…');alive();
      // Pinned Tesseract.js 7.0.0's worker protocol is used directly. Holding the
      // native worker from the start makes initialization cancellable too.
      nativeOCR=new Worker(asset('vendor/ocr/worker.min.js'));
      nativeOCR.onmessage=event=>{
        if(stopped)return;const value=event.data||{},p=pending.get(value.jobId);
        if(value.status==='progress'){if(value.action==='recognize')progress('Reading printed text… '+Math.round(Math.max(0,Math.min(1,Number(value.data?.progress)||0))*100)+'%');return;}
        if(!p)return;pending.delete(value.jobId);
        value.status==='resolve'?p.resolve(value.data):p.reject(Error('Local OCR could not read this image. Try a clearer scan or paste the text.'));
      };
      nativeOCR.onerror=()=>stop(Error('The local OCR engine could not load. Refresh the page and try again.'));
      await call('load',{options:{lstmOnly:true,corePath:asset('vendor/ocr/'),logging:false}});
      await call('loadLanguage',{langs:'eng',options:{langPath:asset('vendor/ocr/'),cacheMethod:'none',gzip:true,lstmOnly:true}});
      await call('initialize',{langs:'eng',oem:1,config:{}});
      await call('setParameters',{params:{tessedit_pageseg_mode:3,preserve_interword_spaces:'1'}});
    };
    const canvasFor=(width,height)=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      cleanup(()=>{canvas.width=0;canvas.height=0;});
      const context=canvas.getContext('2d',{willReadFrequently:true});
      if(!context)throw Error('This browser cannot prepare images for OCR.');
      context.fillStyle='#fff';context.fillRect(0,0,width,height);
      return {canvas,context};
    };
    const recognize=async(canvas)=>{
      alive();const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('This image could not be prepared for OCR.')),'image/png'));alive();
      const image=new Uint8Array(await blob.arrayBuffer());alive();
      const result=await call('recognize',{image,options:{},output:{text:true}});alive();
      return normalized(result?.text);
    };
    const work=(async()=>{
      progress('Preparing scan locally…');
      const buffer=await file.arrayBuffer();alive();
      if(buffer.byteLength>LIMITS.maxFileBytes)throw Error('Choose a file of 20 MB or smaller.');
      const bytes=new Uint8Array(buffer),isPDF=/\.pdf$/i.test(file.name.trim())||String(file.type||'').toLowerCase()==='application/pdf';
      let text='',pagesRead=0,totalPages=1,failed=0,emptyPages=0,clipped=false;
      if(isPDF){
        if(!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))throw Error('This does not appear to be a PDF.');
        pdfLibrary ||= import(asset('vendor/pdf.min.mjs')).catch(error=>{pdfLibrary=null;throw error;});
        const pdf=await pdfLibrary;alive();
        nativePDF=new Worker(asset('vendor/pdf.worker.min.mjs'),{type:'module'});
        pdfWorker=new pdf.PDFWorker({port:nativePDF});
        pdfTask=pdf.getDocument({data:bytes,worker:pdfWorker,isEvalSupported:false,enableXfa:false,disableFontFace:true,useSystemFonts:false,useWasm:false,isOffscreenCanvasSupported:false,isImageDecoderSupported:false,maxImageSize:LIMITS.maxSourcePixels,disableAutoFetch:true,disableStream:true,stopAtErrors:false,verbosity:0,cMapUrl:asset('vendor/cmaps/'),cMapPacked:true,standardFontDataUrl:asset('vendor/standard_fonts/'),useWorkerFetch:true});
        pdfTask.onPassword=()=>stop(Error('This PDF is password-protected. Attach an unlocked copy.'));
        const doc=await pdfTask.promise;alive();totalPages=doc.numPages;
        await startEngine();
        for(let n=1;n<=Math.min(doc.numPages,LIMITS.maxPdfPages);n++){
          alive();progress('Reading scan page '+n+' of '+Math.min(doc.numPages,LIMITS.maxPdfPages)+'…');let page,canvas;
          try{
            page=await doc.getPage(n);alive();
            const natural=page.getViewport({scale:2}),size=fit(natural.width,natural.height);
            if(!Number.isFinite(natural.width)||!Number.isFinite(natural.height)||natural.width<=0||natural.height<=0)throw Error('Invalid page dimensions.');
            const viewport=page.getViewport({scale:2*size.scale}),prepared=canvasFor(size.width,size.height);canvas=prepared.canvas;
            renderTask=page.render({canvasContext:prepared.context,canvas,viewport});await renderTask.promise;renderTask=null;alive();
            const content=await recognize(canvas);
            if(content){pagesRead++;text+='\n\n[Page '+n+' · OCR]\n'+content;}else emptyPages++;
            if(text.length>=LIMITS.maxCharacters){text=text.slice(0,LIMITS.maxCharacters);clipped=true;break;}
          }catch(error){alive();failed++;}finally{try{page?.cleanup();}catch{}if(canvas){canvas.width=0;canvas.height=0;}}
        }
        clipped ||= pagesRead<totalPages||failed>0||emptyPages>0;
      }else{
        const source=dimensions(bytes);checkDimensions(source.width,source.height);const size=fit(source.width,source.height);
        const blob=new Blob([bytes],{type:source.type});let bitmap;
        if(typeof createImageBitmap==='function'){
          bitmap=await createImageBitmap(blob,{resizeWidth:size.width,resizeHeight:size.height,resizeQuality:'high'});
          cleanup(()=>bitmap.close());alive();
        }else{
          const url=URL.createObjectURL(blob);cleanup(()=>URL.revokeObjectURL(url));
          bitmap=await new Promise((resolve,reject)=>{const image=new Image();cleanup(()=>{image.onload=null;image.onerror=null;image.src='';});image.onload=()=>resolve(image);image.onerror=()=>reject(Error('This image could not be opened. Export it as PNG or JPEG.'));image.src=url;});alive();
        }
        const {canvas,context}=canvasFor(size.width,size.height);context.drawImage(bitmap,0,0,size.width,size.height);
        await startEngine();text=await recognize(canvas);pagesRead=1;
        if(text.length>LIMITS.maxCharacters){text=text.slice(0,LIMITS.maxCharacters);clipped=true;}
      }
      text=normalized(text);
      if(!text)throw Error('No printed English text was found. Try a clearer scan, or paste and review the text yourself.');
      return {text,kind:isPDF?'PDF OCR':'IMAGE OCR',clipped,pagesRead,totalPages,emptyPages,note:(isPDF?'OCR found text on '+pagesRead+' of '+totalPages+' pages (first 3 at most). ':'Image read with local OCR. ')+(failed?failed+' page(s) could not be read. ':'')+(emptyPages?emptyPages+' page(s) produced no readable text and may contain scans, diagrams or blank space. ':'')+(clipped?'Only a partial excerpt was extracted. ':'')+'English printed text only. OCR may misread words, numbers and symbols; review the excerpt. Charts, handwriting and image meaning are not interpreted.'};
    })();
    try{return await Promise.race([work,stoppedPromise]);}catch(error){throw error instanceof Error?error:Error('This scan could not be read. Try a smaller file or paste a text excerpt.');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);stop();active=false;}
  }
  window.PherogentOCR=Object.freeze({LIMITS,supported,read});
})();
