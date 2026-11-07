'use client';
import {useEffect,useState,useSyncExternalStore,type ReactNode} from 'react';
import {feedback,type FeedbackRequest} from '../../lib/feedback';
import FeedbackDialog from './FeedbackDialog';
import {feedbackTitles} from './FeedbackNotice';
import FeedbackPresence,{FeedbackScopeContext} from './FeedbackPresence';
import {markFeedbackPresentationScope} from '../../lib/feedbackPresence';
const serverSnapshot=()=>null;
function Decision({request}:{request:FeedbackRequest}){
 const {id,kind,options}=request,[value,setValue]=useState(options.defaultValue||'');
 const variant=options.variant||(kind==='alert'?'info':'confirm');
 const accept=()=>{if(kind==='prompt'&&options.required&&!value.trim())return;feedback.resolve(id,kind==='prompt'?value:true);};
 return <FeedbackDialog open title={options.title||feedbackTitles[variant]} message={options.message} variant={variant} onCancel={()=>feedback.resolve(id,kind==='confirm'?false:null)} footer={<>{kind!=='alert'&&<button data-feedback-autofocus={kind==='confirm'?'true':undefined} type="button" className="saFeedbackButton saFeedbackButtonSecondary" onClick={()=>feedback.resolve(id,kind==='confirm'?false:null)}>{options.cancelLabel||'Cancel'}</button>}<button type="button" className="saFeedbackButton saFeedbackButtonPrimary" disabled={kind==='prompt'&&options.required&&!value.trim()} onClick={accept}>{options.confirmLabel||(kind==='alert'?'Got it':'Confirm')}</button></>}>{kind==='prompt'&&<form className="saFeedbackPrompt" onSubmit={event=>{event.preventDefault();accept();}}><label>{options.inputLabel||'Your response'}<input data-feedback-autofocus value={value} onChange={event=>setValue(event.target.value)} placeholder={options.placeholder} required={options.required} maxLength={options.maxLength||12000}/></label></form>}</FeedbackDialog>;
}
export default function FeedbackProvider({children,scope='site'}:{children:ReactNode;scope?:string}){
 feedback.markScope(scope);
 markFeedbackPresentationScope(scope);
 const request=useSyncExternalStore(feedback.subscribe,feedback.getSnapshot,serverSnapshot);
 useEffect(()=>feedback.connect(scope),[scope]);
 return <FeedbackScopeContext.Provider value={scope}>{children}<FeedbackPresence>{request&&request.scope===scope?<Decision key={request.id} request={request}/>:null}</FeedbackPresence></FeedbackScopeContext.Provider>;
}
