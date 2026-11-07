import net from 'node:net';
import fs from 'node:fs';
import {uploadScanConfiguration} from '../utils/uploadScanConfig.js';
import {scanCloudmersiveFile} from './uploadScanCloudmersive.js';
import {localhostUploadRequest} from '../utils/localUploadMode.js';
/** Provider dispatch. Explicit HTTPS scanning never falls back to an unscanned upload.
 * Legacy private-network ClamAV INSTREAM remains supported without changing its protocol. */
export async function scanFile(filePath,{signal,mime,adminMedia=false,request}={}){
 if(signal?.aborted)throw Object.assign(new Error('Upload cancelled.'),{name:'AbortError',status:499});
 const config=uploadScanConfiguration(process.env);
 if(config.localUnscanned){
  if(!localhostUploadRequest(request))throw Object.assign(new Error('Unscanned development uploads require a direct localhost request. Public and hosted requests require a configured malware scanner. No file was saved.'),{status:503,code:'UPLOAD_SCAN_CONFIGURATION'});
  return {status:'not-scanned-development'};
 }
 if(config.errors.length)throw Object.assign(new Error('Upload scanner configuration is invalid. Ask the administrator to review UPLOAD_SCAN_PROVIDER and the selected scanner settings. No file was saved.'),{status:503,code:'UPLOAD_SCAN_CONFIGURATION'});
 if(config.provider==='cloudmersive')return scanCloudmersiveFile(filePath,{signal,mime,ignoreConfiguredSizeHint:adminMedia&&Number(process.env.ADMIN_MEDIA_MAX_UPLOAD_MB||0)===0});
 const host=process.env.CLAMAV_HOST,required=config.required;
 if(!host){if(required)throw Object.assign(new Error('Uploads require a malware scanner. Ask the server administrator to configure CLAMAV_HOST or the selected scanner provider. No file was saved.'),{status:503,code:'UPLOAD_SCAN_CONFIGURATION'});return {status:'not-scanned-development'};}
 const port=Number(process.env.CLAMAV_PORT||3310),timeout=config.timeout;
 if(!Number.isInteger(port)||port<1||port>65535)throw Object.assign(new Error('The ClamAV port configuration is invalid. No file was saved.'),{status:503,code:'UPLOAD_SCAN_CONFIGURATION'});
 return new Promise((resolve,reject)=>{
  const socket=net.createConnection({host,port});let source,settled=false,reply='';
  const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);source?.destroy();socket.destroy();error?reject(error):resolve(result);};
  const unavailable=()=>Object.assign(new Error('The configured ClamAV scanner could not be reached or did not complete the scan. Ask the server administrator to check its service, host and port. No file was saved.'),{status:503,code:'UPLOAD_SCAN_UNAVAILABLE'});
  const onAbort=()=>finish(Object.assign(new Error('Upload cancelled.'),{name:'AbortError',status:499}));
  const timer=setTimeout(()=>finish(unavailable()),Math.min(Math.max(timeout,5000),300000));
  signal?.addEventListener('abort',onAbort,{once:true});
  if(signal?.aborted){onAbort();return;}
  socket.on('error',()=>finish(unavailable()));
  socket.on('end',()=>{if(!settled)finish(unavailable());});
  socket.on('data',data=>{
   reply+=data.toString('utf8');if(reply.length>4096)return finish(unavailable());
   if(!reply.includes('\0')&&!reply.includes('\n'))return;
   if(/:\s*OK\s*\0?$/.test(reply.trim()))return finish(null,{status:'clean',engine:'clamav',scannedAt:new Date()});
   if(/INSTREAM[^\r\n]*limit|(?:size|scan) limit exceeded|Heuristics\.Limits\.Exceeded/i.test(reply))return finish(Object.assign(new Error('The configured ClamAV service cannot scan this complete file within its current allowance. Configure scanner capacity for this original; it was not saved and scanning was not skipped.'),{status:413,code:'UPLOAD_SCAN_SIZE'}));
   if(/ FOUND/.test(reply))return finish(Object.assign(new Error('Upload rejected by the malware scanner.'),{status:400}));
   finish(unavailable());
  });
  socket.on('connect',()=>{
   socket.write('zINSTREAM\0');source=fs.createReadStream(filePath,{highWaterMark:65536});
   source.on('error',()=>finish(unavailable()));
   source.on('data',chunk=>{const size=Buffer.alloc(4);size.writeUInt32BE(chunk.length);socket.write(size);if(!socket.write(chunk))source.pause();});
   socket.on('drain',()=>source?.resume());source.on('end',()=>socket.write(Buffer.alloc(4)));
  });
 });
}
