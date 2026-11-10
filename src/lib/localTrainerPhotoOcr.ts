/** Browser-only OCR isolated from Supabase sessions in a sandboxed iframe.
 * Free Tesseract.js library runs locally on the uploaded image. The iframe has
 * an opaque origin: it cannot access owner login state, cookies or the DOM.
 * Model, worker and WASM are downloaded from upstream CDN on first use.
 * No image is sent to OpenAI or a Supabase function by this OCR code.
 */
import type {SpatialOcrResult,SpatialOcrRow} from './spatialTrainerPhoto.ts'
type OcrMessage={
 source:'garmin_ai_local_ocr_v1';
 type:'ready'|'progress'|'result'|'error';
 taskId?:string;text?:string;rows?:SpatialOcrRow[];progress?:number;phase?:string
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
  const names=[
   ['Fuchs',/\bFUCHS\b/i],['Wolf',/\bWOLF\b/i],['Tiger',/\bTIGER\b/i],
   ['Bären',/\bB[ÄA]REN\b/i],['Capybara',/\bCAPYBARA\b/i]
  ];
  const decode=(src)=>new Promise((resolve,reject)=>{
   const image=new Image();
   image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('IMAGE_DECODE'));
   image.src=src;
  });
  const crop=(img,x,y,w,h,scale)=>{
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.ceil(w*scale));
   canvas.height=Math.max(1,Math.ceil(h*scale));
   const context=canvas.getContext('2d');
   if(!context)throw new Error('CANVAS_MISSING');
   context.imageSmoothingEnabled=true;
   context.imageSmoothingQuality='high';
   context.filter='contrast(1.5) brightness(1.12)';
   context.drawImage(img,x,y,w,h,0,0,canvas.width,canvas.height);
   return canvas.toDataURL('image/png');
  };
  // Tesseract 7 returns word-position metadata only if blocks output requested.
  const anchors=(data,top,scale)=>{
   const found=[];
   for(const block of data.blocks||[])for(const para of block.paragraphs||[])
    for(const line of para.lines||[]){
     const words=line.words||[];
     const label=words.map(w=>String(w.text||'')).join(' ');
     const match=names.find(pair=>pair[1].test(label));
     if(!match)continue;
     const bbox=line.bbox||words[0]&&words[0].bbox;
     if(!bbox||!Number.isFinite(bbox.y0)||!Number.isFinite(bbox.y1))continue;
     found.push({name:match[0],y:top+Math.round((bbox.y0+bbox.y1)/2/scale)});
    }
   return found;
  };
  const unique=(items)=>items.sort((a,b)=>a.y-b.y).filter((item,i,list)=>
   list.findIndex(other=>other.name===item.name)===i);
  const scaledRecognize=async(worker,img,x,y,w,h,scale,blocks=false)=>{
   const image=crop(img,Math.round(x),Math.round(y),Math.round(w),Math.round(h),scale);
   return worker.recognize(image,{},blocks?{blocks:true}:{text:true});
  };
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
      // Header / warm-up / general recovery notes from the whole poster.
      const full=await worker.recognize(msg.image);
      const fullText=String(full&&full.data&&full.data.text||'').slice(0,14000);
      const img=await decode(msg.image);
      const width=img.naturalWidth,height=img.naturalHeight;
      const x=width*.06,y=height*.35,w=width*.28,h=height*.59;
      await worker.setParameters({tessedit_pageseg_mode:'11'});
      send({type:'progress',taskId:msg.taskId,phase:'Gruppenpositionen erkennen',progress:.05});
      const labels=await scaledRecognize(worker,img,x,y,w,h,2.7,true);
      let found=unique(anchors(labels.data,y,2.7));
      // Sparse/busy graphics sometimes hide names in a tall region.
      // Scan narrower overlapping bands ONLY when the first pass failed.
      if(found.length<2){
       for(let i=0;i<8;i++){
        const start=height*(.37+i*.072);
        if(start>=height*.96)break;
        const bandHeight=Math.min(height*.15,height-start);
        const partial=await scaledRecognize(worker,img,x,start,w,bandHeight,2.6,true);
        found.push(...anchors(partial.data,start,2.6));
       }
       found=unique(found);
      }
      const spaces=found.slice(1).map((item,i)=>item.y-found[i].y)
       .filter(value=>value>=40&&value<=height*.20)
       .sort((a,b)=>a-b);
      const gap=spaces.length?spaces[Math.floor(spaces.length/2)]:height*.105;
      const rows=[];
      await worker.setParameters({tessedit_pageseg_mode:'6'});
      for(let i=0;i<Math.min(found.length,12);i++){
       const item=found[i];
       const start=Math.max(0,Math.round(item.y-gap*.27));
       const end=Math.min(height,Math.round(item.y+gap*.69));
       const rowHeight=end-start;
       if(rowHeight<24)continue;
       send({type:'progress',taskId:msg.taskId,
        phase:'Gruppe '+(i+1)+'/'+found.length+': '+item.name,progress:(i+1)/(found.length+1)});
       const left=await scaledRecognize(worker,img,width*.06,start,width*.27,rowHeight,2.6);
       const right=await scaledRecognize(worker,img,width*.30,start,width*.66,rowHeight,2);
       rows.push({name:item.name,
        leftText:String(left.data&&left.data.text||'').slice(0,3000),
        rightText:String(right.data&&right.data.text||'').slice(0,3000)});
      }
      send({type:'result',taskId:msg.taskId,text:fullText,rows});
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

function readDataUrl(file:File):Promise<SpatialOcrResult>{
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
 return await new Promise<SpatialOcrResult>((resolve,reject)=>{
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
    settled=true;close()
    resolve({text:(data.text||'').slice(0,14000),rows:(data.rows||[]).slice(0,12)})
   }else if(data.type==='error')fail()
  }
  window.addEventListener('message',onMessage)
  timer=window.setTimeout(fail,210000)
  frame.srcdoc=LOCAL_OCR_FRAME
  document.body.appendChild(frame)
 })
}
