'use client';
import {useEffect} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {useAuth} from './AuthProvider';
import {publicPage,loginDestination} from '../../lib/pagePolicy';
/** Root and its existing team-member preview stay public. Only destination
 * links are gated: preview-card/close buttons must run their local callbacks.
 * Auth/legal/external links remain exceptions; direct URLs stay server guarded. */
export default function LandingAuthGate(){
 const {user,ready,signingOut,signedOut}=useAuth(),router=useRouter(),pathname=usePathname();
 useEffect(()=>{if(pathname==='/'&&ready&&user?.role==='student'&&!signedOut&&!signingOut)router.replace('/home');},[pathname,ready,user?.id,signedOut,signingOut,router]);
 useEffect(()=>{
  if(pathname!=='/'||user)return;
  const clicked=(event:MouseEvent)=>{
   const target=event.target instanceof Element?event.target.closest<HTMLElement>('a,button'):null;
   if(!target)return;
   let next='';
   if(target instanceof HTMLAnchorElement){
    const u=new URL(target.href,window.location.origin);
    if(u.origin!==window.location.origin||!/^https?:$/.test(u.protocol))return;
    if(u.pathname==='/'&&!u.hash)return; // Logo/home is intentionally public.
    if(u.pathname!=='/'&&publicPage(u.pathname))return;
    if(/^\/(?:api|images|optimized|_next)(?:\/|$)/.test(u.pathname))return;
    next=u.pathname+u.search+u.hash;
   }else return; // Team preview, close, mobile menu, retry and form controls stay local.
   event.preventDefault();event.stopPropagation();
   router.push(loginDestination(next));
  };
  document.addEventListener('click',clicked,true);
  return()=>document.removeEventListener('click',clicked,true);
 },[pathname,user?.id,router]);
 return null;
}
