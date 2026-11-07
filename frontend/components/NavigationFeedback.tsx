'use client';
import {useEffect,useRef,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
/** Feedback only. Does not intercept/replay navigation, authentication or writes. */
export default function NavigationFeedback(){
 const path=usePathname(),query=useSearchParams(),[target,setTarget]=useState(''),[slow,setSlow]=useState(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const clear=()=>{if(timer.current)clearTimeout(timer.current);timer.current=null;setTarget('');setSlow(false);};
 useEffect(()=>{clear();},[path,query]);
 useEffect(()=>{
  const begin=(href:string)=>{const url=new URL(href,window.location.href);if(url.origin!==window.location.origin||!['http:','https:'].includes(url.protocol))return;if(timer.current)clearTimeout(timer.current);setTarget(url.pathname+url.search+url.hash);setSlow(false);timer.current=setTimeout(()=>setSlow(true),10000);};
  const requested=(event:Event)=>{const href=(event as CustomEvent).detail?.href;if(typeof href==='string')try{begin(href);}catch{}};
  const clicked=(event:MouseEvent)=>{
   if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!(event.target instanceof Element))return;
   const anchor=event.target.closest<HTMLAnchorElement>('a[href]');
   if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self')||anchor.getAttribute('aria-disabled')==='true')return;
   const url=new URL(anchor.href,window.location.href);
   if(url.origin!==window.location.origin||!['http:','https:'].includes(url.protocol)||/^\/(?:api|_next|images|optimized)(?:\/|$)/.test(url.pathname))return;
   if(url.pathname===window.location.pathname&&url.search===window.location.search)return;
   begin(url.href);
  };
  const restored=()=>clear();
  document.addEventListener('click',clicked,true);window.addEventListener('pageshow',restored);window.addEventListener('sa:navigation',requested);
  return()=>{document.removeEventListener('click',clicked,true);window.removeEventListener('pageshow',restored);window.removeEventListener('sa:navigation',requested);if(timer.current)clearTimeout(timer.current);};
 },[]);
 if(!target)return null;
 return <div className="saNavigationFeedback" role="status" aria-live="polite"><i aria-hidden="true"/><span>{slow?'This page is taking longer to open.':'Opening page…'}</span>{slow&&<><a href={target}>Continue to page</a><button type="button" onClick={clear} aria-label="Dismiss navigation status">×</button></>}</div>;
}
