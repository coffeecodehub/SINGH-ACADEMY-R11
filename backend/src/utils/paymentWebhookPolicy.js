/** Required events for hosted Checkout, Orders v2 and Subscriptions v1.
 * Refund events are intentionally excluded by the application's no-refund
 * webhook policy; involuntary reversal/dispute protections remain required.
 */
export const stripeEvents=Object.freeze([
 'checkout.session.completed','checkout.session.async_payment_succeeded',
 'checkout.session.async_payment_failed','checkout.session.expired',
 'charge.dispute.created','charge.dispute.closed',
 'invoice.paid','invoice.payment_failed','customer.subscription.updated','customer.subscription.deleted'
]);
export const paypalEvents=Object.freeze([
 'CHECKOUT.ORDER.APPROVED','CHECKOUT.PAYMENT-APPROVAL.REVERSED',
 'PAYMENT.CAPTURE.COMPLETED','PAYMENT.CAPTURE.DENIED','PAYMENT.CAPTURE.PENDING',
 'PAYMENT.CAPTURE.REVERSED',
 'CUSTOMER.DISPUTE.CREATED','CUSTOMER.DISPUTE.RESOLVED',
 'BILLING.SUBSCRIPTION.CREATED','BILLING.SUBSCRIPTION.ACTIVATED',
 'BILLING.SUBSCRIPTION.UPDATED','BILLING.SUBSCRIPTION.SUSPENDED',
 'BILLING.SUBSCRIPTION.CANCELLED','BILLING.SUBSCRIPTION.EXPIRED',
 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
 'PAYMENT.SALE.COMPLETED','PAYMENT.SALE.REVERSED'
]);
export const paypalAliases=Object.freeze({'PAYMENT.CAPTURE.DENIED':['PAYMENT.CAPTURE.DECLINED']});
export function missingEvents(actual,required,aliases={}){
 const set=new Set(actual||[]);if(set.has('*'))return [];
 return required.filter(name=>!set.has(name)&&!(aliases[name]||[]).some(alias=>set.has(alias)));
}
export function paymentOrigin(value){
 try {const u=new URL(value);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return '';return u.origin;}
 catch{return '';}
}
export function webhookUrl(env,provider){
 const base=paymentOrigin(env.PAYMENT_WEBHOOK_BASE_URL||'')||paymentOrigin(env.FRONTEND_URL||'');
 return base?`${base}/api/payments/webhooks/${provider}`:'';
}
export function paypalEventEntries(events){
 if(!Array.isArray(events))throw new Error('PayPal returned an invalid event list.');
 return events.map(x=>{
  if(!x||typeof x.name!=='string'||!x.name)throw new Error('PayPal returned an invalid event name.');
  return {name:x.name,...(typeof x.resource_version==='string'?{resource_version:x.resource_version}:{})};
 });
}
/** Preserve every existing subscription; add only documented missing events
 * after checking this environment's event catalog. A documented event absent
 * from the catalog may be requested only by explicit operator repair consent;
 * read-back must confirm it before any success is reported.
 */
export function paypalRepairPlan(hook,catalog){
 const existing=paypalEventEntries(hook?.event_types);
 if(!Array.isArray(catalog?.event_types))throw new Error('PayPal event catalog is unavailable. No subscription changed.');
 const available=new Set(catalog.event_types.filter(x=>x&&typeof x.name==='string'&&!['DISABLED','INACTIVE'].includes(String(x.status||'').toUpperCase())).map(x=>x.name));
 const missing=missingEvents(existing.map(x=>x.name),paypalEvents,paypalAliases),added=[],unavailable=[];
 for(const name of missing){
  // Prefer the v2 DECLINED name when creating a missing capture-failure subscription.
  const choices=name==='PAYMENT.CAPTURE.DENIED'?['PAYMENT.CAPTURE.DECLINED',name]:[name];
  const selected=choices.find(x=>available.has(x));
  if(selected)added.push(selected);else{unavailable.push(name);added.push(name);}
 }
 return {missing,added,unavailable,events:[...existing,...added.map(name=>({name}))]};
}
export function samePayPalWebhook(a,b){
 const canonical=h=>JSON.stringify({id:h?.id,url:h?.url,events:paypalEventEntries(h?.event_types).map(x=>JSON.stringify(x)).sort()});
 return canonical(a)===canonical(b);
}
export function redactPaymentMessage(value,env={}){
 let text=String(value||'Unknown payment verification error.');
 for(const name of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_SECRET','PAYPAL_WEBHOOK_ID','PAYPAL_MERCHANT_ID']){
  const secret=env[name];if(typeof secret==='string'&&secret.length>=6)text=text.split(secret).join('[redacted]');
 }
 return text.replace(/\b(?:sk_(?:live|test)_|rk_(?:live|test)_|whsec_)[A-Za-z0-9_.-]+/g,'[redacted]').slice(0,600);
}
