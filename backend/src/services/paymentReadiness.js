import {gatewayConfiguration} from '../utils/commerce.js';
import {checkEnvironment} from '../utils/deployment.js';
import {getStripe,paypalApi} from './paymentProviders.js';
import {stripeEvents,paypalEvents,paypalAliases,missingEvents,paymentOrigin,webhookUrl,paypalRepairPlan,paypalEventEntries,samePayPalWebhook,redactPaymentMessage} from '../utils/paymentWebhookPolicy.js';

/** Configuration/provider registration audit only. Never imports the server,
 * opens MongoDB, creates a checkout, captures a payment, or issues a refund.
 * The sole optional write is a consented PATCH of an existing PayPal webhook's
 * event list; the URL, ID, credentials, other hooks and existing events are retained.
 */
export async function runPaymentChecks({env=process.env,remote=false,strict=false,allowDisabled=false,expectLive=false,repairPayPalWebhook=false,stripeFactory=getStripe,paypalRequest=paypalApi,logger=console}={}){
 const report={startedAt:new Date().toISOString(),status:'running',scope:'configuration_and_provider_registration',livePaymentsActivated:false,signedWebhookDeliveryVerified:false,serverCredentialMatchVerified:false,merchantIdAccountMatchVerified:false,checks:[],paypalUpdated:false,paypalRepairAvailable:false,paypalMissingEvents:[],paypalUnavailableEvents:[],readOnly:true};
 const add=(status,message)=>{const safe=redactPaymentMessage(message,env);report.checks.push({status,message:safe});(status==='FAIL'?logger.error:status==='WARN'?logger.warn:logger.log).call(logger,status+' '+safe);};
 const fail=m=>add('FAIL',m),warn=m=>add('WARN',m),pass=m=>add('PASS',m),strictIssue=m=>(strict?fail:warn)(m);
 const candidate={...env,ONLINE_PAYMENTS_ENABLED:allowDisabled?'true':env.ONLINE_PAYMENTS_ENABLED};
 const config=gatewayConfiguration(candidate);
 logger.log(`Payment configuration check (${env.NODE_ENV||'development'} / ${env.DEPLOYMENT_STAGE||'development'}). Secret values are never printed.`);
 if(env.ONLINE_PAYMENTS_ENABLED!=='true'){
  if(allowDisabled)warn('Checkout is OFF. Auditing configured credentials without changing the server or enabling checkout.');
  else fail('ONLINE_PAYMENTS_ENABLED is not true. Use --allow-disabled for a readiness-only audit; do not enable checkout just to run this check.');
 }
 for(const provider of ['stripe','paypal']){
  if(config[provider].enabled)pass(`${provider}: local configuration complete (${config[provider].environment}).`);
  else fail(`${provider}: configuration incomplete.`);
 }
 if(env.PAYMENTS_REQUIRE_BOTH!=='true')warn('PAYMENTS_REQUIRE_BOTH is not true. Partial provider configuration is allowed by the server.');
 if(expectLive){
  if(env.NODE_ENV!=='production'||env.DEPLOYMENT_STAGE!=='production')fail('--live requires NODE_ENV=production and DEPLOYMENT_STAGE=production in THIS checker process.');
  for(const provider of ['stripe','paypal'])if(config[provider].environment!=='live')fail(`${provider}: --live refuses test/sandbox credentials.`);
 }
 const envCheck=checkEnvironment(candidate);
 for(const e of envCheck.errors.filter(x=>/payment|checkout|stripe|paypal|DEPLOYMENT_STAGE|NODE_ENV|FRONTEND_URL/i.test(x)))fail(e);
 for(const w of envCheck.warnings.filter(x=>/payment|checkout|api/i.test(x)))warn(w);
 const base=paymentOrigin(env.PAYMENT_WEBHOOK_BASE_URL||'');
 if(remote&&!base)fail('An explicit valid PAYMENT_WEBHOOK_BASE_URL origin is required for remote verification.');
 if((expectLive||env.NODE_ENV==='production')&&base&&!base.startsWith('https://'))fail('Live webhook base URL must use HTTPS.');
 if(repairPayPalWebhook&&(!remote||!strict))fail('PayPal webhook repair requires --remote and --strict-webhooks.');
 if(remote&&env!==process.env&&(stripeFactory===getStripe||paypalRequest===paypalApi))fail('A separately supplied environment requires explicitly injected provider clients; refusing to authenticate different process credentials.');
 const locallyValid=!report.checks.some(x=>x.status==='FAIL');
 if(remote&&locallyValid){
  if(config.stripe.enabled)try{
   const stripe=await stripeFactory();const account=await stripe.accounts.retrieve();
   if(!account||typeof account.id!=='string')throw new Error('Stripe account response is invalid.');
   pass(`stripe: API credentials authenticated (${config.stripe.environment}).`);
   if(config.stripe.environment==='live'){
    if(account.charges_enabled===true)pass('stripe: account reports charges_enabled=true.');
    else fail('stripe: live account has not confirmed charges_enabled=true. Complete account activation in Stripe.');
    if(account.payouts_enabled===false)warn('stripe: payouts are not enabled; the account owner must review Stripe requirements.');
   }
   const url=webhookUrl(env,'stripe');let cursor,found=[],complete=false;
   for(let page=0;page<10;page++){
    const result=await stripe.webhookEndpoints.list({limit:100,...(cursor?{starting_after:cursor}:{})});
    if(!Array.isArray(result?.data))throw new Error('Stripe endpoint list could not be read.');
    found.push(...result.data.filter(x=>x.url===url&&x.status==='enabled'&&x.livemode===(config.stripe.environment==='live')));
    if(!result.has_more){complete=true;break;}
    cursor=result.data.at(-1)?.id;if(!cursor)throw new Error('Stripe endpoint pagination is incomplete.');
   }
   if(!complete)strictIssue('stripe: endpoint pagination cap reached. Verification is incomplete, not proof that the endpoint is absent.');
   if(!found.length)strictIssue(`stripe: no matching enabled ${config.stripe.environment} webhook endpoint at ${url}.`);
   else{
    if(found.length>1)warn('stripe: multiple enabled endpoints share this URL. Ensure the deployed signing secret belongs to the intended destination.');
    const good=found.find(x=>missingEvents(x.enabled_events,stripeEvents).length===0);
    if(good)pass(`stripe: webhook URL, environment and all ${stripeEvents.length} required event subscriptions match.`);
    else strictIssue('stripe: webhook is missing required events: '+missingEvents(found[0].enabled_events,stripeEvents).join(', '));
    warn('stripe: listing a webhook cannot validate its signing secret. Actual signed delivery to the deployed backend remains required.');
   }
  }catch(error){fail('stripe remote verification failed: '+(error?.message||'provider error'));}

  if(config.paypal.enabled)try{
   const path='/v1/notifications/webhooks/'+encodeURIComponent(env.PAYPAL_WEBHOOK_ID);
   let hook=await paypalRequest(path);
   if(hook?.id!==env.PAYPAL_WEBHOOK_ID)throw new Error('Configured PayPal webhook ID does not match the app response.');
   pass(`paypal: API credentials authenticated and configured Webhook ID found (${config.paypal.environment}).`);
   const url=webhookUrl(env,'paypal');
   if(hook.url!==url)strictIssue(`paypal: configured webhook URL differs from expected ${url}. No automatic URL change will be made.`);
   else{
    pass('paypal: configured webhook ID points to the expected backend URL.');
    let missing=missingEvents(paypalEventEntries(hook.event_types).map(x=>x.name),paypalEvents,paypalAliases);
    if(missing.length){
     let plan=null;
     try{
      const catalog=await paypalRequest('/v1/notifications/webhooks-event-types');plan=paypalRepairPlan(hook,catalog);report.paypalMissingEvents=plan.missing;report.paypalUnavailableEvents=plan.unavailable;report.paypalRepairAvailable=plan.added.length>0;
      if(plan.unavailable.length)warn('paypal: official API event catalog did not advertise: '+plan.unavailable.join(', ')+'. It remains in the documented project policy. An explicitly authorized API request may succeed or be rejected; only read-back can confirm subscription.');
      if(plan.added.length)warn('paypal: documented missing subscriptions to request with explicit repair consent: '+plan.added.join(', '));
     }catch(error){warn('paypal: could not inspect event catalog: '+(error?.message||'provider error'));}
     if(repairPayPalWebhook&&plan&&plan.added.length){
      const fresh=await paypalRequest(path);
      if(!samePayPalWebhook(hook,fresh))throw new Error('PayPal webhook changed during verification. No PATCH sent; rerun to avoid overwriting another operator.');
      report.readOnly=false;
      await paypalRequest(path,{method:'PATCH',body:[{op:'replace',path:'/event_types',value:plan.events}]});
      const updated=await paypalRequest(path);
      if(updated?.id!==hook.id||updated?.url!==hook.url)throw new Error('PayPal webhook identity changed after update; verification failed.');
      const previous=new Set(paypalEventEntries(updated.event_types).map(x=>JSON.stringify(x)));
      if(paypalEventEntries(hook.event_types).some(x=>!previous.has(JSON.stringify(x))))throw new Error('PayPal update did not retain every original event. Review the provider settings.');
      hook=updated;missing=missingEvents(paypalEventEntries(hook.event_types).map(x=>x.name),paypalEvents,paypalAliases);
      report.paypalUpdated=true;pass('paypal: existing webhook event subscriptions updated and re-read; URL and previous subscriptions preserved.');
     }
     if(missing.length)strictIssue('paypal: webhook is missing required events: '+missing.join(', ')+'. No readiness approval.');
    }
    if(!missing.length)pass(`paypal: all ${paypalEvents.length} required event subscriptions found (DENIED/DECLINED equivalence supported).`);
   }
   if(env.PAYPAL_MERCHANT_ID)warn('paypal: Merchant ID format is configured, but this app/webhook API does not prove that it belongs to the merchant. Order/capture payee checks remain required.');
   warn('paypal: registration is not signature delivery. Simulator mock events cannot pass this integration\'s PayPal postback verification.');
  }catch(error){
   const details=[error?.providerStatus,error?.providerCode,error?.providerIssue,error?.providerDebugId].filter(Boolean).join(' ');
   fail('paypal remote verification failed: '+(details?details+'. ':'')+(error?.message||'provider error'));
  }
 }
 report.status=report.checks.some(x=>x.status==='FAIL')?'failed':'passed';
 report.remoteRequested=remote;report.finishedAt=new Date().toISOString();
 logger.log(remote?`Payment configuration/provider registration ${report.status.toUpperCase()}. No order, capture or refund was created.`:'Config-only check finished. Add --remote to verify provider authentication and webhook registration.');
 logger.log('This result does not activate Hostinger, verify its saved credentials, or prove paid access/receipts.');
 return report;
}
