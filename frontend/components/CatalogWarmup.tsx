'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {useAuth} from './auth/AuthProvider';
import {useWebsiteContent} from './WebsiteContent';
import {apiFetch,accountEpoch} from '../lib/api';
import {canWarmCatalogImages,warmCatalogImages} from '../lib/imageWarmup';
import {contentPageKey} from '../lib/pageSections';
/** Foreground-only, deduplicated data + first-row photo preparation. Never
 * prefetch payments/learning and never mutate enrollment or start a video. */
export default function CatalogWarmup(){
 const {user,ready,portal}=useAuth(),pathname=usePathname()||'/',website=useWebsiteContent();
 useEffect(()=>{
  if(!ready||portal!=='student'||/^\/(?:checkout|learn|billing)(?:\/|$)/.test(pathname)||!canWarmCatalogImages())return;
  const controller=new AbortController(),epoch=accountEpoch(portal),requested=new Set<string>();
  const valid=()=>!controller.signal.aborted&&epoch===accountEpoch(portal);
  const warm=async(path:string)=>{
   if(!valid()||!canWarmCatalogImages()||requested.has(path)||requested.size>=16)return;
   requested.add(path);
   try{const data=await apiFetch(path,{signal:controller.signal});if(valid())warmCatalogImages(path,data,website.images,valid);}catch{/* Warmup must never clear working content or interrupt navigation. */}
  };
  // Academy Plans now displays sections as well as courses. Prepare its data
  // alongside Team/Events, retaining the small shared photo/network budget.
  const warmPage=(path:string)=>{const key=contentPageKey(path);if(key)void warm('/page-sections/'+key);if(path==='/'||path==='/video-reviews')void warm('/video-reviews');};
  const timer=setTimeout(()=>{void Promise.all((user?['/sections','/courses','/content/team','/content/events']:['/content/landing','/content/team','/content/events']).map(warm));warmPage(pathname);},['/academy','/sections','/courses','/team','/events'].includes(pathname)?100:800);
  const intent=(event:Event)=>{
   if(!(event.target instanceof Element))return;
   const link=event.target.closest('a[href]');if(!link)return;
   try{const url=new URL(link.getAttribute('href')||'',window.location.origin);if(url.origin!==window.location.origin)return;
    if(url.pathname==='/academy'&&user){void warm('/sections');void warm('/courses');}
    else if(url.pathname==='/sections'&&user)void warm('/sections');
    else if(url.pathname==='/courses'&&user)void warm('/courses');
    else if(url.pathname==='/team')void warm('/content/team');
    else if(url.pathname==='/events')void warm('/content/events');
    warmPage(url.pathname);
   }catch{}
  };
  document.addEventListener('pointerover',intent);document.addEventListener('focusin',intent);document.addEventListener('touchstart',intent,{passive:true});
  return()=>{clearTimeout(timer);controller.abort();document.removeEventListener('pointerover',intent);document.removeEventListener('focusin',intent);document.removeEventListener('touchstart',intent);};
 },[ready,user?.id,portal,pathname,website.images]);
 return null;
}
