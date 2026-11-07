import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule} from './compile.mjs';

function fixture(mode){
 class NextResponse extends Response{
  static next(options){const response=new NextResponse(null);response.forwarded=options.request.headers;return response;}
 }
 return compileModule('../middleware.ts',{
  imports:{'next/server':{NextResponse},'./lib/server/pageSession':{SNAPSHOT_HEADER:'x-sa-verified-page-session',pageSession:async()=>({})}},
  globals:{process:{env:{NODE_ENV:mode,NEXT_PUBLIC_API_URL:'/api'}},btoa}
 }).middleware;
}
const request=()=>new Request('http://localhost:3000/terms',{headers:{'x-nonce':'browser-injected-nonce','content-security-policy':"script-src 'unsafe-inline'"}});
const directive=(value,name)=>value.split(';').map(part=>part.trim()).find(part=>part.startsWith(name+' ')).split(/\s+/).slice(1);
for(const mode of ['development','production'])test(mode+' CSP sends the same fresh nonce to Next and the browser',async()=>{
 const middleware=fixture(mode),first=await middleware(request()),second=await middleware(request());
 const nonce=first.forwarded.get('x-nonce'),csp=first.headers.get('content-security-policy');
 assert.match(nonce,/^[A-Za-z0-9+/_-]+={0,2}$/);
 assert.notEqual(nonce,'browser-injected-nonce');assert.notEqual(nonce,second.forwarded.get('x-nonce'));
 assert.equal(first.forwarded.get('content-security-policy'),csp);
 assert.ok(directive(csp,'script-src').includes("'nonce-"+nonce+"'"));
 assert.ok(!directive(csp,'script-src').includes("'unsafe-inline'"));
 assert.deepEqual(directive(csp,'object-src'),["'none'"]);
 assert.deepEqual(directive(csp,'frame-ancestors'),["'none'"]);
 assert.match(first.headers.get('cache-control'),/no-store/);
});
test('development CSP permits the same-origin Next lazy loader and HMR without strict-dynamic',async()=>{
 const response=await fixture('development')(request()),scripts=directive(response.headers.get('content-security-policy'),'script-src');
 assert.ok(scripts.includes("'self'"));assert.ok(scripts.includes("'unsafe-eval'"));assert.ok(!scripts.includes("'strict-dynamic'"));
 assert.equal(response.headers.get('strict-transport-security'),null);
});
test('production CSP retains nonce strict-dynamic trust and excludes development eval permissions',async()=>{
 const response=await fixture('production')(request()),csp=response.headers.get('content-security-policy'),scripts=directive(csp,'script-src');
 assert.ok(scripts.includes("'strict-dynamic'"));assert.ok(!scripts.includes("'unsafe-eval'"));assert.ok(!scripts.includes('*'));
 assert.match(csp,/upgrade-insecure-requests/);assert.equal(response.headers.get('strict-transport-security'),'max-age=31536000');
});
