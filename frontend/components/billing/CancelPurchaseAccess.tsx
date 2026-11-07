'use client';
import FeedbackNotice from '../feedback/FeedbackNotice';
import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '../../lib/api';
import BillingCancellationDialog from './BillingCancellationDialog';
import {BillingActionIcon} from './BillingActionConfirmation';
export default function CancelPurchaseAccess({owner,invoiceId,title,onChanged}:{owner:string;invoiceId:string;title:string;onChanged:()=>void}){
 const [confirmation,setConfirmation]=useState<string|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false),flight=useRef<symbol|null>(null),active=useRef(owner+':'+invoiceId);active.current=owner+':'+invoiceId;
 useEffect(()=>{flight.current=null;setBusy(false);setError('');setDone(false);setConfirmation(null);return()=>{flight.current=null;};},[owner,invoiceId]);
 async function cancel(confirmedScope?:string){
  if(flight.current||done)return;
  if(confirmedScope===undefined){setConfirmation(active.current);return;}
  if(confirmedScope!==active.current)return;
  setConfirmation(null);
  const token=Symbol(),scope=active.current;flight.current=token;setBusy(true);setError('');
  try{const d=await apiFetch('/payments/mine/purchases/'+encodeURIComponent(invoiceId)+'/cancel-now',{method:'POST',body:JSON.stringify({confirmImmediateCancellation:true})});if(flight.current!==token||active.current!==scope)return;
   if(d.immediateRevocation!==true||d.noRefund!==true||d.item?._id!==invoiceId||d.item?.invoiceId!==invoiceId||d.item?.canCancelActivePurchase!==false||!Number.isFinite(Date.parse(d.item?.accessCancelledAt||'')))throw new Error('Access cancellation has not been confirmed. Refresh and retry the same purchase.');
   setDone(true);onChanged();
  }catch(e:any){if(flight.current===token&&active.current===scope)setError(e.message||'Cancellation could not be confirmed.');}
  finally{if(flight.current===token){flight.current=null;setBusy(false);}}
 }
 return <div className="billingPurchaseCancellation">{done?<FeedbackNotice variant="success">Purchase access cancelled. No refund was issued.</FeedbackNotice>:<button type="button" className="billingAction billingAction--cancel" disabled={busy} onClick={()=>void cancel()}><BillingActionIcon action="cancel"/>{busy?'Confirming cancellation…':'Cancel purchase access now'}</button>}{error&&<FeedbackNotice variant="error">{error}</FeedbackNotice>}<BillingCancellationDialog open={confirmation===owner+':'+invoiceId} title={title} onCancel={()=>setConfirmation(null)} onConfirm={()=>{if(confirmation)void cancel(confirmation);}}/></div>;
}
