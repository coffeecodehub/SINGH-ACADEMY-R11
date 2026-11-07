'use client';
import {useEffect, useRef, useState} from 'react';
import {apiFetch} from '../../lib/api';
import {checkoutAddress} from '../../lib/checkoutSafety';
import {money} from '../../lib/money';
import BillingCancellationDialog from './BillingCancellationDialog';
import BillingActionConfirmation,{BillingActionIcon,type BillingAction} from './BillingActionConfirmation';
import FeedbackNotice from '../feedback/FeedbackNotice';
import PaidAccessIndicator from './PaidAccessIndicator';
import type {PaidAccess} from '../../lib/paidAccessClock';

type Agreement = {
  _id:string; title:string; kind:string; product:string; provider:string;
  status:string; autoRenew?:boolean; cancelAtPeriodEnd?:boolean;
  currentPeriodEnd?:string; intervalMonths?:number; currency:string; amountMinor?:number;
  canEnableRenewal?:boolean; canDisableRenewal?:boolean; renewalConsentFingerprint?:string;
  renewalActionPending?:boolean; renewalPendingAutoRenew?:boolean;
  canEndDisabledAgreement?:boolean; renewalPendingAction?:string;
  renewalSetup?:boolean; billingStartsAt?:string; canCancelAccess?:boolean; accessCancelledAt?:string;
  checkoutOrderId?:string|null;checkoutStatus?:string|null;pendingCheckout?:boolean;checkoutCancellationPending?:boolean;canContinueCheckout?:boolean;canCancelPendingCheckout?:boolean;
  renewalControlMode?:'suspend'|'cancel_at_period_end';
  paidAccess?:PaidAccess;
};
type SetupItem = {paidAccess?:PaidAccess;invoiceId?:string;canCancelActivePurchase?:boolean;accessCancelledAt?:string;key:string;kind:string;product:string;title:string;testMode?:boolean;accessExpiresAt?:string;amountMinor:number;currency:string;intervalMonths:number;renewalSetup:boolean;billingStartsAt?:string;amountDueNowMinor:number;canSetup:boolean;unavailableReason?:string;setupUrl:string;availableProviders?:Record<string,boolean>;providerUnavailableReasons?:Record<string,string>};
type ActionConfirmation={item:Agreement;owner:string;action:BillingAction;subject:string;message:string;enable?:boolean;endDisabled?:boolean;pending?:boolean};
const providerName=(provider:string)=>provider==='paypal'?'PayPal':provider==='stripe'?'Stripe':'Payment provider';
const day=(value?:string)=>value&&Number.isFinite(Date.parse(value))
  ? new Date(value).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'})
  : 'Awaiting provider confirmation';
const price=(item:Pick<Agreement,'amountMinor'|'currency'|'intervalMonths'>)=>item.amountMinor==null?'Awaiting confirmation':`${money(item.amountMinor/100,item.currency||'USD')} every ${item.intervalMonths||'selected'} month(s)`;

export default function AutoRenewals({owner,onChanged}:{owner:string;onChanged:()=>void}) {
  const [items,setItems]=useState<Agreement[]>([]),[loading,setLoading]=useState(true);
  const [setupItems,setSetupItems]=useState<SetupItem[]>([]);
  const [readError,setReadError]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[revision,setRevision]=useState(0);
  const [cancellation,setCancellation]=useState<{item:Agreement|SetupItem;purchase:boolean;owner:string}|null>(null);
  const [actionConfirmation,setActionConfirmation]=useState<ActionConfirmation|null>(null),confirmation=useRef<ActionConfirmation|null>(null);
  const inFlight=useRef<symbol|null>(null),activeOwner=useRef(owner),loadedOwner=useRef('');activeOwner.current=owner;
  useEffect(()=>{loadedOwner.current='';inFlight.current=null;confirmation.current=null;setBusy('');setNotice('');setError('');setReadError('');setItems([]);setSetupItems([]);setCancellation(null);setActionConfirmation(null);},[owner]);
  useEffect(()=>{
    if(!owner)return;
    const c=new AbortController();setLoading(loadedOwner.current!==owner);setReadError('');
    apiFetch('/payments/mine/agreements',{signal:c.signal}).then(d=>{
      if(!Array.isArray(d.items)||d.setupItems!==undefined&&!Array.isArray(d.setupItems))throw new Error('Automatic renewal records could not be read.');
      if(!c.signal.aborted){loadedOwner.current=owner;setItems(d.items);setSetupItems(d.setupItems||[]);}
    }).catch(e=>{if(!c.signal.aborted)setReadError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return()=>c.abort();
  },[owner,revision]);
  useEffect(()=>{
    if(!owner)return;const refresh=()=>{if(document.visibilityState==='visible'&&!inFlight.current)setRevision(n=>n+1);};
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);const timer=setInterval(refresh,30000);
    return()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);clearInterval(timer);};
  },[owner]);
  async function pendingAction(item:Agreement,cancel=false,confirmedOwner?:string){
    if(inFlight.current||!item.checkoutOrderId||!(cancel?item.canCancelPendingCheckout:item.canContinueCheckout))return;
    if(cancel&&confirmedOwner===undefined){
      if(confirmation.current||cancellation)return;
      const next:ActionConfirmation={item,owner,action:'cancel',subject:'this pending checkout',pending:true,message:`Cancel the pending checkout for ${item.title||item.product}? No already-paid access will be cancelled. The card is removed only after the payment provider confirms this checkout is closed.`};confirmation.current=next;setActionConfirmation(next);return;
    }
    if(cancel&&confirmedOwner!==activeOwner.current)return;
    const action=Symbol(),actionOwner=owner;inFlight.current=action;setBusy(item._id);setError('');setNotice('');
    try{const result=await apiFetch('/payments/mine/agreements/'+encodeURIComponent(item._id)+(cancel?'/cancel-pending':'/continue'),{method:'POST',body:JSON.stringify(cancel?{confirmPendingCancellation:true}:{})});
      if(activeOwner.current!==actionOwner||inFlight.current!==action)return;const value=result.item,order=result.order;
      if(value?._id!==item._id||value?.provider!==item.provider||value?.kind!==item.kind||value?.product!==item.product||value?.checkoutOrderId!==item.checkoutOrderId||order?._id!==item.checkoutOrderId||order?.provider!==item.provider||order?.kind!==item.kind||order?.product!==item.product)throw new Error('The original checkout could not be confirmed. Check the same pending checkout before paying again.');
      if(cancel){
        if(result.checkoutCancelled===true){if(!['cancelled','expired','failed'].includes(order.status)||value.pendingCheckout||value.autoRenew!==false||value.renewalActionPending)throw new Error('Checkout cancellation has not been confirmed. Please retry the same pending checkout.');setItems(current=>current.filter(row=>row._id!==item._id));setNotice('Pending checkout cancelled. No already-paid access was changed.');}
        else if(result.checkoutCancelled===false&&['paid','renewal_ready'].includes(order.status)){setItems(current=>current.map(row=>row._id===item._id?value:row));setNotice('The provider confirmed that this checkout had already completed. Your confirmed agreement remains available below.');}
        else throw new Error('Checkout cancellation has not been confirmed. Please retry the same pending checkout.');
      }else if(result.url&&order.status==='pending'&&!order.cancellationRequested){window.location.assign(checkoutAddress(result.url,item.provider));}
      else if(['paid','renewal_ready'].includes(order.status)){setItems(current=>current.map(row=>row._id===item._id?value:row));setNotice('The provider confirmed this checkout has completed. Your billing records have been updated.');}
      else throw new Error('The original checkout is still being prepared. Please retry Continue checkout shortly.');
      setRevision(n=>n+1);onChanged();
    }catch(e:any){if(activeOwner.current===actionOwner&&inFlight.current===action){setError(e.message||'The pending checkout could not be confirmed. Retry the same action.');setRevision(n=>n+1);}}
    finally{if(inFlight.current===action){inFlight.current=null;setBusy('');}}
  }
  async function change(item:Agreement,enable:boolean,endDisabled=false,confirmedOwner?:string) {
    if(inFlight.current||item.renewalPendingAction==='end'&&!endDisabled)return;
    if(endDisabled&&(item.provider!=='paypal'||item.autoRenew!==false||item.canEndDisabledAgreement!==true))return;
    const provider=providerName(item.provider);
    const prompt=endDisabled
      ? `End this disabled agreement for ${item.title||item.product}? PayPal must confirm it has ended. Your existing paid access remains until its end date. To renew afterward, you must review a new checkout and give consent to its price and payment terms.`
      : enable
      ? `Enable automatic renewal for ${item.title||item.product}? You authorize ${provider} to charge ${price(item)} starting at the next provider renewal date (${day(item.currentPeriodEnd)}), until you disable renewal. First-term discounts do not repeat. Payments are non-refundable except where required by applicable law.`
      : `Disable automatic renewal for ${item.title||item.product}? Your confirmed paid access remains until its end date. ${item.renewalControlMode==='suspend'?'Future charges are suspended': 'Future renewal is stopped'} once ${provider} confirms the change.`;
    if(confirmedOwner===undefined){
      if(confirmation.current||cancellation)return;
      const next:ActionConfirmation={item,owner,action:endDisabled?'cancel':enable?'enable':'disable',subject:endDisabled?'this disabled agreement':'automatic renewal',message:prompt,enable,endDisabled};confirmation.current=next;setActionConfirmation(next);return;
    }
    if(confirmedOwner!==activeOwner.current)return;
    const action=Symbol(),actionOwner=owner;inFlight.current=action;
    setBusy(item._id);setError('');setNotice('');
    try {
      const result=await apiFetch('/payments/mine/agreements/'+encodeURIComponent(item._id)+(endDisabled?'/end':enable?'/resume':'/cancel'),{method:'POST',body:JSON.stringify(enable&&!endDisabled?{termsAccepted:true,consentFingerprint:item.renewalConsentFingerprint}:{})});
      if(activeOwner.current!==actionOwner||inFlight.current!==action)return;
      if(result.item?._id!==item._id||result.item?.provider!==item.provider||result.item?.kind!==item.kind||result.item?.product!==item.product||result.item?.autoRenew!==enable||result.item?.renewalActionPending||endDisabled&&(!['cancelled','canceled','expired'].includes(result.item?.status)||result.item?.canEndDisabledAgreement!==false||result.item?.cancelAtPeriodEnd!==false||result.item?.renewalActionPending!==false||result.item?.renewalPendingAction==='end'))throw new Error('The payment provider has not confirmed this renewal setting. Refresh and retry the same change.');
      setItems(current=>current.map(a=>a._id===item._id?{...result.item,paidAccess:result.item.paidAccess||a.paidAccess}:a));
      setNotice(endDisabled?`${provider} confirmed the disabled agreement has ended. Your already-paid access is retained. A new purchase requires checkout and your consent.`:enable?`${provider} confirmed automatic renewal is on at ${price(result.item)}. You can disable it here before the next renewal.`:`${provider} confirmed automatic renewal is off. Your already-paid access is retained.`);
      setRevision(n=>n+1);onChanged();
    } catch(e:any) {
      if(activeOwner.current===actionOwner&&inFlight.current===action)setError(e.message||'The renewal change could not be confirmed. Refresh and retry the same action; do not assume the setting changed.');
    } finally {if(inFlight.current===action){inFlight.current=null;setBusy('');}}
  }
  async function cancelAccess(item:Agreement|SetupItem,purchase=false,confirmedOwner?:string){
    if(inFlight.current)return;
    const id=purchase?(item as SetupItem).invoiceId:(item as Agreement)._id;
    if(!id||!(purchase?(item as SetupItem).canCancelActivePurchase:(item as Agreement).canCancelAccess)&&((item as Agreement).renewalPendingAction!=='cancel_access'))return;
    if(confirmedOwner===undefined){if(confirmation.current)return;setCancellation({item,purchase,owner});return;}
    if(confirmedOwner!==activeOwner.current)return;
    setCancellation(null);
    const action=Symbol(),actionOwner=confirmedOwner;inFlight.current=action;setBusy(id);setError('');setNotice('');
    try{
      const result=await apiFetch('/payments/mine/'+(purchase?'purchases/':'agreements/')+encodeURIComponent(id)+'/cancel-now',{method:'POST',body:JSON.stringify({confirmImmediateCancellation:true})});
      if(activeOwner.current!==actionOwner||inFlight.current!==action)return;
      const value=result.item;
      if(result.immediateRevocation!==true||result.noRefund!==true||value?._id!==id||value?.kind!==item.kind||value?.product!==item.product||!Number.isFinite(Date.parse(value?.accessCancelledAt||''))||value?.renewalActionPending||(!purchase&&(value?.provider!==(item as Agreement).provider||value?.autoRenew!==false||value?.canCancelAccess!==false))||(purchase&&(value?.invoiceId!==id||value?.canCancelActivePurchase!==false)))throw new Error('Cancellation has not been confirmed. Refresh and retry the same action; do not assume your subscription has ended.');
      if(purchase)setSetupItems(current=>current.filter(row=>row.invoiceId!==id));else setItems(current=>current.filter(row=>row._id!==id));
      setNotice('Cancellation confirmed. Access from this selected purchase/subscription has ended. No refund was issued; your financial history and other independent purchases are retained.');setRevision(n=>n+1);onChanged();
    }catch(e:any){if(activeOwner.current===actionOwner&&inFlight.current===action)setError(e.message||'Cancellation could not be confirmed. Refresh and retry.');}
    finally{if(inFlight.current===action){inFlight.current=null;setBusy('');}}
  }
  const visibleItems=items.filter(item=>!item.accessCancelledAt&&(!['cancelled','canceled','expired','incomplete_expired'].includes(item.status)||item.renewalActionPending));
  return <section className="billingAutoRenewals" aria-labelledby="renewals-title">
    <div className="sectionHead"><div><span className="kicker">YOUR CONTROL</span><h2 id="renewals-title">Automatic renewals</h2></div></div>
    <p>Enable or disable automatic renewal here. For a paid one-time purchase, use Set up automatic renewal to choose an available provider and authorize its future charges after your current paid access ends. Disabling renewal preserves that paid access. Cancel subscription now ends the selected subscription access immediately without a refund.</p>
    {notice&&<FeedbackNotice variant="success">{notice}</FeedbackNotice>}{(error||readError)&&<FeedbackNotice variant="error">{error||readError} <button type="button" className="saFeedbackButton saFeedbackButtonSecondary" onClick={()=>setRevision(n=>n+1)}>Refresh renewal status</button></FeedbackNotice>}
    {loading?<p role="status">Loading automatic renewals…</p>:!readError&&!visibleItems.length&&!setupItems.length?<div className="billingEmpty"><span className="billingState">Automatic renewal off</span><h3>No recurring payment agreement</h3><p>Your one-time purchases do not renew or charge automatically. To enable renewal, choose a section or course and select automatic renewal during checkout, then accept its recurring price and terms.</p><div className="subscriptionActions"><a className="billingAction" href="/academy">Choose a section or course</a><a className="billingAction" href="/billing?section=invoices">View purchases and cancellation controls</a></div></div>:<div className="billingRecords">{visibleItems.map(item=>{
      if(item.pendingCheckout||['creating','incomplete'].includes(item.status))return <article className="contentCard" key={item._id}><span className="billingState">{item.checkoutCancellationPending?'Checkout cancellation pending':'Pending checkout'}</span><h3>{item.title||item.product}</h3><p>{item.kind==='section'?'Section access':item.kind==='course'?'Individual course':'Academy membership'} · {providerName(item.provider)}</p><p>This checkout has not yet confirmed a purchase. No paid access is implied. Continue the same checkout or cancel it below.</p><p>Selected recurring price: {price(item)}. Automatic renewal begins only after you complete and authorize this checkout.</p>{item.checkoutCancellationPending&&<p role="status">Cancellation awaits provider confirmation. The card remains until closure is verified.</p>}<div className="subscriptionActions">{item.canContinueCheckout&&<button type="button" className="billingAction" disabled={!!busy} onClick={()=>void pendingAction(item)}>{busy===item._id?'Checking checkout…':'Continue checkout'}</button>}{item.canCancelPendingCheckout&&<button type="button" className="billingAction billingAction--cancel" disabled={!!busy} onClick={()=>void pendingAction(item,true)}><BillingActionIcon action="cancel"/>{busy===item._id?'Checking checkout…':item.checkoutCancellationPending?'Retry cancelling checkout':'Cancel pending checkout'}</button>}</div>{!item.canContinueCheckout&&!item.canCancelPendingCheckout&&<p role="status">The original checkout is being reconciled. Contact the Academy if it does not become available.</p>}</article>;
      const ended=['cancelled','canceled','expired','incomplete_expired'].includes(item.status);
      const renewing=item.autoRenew===true&&!item.cancelAtPeriodEnd&&!ended;
      const preparing=['creating','incomplete'].includes(item.status);
      const scheduled=renewing&&item.renewalSetup===true&&(item.status==='trialing'||Number.isFinite(Date.parse(item.billingStartsAt||''))&&Date.parse(item.billingStartsAt!)>Date.now());
      const setup=setupItems.find(s=>s.kind===item.kind&&s.product===item.product);
      return <article className="contentCard" key={item._id}><span className="billingState">{item.renewalActionPending?'Renewal change awaiting confirmation':preparing?'Renewal awaiting checkout confirmation':scheduled?'Automatic renewal scheduled':renewing?'Automatic renewal on':'Automatic renewal off'}</span><h3>{item.title||item.product}</h3>
        <p>{item.kind==='section'?'Section access':item.kind==='course'?'Individual course':'Legacy Academy membership'} · {providerName(item.provider)}</p>
        <PaidAccessIndicator access={item.paidAccess} renewHref={setup?.canSetup?setup.setupUrl:null}/>
        <dl className="subscriptionDates"><div><dt>Recurring price</dt><dd>{price(item)}</dd></div><div><dt>{scheduled?'First charge scheduled':renewing?'Next period date':'Current paid period ends'}</dt><dd>{day(scheduled?item.billingStartsAt||item.currentPeriodEnd:item.currentPeriodEnd)}</dd></div><div><dt>Provider status</dt><dd>{item.status.replaceAll('_',' ')}</dd></div></dl>
        {scheduled&&<p>No payment was taken for this setup. Your existing paid purchase continues to authorize access until its end date.</p>}
        {item.renewalActionPending&&<p role="status">The provider has not confirmed the last change. Retry the same action below to confirm its result.</p>}
        {['end','cancel_access'].includes(item.renewalPendingAction||'')?null:item.canDisableRenewal?<button type="button" className="billingAction billingAction--disable" disabled={!!busy} onClick={()=>void change(item,false)}><BillingActionIcon action="disable"/>{busy===item._id?`Confirming with ${providerName(item.provider)}…`:item.renewalActionPending?'Retry disabling automatic renewal':'Disable automatic renewal'}</button>
          :item.canEnableRenewal?<><p>Renewal is off for this paid term. Enable it to authorize the recurring price shown above; your original discount does not repeat.</p><button type="button" className="billingAction billingAction--enable" disabled={!!busy} onClick={()=>void change(item,true)}><BillingActionIcon action="enable"/>{busy===item._id?`Confirming with ${providerName(item.provider)}…`:item.renewalActionPending?'Retry enabling automatic renewal':'Enable automatic renewal'}</button></>
          :ended?<><p>This payment agreement has ended. Enabling renewal requires a new checkout and your consent to its recurring price.</p><a className="billingAction" href={setup?.canSetup?setup.setupUrl:'/academy'}>Review a new purchase</a></>
          :<p>{preparing?'Finish or close your existing checkout before changing renewal.':'Renewal cannot be enabled for this agreement right now. Refresh its status or review a new section or course checkout.'}</p>}
        {item.provider==='paypal'&&item.autoRenew===false&&item.canEndDisabledAgreement===true&&item.renewalPendingAction!=='cancel_access'&&<><p>End this disabled agreement to review a new purchase. Existing paid access is retained; a new checkout requires your consent.</p><button type="button" className="billingAction billingAction--cancel" disabled={!!busy} onClick={()=>void change(item,false,true)}><BillingActionIcon action="cancel"/>{busy===item._id?'Confirming with PayPal…':item.renewalPendingAction==='end'?'Retry ending this disabled agreement':'End this disabled agreement'}</button></>}
        {item.accessCancelledAt&&<p>Access from this subscription ended on {day(item.accessCancelledAt)}. No refund was issued.</p>}
        {(item.canCancelAccess||item.renewalPendingAction==='cancel_access')&&!item.accessCancelledAt&&<button type="button" className="billingAction billingAction--cancel" disabled={!!busy} onClick={()=>void cancelAccess(item)}><BillingActionIcon action="cancel"/>{busy===item._id?'Confirming cancellation…':item.renewalPendingAction==='cancel_access'?'Retry cancelling subscription now':'Cancel subscription now'}</button>}
      </article>;
    })}{setupItems.map(item=><article className="contentCard" key={'setup:'+item.key}>
      <span className="billingState">Automatic renewal off</span><h3>{item.title}</h3><p>{item.kind==='section'?'Section access':'Individual course'} · Paid purchase</p>
      {item.testMode&&<p className="paymentTestNote">Sandbox purchase · no real money</p>}
      <PaidAccessIndicator access={item.paidAccess} renewHref={item.canSetup?item.setupUrl:null}/>
      <dl className="subscriptionDates"><div><dt>{item.renewalSetup?'Current paid access ends':'Previous paid access ended'}</dt><dd>{day(item.accessExpiresAt)}</dd></div><div><dt>Current recurring price</dt><dd>{price(item)}</dd></div><div><dt>{item.renewalSetup?'Due for setup now':'Due at new checkout'}</dt><dd>{money(item.amountDueNowMinor/100,item.currency)}</dd></div></dl>
      <p>{!item.canSetup?'Your existing paid access dates need to fit a supported renewal schedule before a new agreement can be set up.':item.renewalSetup?'Set up automatic renewal with an available provider. No charge is taken now; the first recurring charge is scheduled after your current paid access ends. Your existing invoice and paid access remain intact.':'This paid term has ended. Review a new checkout to renew access and enable future automatic renewal at the current price.'}</p>
      {item.availableProviders&&<p>Available providers: {Object.entries(item.availableProviders).filter(([,available])=>available).map(([name])=>providerName(name)).join(' / ')||'No provider is currently available for this term.'}</p>}
      {Object.entries(item.providerUnavailableReasons||{}).filter(([,reason])=>!!reason).map(([name,reason])=><p key={name}>{providerName(name)}: {reason}</p>)}
      {item.canSetup?<a className="billingAction" href={item.setupUrl}>{item.renewalSetup?'Set up automatic renewal':'Renew and enable automatic renewal'}</a>:<p role="status">{item.unavailableReason}</p>}
      {item.canCancelActivePurchase&&item.invoiceId&&<button type="button" className="billingAction billingAction--cancel" disabled={!!busy} onClick={()=>void cancelAccess(item,true)}><BillingActionIcon action="cancel"/>{busy===item.invoiceId?'Confirming cancellation…':'Cancel purchase access now'}</button>}
    </article>)}</div>}
    <BillingActionConfirmation open={Boolean(actionConfirmation&&actionConfirmation.owner===owner)} action={actionConfirmation?.action||'enable'} title={actionConfirmation?.item.title||actionConfirmation?.item.product||''} subject={actionConfirmation?.subject} message={actionConfirmation?.message||''} onCancel={()=>{confirmation.current=null;setActionConfirmation(null);}} onConfirm={()=>{
      const selected=confirmation.current;if(!selected||selected!==actionConfirmation||selected.owner!==activeOwner.current)return;
      confirmation.current=null;setActionConfirmation(null);
      if(selected.pending)void pendingAction(selected.item,true,selected.owner);else void change(selected.item,selected.enable===true,selected.endDisabled===true,selected.owner);
    }}/>
    <BillingCancellationDialog open={Boolean(cancellation&&cancellation.owner===owner)} title={cancellation?.item.title||cancellation?.item.product||''} onCancel={()=>setCancellation(null)} onConfirm={()=>{if(cancellation&&cancellation.owner===activeOwner.current)void cancelAccess(cancellation.item,cancellation.purchase,cancellation.owner);}}/>
    <p className="secureNote">Choose an available Stripe or PayPal option at checkout. Renewal availability depends on your selected term. Discount codes apply to the first paid term only and cannot be used for deferred renewal setup. Payments are non-refundable except where required by applicable law. No card details are stored on this website.</p>
  </section>;
}
