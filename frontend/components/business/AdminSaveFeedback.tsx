'use client';
import {useEffect,useState} from 'react';
import FeedbackNotice from '../feedback/FeedbackNotice';
/** Acknowledges only explicit server-confirmed admin events. Keep the result
 * readable until dismissed; opening an editor or uploading a draft is not a save. */
export default function AdminSaveFeedback(){
 const [message,setMessage]=useState('');
 useEffect(()=>{
  const receive=(event:Event)=>{const value=(event as CustomEvent).detail?.message;if(typeof value==='string'&&value.trim())setMessage(value.trim().slice(0,1200));};
  window.addEventListener('sa-admin-feedback',receive);
  return()=>window.removeEventListener('sa-admin-feedback',receive);
 },[]);
 if(!message)return null;
 return <FeedbackNotice variant="success" className="saFeedbackToast" onDismiss={()=>setMessage('')}><p>{message}</p><small>Your changes have been saved.</small></FeedbackNotice>;
}
