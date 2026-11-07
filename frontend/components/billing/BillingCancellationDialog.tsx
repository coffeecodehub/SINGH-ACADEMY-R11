'use client';
import {useEffect,useRef,useState} from 'react';
import {BillingActionIcon} from './BillingActionConfirmation';
import FeedbackDialog from '../feedback/FeedbackDialog';

/** Explicit two-step consent; opening or advancing this card never mutates billing. */
export default function BillingCancellationDialog({open,title,onCancel,onConfirm}:{open:boolean;title:string;onCancel:()=>void;onConfirm:()=>void}){
 const [acknowledged,setAcknowledged]=useState(false),[step,setStep]=useState(1);
 const submitted=useRef(false);
 useEffect(()=>{if(!open)return;setAcknowledged(false);setStep(1);submitted.current=false;
 },[open]);
 return <FeedbackDialog open={open} title={step===1?'Before you cancel':'Confirm cancellation'} variant="warning" className="billingActionConfirm--cancel" onCancel={onCancel} message={<><span className="kicker">SUBSCRIPTION CONTROL · STEP {step} OF 2</span><p className="billingConfirmProduct">{title||'Selected purchase'}</p><div className="billingConfirmWarning"><strong>Access ends immediately once cancellation is confirmed.</strong><p>The selected purchase/subscription access will end, and its future recurring charges will stop. Payment is non-refundable except where required by law. Other independent purchases and your payment history remain unchanged.</p></div></>}>
  {step===1?<label className="billingConfirmAcknowledgement"><input type="checkbox" checked={acknowledged} onChange={event=>setAcknowledged(event.target.checked)}/>I understand that selected access ends immediately and payment is non-refundable.</label>:<p role="status">You can keep your access by going back. To stop only future charges and retain your paid period, close this card and use Disable automatic renewal.</p>}
  <div className="saFeedbackDialogInlineActions"><button data-feedback-autofocus type="button" className="saFeedbackButton saFeedbackButtonSecondary" onClick={onCancel}>Keep my access</button>{step===2&&<button type="button" className="saFeedbackButton saFeedbackButtonSecondary" onClick={()=>setStep(1)}>Back</button>}{step===1?<button type="button" className="saFeedbackButton saFeedbackButtonPrimary" disabled={!acknowledged} onClick={()=>{if(acknowledged)setStep(2);}}>Next: review cancellation</button>:<button type="button" className="saFeedbackButton saFeedbackButtonPrimary" onClick={()=>{if(!acknowledged||submitted.current)return;submitted.current=true;onConfirm();}}><BillingActionIcon action="cancel"/>Confirm cancellation now</button>}</div>
 </FeedbackDialog>;
}
