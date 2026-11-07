/** Contracts for test infrastructure, not live provider/backend verification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
 syntheticProviderIdentity,syntheticProviderDocument,matchingFixtureOrder,
 fulfillObservedJson,SYNTHETIC_PROVIDER_HEADING,FIXTURE_FRONTEND_ORIGIN,
} from '../ui-tests/helpers/fixtures.mjs';

const first='000000000000000000000001',last='000000000000000000000099';
const urls={
 stripe:'https://checkout.stripe.com/c/pay/sa-ui-'+first,
 paypal:'https://www.sandbox.paypal.com/checkoutnow?token=sa-ui-'+first,
};
for(const [provider,url] of Object.entries(urls)){
 test(`${provider} fixture identity is bound to its exact synthetic document`,()=>{
  assert.deepEqual(syntheticProviderIdentity(url),{provider,id:first});
 });
 test(`${provider} fixture declares UTF-8 in header and early metadata; exact Unicode remains`,()=>{
  const response=syntheticProviderDocument(url);
  assert.equal(response.status,200);
  assert.equal(response.contentType,'text/html; charset=utf-8');
  assert.match(response.body,/^<!doctype html><html lang="en"><head><meta charset="utf-8">/);
  assert.ok(Buffer.from(response.body,'utf8').includes(Buffer.from([0xe2,0x80,0x94])));
  assert.ok(response.body.includes(`<h1>${SYNTHETIC_PROVIDER_HEADING}</h1>`));
  assert.equal(response.headers['X-SA-UI-Fixture'],'synthetic-payment-provider');
  assert.equal(response.headers['Cache-Control'],'no-store');
 });
 test(`${provider} fixture return and cancellation bind the same exact order`,()=>{
  const {body}=syntheticProviderDocument(url);
  assert.ok(body.includes(`href="${FIXTURE_FRONTEND_ORIGIN}/checkout/return?order=${first}"`));
  assert.ok(body.includes(`href="${FIXTURE_FRONTEND_ORIGIN}/checkout/return?order=${first}&amp;cancelled=1"`));
  assert.ok(body.includes(`data-provider="${provider}"`));
  assert.doesNotMatch(body,/<script|<iframe|<form|src=/i);
 });
 test(`${provider} observed order is selected by ID/provider, never list position`,()=>{
  const old={_id:first,provider,kind:'course'};
  const newer={_id:last,provider,kind:'membership'};
  assert.equal(matchingFixtureOrder([old,newer],syntheticProviderIdentity(url)),old);
  assert.equal(matchingFixtureOrder([newer],syntheticProviderIdentity(url)),null);
  assert.equal(matchingFixtureOrder([{...old,provider:'wrong'}],syntheticProviderIdentity(url)),null);
 });
}
for(const invalid of [
 '', 'not a URL','http://checkout.stripe.com/c/pay/sa-ui-'+first,
 'https://checkout.stripe.com.evil.invalid/c/pay/sa-ui-'+first,
 'https://user:password@checkout.stripe.com/c/pay/sa-ui-'+first,
 'https://checkout.stripe.com:444/c/pay/sa-ui-'+first,
 'https://checkout.stripe.com/c/pay/REAL_SESSION_ID',
 urls.stripe+'?extra=true',urls.stripe+'#fragment',urls.stripe+'/more',
 'https://www.paypal.com/checkoutnow?token=sa-ui-'+first,
 'https://www.sandbox.paypal.com/checkoutnow?token=sa-ui-'+first+'&token=sa-ui-'+last,
 'https://www.sandbox.paypal.com/checkoutnow?token=sa-ui-'+first+'&extra=1',
 'https://www.sandbox.paypal.com/checkoutnow?token=not-synthetic',
 'https://www.sandbox.paypal.com/other?token=sa-ui-'+first,
 'javascript:alert(1)',
])test(`fixture refuses unrelated or malformed provider URL ${invalid}`,()=>{
 assert.equal(syntheticProviderIdentity(invalid),null);
 assert.equal(syntheticProviderDocument(invalid),null);
});
test('fixture order lookup tolerates empty and unfinished reads, without inventing an order',()=>{
 assert.equal(matchingFixtureOrder([],syntheticProviderIdentity(urls.stripe)),null);
 assert.equal(matchingFixtureOrder(undefined,syntheticProviderIdentity(urls.stripe)),null);
 assert.equal(matchingFixtureOrder([{_id:first,provider:'stripe'}],null),null);
});
test('logout evidence is buffered before browser delivery and survives immediate navigation',async()=>{
 const events=[];let delivered=false,disposed=false;
 const payload=Buffer.from(JSON.stringify({success:true,signedOut:true,portal:'student'}));
 const response={
  status:()=>200,
  body:async()=>{assert.equal(delivered,false,'cannot read discarded navigation response');events.push('read-body');return payload;},
  dispose:async()=>{disposed=true;events.push('dispose');},
 };
 const route={
  fetch:async options=>{assert.deepEqual(options,{maxRedirects:0});events.push('fetch');return response;},
  fulfill:async options=>{
   assert.equal(options.response,response,'retain upstream headers/cookies/status');
   assert.equal(options.body,payload,'forward the identical response bytes');
   events.push('deliver-and-navigate');delivered=true;
  },
 };
 const evidence=await fulfillObservedJson(route);
 assert.equal(evidence.status,200);assert.equal(evidence.body.signedOut,true);
 assert.equal(disposed,true);
 assert.deepEqual(events,['fetch','read-body','deliver-and-navigate','dispose']);
});
test('failed logout evidence remains failed, never normalized into a successful revocation',async()=>{
 let forwarded;
 const response={status:()=>503,body:async()=>Buffer.from('{"success":false,"message":"database unavailable"}'),dispose:async()=>{}};
 const result=await fulfillObservedJson({fetch:async()=>response,fulfill:async value=>{forwarded=value;}});
 assert.equal(result.status,503);assert.equal(result.body.success,false);
 assert.equal(result.body.signedOut,undefined);assert.equal(forwarded.response,response);
});
test('invalid logout JSON fails the observing test and always disposes its response',async()=>{
 let disposed=false,delivered=false;
 const response={status:()=>200,body:async()=>Buffer.from('{'),dispose:async()=>{disposed=true;}};
 await assert.rejects(fulfillObservedJson({fetch:async()=>response,fulfill:async()=>{delivered=true;}}),SyntaxError);
 assert.equal(disposed,true);assert.equal(delivered,false);
});
test('failure to deliver/logout evidence is not caught and reported as a pass',async()=>{
 let disposed=false;const failure=new Error('route delivery failed');
 const response={status:()=>200,body:async()=>Buffer.from('{"signedOut":true}'),dispose:async()=>{disposed=true;}};
 await assert.rejects(fulfillObservedJson({fetch:async()=>response,fulfill:async()=>{throw failure;}}),{message:failure.message});
 assert.equal(disposed,true);
});
