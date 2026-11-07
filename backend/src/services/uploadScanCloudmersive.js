/** Streaming Cloudmersive Virus Scan adapter. No SDK/new dependency; no public file URL.
 * The file is still in the existing private temporary directory. Only an explicit,
 * well-formed clean verdict permits the caller to decode/store it. Never retry a
 * metered POST or fall back to another scanner/unscanned storage automatically.
 */
import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {CLOUDMERSIVE_SCAN_URL,uploadScanConfiguration,usableScannerKey} from '../utils/uploadScanConfig.js';

const MAX_RESPONSE_BYTES=65536;
const extensions=Object.freeze({
  'image/jpeg':'.jpg','image/png':'.png','image/gif':'.gif','image/webp':'.webp',
  'video/mp4':'.mp4','video/webm':'.webm','video/quicktime':'.mov',
  'application/pdf':'.pdf','application/msword':'.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx',
  'text/plain':'.txt',
});
const failure=(status,code,message)=>Object.assign(new Error(message),{status,code});
const unavailable=()=>failure(503,'UPLOAD_SCAN_UNAVAILABLE','Upload security scan could not be completed. Try again later.');
const cancelled=()=>Object.assign(failure(499,'UPLOAD_CANCELLED','Upload cancelled.'),{name:'AbortError'});
function statusError(status) {
  if(status===401||status===403)return failure(503,'UPLOAD_SCAN_AUTH','The upload scanner credentials or plan need administrator attention.');
  if(status===429)return failure(503,'UPLOAD_SCAN_BUSY','The upload scanner is busy or its allowance has been reached. Retry later or contact the administrator.');
  if(status===413)return failure(413,'UPLOAD_SCAN_SIZE','The configured scanner cannot accept this file size. Configure a scanner/account that supports this original file (for example a suitable private ClamAV service). The original was not saved; scanning was not skipped.');
  return unavailable();
}
async function readVerdict(response) {
  if(response.statusCode!==200)throw statusError(response.statusCode);
  const type=String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase();
  if(!['application/json','text/json'].includes(type))throw unavailable();
  const length=response.headers['content-length'];
  if(length!==undefined&&(!/^\d+$/.test(String(length))||Number(length)>MAX_RESPONSE_BYTES))throw unavailable();
  const chunks=[];let bytes=0;
  for await(const chunk of response){bytes+=chunk.length;if(bytes>MAX_RESPONSE_BYTES)throw unavailable();chunks.push(chunk);}
  let verdict;
  try{verdict=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw unavailable();}
  if(!verdict||typeof verdict!=='object'||Array.isArray(verdict)||typeof verdict.CleanResult!=='boolean')throw unavailable();
  // The API represents no findings as [] or null. A missing/malformed field is NOT a clean scan.
  if(verdict.FoundViruses!==null&&!Array.isArray(verdict.FoundViruses))throw unavailable();
  if(verdict.CleanResult!==true||(Array.isArray(verdict.FoundViruses)&&verdict.FoundViruses.length>0)) {
    throw failure(400,'UPLOAD_INFECTED','Upload rejected by the malware scanner.');
  }
  // Do not silently ignore a provider's additional explicitly adverse verdict.
  for(const [name,value] of Object.entries(verdict))if(name.startsWith('Contains')){
    if(typeof value!=='boolean')throw unavailable();
    if(value)throw failure(400,'UPLOAD_INFECTED','Upload rejected by the malware scanner.');
  }
}

/** Dependency injection is for isolated transport tests only. Production always uses
 * node:https with its default certificate/hostname verification and the fixed URL.
 */
export function createCloudmersiveScanner(requestImpl=https.request) {
  return async function scan(filePath,{signal,mime,env=process.env,ignoreConfiguredSizeHint=false}={}) {
    if(signal?.aborted)throw cancelled();
    const config=uploadScanConfiguration(env);
    if(config.errors.length||!usableScannerKey(config.apiKey))throw failure(503,'UPLOAD_SCAN_CONFIGURATION','Upload scanner configuration is invalid. Ask the administrator to review the scanner settings.');
    const controller=new AbortController();let handle,source,body,request,response,sendTask;
    let timedOut=false;
    const onAbort=()=>controller.abort();
    signal?.addEventListener('abort',onAbort,{once:true});
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},config.timeout);
    try {
      if(signal?.aborted){controller.abort();throw cancelled();}
      handle=await fs.promises.open(filePath,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW||0));
      const stat=await handle.stat();
      if(!stat.isFile()||stat.size<=0)throw failure(400,'UPLOAD_INVALID_FILE','Empty or invalid files cannot be scanned.');
      if(!ignoreConfiguredSizeHint&&config.maxFileBytes>0&&stat.size>config.maxFileBytes)throw statusError(413);
      if(controller.signal.aborted)throw unavailable();
      const boundary='sa-'+crypto.randomBytes(24).toString('hex');
      const suffix=extensions[mime]||'.bin';
      // Never send original filename, user IDs, email, cookies, or database credentials.
      const prefix=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="inputFile"; filename="upload${suffix}"\r\nContent-Type: application/octet-stream\r\n\r\n`);
      const end=Buffer.from(`\r\n--${boundary}--\r\n`);
      const hash=crypto.createHash('sha256');let sentBytes=0;
      const gotResponse=new Promise((resolve,reject)=>{
        request=requestImpl(CLOUDMERSIVE_SCAN_URL,{
          method:'POST',signal:controller.signal,rejectUnauthorized:true,
          headers:{Apikey:config.apiKey,Accept:'application/json','Accept-Encoding':'identity',
            'Content-Type':'multipart/form-data; boundary='+boundary,
            'Content-Length':String(prefix.length+stat.size+end.length)},
        },incoming=>{response=incoming;resolve(incoming);});
        request.once('error',reject);
      });
      // A promise handler is attached before file I/O can fail, preventing unhandled rejections.
      gotResponse.catch(()=>{});
      source=handle.createReadStream({start:0,end:stat.size-1,autoClose:false,highWaterMark:65536});
      body=Readable.from((async function*(){
        yield prefix;
        for await(const chunk of source){sentBytes+=chunk.length;hash.update(chunk);yield chunk;}
        if(sentBytes!==stat.size)throw unavailable();
        const after=await handle.stat();
        if(after.size!==stat.size||after.mtimeMs!==stat.mtimeMs)throw unavailable();
        yield end;
      })());
      sendTask=pipeline(body,request,{signal:controller.signal}).then(()=>true,()=>false);
      await readVerdict(await gotResponse);
      if(!(await sendTask)||sentBytes!==stat.size||controller.signal.aborted)throw unavailable();
      return {status:'clean',engine:'cloudmersive',scannedAt:new Date(),sha256:hash.digest('hex')};
    } catch(error) {
      if(signal?.aborted)throw cancelled();
      if(timedOut)throw failure(503,'UPLOAD_SCAN_TIMEOUT','Upload security scan timed out. No file was saved. Retry later.');
      if(error?.code?.startsWith('UPLOAD_'))throw error;
      // Provider bodies and low-level error messages may contain credentials or file details.
      throw unavailable();
    } finally {
      clearTimeout(timer);signal?.removeEventListener('abort',onAbort);
      controller.abort();body?.destroy();source?.destroy();response?.destroy();request?.destroy();
      if(sendTask)await sendTask;
      await handle?.close().catch(()=>{});
    }
  };
}
export const scanCloudmersiveFile=createCloudmersiveScanner();
