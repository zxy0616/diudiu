function check(current){if(!current())throw new DOMException('已离开本次倾诉','AbortError');}
export function recognizedContent(message){
  return [message.text||'',...(message.recognitions||[]).map(r=>`[${r.kind==='audio'?'录音转成的文字':'图片里读到的内容'}，可能有识别误差]\n${r.text}`)].filter(Boolean).join('\n\n');
}
function base64(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('这份附件没有读完整，可以重新添加。'));r.readAsDataURL(blob);});}
async function blobOf(item){return item.blob||await (await fetch(item.url)).blob();}
export async function imageData(item){
  const bmp=await createImageBitmap(await blobOf(item));const scale=Math.min(1,1600/Math.max(bmp.width,bmp.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bmp.width*scale));canvas.height=Math.max(1,Math.round(bmp.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close();
  let blob;for(const quality of [.85,.65,.45]){blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(blob&&blob.size<1500000)break;}
  if(!blob||blob.size>=1500000)throw Error('图片有点大，裁掉无关部分再试一下吧。');
  return {mime:'image/jpeg',data:await base64(blob)};
}
export function wavBlob(samples,sampleRate=16000){
  const buffer=new ArrayBuffer(44+samples.length*2),v=new DataView(buffer);const word=(offset,text)=>{for(let i=0;i<text.length;i++)v.setUint8(offset+i,text.charCodeAt(i));};
  word(0,'RIFF');v.setUint32(4,36+samples.length*2,true);word(8,'WAVE');word(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);word(36,'data');v.setUint32(40,samples.length*2,true);
  for(let i=0;i<samples.length;i++){const s=Math.max(-1,Math.min(1,samples[i]));v.setInt16(44+i*2,s<0?s*32768:s*32767,true);}return new Blob([buffer],{type:'audio/wav'});
}
export async function audioData(item){
  const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context)throw Error('这台浏览器暂时读不了录音，可以换个浏览器试试。');
  const context=new Context();let decoded;try{decoded=await context.decodeAudioData(await (await blobOf(item)).arrayBuffer());}finally{await context.close();}
  if(decoded.duration>121)throw Error('这段录音有点长，请分成两段再说。');
  const offline=new OfflineAudioContext(1,Math.ceil(decoded.duration*16000),16000);const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();const mono=(await offline.startRendering()).getChannelData(0);const parts=[];
  for(let offset=0;offset<mono.length;offset+=30*16000)parts.push({mime:'audio/wav',data:await base64(wavBlob(mono.subarray(offset,offset+30*16000)))});
  return parts;
}
export async function recognizeMessages(messages,{invoke,isCurrent,onProgress}){
  for(const m of messages){if(m.role==='assistant')continue;m.recognitions||=[];
    const items=[...(m.images||[]).map((item,index)=>({kind:'image',item,index})),...(m.audio?[{kind:'audio',item:m.audio,index:0}]:[])];
    for(const {kind,item,index}of items){if(m.recognitions.some(r=>r.kind===kind&&r.index===index)||(m.skippedMedia||[]).includes(kind+':'+index))continue;check(isCurrent);onProgress(kind);
      const parts=kind==='image'?[await imageData(item)]:await audioData(item);check(isCurrent);const texts=[];
      item.recognizedParts||=[];
      for(const [partIndex,part]of parts.entries()){check(isCurrent);if(!item.recognizedParts[partIndex]){const result=await invoke({action:'recognize',kind,...part});check(isCurrent);if(!result.text?.trim())throw Error('这份附件没有读清楚，可以重新试一下。');item.recognizedParts[partIndex]=result.text;}texts.push(item.recognizedParts[partIndex]);}
      check(isCurrent);m.recognitions.push({kind,index,text:texts.join('\n').slice(0,8000)});
    }
  }
}
