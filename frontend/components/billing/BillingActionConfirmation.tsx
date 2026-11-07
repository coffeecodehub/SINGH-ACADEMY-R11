'use client';
import {useEffect,useRef,useState} from 'react';
import FeedbackDialog from '../feedback/FeedbackDialog';

export type BillingAction='enable'|'disable'|'cancel';

export function BillingActionIcon({action}:{action:BillingAction}){
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/>{action==='enable'?<path d="m7.5 12 3 3 6-6"/>:action==='disable'?<path d="M9 8v8m6-8v8"/>:<path d="m8.5 8.5 7 7m0-7-7 7"/>}</svg>;
}

/** Consent UI only: opening, dismissing or focusing this card never changes billing. */
export default function BillingActionConfirmation({open,action,title,subject='this course',message,onCancel,onConfirm}:{open:boolean;action:BillingAction;title:string;subject?:string;message:string;onCancel:()=>void;onConfirm:()=>void}){
  const submitted=useRef(false);
  const [confirming,setConfirming]=useState(false);
  useEffect(()=>{
    if(!open)return;
    submitted.current=false;setConfirming(false);
  },[open]);
  return <FeedbackDialog open={open} title={`Are you sure you want to ${action} ${subject}?`} variant={action==='enable'?'confirm':'warning'} className={'billingActionConfirm--'+action} busy={confirming} onCancel={()=>{if(!submitted.current)onCancel();}} message={<><p className="billingConfirmProduct">{title||'Selected course'}</p><p>{message}</p></>} footer={<><button data-feedback-autofocus type="button" className="saFeedbackButton saFeedbackButtonSecondary" disabled={confirming} onClick={()=>{if(!submitted.current)onCancel();}}>Cancel</button><button type="button" className="saFeedbackButton saFeedbackButtonPrimary" disabled={confirming} onClick={()=>{if(submitted.current)return;submitted.current=true;setConfirming(true);onConfirm();}}><BillingActionIcon action={action}/>{confirming?'Confirming…':'Confirm'}</button></>}/>;
}
