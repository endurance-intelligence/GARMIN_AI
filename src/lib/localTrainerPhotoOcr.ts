/** Browser-only OCR isolated from Supabase sessions in a sandboxed iframe.
 * Free Tesseract.js library runs locally on the uploaded image. The iframe has
 * an opaque origin: it cannot access owner login state, cookies or the DOM.
 * Model, worker and WASM are downloaded from upstream CDN on first use.
 * No image is sent to OpenAI or a Supabase function by this OCR code.
 */
type OcrMessage={
 source:'garmin_ai_local_ocr_v1';
 type:'ready'|'progress'|'result'|'error';
 taskId?:string;text?:string;progress?:number;phase?:string
}
const LOCAL_OCR_FRAME=`<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<meta name="referrer" content="no-referrer"></head><body>
<script src="https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js"><\/script>
<script>
(function(){
  'use strict';
  const source='garmin_ai_local_ocr_v1';
  const send=(data)=>parent.postMessage(Object.assign({source},data),'*');
  let busy=false;
  window.addEventListener('message',async event=>{
    const msg=event.data;
    if(event.source!==parent||!msg||msg.source!==source||
      msg.type!=='start'||busy||typeof msg.taskId!=='string'||
      typeof msg.image!=='string'||!/^data:image\\/(png|jpeg|webp);base64,/.test(msg.image))
      return;
    busy=true;
    let worker=null;
    try{
      if(!window.Tesseract||!window.Tesseract.createWorker)throw Error('OCR_ENGINE_MISSING');
      send({type:'progress',taskId:msg.taskId,progress:0,phase:'OCR-Modell wird geladen'});
      worker=await Tesseract.createWorker('deu',1,{
        logger:(m)=>{
          const p=typeof m.progress==='number'?Math.max(0,Math.min(1,m.progress)):0;
          send({type:'progress',taskId:msg.taskId,progress:p,phase:
            m.status==='recognizing text'?'Schrift wird gelesen':'OCR-Modell wird geladen'});
        }
      });
      const response=await worker.recognize(msg.image);
      send({type:'result',taskId:msg.taskId,
        text:String(response&&response.data&&response.data.text||'').slice(0,14000)});
    }catch{
      send({type:'error',taskId:msg.taskId});
    }finally{
      if(worker)try{await worker.terminate()}catch{}
      busy=false;
    }
  });
  send({type:'ready'});
})();
<\/script></body></html>`;

function readDataUrl(file:File):Promise<string>{
 return new Promise((resolve,reject)=>{
  const reader=new FileReader()
  reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):
   reject(Error('Das Foto konnte nicht gelesen werden.'))
  reader.onerror=()=>reject(Error('Das Foto konnte nicht gelesen werden.'))
  reader.readAsDataURL(file)
 })
}
export async function readTrainerPhotoLocally(
 file:File,onProgress:(phase:string,progress:number)=>void
):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||
   file.size<1000||file.size>8_000_000)
   throw Error('Bitte JPG, PNG oder WebP unter 8 MB auswählen.')
 const image=await readDataUrl(file)
 return await new Promise<string>((resolve,reject)=>{
  const frame=document.createElement('iframe')
  frame.setAttribute('sandbox','allow-scripts')
  frame.setAttribute('referrerpolicy','no-referrer')
  frame.setAttribute('aria-hidden','true')
  frame.setAttribute('tabindex','-1')
  frame.style.cssText='position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0;'
  const taskId=crypto.randomUUID()
  let settled=false
  let timer=0
  function close(){
   window.removeEventListener('message',onMessage)
   window.clearTimeout(timer)
   frame.remove()
  }
  function fail(){
   if(settled)return
   settled=true;close()
   reject(Error('Lokale Texterkennung auf diesem Gerät nicht verfügbar. Du kannst die Vorlage weiterhin manuell erfassen.'))
  }
  function onMessage(event:MessageEvent){
   if(event.source!==frame.contentWindow)return
   const data=event.data as OcrMessage|null
   if(!data||data.source!=='garmin_ai_local_ocr_v1')return
   if(data.type==='ready'){
    frame.contentWindow?.postMessage({
     source:'garmin_ai_local_ocr_v1',type:'start',taskId,image
    },'*')
    onProgress('Schriftmodell laden',0)
    return
   }
   if(data.taskId!==taskId)return
   if(data.type==='progress'){
    onProgress(data.phase||'Schrift wird gelesen',data.progress||0)
   }else if(data.type==='result'){
    if(settled)return
    settled=true;close();resolve((data.text||'').slice(0,14000))
   }else if(data.type==='error')fail()
  }
  window.addEventListener('message',onMessage)
  timer=window.setTimeout(fail,150000)
  frame.srcdoc=LOCAL_OCR_FRAME
  document.body.appendChild(frame)
 })
}
