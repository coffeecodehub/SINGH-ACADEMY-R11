import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {proxyApi} from '../lib/server/apiProxy.mjs';import {verifyProxyIdentity} from '../../backend/src/utils/proxyIdentity.js';
const secret='SYNTHETIC-Network-Attribution-Key-0123456789-ABCxyz';
const env={NODE_ENV:'production',API_PROXY_TARGET:'https://backend.example.test',SA_PROXY_SHARED_SECRET:secret,SA_PROXY_CLIENT_IP_HEADER:'x-fixture-edge-ip',SA_PROXY_CLIENT_IP_VERIFIED:'true',SA_REQUIRE_PROXY_IDENTITY:'true'};
function request(ip='198.51.100.20',extra={}){return new Request('https://academy.example.test/api/auth/login?x=1',{method:'POST',headers:{origin:'https://academy.example.test','content-type':'application/json','x-sa-portal':'student',cookie:'sa_student_v45=synthetic','x-fixture-edge-ip':ip,...extra},body:'{"fixture":true}'});}
for(const ip of ['198.51.100.20','2001:db8::2'])test('actual proxy signs verified edge IP, preserves origin/cookie, strips supplied proof and arbitrary forwarding '+ip,async()=>{
 let got;const response=await proxyApi(request(ip,{'x-forwarded-for':'203.0.113.99','x-sa-network':'attacker','x-sa-network-signature':'0'.repeat(64)}),{env,fetcher:async(url,options)=>{got={url,options};return Response.json({ok:true});}});
 assert.equal(response.status,200);assert.equal(got.url,'https://backend.example.test/api/auth/login?x=1');const h=got.options.headers;
 assert.equal(h.get('x-forwarded-for'),null);assert.notEqual(h.get('x-sa-network'),'attacker');
 assert.equal(verifyProxyIdentity(h.get('x-sa-network'),h.get('x-sa-network-signature'),{method:'POST',path:'/api/auth/login?x=1',origin:h.get('origin'),portal:'student',cookie:h.get('cookie')},secret),ip);
 assert.equal(await new Response(got.options.body).text(),'{"fixture":true}');
});
for(const [name,override]of [['missing verification',{SA_PROXY_CLIENT_IP_VERIFIED:'false'}],['missing secret',{SA_PROXY_SHARED_SECRET:''}],['no explicit edge header',{SA_PROXY_CLIENT_IP_HEADER:''}],['invalid header',{SA_PROXY_CLIENT_IP_HEADER:'X-Whatever'}]])test('unsafe proxy configuration fails closed: '+name,async()=>{const response=await proxyApi(request(),{env:{...env,...override},fetcher(){assert.fail('must not forward');}});assert.equal(response.status,503);});
for(const ip of ['198.51.100.20, 127.0.0.1','unknown','198.51.100.20:80',''])test('ambiguous edge value is rejected, no guessed client identity '+ip,async()=>{assert.equal((await proxyApi(request(ip),{env,fetcher(){assert.fail('must not forward');}})).status,503);});
test('frontend and backend signed network protocol are byte-identical',()=>assert.deepEqual(fs.readFileSync(new URL('../lib/server/proxyIdentity.mjs',import.meta.url)),fs.readFileSync(new URL('../../backend/src/utils/proxyIdentity.js',import.meta.url))));
test('no proxy secret is exposed with NEXT_PUBLIC configuration or forwarded to browser',async()=>{const r=await proxyApi(request(),{env,fetcher:async()=>Response.json({success:true})});assert.equal(r.headers.get('x-sa-network'),null);assert.equal(r.headers.get('x-sa-network-signature'),null);assert.ok(!(await r.text()).includes(secret));});
