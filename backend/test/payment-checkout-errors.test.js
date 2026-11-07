/** Synthetic error/configuration contracts. No merchant requests or database. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentProviderError} from '../src/utils/paymentProviderErrors.js';
import {gatewayConfiguration,paypalClientSecret} from '../src/utils/commerce.js';
import {redactPaymentMessage} from '../src/utils/paymentWebhookPolicy.js';
import {runPaymentChecks} from '../src/services/paymentReadiness.js';
import crypto from 'node:crypto';
import {load} from './testLoader.js';
import * as business from '../src/utils/business.js';
import {paymentEnvironment} from '../src/utils/commerce.js';

for(const [type,status,code]of [
 ['StripeAuthenticationError',503,'PAYMENT_PROVIDER_CONFIGURATION'],
 ['StripePermissionError',503,'PAYMENT_PROVIDER_CONFIGURATION'],
 ['StripeRateLimitError',503,'PAYMENT_PROVIDER_UNAVAILABLE'],
 ['StripeConnectionError',503,'PAYMENT_PROVIDER_UNAVAILABLE'],
 ['StripeAPIError',503,'PAYMENT_PROVIDER_UNAVAILABLE'],
 ['StripeInvalidRequestError',502,'PAYMENT_PROVIDER_REJECTED'],
 ['StripeIdempotencyError',502,'PAYMENT_PROVIDER_REJECTED']
])test(type+' becomes a bounded safe checkout failure',()=>{
 const original=Object.assign(new Error('PRIVATE provider response with merchant/customer details'),{type,statusCode:400,code:'parameter_invalid_integer',param:'line_items[0][price_data][unit_amount]',requestId:'req_SYNTHETIC_R9',raw:{private:'DO NOT LOG'},headers:{Authorization:'PRIVATE'}});
 const normalized=paymentProviderError(original);
 assert.equal(normalized.status,status);assert.equal(normalized.code,code);
 assert.equal(normalized.paymentProvider,'stripe');assert.equal(normalized.providerRequestId,'req_SYNTHETIC_R9');assert.equal(normalized.providerCode,'parameter_invalid_integer');
 assert.equal(normalized.providerParam,'line_items[0][price_data][unit_amount]');
 assert.equal(normalized.providerStatus,400);assert.equal(normalized.raw,undefined);assert.equal(normalized.headers,undefined);
 assert.equal(normalized.message.includes('PRIVATE'),false);assert.equal(JSON.stringify(normalized).includes('PRIVATE'),false);assert.equal(original.status,undefined);
});
test('transport failure warns about checking the same order and never asks for a new payment',()=>{
 const error=paymentProviderError({type:'StripeConnectionError',message:'socket closed'});
 assert.match(error.message,/same order/);assert.equal(error.status,503);
});
test('unrelated validation and business errors are left to the original handler',()=>{
 for(const error of [new Error('unrelated'),{status:409,message:'Price changed'},{name:'ValidationError'},{code:11000}])assert.equal(paymentProviderError(error),null);
});
test('PayPal diagnostics retain only safe issue/status/debug identifiers',()=>{
 const error=paymentProviderError({providerStatus:422,providerCode:'UNPROCESSABLE_ENTITY',providerIssue:'CURRENCY_NOT_SUPPORTED',providerDebugId:'DEBUG_SYNTHETIC_R9',message:'PRIVATE BODY'});
 assert.equal(error.status,502);assert.equal(error.paymentProvider,'paypal');assert.equal(error.providerIssue,'CURRENCY_NOT_SUPPORTED');assert.equal(error.providerRequestId,'DEBUG_SYNTHETIC_R9');assert.equal(error.message.includes('PRIVATE'),false);
 assert.equal(paymentProviderError({paymentProvider:'paypal',name:'TimeoutError'}).status,503);
 assert.equal(paymentProviderError({providerStatus:401,providerCode:'invalid_client'}).code,'PAYMENT_PROVIDER_CONFIGURATION');
});
test('malformed or credential-bearing provider diagnostics are never logged',()=>{
 const saved=process.env.PAYPAL_SECRET;process.env.PAYPAL_SECRET='SyntheticAliasSecretOnly';
 try{
  const error=paymentProviderError({type:'StripeInvalidRequestError',statusCode:99999,code:'sk_live_SyntheticSecretOnly',requestId:'SyntheticAliasSecretOnly',providerIssue:'<script>alert(1)</script>'});
  assert.equal(error.providerStatus,undefined);assert.equal(error.providerCode,undefined);assert.equal(error.providerRequestId,undefined);assert.equal(error.providerIssue,undefined);
  assert.equal(redactPaymentMessage('SyntheticAliasSecretOnly',process.env),'[redacted]');
 }finally{if(saved===undefined)delete process.env.PAYPAL_SECRET;else process.env.PAYPAL_SECRET=saved;}
});
const configuration=()=>({ONLINE_PAYMENTS_ENABLED:'true',PAYPAL_MODE:'live',PAYPAL_CLIENT_ID:'SyntheticClientOnly',PAYPAL_WEBHOOK_ID:'SyntheticWebhookOnly'});
test('both PayPal secret names use the same gateway configuration; conflicts fail closed',()=>{
 const base=configuration(),secret='SyntheticSecretOnly';
 assert.equal(paypalClientSecret({...base,PAYPAL_SECRET:secret}),secret);
 assert.equal(gatewayConfiguration({...base,PAYPAL_SECRET:secret}).paypal.enabled,true);
 assert.equal(gatewayConfiguration({...base,PAYPAL_CLIENT_SECRET:secret}).paypal.enabled,true);
 assert.equal(gatewayConfiguration({...base,PAYPAL_CLIENT_SECRET:secret,PAYPAL_SECRET:secret}).paypal.enabled,true);
 assert.equal(gatewayConfiguration({...base,PAYPAL_CLIENT_SECRET:secret,PAYPAL_SECRET:'DifferentSyntheticSecret'}).paypal.enabled,false);
 for(const mode of ['', 'production', 'LIVE'])assert.equal(gatewayConfiguration({...base,PAYPAL_MODE:mode,PAYPAL_SECRET:secret}).paypal.enabled,false);
});
test('readiness checker recognizes PAYPAL_SECRET without writing the supplied environment',async()=>{
 const env={...configuration(),ONLINE_PAYMENTS_ENABLED:'false',STRIPE_SECRET_KEY:'sk_live_SyntheticR9',STRIPE_WEBHOOK_SECRET:'whsec_SyntheticR9',PAYPAL_SECRET:'SyntheticAliasOnly',FRONTEND_URL:'https://singhacademy.com'};
 const before=structuredClone(env),messages=[],logger={log:x=>messages.push(x),error:x=>messages.push(x),warn:x=>messages.push(x)};
 const report=await runPaymentChecks({env,allowDisabled:true,logger});
 assert.ok(report.checks.some(x=>x.status==='PASS'&&x.message==='paypal: local configuration complete (live).'));
 assert.deepEqual(env,before);assert.equal(messages.join('').includes(env.PAYPAL_SECRET),false);
});
test('PayPal runtime OAuth and saved credential fingerprint resolve the same alias',async()=>{
 const env={...configuration(),PAYPAL_SECRET:'SyntheticAliasOnly'},calls=[];
 const provider=load('../src/services/paymentProviders.js',{crypto,...business,paypalClientSecret,paymentEnvironment:provider=>paymentEnvironment(provider,env),process:{env},fetch:async(url,options)=>{calls.push({url,options});return url.endsWith('/token')?Response.json({access_token:'SyntheticBearerOnly',expires_in:3600}):Response.json({id:'SyntheticOrderOnly'});}},'({paypalApi,providerCredentialFingerprint})');
 const fingerprint=provider.providerCredentialFingerprint('paypal');
 assert.equal((await provider.paypalApi('/v2/checkout/orders/SyntheticOrderOnly')).id,'SyntheticOrderOnly');
 assert.equal(calls[0].url,'https://api-m.paypal.com/v1/oauth2/token');assert.equal(calls[0].options.headers.Authorization,'Basic '+Buffer.from(env.PAYPAL_CLIENT_ID+':'+env.PAYPAL_SECRET).toString('base64'));
 env.PAYPAL_CLIENT_SECRET=env.PAYPAL_SECRET;delete env.PAYPAL_SECRET;assert.equal(provider.providerCredentialFingerprint('paypal'),fingerprint);
 env.PAYPAL_SECRET='ConflictingSyntheticOnly';const before=calls.length;
 assert.throws(()=>provider.providerCredentialFingerprint('paypal'),{status:503});await assert.rejects(()=>provider.paypalApi('/v2/checkout/orders/SyntheticOrderOnly'),{status:503});assert.equal(calls.length,before);
});
test('PayPal OAuth transport error carries provider context without leaking its raw message',async()=>{
 const env={...configuration(),PAYPAL_SECRET:'SyntheticAliasOnly'};
 const provider=load('../src/services/paymentProviders.js',{crypto,...business,paypalClientSecret,process:{env},fetch:async()=>{throw new TypeError('PRIVATE socket error');}},'({paypalApi})');
 await assert.rejects(()=>provider.paypalApi('/v2/checkout/orders/SyntheticOrderOnly'),error=>{
  assert.equal(error.paymentProvider,'paypal');const safe=paymentProviderError(error);assert.equal(safe.status,503);assert.equal(safe.message.includes('PRIVATE'),false);assert.match(safe.message,/same order/);return true;
 });
});
