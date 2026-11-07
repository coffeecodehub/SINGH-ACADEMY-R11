'use client';
import {useLayoutEffect,useId,useRef,useState,type ReactNode} from 'react';
import type {FeedbackVariant} from '../../lib/feedback';
import {FeedbackIcon} from './FeedbackNotice';
import {useFeedbackPresence,useFeedbackScope} from './FeedbackPresence';
import {canAnimateFeedbackExit,FEEDBACK_EXIT_MS,feedbackPresentationScope} from '../../lib/feedbackPresence';
import './feedback.css';
let scrollLocks=0,previousOverflow='';
const modalStack:HTMLDialogElement[]=[];
/** Native top-layer dialog works above existing form dialogs and restores its opener. */
export default function FeedbackDialog({open,title,message,children,footer,header,labelledBy,onCancel,busy=false,variant='confirm',wide=false,className='',showIcon=true}:{open:boolean;title:string;message?:ReactNode;children?:ReactNode;footer?:ReactNode;header?:ReactNode;labelledBy?:string;onCancel:()=>void;busy?:boolean;variant?:FeedbackVariant;wide?:boolean;className?:string;showIcon?:boolean}){
 const dialog=useRef<HTMLDialogElement>(null),cancel=useRef(onCancel),blocked=useRef(busy),titleId=useId(),messageId=useId();cancel.current=onCancel;blocked.current=busy;
 const presence=useFeedbackPresence(),scope=useFeedbackScope(),[retained,setRetained]=useState(open),capturedScope=useRef(scope),wasOpen=useRef(open),currentScope=useRef(scope);currentScope.current=scope;
 if(!open)wasOpen.current=false;else if(!wasOpen.current){wasOpen.current=true;capturedScope.current=scope;}
 const sameScope=capturedScope.current===scope,active=open&&presence?.present!==false&&sameScope,activeRef=useRef(active);activeRef.current=active;
 const snapshot=useRef({title,message,children,footer,header,labelledBy,variant,wide,className,showIcon});if(active)snapshot.current={title,message,children,footer,header,labelledBy,variant,wide,className,showIcon};
 const displayed=active?{title,message,children,footer,header,labelledBy,variant,wide,className,showIcon}:snapshot.current;
 const complete=()=>{if(activeRef.current)return;setRetained(false);presence?.onExitComplete();};
 useLayoutEffect(()=>{
  if(!active){if(retained){if(!sameScope||!canAnimateFeedbackExit()){complete();return;}const timer=setTimeout(complete,FEEDBACK_EXIT_MS+35);return()=>clearTimeout(timer);}return;}
  setRetained(true);
  const element=dialog.current,opener=document.activeElement as HTMLElement|null;
  if(!element)return;
  const openingScope=scope;
  if(!scrollLocks++) {previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';}
  if(!element.open)element.showModal();
  modalStack.push(element);
  const initial=element.querySelector<HTMLElement>('[data-feedback-autofocus]:not(:disabled):not([hidden])')||element.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]');initial?.focus();
  const key=(event:KeyboardEvent)=>{
   // A nested modal owns its own keyboard interaction.
   if(modalStack[modalStack.length-1]!==element)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!blocked.current)cancel.current();return;}
   if(event.key!=='Tab')return;
   const controls=Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(node=>!node.hidden);
   const first=controls[0],last=controls[controls.length-1];if(!first){event.preventDefault();element.focus();return;}
   if(event.shiftKey&&(document.activeElement===first||!element.contains(document.activeElement))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!element.contains(document.activeElement))){event.preventDefault();first.focus();}
  };
  element.addEventListener('keydown',key);
  return()=>{element.removeEventListener('keydown',key);const index=modalStack.indexOf(element);if(index>=0)modalStack.splice(index,1);if(element.open)element.close();if(!--scrollLocks)document.body.style.overflow=previousOverflow;const authoritativeScope=feedbackPresentationScope();if(currentScope.current===openingScope&&(!authoritativeScope||authoritativeScope===openingScope)&&opener?.isConnected)opener.focus();};
 },[active,scope]);
 if(!sameScope||!active&&!retained)return null;
 const preventClosingAction=(event:{preventDefault:()=>void;stopPropagation:()=>void})=>{if(!activeRef.current){event.preventDefault();event.stopPropagation();}};
 return <dialog ref={dialog} data-feedback-state={active?'open':'closing'} inert={!active||undefined} aria-hidden={!active||undefined} className={'saFeedbackDialog saFeedbackDialog--'+displayed.variant+(displayed.wide?' saFeedbackDialogWide':'')+(displayed.className?' '+displayed.className:'')} aria-modal={active?'true':'false'} aria-labelledby={displayed.labelledBy||titleId} aria-describedby={displayed.message?messageId:undefined} onTransitionEnd={event=>{if(!active&&event.target===event.currentTarget&&event.propertyName==='opacity')complete();}} onClickCapture={preventClosingAction} onSubmitCapture={preventClosingAction} onCancel={event=>{event.preventDefault();if(active&&!busy)onCancel();}} onClick={event=>{if(active&&event.target===event.currentTarget&&!busy){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onCancel();}}}>{displayed.header?<>{displayed.header}{displayed.children}</>:<div className="saFeedbackDialogBody">{displayed.showIcon&&<span className="saFeedbackDialogIcon"><FeedbackIcon variant={displayed.variant}/></span>}<h2 id={titleId}>{displayed.title}</h2>{displayed.message&&<div id={messageId} className="saFeedbackDialogMessage">{displayed.message}</div>}{displayed.children}</div>}{displayed.footer&&<div className="saFeedbackDialogActions">{displayed.footer}</div>}</dialog>;
}
