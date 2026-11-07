import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';
function fixture(){
 const requests=[],progress=[],timers=new Map();let counter=0;
 class XHR{upload={};status=201;responseText='{"success":true}';constructor(){requests.push(this);}open(){}setRequestHeader(){}send(){}abort(){this.onabort?.();}getResponseHeader(){return '1';}}
 const {adminUpload}=compileModule('../lib/adminUpload.ts',{globals:{XMLHttpRequest:XHR,setTimeout:(fn,ms)=>{timers.set(++counter,{fn,ms});return counter;},clearTimeout:id=>timers.delete(id)}}),controller=new AbortController(),body=new FormData();body.append('file',new Blob(['bytes']),'review.webm');
 const promise=adminUpload('/api/admin/video-reviews/upload',{body,headers:new Headers(),signal:controller.signal,onProgress:value=>progress.push(value)});
 return {requests,progress,timers,controller,promise,run(ms){for(const[id,timer]of [...timers])if(timer.ms===ms){timers.delete(id);timer.fn();}}};
}
test('stalled transfer terminates once and no response ambiguity is retried',async()=>{const f=fixture();f.run(90000);await assert.rejects(f.promise,/90 seconds/);assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);});
test('post-transfer verification watchdog terminates with unknown status instead of staying disabled forever',async()=>{const f=fixture();f.requests[0].upload.onload();assert.equal(f.timers.size,1);f.run(390000);await assert.rejects(f.promise,/final status is unknown/);assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);});
test('only explicit pre-storage busy rejection retries, at most twice, retaining headers/body and real progress',async()=>{
 const f=fixture();for(let attempt=0;attempt<2;attempt++){const xhr=f.requests.at(-1);xhr.status=429;xhr.responseText='{"code":"UPLOAD_BUSY","retryable":true,"uploadCommitted":false}';xhr.onload();assert.equal(f.progress.at(-1).retryAttempt,attempt+1);f.run(1000);}
 assert.equal(f.requests.length,3);f.requests[2].onload();assert.equal((await f.promise).status,201);assert.equal(f.timers.size,0);
});
test('generic busy/error statuses and unsafe retry markers are never repeated',async()=>{
 for(const [status,body]of [[429,{}],[503,{code:'UPLOAD_BUSY',retryable:true,uploadCommitted:false}],[429,{code:'UPLOAD_BUSY',retryable:true,uploadCommitted:true}],[503,{code:'UPLOAD_SCAN_BUSY'}]]){const f=fixture();f.requests[0].status=status;f.requests[0].responseText=JSON.stringify(body);f.requests[0].onload();assert.equal((await f.promise).status,status);assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);}
});
test('cancel during admission backoff prevents a later repeated POST',async()=>{const f=fixture();f.requests[0].status=429;f.requests[0].responseText='{"code":"UPLOAD_BUSY","retryable":true,"uploadCommitted":false}';f.requests[0].onload();f.controller.abort();await assert.rejects(f.promise,{name:'AbortError'});f.run(1000);assert.equal(f.requests.length,1);assert.equal(f.timers.size,0);});
