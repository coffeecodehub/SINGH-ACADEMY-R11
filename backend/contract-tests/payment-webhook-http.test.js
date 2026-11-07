/** Actual Express HTTP body parsing + actual Stripe HMAC verification.
 * PayPal's external postback server is a deterministic stub. No real payment/DB.
 */
import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import express,{Router} from 'express';
import {load} from '../test/testLoader.js';
import {getStripe,verifyStripeEvent,verifyPayPalEvent} from '../src/services/paymentProviders.js';
function request(port,path,body,headers={}){return new Promise((resolve,reject)=>{
 const r=http.request({host:'127.0.0.1',port,path,method:'POST',headers:{'content-type':'application/json',...headers}},res=>{let text='';res.setEncoding('utf8');res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,body:text}));});r.on('error',reject);r.end(body);
});}
async function server(){
 const applied=[];const router=load('../src/routes/gatewayWebhookRoutes.js',{express,Router,verifyStripeEvent,verifyPayPalEvent,applyGatewayEvent:async(provider,event)=>applied.push({provider,event}),rateLimit:()=> (req,res,next)=>next()},'r');
 const app=express();app.use('/api/payments/webhooks',router);app.use((error,req,res,next)=>res.status(error.status||500).json({message:error.message}));
 const srv=http.createServer(app);await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 return {applied,port:srv.address().port,close:()=>new Promise(resolve=>srv.close(resolve))};
}
test('actual Express/Stripe verifies a valid signed raw body and rejects tampering/unsigned payloads',async()=>{
 process.env.STRIPE_SECRET_KEY='sk_test_SyntheticSignatureOnly';process.env.STRIPE_WEBHOOK_SECRET='whsec_SyntheticSignatureOnly';
 const s=await server();try{
  const stripe=await getStripe(),body=JSON.stringify({id:'evt_SYNTHETIC_signature_only',type:'checkout.session.completed',livemode:false,data:{object:{id:'cs_SYNTHETIC'}}});
  const signature=stripe.webhooks.generateTestHeaderString({payload:body,secret:process.env.STRIPE_WEBHOOK_SECRET});
  assert.equal((await request(s.port,'/api/payments/webhooks/stripe',body,{'stripe-signature':signature})).status,200);assert.equal(s.applied.length,1);
  assert.equal((await request(s.port,'/api/payments/webhooks/stripe',body+' ',{'stripe-signature':signature})).status,400);
  assert.equal((await request(s.port,'/api/payments/webhooks/stripe',body)).status,400);assert.equal(s.applied.length,1);
 }finally{await s.close();}
});
test('actual Express PayPal route preserves webhook bytes for postback and rejects failed verification',async()=>{
 Object.assign(process.env,{PAYPAL_MODE:'sandbox',PAYPAL_CLIENT_ID:'SyntheticRawHttpClient',PAYPAL_CLIENT_SECRET:'SyntheticRawHttpSecret',PAYPAL_WEBHOOK_ID:'SyntheticRawHttpWebhook'});
 const original=global.fetch,raw=' {"id":"WH-SYNTHETIC-http", "event_type":"PAYMENT.CAPTURE.COMPLETED", "resource":{"amount":1.00}}\n';let posts=0,accept=true;
 global.fetch=async(url,options)=>{
  if(url==='https://api-m.sandbox.paypal.com/v1/oauth2/token')return {ok:true,status:200,text:async()=>JSON.stringify({access_token:'SyntheticTokenOnly',expires_in:3600})};
  assert.equal(url,'https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature');assert.ok(options.body.includes('"webhook_event":'+raw+'}'));posts++;
  return {ok:true,status:200,text:async()=>JSON.stringify({verification_status:accept?'SUCCESS':'FAILURE'})};
 };
 const s=await server(),headers={'paypal-auth-algo':'SHA256withRSA','paypal-cert-url':'https://api-m.sandbox.paypal.com/v1/notifications/certs/SYNTHETIC','paypal-transmission-id':'SYNTHETIC-tx','paypal-transmission-sig':'SyntheticSignature','paypal-transmission-time':'2026-10-16T00:00:00Z'};
 try{
  assert.equal((await request(s.port,'/api/payments/webhooks/paypal',raw,headers)).status,200);assert.equal(s.applied.length,1);
  accept=false;assert.equal((await request(s.port,'/api/payments/webhooks/paypal',raw,headers)).status,400);assert.equal(s.applied.length,1);
  assert.equal((await request(s.port,'/api/payments/webhooks/paypal','{}')).status,400);assert.equal(posts,2);
 }finally{global.fetch=original;await s.close();}
});
