'use client';
import FeedbackNotice from './feedback/FeedbackNotice';
export default function ApiLoadError({message,onRetry,busy=false}:{message:string;onRetry:()=>void;busy?:boolean}){
 return <FeedbackNotice variant="error" title="Unable to load this content right now."><p>{message}</p><button type="button" className="pill" disabled={busy} onClick={onRetry}>{busy?'Retrying…':'Retry'}</button></FeedbackNotice>;
}
