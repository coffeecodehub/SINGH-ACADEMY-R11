export type UploadProgress={loaded:number;total:number;percent:number;processing:boolean;retryAttempt?:number};
/** Active transfers may take as long as needed. A stalled connection or commit
 * must settle. Retry only a structured admission rejection before file storage. */
export function adminUpload(url:string,options:{body:FormData;headers:Headers;signal:AbortSignal;onProgress?:(value:UploadProgress)=>void}):Promise<{ok:boolean;status:number;json:()=>Promise<any>}>{
 if(typeof XMLHttpRequest==='undefined')return fetch(url,{method:'POST',credentials:'include',body:options.body,headers:options.headers,signal:options.signal});
 return new Promise((resolve,reject)=>{
  if(options.signal.aborted){reject(new DOMException('Upload cancelled.','AbortError'));return;}
  const file=options.body.get('file'),bytes=file instanceof Blob?file.size:0;
  const processingDeadline=Math.min(930000,Math.max(390000,330000+Math.ceil(bytes/(512*1024))*1000));
  let xhr:XMLHttpRequest,settled=false,watchdog:ReturnType<typeof setTimeout>|undefined,retryTimer:ReturnType<typeof setTimeout>|undefined,retries=0;
  const cleanup=()=>{clearTimeout(watchdog);clearTimeout(retryTimer);options.signal.removeEventListener('abort',abort);};
  const fail=(error:Error)=>{if(settled)return;settled=true;cleanup();reject(error);};
  const abort=()=>{fail(new DOMException('Upload cancelled.','AbortError'));xhr?.abort();};
  const arm=(processing=false)=>{clearTimeout(watchdog);watchdog=setTimeout(()=>{fail(new Error(processing?'The server did not confirm scanning and storage in time. The request was stopped. Check the upload list before retrying; its final status is unknown.':'No upload progress was received for 90 seconds. Check your connection and retry when it is stable.'));xhr.abort();},processing?processingDeadline:90000);};
  const send=()=>{
   if(settled)return;xhr=new XMLHttpRequest();const current=xhr;
   xhr.open('POST',url);xhr.withCredentials=true;xhr.timeout=0;
   options.headers.forEach((value,key)=>xhr.setRequestHeader(key,value));
   xhr.upload.onprogress=event=>{if(settled||xhr!==current)return;arm(event.lengthComputable&&event.loaded>=event.total);if(event.lengthComputable)options.onProgress?.({loaded:event.loaded,total:event.total,percent:Math.min(100,Math.round(event.loaded/event.total*100)),processing:event.loaded>=event.total});};
   xhr.upload.onload=()=>{if(settled||xhr!==current)return;arm(true);options.onProgress?.({loaded:bytes,total:bytes,percent:100,processing:true});};
   xhr.onload=()=>{
    if(settled||xhr!==current)return;clearTimeout(watchdog);const raw=current.responseText,status=current.status;let body:any;try{body=JSON.parse(raw);}catch{}
    // A generic 429/503, lost response, scanner response or storage error may
    // have accepted bytes: never repeat those POSTs automatically.
    if(status===429&&body?.code==='UPLOAD_BUSY'&&body?.retryable===true&&body?.uploadCommitted===false&&retries<2){
     retries++;options.onProgress?.({loaded:0,total:bytes,percent:0,processing:false,retryAttempt:retries});
     const seconds=Number(current.getResponseHeader?.('Retry-After'));retryTimer=setTimeout(send,Math.min(10000,Math.max(1000,Number.isFinite(seconds)?seconds*1000:1000)));return;
    }
    settled=true;cleanup();resolve({ok:status>=200&&status<300,status,json:async()=>JSON.parse(raw)});
   };
   xhr.onerror=()=>fail(new Error('Upload connection failed. The final storage status is unknown; check your upload list before retrying.'));
   xhr.ontimeout=()=>fail(new Error('The upload connection timed out. Check the upload list before retrying.'));
   xhr.onabort=()=>fail(new DOMException('Upload cancelled.','AbortError'));
   arm();try{xhr.send(options.body);}catch(error){fail(error instanceof Error?error:new Error('The upload could not start.'));}
  };
  options.signal.addEventListener('abort',abort,{once:true});send();
 });
}
