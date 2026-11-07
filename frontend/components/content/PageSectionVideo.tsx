'use client';
import {useEffect,useRef,useState} from 'react';
import ReviewVideo from '../video-reviews/ReviewVideo';
import {reviewVideoSource,reviewPreviewSeconds} from '../../lib/videoReviews';
import '../video-reviews/video-reviews.css';

/** The original remains the full video. Only the silent inline preview loops. */
export default function PageSectionVideo({url,title,seconds=15,previewRendition}:{url:string;title:string;seconds?:number;previewRendition?:string}){
 const [open,setOpen]=useState(false),modal=useRef<HTMLElement>(null),source=reviewVideoSource(url),label=title||'Page video';
 useEffect(()=>{
  if(!open)return;
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const controls=()=>Array.from(modal.current?.querySelectorAll<HTMLElement>('button,a[href],video,iframe')||[]);
  controls()[0]?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();setOpen(false);return;}
   if(event.key!=='Tab')return;
   const list=controls(),first=list[0],last=list[list.length-1];if(!first)return;
   if(event.shiftKey&&(document.activeElement===first||!modal.current?.contains(document.activeElement))){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(document.activeElement===last||!modal.current?.contains(document.activeElement))){event.preventDefault();first.focus();}
  };
  document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[open]);
 if(!source)return null;
 return <div className="pageSectionVideoPlayer">
  <div className="videoReviewPreview pageSectionVideoPreview"><ReviewVideo url={url} title={label} preview seconds={reviewPreviewSeconds(seconds)} previewRendition={previewRendition} paused={open}/><button type="button" className="videoReviewOpen" aria-label={`Open full page video: ${label}`} onClick={()=>setOpen(true)}><span aria-hidden="true">{source.kind==='external'?'↗':'▶'}</span><b>{source.kind==='external'?'Open video':'Watch full video'}</b></button></div>
  {open&&<div className="videoReviewBackdrop" onClick={()=>setOpen(false)}><section ref={modal} className="videoReviewModal" role="dialog" aria-modal="true" aria-label={label} onClick={event=>event.stopPropagation()}><button type="button" className="videoReviewClose" aria-label="Close page video" onClick={()=>setOpen(false)}>×</button><h2>{label}</h2><ReviewVideo key={url} url={url} title={label} preview={false}/></section></div>}
 </div>;
}
