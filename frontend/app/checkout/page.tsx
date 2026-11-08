'use client';
import '../billing/billing-v50.css';
import {useEffect,useState,useRef} from 'react';import {useSearchParams,useRouter} from 'next/navigation';
import ApiLoadError from '../../components/ApiLoadError';
import BackButton from '../../components/layout/BackButton';import SiteHeader from '../../components/SiteHeader';import SiteFooter from '../../components/layout/SiteFooter';import {useAuth} from '../../components/auth/AuthProvider';import {apiFetch,safeStudentNext} from '../../lib/api';import {money} from '../../lib/money';
import {checkoutId,checkoutAddress,confirmedRenewalSetup,checkoutScope,checkoutLegacyKey,readCheckoutAttempt,saveCheckoutAttempt,forgetCheckoutAttempt,type CheckoutAttempt} from '../../lib/checkoutSafety';
import {useCatalogAccess} from '../../lib/useCatalogAccess';
import FeedbackNotice from '../../components/feedback/FeedbackNotice';
import SectionPurchaseSuggestion from '../../components/SectionPurchaseSuggestion';
export default function Checkout(){
 const query=useSearchParams(),router=useRouter(),{user,ready}=useAuth(),slug=query.get('course')||'',requestedPlan=query.get('plan')||'',sectionSlug=query.get('section')||'';
 const catalog=useCatalogAccess();
 const choiceScope=catalog.scope+'|'+query.toString();
 const [choice,setChoice]=useState<{scope:string;mode:'course'|'section'|'membership';optionKey?:string}>({scope:choiceScope,mode:sectionSlug?'section':requestedPlan||!slug?'membership':'course'}),[courseSection,setCourseSection]=useState<{scope:string;slug:string}>({scope:'',slug:''});
 const mode=choice.scope===choiceScope?choice.mode:sectionSlug?'section':requestedPlan||!slug?'membership':'course',owningSection=courseSection.scope===choiceScope?courseSection.slug:'',sectionProduct=sectionSlug||owningSection;
 const [plan]=useState(requestedPlan),[purchase,setPurchase]=useState<any>(null),[methods,setMethods]=useState<any>({}),[optionKey,setOptionKey]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
 const renewalOf=query.get('renewal')||'',renewalSetup=query.get('renewalSetup')==='1',sourceInvoiceId=renewalSetup?query.get('sourceInvoice')||'':'';
 const [couponInput,setCouponInput]=useState(''),[couponCode,setCouponCode]=useState(''),[autoRenew,setAutoRenew]=useState(true),[termsAccepted,setTermsAccepted]=useState(false),[quote,setQuote]=useState<any>(null),[quoteError,setQuoteError]=useState(''),[quoteLoading,setQuoteLoading]=useState(false);
 const replacementKey=useRef('');
 const selectionRevision=useRef(0),renderSelectionRevision=selectionRevision.current;
 const keys=useRef<Record<string,string>>({}),paymentLock=useRef(false),alive=useRef(true),leaving=useRef(false),lastAttempt=useRef<CheckoutAttempt|null>(null),operation=useRef(0),currentScope=useRef('');
 const [pendingAttempt,setPendingAttempt]=useState<CheckoutAttempt|null>(null);
 const [slow,setSlow]=useState(false),[recovering,setRecovering]=useState(false),[canStartNew,setCanStartNew]=useState(false);
 useEffect(()=>{alive.current=true;const restored=(event:PageTransitionEvent)=>{if(!event.persisted&&!leaving.current)return;operation.current++;paymentLock.current=false;leaving.current=false;setBusy('');setRecovering(false);};window.addEventListener('pageshow',restored);return()=>{alive.current=false;window.removeEventListener('pageshow',restored);};},[]);
 useEffect(()=>{setSlow(false);if(!busy)return;const timer=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(timer);},[busy]);
 const [bootstrapError,setBootstrapError]=useState(''),[bootstrapLoading,setBootstrapLoading]=useState(true),[bootstrapRevision,setBootstrapRevision]=useState(0),[priceRevision,setPriceRevision]=useState(0);
 useEffect(()=>{if(ready&&!user)router.replace('/login?next='+encodeURIComponent(safeStudentNext('/checkout?'+query.toString())));},[ready,user,router,query]);
 useEffect(()=>{let alive=true;setBootstrapLoading(true);setBootstrapError('');apiFetch('/payments/methods').then(payments=>{if(!alive)return;setMethods(payments.methods||{});}).catch(e=>{if(alive)setBootstrapError(e.message);}).finally(()=>{if(alive)setBootstrapLoading(false);});return()=>{alive=false;};},[bootstrapRevision]);
 const product=mode==='course'?slug:mode==='section'?sectionProduct:plan,owner=String(user?.id||user?._id||''),scope=checkoutScope(owner,mode,product,renewalOf,renewalSetup,sourceInvoiceId);
 const requestScope=[scope,catalog.scope,choiceScope].join('|');
 currentScope.current=requestScope;
 const selectionIsCurrent=()=>currentScope.current===requestScope&&renderSelectionRevision===selectionRevision.current;
 const isCurrent=(ticket:number)=>alive.current&&ticket===operation.current&&currentScope.current===requestScope;
 useEffect(()=>{
  operation.current++;paymentLock.current=false;leaving.current=false;setBusy('');setRecovering(false);
  let previous:CheckoutAttempt|null=null;
  if(owner&&product)try{previous=readCheckoutAttempt(sessionStorage,scope);}catch{}
  lastAttempt.current=previous;setPendingAttempt(previous);setCanStartNew(false);setTermsAccepted(false);if(renewalSetup){setAutoRenew(true);setCouponCode('');setCouponInput('');}
  if(previous){setAutoRenew(previous.autoRenew===true);setCouponCode(previous.couponCode||'');setCouponInput(previous.couponCode||'');setOptionKey(previous.optionKey);setError('An existing checkout was found. Choose either payment method; the previous checkout will be checked and safely closed before a new one opens.');}
 },[scope,catalog.scope]);
 function remember(a:CheckoutAttempt){lastAttempt.current=a;setPendingAttempt(a);try{saveCheckoutAttempt(sessionStorage,a);}catch{}}
 function forget(a:CheckoutAttempt){delete keys.current[checkoutLegacyKey(a)];try{forgetCheckoutAttempt(sessionStorage,a);}catch{}lastAttempt.current=null;setPendingAttempt(null);}

 useEffect(()=>{if(!product||mode==='membership'){setPurchase(null);setLoading(false);return;}const controller=new AbortController();setLoading(true);setError(lastAttempt.current?'An existing checkout was found. Choose either payment method; the previous checkout will be checked and safely closed before a new one opens.':'');setPurchase(null);apiFetch('/payments/catalog?'+new URLSearchParams({kind:mode,product}),{signal:controller.signal}).then(d=>{if(controller.signal.aborted||!selectionIsCurrent())return;if(!d.purchase||typeof d.purchase!=='object'||(d.purchase.offers!==undefined&&!Array.isArray(d.purchase.offers)))throw new Error('The price response was incomplete. Please retry loading prices.');setPurchase(d.purchase);if(mode==='course')setCourseSection({scope:choiceScope,slug:typeof d.purchase.sectionSlug==='string'?d.purchase.sectionSlug:''});const preferred=choice.scope===choiceScope?choice.optionKey:'';setOptionKey(lastAttempt.current?.optionKey||(preferred&&d.purchase.offers?.some((o:any)=>o.key===preferred)?preferred:null)||(d.purchase.offers?.some((o:any)=>o.key===query.get('option'))?query.get('option'):null)||d.purchase.offers?.[0]?.key||'');}).catch(e=>{if(!controller.signal.aborted&&selectionIsCurrent())setError(e.message);}).finally(()=>{if(!controller.signal.aborted&&selectionIsCurrent())setLoading(false);});return()=>controller.abort();},[mode,product,owner,catalog.scope,choiceScope,priceRevision]);
 const offer=purchase?.offers?.find((o:any)=>o.key===optionKey);
 const coverage=mode==='course'?catalog.courseAccess({slug:product,sectionSlug:purchase?.sectionSlug}):mode==='section'?catalog.sectionAccess(product):null;
 const covered=!renewalSetup&&!!coverage,checkingAccess=!renewalSetup&&(catalog.checking||catalog.unavailable);
 useEffect(()=>{if(!owner||!product||!offer||mode==='membership'||covered||checkingAccess){setQuote(null);setQuoteLoading(false);return;}const c=new AbortController();setQuoteLoading(true);setQuoteError('');setQuote(null);apiFetch('/payments/quote',{method:'POST',body:JSON.stringify({kind:mode,product,optionKey,couponCode,autoRenew,renewalSetup,...(sourceInvoiceId?{sourceInvoiceId}:{})}),signal:c.signal}).then(d=>{if(!d.quote||!Number.isSafeInteger(d.quote.amountMinor)||!Number.isSafeInteger(d.quote.renewalAmountMinor))throw new Error('The checkout quote was incomplete. Please reload prices.');if(!c.signal.aborted&&selectionIsCurrent())setQuote(d.quote);}).catch(e=>{if(!c.signal.aborted&&selectionIsCurrent())setQuoteError(e.message);}).finally(()=>{if(!c.signal.aborted&&selectionIsCurrent())setQuoteLoading(false);});return()=>c.abort();},[owner,catalog.scope,mode,product,optionKey,couponCode,autoRenew,renewalSetup,sourceInvoiceId,offer,pendingAttempt?.key,covered,checkingAccess]);
 const available=['stripe','paypal'].some(k=>methods[k]?.enabled&&quote?.availableProviders?.[k]);
 function checkoutKey(provider:string){const key=[owner,mode,product,optionKey,provider,renewalOf,String(autoRenew),couponCode,...(renewalSetup?['renewal-setup']:[]),...(sourceInvoiceId?['source',sourceInvoiceId]:[])].join('|');if(keys.current[key])return keys.current[key];let id='';try{id=sessionStorage.getItem('sa-checkout:'+key)||'';}catch{}if(!id){id=checkoutId();try{sessionStorage.setItem('sa-checkout:'+key,id);}catch{}}keys.current[key]=id;return id;}
 function openOrder(data:any,provider:string,ticket:number){
  if(!isCurrent(ticket))return false;
  if(data.url&&!data.order)throw new Error('The checkout response is incomplete. Check the existing checkout before paying again.');
  const attempt=lastAttempt.current;
  if(data.order&&attempt){
   if((data.order.provider!==attempt.provider&&!((quote?.noPaymentRequired||!!attempt.couponCode&&!attempt.autoRenew)&&data.order.provider==='discount'&&data.order.status==='paid'&&data.order.amountMinor===0))||data.order.kind!==attempt.kind||data.order.product!==attempt.product||Boolean(data.order.renewalSetup)!==Boolean(attempt.renewalSetup)||(attempt.sourceInvoiceId&&data.order.sourceInvoiceId!==attempt.sourceInvoiceId)||!/^[a-f0-9]{24}$/i.test(data.order._id||''))throw new Error('Checkout identity does not match this purchase. Check My Billing before paying again.');
   remember({...attempt,orderId:data.order._id});
  }
  if(data.order?.status==='renewal_ready'){
   if(!renewalSetup||!confirmedRenewalSetup(data.order))throw new Error('Renewal setup identity could not be confirmed. Check My Billing.');
   if(lastAttempt.current)forget(lastAttempt.current);leaving.current=true;router.push('/checkout/return?order='+data.order._id);return true;
  }
  if(data.order?.status==='paid'){
   if(renewalSetup)throw new Error('Renewal setup cannot confirm a new paid term. Check My Billing; the existing checkout identity has been retained.');
   if(!/^[a-f0-9]{24}$/i.test(data.order._id||''))throw new Error('The paid order reference is missing. Open My Billing; do not pay again.');
   if(lastAttempt.current)forget(lastAttempt.current);leaving.current=true;router.push('/checkout/return?order='+data.order._id);return true;
  }
  if(data.url&&data.order?.status==='pending'){const url=checkoutAddress(data.url,provider);leaving.current=true;window.location.assign(url);return true;}
  return false;
 }
 async function recoverAttempt(provider:string,key:string,ticket:number){
  if(!isCurrent(ticket))return false;setRecovering(true);
  try{
   // Reads only: a timeout never starts a new charge or substitutes a new key.
   const data=await apiFetch('/payments/checkout-status',{headers:{'Idempotency-Key':key}});
   if(!isCurrent(ticket))return false;
   if(data.order&&lastAttempt.current&&data.order.provider!==lastAttempt.current.provider&&
      ['stripe','paypal'].includes(data.order.provider)&&data.order.kind===mode&&data.order.product===product&&Boolean(data.order.renewalSetup)===renewalSetup&&(!sourceInvoiceId||data.order.sourceInvoiceId===sourceInvoiceId)&&
      /^[a-f0-9]{24}$/i.test(data.order._id||'')){
    remember({...lastAttempt.current,provider:data.order.provider,orderId:data.order._id});
    if(['paid','renewal_ready'].includes(data.order.status))return openOrder(data,data.order.provider,ticket);
    setError('Another tab already selected a payment method for this checkout. Choose either method again to check and switch safely.');
    return false;
   }
   if(openOrder(data,provider,ticket))return true;
   const closed=['expired','failed','cancelled'].includes(data.order?.status);setCanStartNew(closed);
   setError(data.order?.recoveryRequired?'The previous payment needs Academy reconciliation. Contact support with checkout '+data.order._id+'; do not make another payment.':closed?'The provider confirmed this checkout is closed. You can start a new checkout.':data.creationPending?'Your existing checkout is still being prepared. Check it again below; do not start another payment.':'The existing checkout is not ready. Retry the same payment method to keep the same order, or check My Billing first.');
   return false;
  }catch{if(isCurrent(ticket))setError('Payment status could not be confirmed. Your existing checkout key has been retained. Check the same checkout or My Billing before paying again.');return false;}
  finally{if(isCurrent(ticket))setRecovering(false);}
 }
 async function pay(provider:string){
  if(currentScope.current!==requestScope||renderSelectionRevision!==selectionRevision.current||paymentLock.current||busy||covered||checkingAccess||!offer||!quote||quoteLoading||quoteError||!ready||!owner||bootstrapLoading||bootstrapError||loading||(!quote.noPaymentRequired&&(!methods[provider]?.enabled||!quote.availableProviders?.[provider])))return;
  if(!termsAccepted){setError('Please accept the purchase and renewal terms before continuing.');return;}
  let retained=lastAttempt.current;
  if(!retained)try{retained=readCheckoutAttempt(sessionStorage,scope);}catch{}
  if(retained&&(retained.owner!==owner||retained.kind!==mode||retained.product!==product||Boolean(retained.renewalSetup)!==renewalSetup)){
   setError('This saved checkout belongs to a different purchase. Open My Billing to review it.');return;
  }
  const ticket=++operation.current;paymentLock.current=true;leaving.current=false;setBusy(provider);setError('');setCanStartNew(false);
  try{
   let nextKey=replacementKey.current;
   if(retained&&(retained.provider!==provider||canStartNew||retained.optionKey!==optionKey||retained.releaseRequested)){
    retained={...retained,releaseRequested:true};remember(retained);
    setRecovering(true);
    const released=await apiFetch('/payments/checkout/release',{method:'POST',
     headers:{'Idempotency-Key':retained.key},body:JSON.stringify({})});
    if(!isCurrent(ticket))return;
    const old=released.order;
    if(!old||old.provider!==retained.provider||old.kind!==retained.kind||old.product!==retained.product||
      (retained.orderId&&old._id!==retained.orderId)||(retained.sourceInvoiceId&&old.sourceInvoiceId!==retained.sourceInvoiceId))throw new Error('The previous checkout identity could not be verified.');
    if(['paid','renewal_ready'].includes(old.status)){if(openOrder(released,retained.provider,ticket))return;}
    if(released.released!==true||!['failed','expired','cancelled'].includes(old.status)||
       typeof released.replacementKey!=='string'||!/^[-_a-zA-Z0-9]{16,128}$/.test(released.replacementKey))
      throw new Error('The previous payment is still being checked. Do not pay again yet.');
    nextKey=released.replacementKey;forget(retained);retained=null;setRecovering(false);
   }
   const key=nextKey||retained?.key||checkoutKey(provider);
   remember({owner,kind:mode,product,optionKey,renewalOf,provider:provider as 'stripe'|'paypal',key,autoRenew,couponCode,...(renewalSetup?{renewalSetup:true}:{}),...(sourceInvoiceId?{sourceInvoiceId}:{})});replacementKey.current='';
   const data=await apiFetch('/payments/checkout',{method:'POST',headers:{'Idempotency-Key':key},body:JSON.stringify({kind:mode,product,optionKey,provider,autoRenew,renewalSetup,...(sourceInvoiceId?{sourceInvoiceId}:{}),termsAccepted,couponCode,quoteFingerprint:quote.fingerprint,...(mode==='membership'&&plan===requestedPlan&&renewalOf?{renewalOf}:{})})});
   if(!isCurrent(ticket))return;if(!openOrder(data,provider,ticket))throw new Error('Checkout is being prepared. Check the existing order.');
  }catch(e:any){
   if(!isCurrent(ticket))return;setError(e.message);
   if(e.code==='ACTIVE_ACCESS_EXISTS'){if(lastAttempt.current&&!lastAttempt.current.orderId)forget(lastAttempt.current);catalog.refresh();return;}
   if(lastAttempt.current&&(!e.status||[408,409,429,500,502,503,504].includes(e.status)))await recoverAttempt(lastAttempt.current.provider,lastAttempt.current.key,ticket);
   if(isCurrent(ticket)&&typeof e.code==='string'&&e.code.startsWith('PAYMENT_PROVIDER_'))setError(current=>current===e.message?current:e.message+(current?' '+current:''));
  }finally{if(isCurrent(ticket)&&!leaving.current){paymentLock.current=false;setBusy('');}}
 }
 async function checkExisting(){
  if(paymentLock.current||!lastAttempt.current)return;
  const {provider,key}=lastAttempt.current,ticket=++operation.current;paymentLock.current=true;setBusy(provider);
  try{await recoverAttempt(provider,key,ticket);}finally{if(isCurrent(ticket)&&!leaving.current){paymentLock.current=false;setBusy('');}}
 }
 function resetCheckout(){
  if(!canStartNew||busy)return;
  // Keep the old identity. The next explicit provider click obtains the same
  // server-issued replacement key, including when another tab chooses a method.
  setError('Choose Stripe or PayPal below.');
 }

 function selectPurchase(next:'course'|'section',preferredOption?:string){
  if(currentScope.current!==requestScope||renderSelectionRevision!==selectionRevision.current||next===mode||renewalSetup||paymentLock.current||busy||lastAttempt.current||pendingAttempt||next==='section'&&!sectionProduct)return;
  selectionRevision.current++;operation.current++;currentScope.current='';replacementKey.current='';
  setPurchase(null);setLoading(true);setOptionKey('');setQuote(null);setQuoteError('');setQuoteLoading(true);setError('');setTermsAccepted(false);setCouponCode('');setCouponInput('');
  setChoice({scope:choiceScope,mode:next,optionKey:preferredOption});
 }

 async function releaseForChanges(){
  const old=lastAttempt.current;if(!old||paymentLock.current)return;
  const ticket=++operation.current;paymentLock.current=true;setBusy(old.provider);setError('');
  try{const d=await apiFetch('/payments/checkout/release',{method:'POST',headers:{'Idempotency-Key':old.key},body:'{}'});
   if(!isCurrent(ticket))return;
   if(['paid','renewal_ready'].includes(d.order?.status)){router.push('/checkout/return?order='+d.order._id);return;}
   if(!d.released||d.order?.kind!==old.kind||d.order?.product!==old.product||typeof d.replacementKey!=='string')throw new Error('The previous checkout could not be confirmed closed. Check My Billing before paying again.');
   replacementKey.current=d.replacementKey;forget(old);setCanStartNew(false);setTermsAccepted(false);
  }catch(e:any){if(isCurrent(ticket))setError(e.message);}finally{if(isCurrent(ticket)){paymentLock.current=false;setBusy('');}}
 }

 if(!ready||!user)return <main><SiteHeader/><div className="authLoading">Checking your session…</div></main>;
 if(mode==='membership')return <main><SiteHeader/><section className="checkoutWrap"><BackButton fallback="/academy" label="Back to Academy Plans"/><span className="kicker">ACADEMY PLANS</span><h1>Choose a section or an individual course.</h1><p>Academy-wide plans are no longer sold. Explore the available sections, then choose full section access or purchase a course separately.</p><a className="button" href="/academy">Explore Academy Plans →</a>{pendingAttempt&&<div className="checkoutRecovery"><p>You have an existing checkout. Check its status before making another purchase.</p><button type="button" className="pill" disabled={!!busy} onClick={()=>void checkExisting()}>Check existing checkout</button>{error&&<FeedbackNotice variant="error">{error}</FeedbackNotice>}</div>}<p>Your existing paid access, invoices and renewal controls remain in <a href="/billing">My Billing</a>.</p></section><SiteFooter/></main>;
 if(mode==='course'&&purchase?.free)return <main><SiteHeader/><section className="checkoutWrap"><BackButton fallback={'/courses/'+slug} label="Back to course"/><span className="kicker">FREE COURSE</span><h1>{purchase.title}</h1><p>No payment is needed for this course. Start it from the course page to save your enrollment and progress.</p><a className="button" href={'/courses/'+slug}>Start Course →</a></section><SiteFooter/></main>;
 if(covered||checkingAccess)return <main><SiteHeader/><section className="checkoutWrap"><BackButton fallback={mode==='section'?'/sections/'+encodeURIComponent(product):'/courses/'+encodeURIComponent(product)} label="Back"/><span className="kicker">{covered?'ACTIVE ACCESS':'COURSE ACCESS'}</span><h1>{covered?'Your access is active.':'Checking your access…'}</h1>{covered?<><p>{purchase?.title||'This learning content'} is already included in your active access.</p><a className="button" href={mode==='section'?'/sections/'+encodeURIComponent(product)+'#section-courses':'/learn/'+encodeURIComponent(product)}>{mode==='section'?'Open included courses →':'Continue Course →'}</a></>:catalog.unavailable&&<ApiLoadError message={catalog.error} onRetry={catalog.refresh}/>} {pendingAttempt&&<div className="checkoutReturnActions"><button type="button" className="pill" disabled={!!busy} onClick={()=>void checkExisting()}>Check existing checkout</button><button type="button" className="pill" disabled={!!busy} onClick={()=>void releaseForChanges()}>Close existing checkout</button><a className="pill" href="/billing">My Billing</a></div>}{error&&<FeedbackNotice variant="error">{error}</FeedbackNotice>}</section><SiteFooter/></main>;
 return <main><SiteHeader/><section className="checkoutWrap"><BackButton fallback={sectionSlug?'/sections/'+sectionSlug:slug?'/courses/'+slug:'/academy'} label="Back"/><span className="kicker">SECURE CHECKOUT</span><h1>{renewalSetup?'Set up automatic renewal.':'Your learning, your choice.'}</h1>{renewalSetup&&<p>Your already-paid access stays in place. No payment is collected now; authorize future charges with the provider you choose, starting when your current paid access ends.</p>}<p>Choose the term for your individual course or complete section. Prices are in USD for the country saved on your account.</p>
 {bootstrapError&&<ApiLoadError message={bootstrapError} onRetry={()=>setBootstrapRevision(n=>n+1)}/>} {error&&<FeedbackNotice variant="error">{error}{!purchase&&<button type="button" className="pill" onClick={()=>setPriceRevision(n=>n+1)}>Retry loading prices</button>}</FeedbackNotice>}
 <div className="checkoutLayout"><div><div className="planChoice">{slug&&<button disabled={!!busy||!!pendingAttempt} className={mode==='course'?'selected':''} aria-pressed={mode==='course'} onClick={()=>selectPurchase('course')}><b>Individual course</b><span>Your selected course</span></button>}{sectionSlug&&<button disabled={!!busy||!!pendingAttempt} className={mode==='section'?'selected':''} aria-pressed={mode==='section'} onClick={()=>selectPurchase('section')}><b>Complete section</b><span>All published courses in this section</span></button>}
 {!sectionSlug&&!renewalSetup&&owningSection&&!catalog.sectionAccess(owningSection)&&<SectionPurchaseSuggestion key={choiceScope+':'+owningSection} slug={owningSection} durationMonths={mode==='course'?offer?.durationMonths:undefined} selected={mode==='section'} disabled={!!busy||!!pendingAttempt} onSelect={key=>selectPurchase('section',key)}/>}</div>
 {loading?<p role="status">Loading your prices…</p>:purchase?.membershipOnly?<p>This course has no individual purchase price yet. Check its section in Academy Plans or contact the Academy.</p>:<>
 {purchase?.offers?.length>0&&<div className="checkoutOptions">{purchase.offers.map((o:any)=><label key={o.key}><input type="radio" name="offer" checked={optionKey===o.key} disabled={!!busy||!!pendingAttempt} onChange={()=>{setOptionKey(o.key);setTermsAccepted(false);}}/><span><b>{o.label}</b><small>{o.durationMonths} month(s) of {mode==='section'?'section':'course'} access</small></span><strong>{money(o.amountMinor/100,o.currency)}</strong></label>)}</div>}
 <div className="checkoutPreferences"><label className="checkoutRenewal"><input type="checkbox" checked={autoRenew} disabled={renewalSetup||!!busy||!!pendingAttempt} onChange={e=>{setAutoRenew(e.target.checked);setTermsAccepted(false);}}/><span><b>Automatically renew my access</b><small>Renews every {offer?.durationMonths||'selected'} month(s). Disable future renewals in My Billing; your paid access remains until its end date.</small></span></label>
 {!renewalSetup&&<div className="checkoutCoupon"><label htmlFor="checkout-coupon">One-time discount code</label><div><input id="checkout-coupon" autoComplete="off" maxLength={64} value={couponInput} disabled={!!busy||!!pendingAttempt} onChange={e=>setCouponInput(e.target.value.toUpperCase())} placeholder="Code supplied by the Academy"/><button type="button" className="pill" disabled={!!busy||!!pendingAttempt||quoteLoading} onClick={()=>{setCouponCode(couponInput.trim().toUpperCase());setTermsAccepted(false);}}>Apply code</button>{couponCode&&<button type="button" className="pill" disabled={!!busy||!!pendingAttempt} onClick={()=>{setCouponCode('');setCouponInput('');setTermsAccepted(false);}}>Remove</button>}</div><small>Single-use codes apply to the first term only. Future renewals use the standard price shown below.</small></div>}
 {quoteLoading&&<p role="status">Checking your price and available payment methods…</p>}{quoteError&&<FeedbackNotice variant="error">{quoteError}</FeedbackNotice>}{quote?.recurringUnavailableReason&&<FeedbackNotice variant="warning">{quote.recurringUnavailableReason}</FeedbackNotice>}
 {autoRenew&&<p className="secureNote">Automatic renewal is managed by the available payment provider you choose. Review the recurring price and interval before accepting.</p>}
 <label className="checkoutConsent"><input type="checkbox" checked={termsAccepted} disabled={!!busy} onChange={e=>setTermsAccepted(e.target.checked)}/><span>I agree to the <a href="/terms" target="_blank" rel="noreferrer">purchase terms</a>: payments are non-refundable except where required by law. {autoRenew?(renewalSetup?'I authorize future recurring charges at the amount shown, starting on the displayed date, until I disable renewal in My Billing. No payment is collected today.':'I authorize recurring charges at the renewal amount and interval shown until I cancel in My Billing.'):'This is a one-time purchase with no automatic recurring charge.'}</span></label></div>
 <h2 className="paymentHeading">{renewalSetup?'Authorize future renewal':quote?.noPaymentRequired?'Activate your discounted access':'Choose your payment method'}</h2>
 {quote?.noPaymentRequired&&!autoRenew?<button type="button" className="button" disabled={!!busy||quoteLoading||!termsAccepted} onClick={()=>pay('stripe')}>Activate access — no payment required</button>:<div className="paymentGrid">{['stripe','paypal'].map(provider=><button key={provider} className={'paymentMethod '+provider} aria-busy={busy===provider} disabled={!!busy||bootstrapLoading||!!bootstrapError||loading||quoteLoading||!!quoteError||!quote||!offer||!methods[provider]?.enabled||!quote.availableProviders?.[provider]} onClick={()=>pay(provider)}><span className="paymentIcon" aria-hidden="true">{provider==='stripe'?'S':'P'}</span><span><b>{busy===provider?(recovering?'Checking existing checkout…':'Opening secure checkout…'):provider==='stripe'?(renewalSetup?'Set up renewal with Stripe':'Pay with Stripe'):(renewalSetup?'Set up renewal with PayPal':'Pay with PayPal')}</b><small>{bootstrapLoading?'Loading payment options…':methods[provider]?.enabled&&quote?.availableProviders?.[provider]?(renewalSetup?'Authorize future renewal — no charge today':autoRenew?'Hosted recurring checkout':provider==='stripe'?'Hosted secure card checkout':'Hosted one-time checkout'):(quote?.providerUnavailableReasons?.[provider]||'Unavailable for this purchase')}</small></span></button>)}</div>}
 {!bootstrapLoading&&!bootstrapError&&!quoteLoading&&!quoteError&&!available&&!quote?.noPaymentRequired&&<p className="secureNote">No payment method is currently available for this purchase. {autoRenew?'Try a supported duration or switch off automatic renewal.':'Contact the Academy if the problem continues.'}</p>}
 {Object.values(methods).some((m:any)=>m?.enabled&&m.environment==='test')&&<p className="paymentTestNote">Sandbox testing: test payments do not charge real money.</p>}{busy&&<p className="secureNote" role="status">{slow?'The payment provider is taking longer. Your existing checkout identity is retained.':'Connecting securely…'}</p>}
 {pendingAttempt&&<div className="checkoutReturnActions"><button type="button" className="pill" disabled={!!busy} onClick={()=>void checkExisting()}>Check existing checkout</button><button type="button" className="pill" disabled={!!busy} onClick={()=>void releaseForChanges()}>Change purchase options</button><a className="pill" href="/billing">My Billing</a></div>}{error&&offer&&canStartNew&&<button className="pill" disabled={!!busy} onClick={resetCheckout}>Start a new checkout</button>}</>}
 </div><aside className="orderSummary"><span className="kicker">ORDER SUMMARY</span><h2>{purchase?.title||'Choose an option'}</h2><div><span>Access</span><b>{mode==='section'?'Entire section':'Individual course'}</b></div><div><span>Term</span><b>{offer?.durationMonths||'—'} month(s)</b></div><div><span>Subtotal</span><b>{quote?money(quote.subtotalMinor/100,quote.currency):'—'}</b></div>{quote?.discountMinor>0&&<div><span>First-term discount</span><b>−{money(quote.discountMinor/100,quote.currency)}</b></div>}<div><span>Total due now</span><b>{quote?money((quote.amountDueNowMinor??quote.amountMinor)/100,quote.currency):'—'}</b></div>{renewalSetup&&quote?.billingStartsAt&&<div><span>First future payment</span><b>{new Date(quote.billingStartsAt).toLocaleDateString(undefined,{timeZone:'UTC'})}</b></div>}{autoRenew&&quote&&<div><span>Each renewal</span><b>{money(quote.renewalAmountMinor/100,quote.currency)} / {quote.durationMonths} month(s)</b></div>}<hr/><p>{autoRenew?'Access renews for the selected interval until you disable automatic renewal in My Billing.':'Access expires at the end of this paid term. No automatic renewal is authorized.'}</p><p>Purchases are non-refundable except where required by applicable law. Cancellation stops future renewals; it does not refund a paid term.</p><p>Your confirmed invoice, access dates and renewal controls appear in My Billing.</p></aside></div></section><SiteFooter/></main>;
}
