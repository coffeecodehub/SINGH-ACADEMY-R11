/** Secure unique request keys also work on HTTP LAN testing where randomUUID is absent. */
export function checkoutId(source:Crypto=globalThis.crypto):string{
 if(typeof source?.randomUUID==='function')return source.randomUUID();
 if(typeof source?.getRandomValues!=='function')throw new Error('Secure checkout requires a browser with cryptographic randomness. Open the HTTPS website in an up-to-date browser.');
 return Array.from(source.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');
}
export function checkoutAddress(value:unknown,provider:string):string{
 if(typeof value!=='string')throw new Error('The provider checkout address was not returned. Retry using the same checkout.');
 const u=new URL(value),hosts=provider==='stripe'?['checkout.stripe.com']:provider==='paypal'?['www.paypal.com','www.sandbox.paypal.com']:[];
 if(u.protocol!=='https:'||u.username||u.password||u.port||!hosts.includes(u.hostname))throw new Error('Invalid provider checkout address.');
 return u.href;
}
/** Provider-confirmed setup is terminal, but is never evidence of a paid term. */
export function confirmedRenewalSetup(order:any):boolean{
 return !!order&&order.status==='renewal_ready'&&order.renewalSetup===true&&['stripe','paypal'].includes(order.provider)
  &&/^[a-f0-9]{24}$/i.test(order._id||'')&&order.amountDueNowMinor===0
  &&Number.isSafeInteger(order.amountMinor)&&order.amountMinor>0
  &&typeof order.billingStartsAt==='string'&&Number.isFinite(Date.parse(order.billingStartsAt));
}

/** Client-side retry identity only, never payment evidence. Store no card data,
 * access grant, price or credentials here; the backend owns those decisions. */
export type CheckoutAttempt={owner:string;kind:'course'|'section'|'membership';product:string;optionKey:string;renewalOf:string;provider:'stripe'|'paypal';key:string;orderId?:string;releaseRequested?:boolean;autoRenew?:boolean;couponCode?:string;renewalSetup?:boolean;sourceInvoiceId?:string};
export function checkoutScope(owner:string,kind:string,product:string,renewalOf='',renewalSetup=false,sourceInvoiceId=''){
 return 'sa-checkout-active:'+JSON.stringify([owner,kind,product,renewalOf])+(renewalSetup?':renewal-setup':'')+(sourceInvoiceId?':source:'+sourceInvoiceId:'');
}
export function checkoutLegacyKey(a:CheckoutAttempt){return [a.owner,a.kind,a.product,a.optionKey,a.provider,a.renewalOf,...(a.autoRenew!==undefined?[String(a.autoRenew),a.couponCode||'']:[]),...(a.renewalSetup?['renewal-setup']:[]),...(a.sourceInvoiceId?['source',a.sourceInvoiceId]:[])].join('|');}
export function readCheckoutAttempt(storage:Pick<Storage,'getItem'>,scope:string):CheckoutAttempt|null{
 try{
  const raw=storage.getItem(scope);if(!raw||raw.length>2000)return null;
  const a=JSON.parse(raw);
  if(!a||typeof a.owner!=='string'||!a.owner||!['course','section','membership'].includes(a.kind)||typeof a.product!=='string'||!a.product||a.product.length>200||typeof a.optionKey!=='string'||a.optionKey.length>64||typeof a.renewalOf!=='string'||!['stripe','paypal'].includes(a.provider)||!/^[-_a-zA-Z0-9]{16,128}$/.test(a.key)||checkoutScope(a.owner,a.kind,a.product,a.renewalOf,a.renewalSetup===true,a.sourceInvoiceId||'')!==scope)return null;
  if(a.sourceInvoiceId!==undefined&&(!a.renewalSetup||typeof a.sourceInvoiceId!=='string'||!/^[a-f0-9]{24}$/i.test(a.sourceInvoiceId)))return null;
  if(a.renewalSetup!==undefined&&typeof a.renewalSetup!=='boolean')return null;
  if(a.renewalSetup&&(a.autoRenew!==true||a.kind==='membership'||a.couponCode))return null;
  if(a.autoRenew!==undefined&&typeof a.autoRenew!=='boolean')return null;
  if(a.couponCode!==undefined&&(typeof a.couponCode!=='string'||a.couponCode.length>64||!/^[A-Z0-9_-]*$/.test(a.couponCode)))return null;
  if(a.releaseRequested!==undefined&&typeof a.releaseRequested!=='boolean')return null;
  if(a.orderId!==undefined&&!/^[a-f0-9]{24}$/i.test(a.orderId))return null;
  return {owner:a.owner,kind:a.kind,product:a.product,optionKey:a.optionKey,renewalOf:a.renewalOf,provider:a.provider,key:a.key,...(a.orderId?{orderId:a.orderId}:{}),...(a.releaseRequested?{releaseRequested:true}:{}),...(typeof a.autoRenew==='boolean'?{autoRenew:a.autoRenew}:{}),...(a.couponCode!==undefined?{couponCode:a.couponCode}:{}),...(a.renewalSetup?{renewalSetup:true}:{}),...(a.sourceInvoiceId?{sourceInvoiceId:a.sourceInvoiceId}:{})};
 }catch{return null;}
}
export function saveCheckoutAttempt(storage:Pick<Storage,'setItem'>,a:CheckoutAttempt){
 try{storage.setItem(checkoutScope(a.owner,a.kind,a.product,a.renewalOf,a.renewalSetup,a.sourceInvoiceId),JSON.stringify(a));return true;}catch{return false;}
}
export function forgetCheckoutAttempt(storage:Pick<Storage,'removeItem'>,a:CheckoutAttempt){
 try{storage.removeItem(checkoutScope(a.owner,a.kind,a.product,a.renewalOf,a.renewalSetup,a.sourceInvoiceId));storage.removeItem('sa-checkout:'+checkoutLegacyKey(a));}catch{}
}
/** Call only AFTER the owned server order is confirmed paid/terminal. Never on
 * a browser cancel URL, timeout, unknown response, or another student's order. */
export function clearSettledCheckout(storage:Storage,owner:string,orderId:string){
 if(!owner||!/^[a-f0-9]{24}$/i.test(orderId))return;
 try{
  const keys:string[]=[];
  for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith('sa-checkout-active:'))keys.push(k);}
  for(const key of keys){const a=readCheckoutAttempt(storage,key);if(a?.owner===owner&&a.orderId===orderId)forgetCheckoutAttempt(storage,a);}
 }catch{}
}
