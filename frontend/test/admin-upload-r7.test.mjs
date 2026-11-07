import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';
function fixture(){
 const requests=[],progress=[];class XHR{
  upload={};headers=[];status=201;responseText='{"success":true,"fileId":"original-id"}';
  constructor(){requests.push(this);}open(...args){this.opened=args;}setRequestHeader(...args){this.headers.push(args);}send(body){this.body=body;}abort(){this.onabort?.();}
 }
 const {adminUpload}=compileModule('../lib/adminUpload.ts',{globals:{XMLHttpRequest:XHR}}),controller=new AbortController(),body=new FormData();body.append('file',new Blob(['original']),'full.webm');
 const promise=adminUpload('/api/admin/video-reviews/upload',{body,headers:new Headers({'X-SA-CSRF':'1','X-SA-Portal':'client_admin'}),signal:controller.signal,onProgress:value=>progress.push(value)});
 return {requests,progress,controller,body,promise,xhr:requests[0]};
}
test('one original streams with credentials, security headers, no artificial timeout and true transfer/commit phases',async()=>{
 const f=fixture(),x=f.xhr;assert.deepEqual(Array.from(x.opened),['POST','/api/admin/video-reviews/upload']);assert.equal(x.withCredentials,true);assert.equal(x.timeout,0);assert.equal(x.body,f.body);assert.equal(x.headers.find(([k])=>k==='x-sa-csrf')?.[1],'1');assert.equal(x.headers.some(([k])=>k==='content-type'),false);
 x.upload.onprogress({lengthComputable:true,loaded:25,total:100});assert.equal(f.progress.at(-1).percent,25);assert.equal(f.progress.at(-1).processing,false);
 x.upload.onprogress({lengthComputable:true,loaded:100,total:100});assert.equal(f.progress.at(-1).processing,true);
 let committed=false;f.promise.then(()=>committed=true);await Promise.resolve();assert.equal(committed,false);x.onload();const response=await f.promise;assert.equal(response.status,201);assert.equal((await response.json()).fileId,'original-id');assert.equal(f.requests.length,1);
});
test('scanner413/503 exact diagnostic bodies survive transfer completion without retry',async()=>{
 for(const status of [413,503]){const f=fixture();f.xhr.status=status;f.xhr.responseText=JSON.stringify({success:false,code:'UPLOAD_SCAN_SIZE',requestId:'original-request'});f.xhr.upload.onload();f.xhr.onload();const r=await f.promise;assert.equal(r.ok,false);assert.equal(r.status,status);assert.equal((await r.json()).requestId,'original-request');assert.equal(f.requests.length,1);}
});
test('cancellation during transfer and storage rejects once and ignores later progress/response',async()=>{
 for(const processing of [false,true]){const f=fixture();if(processing)f.xhr.upload.onload();const before=f.progress.length;f.controller.abort();await assert.rejects(f.promise,{name:'AbortError'});f.xhr.upload.onprogress({lengthComputable:true,loaded:100,total:100});f.xhr.onload();assert.equal(f.progress.length,before);assert.equal(f.requests.length,1);}
});
test('already aborted selection never sends original bytes',async()=>{
 let sent=0;const mod=compileModule('../lib/adminUpload.ts',{globals:{XMLHttpRequest:class{constructor(){sent++;}}}}),c=new AbortController();c.abort();await assert.rejects(mod.adminUpload('/api/admin/upload',{body:new FormData(),headers:new Headers(),signal:c.signal}),{name:'AbortError'});assert.equal(sent,0);
});
test('network/timeout errors never retry and malformed server JSON never becomes success data',async()=>{
 for(const event of ['onerror','ontimeout']){const f=fixture();f.xhr[event]();await assert.rejects(f.promise,/Upload|upload/);assert.equal(f.requests.length,1);}
 const f=fixture();f.xhr.responseText='not json';f.xhr.onload();const r=await f.promise;await assert.rejects(r.json(),/JSON|Unexpected/);
});
