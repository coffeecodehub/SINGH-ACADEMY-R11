'use client';
import {useEffect,useRef,useState} from 'react';
import FeedbackDialog from '../feedback/FeedbackDialog';
export function adminSaved(message:string){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('sa-admin-feedback',{detail:{message}}));}
export default function AdminConfirm({open,title='Confirm update',message='Save these changes?',busy=false,onCancel,onConfirm}:{open:boolean;title?:string;message?:string;busy?:boolean;onCancel:()=>void;onConfirm:()=>void}){
 const submitted=useRef(false),[confirming,setConfirming]=useState(false);
 useEffect(()=>{if(!open||!busy){submitted.current=false;setConfirming(false);}},[open,busy]);
 const blocked=busy||confirming;
 return <FeedbackDialog open={open} title={title} message={message} busy={blocked} onCancel={onCancel} footer={<><button data-feedback-autofocus type="button" className="saFeedbackButton saFeedbackButtonSecondary" disabled={blocked} onClick={onCancel}>Cancel</button><button type="button" className="saFeedbackButton saFeedbackButtonPrimary" aria-busy={blocked} disabled={blocked} onClick={async()=>{if(submitted.current||busy)return;submitted.current=true;setConfirming(true);try{await onConfirm();}finally{submitted.current=false;setConfirming(false);}}}>{blocked?'Saving…':'Confirm & save'}</button></>}/>;
}
