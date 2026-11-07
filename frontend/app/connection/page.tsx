'use client';
import {useEffect,useRef,useState,useCallback} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {apiFetch,portalForPath,safeStudentNext} from '../../lib/api';
import {loginDestination} from '../../lib/pagePolicy';
/** A connection failure is not an expired session and never erases cookies. */
export default function ConnectionPage(){
 const q=useSearchParams(),router=useRouter(),raw=q.get('next')||'/home';
 // Staff returns are restricted to fixed workspace paths, not arbitrary URLs.
 const next=/^\/(?:admin|super-admin)(?:\?|$)/.test(raw)?raw:safeStudentNext(raw),portal=portalForPath(next.split('?')[0]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('We could not reach the Academy service. Your session has not been signed out.');
 const flight=useRef(false),alive=useRef(true),attempt=useRef(0);
 const retry=useCallback(async()=>{
  if(flight.current||!navigator.onLine)return;
  flight.current=true;setBusy(true);
  try{const d=await apiFetch('/auth/session?compact=1',{headers:{'X-SA-Portal':portal}});
   if(!alive.current)return;
   if(!('user' in d))throw new Error('Incomplete session reply');
   router.replace(d.user?.role===portal?next:loginDestination(next));
  }catch{if(alive.current)setMessage('The connection is still unavailable. Retry when you are online; do not repeat a payment.');}
  finally{flight.current=false;if(alive.current)setBusy(false);}
 },[next,portal,router]);
 useEffect(()=>{alive.current=true;let timer:ReturnType<typeof setTimeout>;const run=async()=>{await retry();if(alive.current&&++attempt.current<3)timer=setTimeout(run,attempt.current===1?15000:30000);};timer=setTimeout(run,5000);window.addEventListener('online',retry);return()=>{alive.current=false;clearTimeout(timer);window.removeEventListener('online',retry);};},[retry]);
 return <main className="siteStatus" role="status"><h1>Reconnecting to Singh Academy.</h1><p>{message}</p><button className="button" type="button" disabled={busy} aria-busy={busy} onClick={()=>void retry()}>{busy?'Checking connection…':'Retry connection'}</button><a href="/">Return to Singh Academy</a></main>;
}
