import crypto from 'node:crypto';
import {businessError,toMinor} from '../utils/business.js';
import {frontendOrigin,moneyString,paymentEnvironment,paypalClientSecret,approvedRedirect} from '../utils/commerce.js';
let stripeClient,stripeKey;
export async function getStripe(){
 const key=process.env.STRIPE_SECRET_KEY;
 if(!key)throw businessError('Stripe is not configured.',503);
 if(!stripeClient||stripeKey!==key){const {default:Stripe}=await import('stripe');stripeClient=new Stripe(key,{maxNetworkRetries:1,timeout:10000});stripeKey=key;}
 return stripeClient;
}
/** Hash only; never expose API credentials in a response or a log. A changed
 * credential/account cannot reuse an old creation key as though it were local. */
export function providerCredentialFingerprint(provider){
 const secret=provider==='paypal'?paypalClientSecret(process.env):'';
 const credential=provider==='stripe'?process.env.STRIPE_SECRET_KEY:(process.env.PAYPAL_CLIENT_ID||'')+':'+secret+':'+(process.env.PAYPAL_MERCHANT_ID||'');
 if(!credential||(provider==='paypal'&&(!process.env.PAYPAL_CLIENT_ID||!secret)))throw businessError('Payment credentials are not configured.',503);
 return crypto.createHash('sha256').update('sa-provider-account-v1:'+provider+':'+paymentEnvironment(provider)+':'+credential).digest('hex');
}
export function stripeOrderBody(order,user){
 const root=frontendOrigin(),trialEnd=order.renewalSetup?Math.ceil(+new Date(order.billingStartsAt)/1000):null;
 if(order.renewalSetup&&(!order.autoRenew||order.discountMinor>0||!Number.isSafeInteger(trialEnd)))throw businessError('Invalid deferred renewal setup snapshot.',409);
 return {
  mode:order.autoRenew?'subscription':'payment',...(order.renewalSetup?{payment_method_collection:'always'}:{}),client_reference_id:String(order._id),customer_email:user.email,
  line_items:[{quantity:1,price_data:{currency:order.currency.toLowerCase(),unit_amount:order.autoRenew?order.renewalAmountMinor:order.amountMinor,...(order.autoRenew?{recurring:{interval:'month',interval_count:order.durationMonths}}:{}),product_data:{name:order.title.slice(0,200),description:order.autoRenew?`${order.durationMonths} month access. Automatically renews until cancelled; cancel future renewal in My Billing.`:order.kind==='membership'?`${order.durationMonths} month Academy membership. One payment; no automatic renewal.`:`${order.durationMonths} month individual course access. One payment; no automatic renewal.`}}}],
  metadata:{sa_order_id:String(order._id),sa_user_id:String(order.user)},...(order.autoRenew?{subscription_data:{metadata:{sa_order_id:String(order._id),sa_user_id:String(order.user)},...(order.renewalSetup?{trial_end:trialEnd,trial_settings:{end_behavior:{missing_payment_method:'cancel'}}}:{})},...(order.discountMinor>0?{discounts:[{coupon:'sa-first-'+String(order._id)}]}:{}),custom_text:{submit:{message:(order.renewalSetup?'No charge now. First charge '+new Date(order.billingStartsAt).toISOString().slice(0,10)+'. ':'')+'Automatically renews at '+order.currency+' '+moneyString(order.renewalAmountMinor)+' every '+order.durationMonths+' month(s). Cancel renewal in My Billing. Purchases are non-refundable except where law or provider rights require otherwise.'}}}:{payment_intent_data:{metadata:{sa_order_id:String(order._id)}}}),
  success_url:root+'/checkout/return?order='+String(order._id),cancel_url:root+'/checkout/return?order='+String(order._id)+'&cancelled=1',
  expires_at:Math.floor(new Date(order.expiresAt).getTime()/1000)
 };
}
export async function createStripeOrder(order,user){
 if(paymentEnvironment('stripe')!==order.environment)throw businessError('Checkout environment does not match Stripe credentials. No new payment was started.',409);
 const stripe=await getStripe();
 if(order.autoRenew&&order.discountMinor>0)await stripe.coupons.create({id:'sa-first-'+String(order._id),amount_off:order.discountMinor,currency:order.currency.toLowerCase(),duration:'once',name:'First period discount'},{idempotencyKey:'sa-discount-'+String(order._id)});
 const data=await stripe.checkout.sessions.create(order.creationPayload||stripeOrderBody(order,user),{idempotencyKey:'sa-create-'+String(order._id)});
 return {id:data.id,url:data.url?approvedRedirect(data.url,'stripe',order.environment):null,
  state:data.status==='expired'&&data.payment_status!=='paid'?'expired':'pending'};
}
/** Bounded READ-ONLY discovery. Never reuse a pruned idempotency key to create
 * a competing charge. No search result is treated as proof if pagination caps. */
export async function findStripeOrder(order){
 const stripe=await getStripe();
 const first=new Date(order.creationAttemptedAt||order.createdAt||new Date(+new Date(order.expiresAt)-3600000));
 const last=new Date(order.lastCreationAttemptedAt||order.creationAttemptedAt||order.createdAt||first);
 if(!Number.isFinite(+first)||!Number.isFinite(+last))return {complete:false};
 let cursor,found=[];
 for(let page=0;page<5;page++){
  // Do not use the application's wall-clock window to prove ABSENCE:
  // server/provider clock skew could exclude the actual earlier session.
  // Only exhausting the account's unfiltered list proves this bounded search complete.
  const result=await stripe.checkout.sessions.list({limit:100,...(cursor?{starting_after:cursor}:{})});
  if(!Array.isArray(result.data))return {complete:false};
  for(const row of result.data)if(row.client_reference_id===String(order._id)&&row.metadata?.sa_order_id===String(order._id)&&row.metadata?.sa_user_id===String(order.user)&&row.livemode===(order.environment==='live'))found.push(row);
  if(found.length>1)throw businessError('Multiple provider sessions need Academy reconciliation. No new payment was started.',409);
  if(!result.has_more)return {complete:true,remote:found[0]?{id:found[0].id,url:found[0].url?approvedRedirect(found[0].url,'stripe',order.environment):null}:null};
  if(!result.data.length)return {complete:false};cursor=result.data.at(-1).id;
 }
 return {complete:false};
}
export async function stripeEvidence(order){
 const stripe=await getStripe();
 const s=await stripe.checkout.sessions.retrieve(order.providerOrderId,{expand:['payment_intent.latest_charge']});
 if(order.autoRenew){
  if(s.client_reference_id!==String(order._id)||s.metadata?.sa_order_id!==String(order._id)||s.metadata?.sa_user_id!==String(order.user)||s.mode!=='subscription'||s.livemode!==(order.environment==='live'))throw businessError('Stripe subscription checkout does not match the order.',409);
  const subId=typeof s.subscription==='string'?s.subscription:s.subscription?.id;if(!subId||s.payment_status!=='paid'&&!(order.renewalSetup&&s.status==='complete'&&s.payment_status==='no_payment_required'))return {state:s.status==='expired'?'expired':'pending'};
  return stripeSubscriptionInvoiceEvidence(order,subId,order.renewalSetup?null:typeof s.invoice==='string'?s.invoice:s.invoice?.id||null,order.amountMinor);
 }
 if(s.client_reference_id!==String(order._id)||s.metadata?.sa_order_id!==String(order._id)||s.metadata?.sa_user_id!==String(order.user)||s.mode!=='payment'||s.livemode!==(order.environment==='live'))throw businessError('Stripe checkout does not match the order.',409);
 if(s.payment_status!=='paid')return {state:s.status==='expired'?'expired':'pending'};
 const p=s.payment_intent,c=p?.latest_charge;
 if(!p||typeof p==='string'||p.status!=='succeeded'||typeof c==='string'||!c?.paid||!c?.created||p.amount_received!==order.amountMinor||p.currency?.toUpperCase()!==order.currency)throw businessError('Stripe payment is not confirmed as fully collected.',409);
 return {state:'paid',provider:'stripe',environment:s.livemode?'live':'test',providerOrderId:s.id,orderId:s.client_reference_id,amountMinor:s.amount_total,currency:s.currency.toUpperCase(),paymentId:p.id,paidAt:new Date(c.created*1000)};
}
let paypalToken=null,paypalTokenFlight=null;
function paypalBase(){return process.env.PAYPAL_MODE==='live'?'https://api-m.paypal.com':'https://api-m.sandbox.paypal.com';}
async function readProvider(response){
 const raw=await response.text();if(response.ok&&response.status===204&&!raw)return {};if(raw.length>2000000)throw businessError('Payment provider response too large.',502);
 let data;try{data=JSON.parse(raw);}catch{throw businessError('Payment provider response could not be read.',502);}
 if(!response.ok){const e=businessError('Payment provider could not finish the request. Retry the same order; do not pay again if already charged.',502);e.providerStatus=response.status;e.providerCode=String(data.name||data.error?.code||(typeof data.error==='string'?data.error:'PROVIDER_ERROR')).replace(/[^A-Za-z0-9_.-]/g,'').slice(0,100);e.providerIssue=String(data.details?.[0]?.issue||'').replace(/[^A-Za-z0-9_.-]/g,'').slice(0,100);e.providerDebugId=String(data.debug_id||'').replace(/[^A-Za-z0-9-]/g,'').slice(0,64);throw e;}return data;
}
async function getPayPalToken(base=paypalBase()){
 const id=process.env.PAYPAL_CLIENT_ID,secret=paypalClientSecret(process.env);if(!id||!secret)throw businessError('PayPal is not configured.',503);
 const fingerprint=crypto.createHash('sha256').update(base+id+secret).digest('hex');
 if(paypalToken?.fingerprint===fingerprint&&paypalToken.expiresAt>Date.now()+60000)return paypalToken.value;
 if(paypalTokenFlight?.fingerprint===fingerprint)return paypalTokenFlight.promise;
 const pending=(async()=>{
  const response=await fetch(base+'/v1/oauth2/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Basic '+Buffer.from(id+':'+secret).toString('base64'),'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  const data=await readProvider(response);if(typeof data.access_token!=='string'||!data.access_token)throw businessError('PayPal authentication failed.',502);
  paypalToken={fingerprint,value:data.access_token,expiresAt:Date.now()+Math.max(60,Number(data.expires_in)||300)*1000};return paypalToken.value;
 })();paypalTokenFlight={fingerprint,promise:pending};
 try{return await pending;}finally{if(paypalTokenFlight?.promise===pending)paypalTokenFlight=null;}
}
export async function paypalApi(path,{method='GET',body,requestId,serializedBody}={}){
 if(!/^\/v[12]\//.test(path))throw businessError('Invalid provider request.',500);
 // Only signature postback may supply an already-serialized envelope.
 if(serializedBody!==undefined&&(path!=='/v1/notifications/verify-webhook-signature'||method!=='POST'||body!==undefined||typeof serializedBody!=='string'))throw businessError('Invalid serialized provider request.',500);
 try{
 const base=paypalBase(),token=await getPayPalToken(base);
 // Start this request's timeout AFTER OAuth finishes. Previously OAuth could
 // consume almost the entire HTTP timeout before the order request even began.
 const response=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Prefer:'return=representation',...(requestId?{'PayPal-Request-Id':requestId}:{})},...(serializedBody!==undefined?{body:serializedBody}:body!==undefined?{body:JSON.stringify(body)}:{})});
 return await readProvider(response);
 }catch(error){
  // Add provider context to transport failures without changing checkout state
  // or retrying a potentially successful mutation under a different identity.
  if(error&&typeof error==='object'&&!error.status)error.paymentProvider='paypal';
  throw error;
 }
}
export function paypalRequestId(action,value){
 const label=action==='capture'?'cap':'new',digest=crypto.createHash('sha256').update(String(action)+':'+String(value)).digest('hex').slice(0,18);
 return `sa-${label}-${digest}`; // Short deterministic provider idempotency key; never contains secrets.
}
export function paypalOrderBody(order){
 const root=frontendOrigin(),unit={reference_id:'academy',custom_id:String(order._id),invoice_id:'SA-'+String(order._id),description:order.title.slice(0,127),amount:{currency_code:order.currency,value:moneyString(order.amountMinor)}};
 if(process.env.PAYPAL_MERCHANT_ID)unit.payee={merchant_id:process.env.PAYPAL_MERCHANT_ID};
 return {intent:'CAPTURE',purchase_units:[unit],payment_source:{paypal:{experience_context:{brand_name:'Singh Academy',shipping_preference:'NO_SHIPPING',user_action:'PAY_NOW',return_url:root+'/checkout/return?order='+String(order._id),cancel_url:root+'/checkout/return?order='+String(order._id)+'&cancelled=1'}}}};
}
export async function createPayPalOrder(order){
 if(paymentEnvironment('paypal')!==order.environment)throw businessError('Checkout environment does not match PayPal credentials. No new payment was started.',409);
 const data=await paypalApi('/v2/checkout/orders',{method:'POST',requestId:paypalRequestId('create',order._id),body:order.creationPayload||paypalOrderBody(order)});
 const url=(data.links||[]).find(l=>l.rel==='payer-action'||l.rel==='approve')?.href;
 return {id:data.id,url:url?approvedRedirect(url,'paypal',order.environment):null,state:data.status==='VOIDED'?'cancelled':'pending'};
}
export async function paypalEvidence(order,{capture=false,onBeforeCapture}={}){
 let remote=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(order.providerOrderId));
 const units=remote.purchase_units||[];
 if(remote.id!==order.providerOrderId||units.length!==1||units[0].custom_id!==String(order._id)||(process.env.PAYPAL_MERCHANT_ID&&units[0].payee?.merchant_id!==process.env.PAYPAL_MERCHANT_ID)||units[0].amount?.currency_code!==order.currency||toMinor(units[0].amount?.value)!==order.amountMinor||paymentEnvironment('paypal')!==order.environment)throw businessError('PayPal order details do not match the saved purchase.',409);
 if(remote.status==='APPROVED'&&capture&&!order.cancelRequestedAt){
  if(onBeforeCapture)await onBeforeCapture();
  try{await paypalApi('/v2/checkout/orders/'+encodeURIComponent(order.providerOrderId)+'/capture',{method:'POST',requestId:paypalRequestId('capture',order._id),body:{}});remote=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(order.providerOrderId));}
  catch(error){
   // A concurrent webhook can have captured the order already. Read provider truth before failing.
   const current=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(order.providerOrderId));
   if(current.status!=='COMPLETED')throw error;remote=current;
  }
 }
 if(remote.status!=='COMPLETED')return {state:['VOIDED'].includes(remote.status)?'cancelled':'pending'};
 const purchases=remote.purchase_units||[];const captures=purchases[0]?.payments?.captures||[];
 if(purchases.length!==1||purchases[0].custom_id!==String(order._id)||(process.env.PAYPAL_MERCHANT_ID&&purchases[0].payee?.merchant_id!==process.env.PAYPAL_MERCHANT_ID)||captures.length!==1)throw businessError('Unexpected PayPal settlement. The Academy must review it.',409);
 const paid=captures[0];if(!['COMPLETED','REFUNDED','PARTIALLY_REFUNDED'].includes(paid.status))return {state:['DENIED','DECLINED','FAILED'].includes(paid.status)?'failed':'pending'};
 return {state:'paid',provider:'paypal',environment:paymentEnvironment('paypal'),providerOrderId:remote.id,orderId:purchases[0].custom_id,amountMinor:toMinor(paid.amount?.value),currency:paid.amount?.currency_code,paymentId:paid.id,paidAt:new Date(paid.create_time)};
}
export async function verifyStripeEvent(raw,signature){
 if(!process.env.STRIPE_WEBHOOK_SECRET||!signature||!Buffer.isBuffer(raw))throw businessError('Invalid Stripe signature.',400);
 try{return (await getStripe()).webhooks.constructEvent(raw,signature,process.env.STRIPE_WEBHOOK_SECRET,300);}catch{throw businessError('Invalid Stripe signature.',400);}
}
export async function verifyPayPalEvent(input,headers){
 // The HTTP route supplies raw bytes. Preserve them inside the postback
 // envelope: JSON parse/stringify can change spacing or numeric formatting.
 let event=input,raw;
 if(Buffer.isBuffer(input)){
  try{raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(input);event=JSON.parse(raw);}catch{throw businessError('Invalid PayPal event.',400);}
 }
 if(!process.env.PAYPAL_WEBHOOK_ID||typeof event?.id!=='string'||event.id.length>150)throw businessError('Invalid PayPal event.',400);
 const fields={auth_algo:'paypal-auth-algo',cert_url:'paypal-cert-url',transmission_id:'paypal-transmission-id',transmission_sig:'paypal-transmission-sig',transmission_time:'paypal-transmission-time'},body={webhook_id:process.env.PAYPAL_WEBHOOK_ID,webhook_event:event};
 for(const[field,key]of Object.entries(fields)){const v=headers[key];if(typeof v!=='string'||!v||v.length>1000)throw businessError('Missing PayPal signature.',400);body[field]=v;}
 // The certificate URL is passed to PayPal's verification API, never fetched by this server.
 let request={method:'POST',body};
 if(raw!==undefined){const {webhook_event,...envelope}=body;request={method:'POST',serializedBody:JSON.stringify(envelope).slice(0,-1)+',\"webhook_event\":'+raw+'}'};}
 const result=await paypalApi('/v1/notifications/verify-webhook-signature',request);
 if(result.verification_status!=='SUCCESS')throw businessError('Invalid PayPal signature.',400);return event;
}

/** Close only an identified, unpaid Stripe Checkout Session.
 * Expiration is provider-side; a browser Back/Cancel is never sufficient.
 */
export async function closeStripeCheckout(order){
 const stripe=await getStripe();
 const inspect=async()=>{
  const remote=await stripe.checkout.sessions.retrieve(order.providerOrderId,{expand:['payment_intent.latest_charge']});
  if(remote.id!==order.providerOrderId||remote.client_reference_id!==String(order._id)||remote.metadata?.sa_order_id!==String(order._id)||
     remote.metadata?.sa_user_id!==String(order.user)||remote.mode!==(order.autoRenew?'subscription':'payment')||
     remote.livemode!==(order.environment==='live'))throw businessError('Stripe checkout identity could not be verified.',409);
  return remote;
 };
 let remote=await inspect();
 if(remote.payment_status==='paid'||order.renewalSetup&&remote.status==='complete'&&remote.payment_status==='no_payment_required')return stripeEvidence(order);
 const activeIntent=()=>remote.payment_intent&&
  (typeof remote.payment_intent==='string'||!['requires_payment_method','canceled'].includes(remote.payment_intent.status));
 if(remote.status==='expired'&&!activeIntent())return {state:'expired'};
 if(remote.status!=='open'||remote.payment_status!=='unpaid'||activeIntent())
  throw businessError('The previous Stripe payment is still being processed. Check its status before switching methods.',409);
 try{await stripe.checkout.sessions.expire(order.providerOrderId,{},
   {idempotencyKey:'sa-close-'+String(order._id)});}
 catch(error){
  // Expiration may race settlement or its response may be lost. Re-read truth.
  remote=await inspect();
  if(remote.payment_status==='paid'||order.renewalSetup&&remote.status==='complete'&&remote.payment_status==='no_payment_required')return stripeEvidence(order);
  if(remote.status==='expired'&&!activeIntent())return {state:'expired'};
  throw error;
 }
 remote=await inspect();
 if(remote.payment_status==='paid'||order.renewalSetup&&remote.status==='complete'&&remote.payment_status==='no_payment_required')return stripeEvidence(order);
 if(remote.status!=='expired'||activeIntent())throw businessError('The previous Stripe checkout has not been confirmed closed yet.',409);
 return {state:'expired'};
}

/** Orders v2 CAPTURE has no generic "cancel order" endpoint.
 * The caller MUST first persist cancelRequestedAt and serialize this operation
 * against every capture path. We never claim that PayPal approval itself is voided.
 */
export async function closePayPalCheckout(order){
 if(!order.cancelRequestedAt)throw businessError('PayPal capture must be blocked before changing payment method.',409);
 const remote=await paypalApi('/v2/checkout/orders/'+encodeURIComponent(order.providerOrderId));
 const units=remote.purchase_units||[];
 if(remote.id!==order.providerOrderId||units.length!==1||units[0].custom_id!==String(order._id)||
    (process.env.PAYPAL_MERCHANT_ID&&units[0].payee?.merchant_id!==process.env.PAYPAL_MERCHANT_ID)||
    units[0].amount?.currency_code!==order.currency||toMinor(units[0].amount?.value)!==order.amountMinor||
    paymentEnvironment('paypal')!==order.environment)
  throw businessError('PayPal order details do not match this checkout.',409);
 if(remote.status==='COMPLETED')return paypalEvidence(order,{capture:false});
 if(remote.status==='VOIDED')return {state:'cancelled'};
 const payments=units[0].payments;
 if(order.captureAttemptedAt||payments?.captures?.length||payments?.authorizations?.length||
    remote.intent!=='CAPTURE'||!['CREATED','SAVED','PAYER_ACTION_REQUIRED','APPROVED'].includes(remote.status))
  throw businessError('The previous PayPal payment may still be processing. Check its status before switching methods.',409);
 // Approval may arrive later, but the durable local cancellation marker prevents
 // our return, reconciliation worker and webhook paths from capturing this order.
 return {state:'cancelled'};
}

/** Verify a settled subscription invoice against the immutable agreed price.
 * Paid-out-of-band, customer-credit, prorated and multi-item invoices require
 * operator reconciliation; they do not manufacture a card settlement here. */
export async function stripeSubscriptionInvoiceEvidence(order,subscriptionId,invoiceId,expectedAmount){
 const stripe=await getStripe(),subscription=await stripe.subscriptions.retrieve(subscriptionId);
 if(subscription.id!==subscriptionId||subscription.metadata?.sa_order_id!==String(order._id)||subscription.metadata?.sa_user_id!==String(order.user)||subscription.livemode!==(order.environment==='live'))throw businessError('Recurring subscription identity mismatch.',409);
 const item=subscription.items?.data?.[0],price=item?.price;
 if(subscription.items?.data?.length!==1||subscription.items.has_more||price?.currency?.toUpperCase()!==order.currency||price.unit_amount!==order.renewalAmountMinor||price.recurring?.interval!=='month'||price.recurring?.interval_count!==order.durationMonths)throw businessError('Recurring price differs from the accepted agreement; reconcile with the provider.',409);
 const target=invoiceId||(typeof subscription.latest_invoice==='string'?subscription.latest_invoice:subscription.latest_invoice?.id);
 if(!target)return {state:'pending'};
 const invoice=await stripe.invoices.retrieve(target),owner=invoice.parent?.subscription_details?.subscription||invoice.subscription;
 if(invoice.id!==target||(typeof owner==='string'?owner:owner?.id)!==subscriptionId||invoice.livemode!==(order.environment==='live')||invoice.currency?.toUpperCase()!==order.currency)throw businessError('Recurring invoice identity mismatch.',409);
 if(invoice.status!=='paid')return {state:'pending'};
 if(order.renewalSetup&&invoice.billing_reason==='subscription_create'&&invoice.total===0&&invoice.amount_paid===0&&invoice.amount_remaining===0){
  const end=Math.ceil(+new Date(order.billingStartsAt)/1000),lines=invoice.lines?.data||[],period=lines[0]?.period;
  if(!Number.isSafeInteger(end)||subscription.trial_end!==end||invoice.paid_out_of_band===true||lines.length!==1||invoice.lines.has_more||!Number.isInteger(period?.start)||period.start>=end||period.end!==end||lines[0]?.proration===true||lines[0]?.parent?.subscription_item_details?.proration===true)throw businessError('Deferred renewal setup does not match the accepted paid-access end.',409);
  // A zero trial invoice proves no charge. It never creates a local Invoice,
  // Payment or access contribution. Late historical trial events are harmless.
  if(subscription.status!=='trialing')return {state:'setup_history'};
  const method=typeof subscription.default_payment_method==='string'?subscription.default_payment_method:subscription.default_payment_method?.id;
  if(!method)return {state:'pending'};
  if(subscription.pending_setup_intent){const ref=subscription.pending_setup_intent,intent=typeof ref==='string'?await stripe.setupIntents.retrieve(ref):ref;if(intent.status!=='succeeded')return {state:'pending'};}
  if(end*1000<=Date.now()||subscription.trial_settings?.end_behavior?.missing_payment_method!=='cancel')throw businessError('The provider renewal schedule is not confirmed.',409);
  return {state:'renewal_ready',provider:'stripe',environment:order.environment,providerOrderId:order.providerOrderId,orderId:String(order._id),futureAmountMinor:order.amountMinor,currency:order.currency,providerSubscriptionId:subscription.id,providerCustomerId:typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id,providerInvoiceId:invoice.id,billingStartsAt:new Date(end*1000),periodStartsAt:new Date(period.start*1000),providerStatus:subscription.status,cancelAtPeriodEnd:subscription.cancel_at_period_end===true};
 }
 if(!['subscription_create','subscription_cycle'].includes(invoice.billing_reason)||invoice.amount_paid!==expectedAmount||invoice.total!==expectedAmount||invoice.paid_out_of_band===true||invoice.amount_remaining!==0)throw businessError('Recurring invoice settlement needs reconciliation.',409);
 const lines=invoice.lines?.data||[],line=lines[0],period=line?.period;
 if(lines.length!==1||invoice.lines?.has_more||line?.proration===true||line?.parent?.subscription_item_details?.proration===true||!Number.isInteger(period?.start)||!Number.isInteger(period?.end)||period.end<=period.start)throw businessError('Recurring invoice access period is invalid.',409);
 const paid=await stripe.invoicePayments.list({invoice:invoice.id,status:'paid',limit:2,expand:['data.payment.payment_intent']});
 if(paid.has_more||paid.data?.length!==1||paid.data[0].status!=='paid'||(typeof paid.data[0].invoice==='string'?paid.data[0].invoice:paid.data[0].invoice?.id)!==invoice.id||paid.data[0].amount_paid!==expectedAmount||paid.data[0].currency?.toUpperCase()!==order.currency||paid.data[0].livemode!==(order.environment==='live'))throw businessError('Recurring collection evidence needs reconciliation.',409);
 let intent=paid.data[0].payment?.payment_intent;if(typeof intent==='string')intent=await stripe.paymentIntents.retrieve(intent);
 if(!intent?.id||intent.status!=='succeeded'||intent.amount_received!==expectedAmount||intent.currency?.toUpperCase()!==order.currency)throw businessError('Recurring collection is not verified.',409);
 return {state:'paid',provider:'stripe',environment:order.environment,providerOrderId:order.providerOrderId,orderId:String(order._id),amountMinor:expectedAmount,currency:order.currency,paymentId:intent.id,paidAt:new Date(invoice.status_transitions.paid_at*1000),providerSubscriptionId:subscriptionId,providerCustomerId:typeof subscription.customer==='string'?subscription.customer:subscription.customer?.id,providerInvoiceId:invoice.id,billingReason:invoice.billing_reason,periodStartsAt:new Date(period.start*1000),periodEndsAt:new Date(period.end*1000),providerStatus:subscription.status,cancelAtPeriodEnd:subscription.cancel_at_period_end===true};
}
