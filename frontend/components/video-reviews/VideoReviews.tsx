'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePublicResource} from '../../lib/usePublicResource';
import {reviewVideoSource,reviewPreviewSeconds,type VideoReview} from '../../lib/videoReviews';
import ReviewVideo from './ReviewVideo';
import FeedbackNotice from '../feedback/FeedbackNotice';
import './video-reviews.css';
export default function VideoReviews({landing=false}:{landing?:boolean}){
 const {data:items,loading,error,retry}=usePublicResource<VideoReview>('/video-reviews','items');
 const [active,setActive]=useState<VideoReview|null>(null);
 const modal=useRef<HTMLElement>(null);
 useEffect(()=>{
  if(!active)return;const previous=document.activeElement instanceof HTMLElement?document.activeElement:null,overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const controls=()=>Array.from(modal.current?.querySelectorAll<HTMLElement>('button,a[href],video,iframe')||[]);
  controls()[0]?.focus();const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setActive(null);}if(event.key==='Tab'){const list=controls(),first=list[0],last=list[list.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}};
  document.addEventListener('keydown',key);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
 },[active]);
 const shown=landing?items.slice(0,6):items;
 if(landing&&!loading&&!error&&!items.length)return null;
 return <section className="section videoReviews" aria-labelledby={landing?'landing-video-reviews-title':'video-reviews-title'}>
  {landing&&<div className="sectionHead"><div><span className="kicker">LEARNER PERSPECTIVES</span><h2 id="landing-video-reviews-title">Video reviews.</h2></div><Link className="textLink" href="/video-reviews">All video reviews →</Link></div>}
  {!landing&&<h2 id="video-reviews-title" className="videoReviewSrOnly">Published video reviews</h2>}
  {loading&&<p role="status">Loading video reviews…</p>}{error&&<FeedbackNotice variant="error">{error} <button type="button" className="pill" onClick={retry}>Retry video reviews</button></FeedbackNotice>}
  {!loading&&!error&&!items.length&&<p className="emptyState">Published video reviews will appear here.</p>}
  <div className="videoReviewGrid">{shown.map((item,index)=>{const source=reviewVideoSource(item.videoUrl);return <article className="videoReviewCard" key={item._id}>
   <div className="videoReviewPreview"><ReviewVideo url={item.videoUrl} title={item.title} preview previewRendition={item.previewRendition} priorityPoster={!landing&&index===0} seconds={reviewPreviewSeconds(item.teaserSeconds)} paused={!!active}/><button type="button" className="videoReviewOpen" onClick={()=>setActive(item)} aria-label={(source?.kind==='external'?'Open video review: ':'Watch full video review: ')+item.title}><span aria-hidden="true">{source?.kind==='external'?'↗':'▶'}</span><b>{source?.kind==='external'?'Open review':'Watch full video'}</b></button></div>
   <div className="videoReviewCopy"><h3>{item.title}</h3>{item.description&&<p>{item.description}</p>}</div>
  </article>;})}</div>
  {active&&<div className="videoReviewBackdrop" onClick={()=>setActive(null)}><section className="videoReviewModal" ref={modal} role="dialog" aria-modal="true" aria-labelledby="full-video-review-title" onClick={event=>event.stopPropagation()}><button type="button" className="videoReviewClose" aria-label="Close video review" onClick={()=>setActive(null)}>×</button><h2 id="full-video-review-title">{active.title}</h2><ReviewVideo key={active._id} url={active.videoUrl} title={active.title} preview={false}/>{active.description&&<p>{active.description}</p>}</section></div>}
 </section>;
}
