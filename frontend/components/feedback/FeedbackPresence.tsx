'use client';
import {createContext,useContext,useLayoutEffect,useRef,useState,type ReactElement,type ReactNode} from 'react';
import {canAnimateFeedbackExit,FEEDBACK_EXIT_MS,reconcileFeedbackPresentation,type FeedbackPresentation} from '../../lib/feedbackPresence';
export const FeedbackScopeContext=createContext('site');
const PresenceContext=createContext<{present:boolean;onExitComplete:()=>void}|null>(null);
export const useFeedbackScope=()=>useContext(FeedbackScopeContext);
export const useFeedbackPresence=()=>useContext(PresenceContext);
/** Keep the caller-owned fiber/context in place while its one native dialog exits. */
export default function FeedbackPresence({children,contain=false}:{children:ReactElement|null|false|undefined;contain?:boolean}){
 const scope=useFeedbackScope(),value=children||null,key=value?String(value.key??'feedback'):'';
 const latest=useRef({value,key,scope});latest.current={value,key,scope};
 const [shown,setShown]=useState<FeedbackPresentation<ReactElement>>(()=>({value,key,scope,leaving:false}));
 const next=reconcileFeedbackPresentation(shown,value,key,scope);
 if(next!==shown)setShown(next);
 const complete=()=>setShown(current=>{if(!current.leaving||current.scope!==scope)return current;return {...latest.current,leaving:false};});
 useLayoutEffect(()=>{
  if(!next.leaving)return;
  if(!canAnimateFeedbackExit()){complete();return;}
  const timer=setTimeout(complete,FEEDBACK_EXIT_MS+50);return()=>clearTimeout(timer);
 },[next.leaving,next.key,next.scope]);
 if(!next.value)return null;
 const content:ReactNode=contain?<div className="saFeedbackPresence" inert={next.leaving||undefined} aria-hidden={next.leaving||undefined} onClickCapture={event=>{if(next.leaving){event.preventDefault();event.stopPropagation();}}} onSubmitCapture={event=>{if(next.leaving){event.preventDefault();event.stopPropagation();}}}>{next.value}</div>:next.value;
 return <PresenceContext.Provider value={{present:!next.leaving,onExitComplete:complete}}>{content}</PresenceContext.Provider>;
}
