'use client';
import type {ReactNode} from 'react';
import type {FeedbackVariant} from '../../lib/feedback';
import './feedback.css';
export const feedbackTitles:Record<FeedbackVariant,string>={success:'Update confirmed',error:'Something needs attention',warning:'Please review',info:'Good to know',confirm:'Confirm your choice'};
export function FeedbackIcon({variant='info'}:{variant?:FeedbackVariant}){
 return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{variant==='warning'?<><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/></>:<><circle cx="12" cy="12" r="9"/>{variant==='success'||variant==='confirm'?<path d="m7.5 12 3 3 6-6"/>:variant==='error'?<path d="m9 9 6 6m0-6-6 6"/>:<path d="M12 11v6m0-10h.01"/>}</>}</svg>;
}
export default function FeedbackNotice({variant='info',title,children,onDismiss,className='',id}:{variant?:FeedbackVariant;title?:string;children:ReactNode;onDismiss?:()=>void;className?:string;id?:string}){
 return <div id={id} className={'saFeedback saFeedback--'+variant+(className?' '+className:'')} role={variant==='error'?'alert':'status'} aria-live={variant==='error'?'assertive':'polite'} aria-atomic="true"><span className="saFeedbackIcon"><FeedbackIcon variant={variant}/></span><div className="saFeedbackContent"><strong>{title||feedbackTitles[variant]}</strong><div className="saFeedbackMessage">{children}</div></div>{onDismiss&&<button type="button" className="saFeedbackDismiss" aria-label="Dismiss message" onClick={onDismiss}>×</button>}</div>;
}
