'use client';
import {useEffect,startTransition} from 'react';
import {useRouter} from 'next/navigation';
import {recoverableChunkError,allowChunkReload} from '../lib/errorRecovery';
export default function ErrorPage({error,reset}:{error:Error&{digest?:string};reset:()=>void}){
 const router=useRouter();
 useEffect(()=>{
  console.error('[SA_PAGE_ERROR]',{name:error.name,digest:error.digest||'client-render'});
  if(recoverableChunkError(error)&&navigator.onLine){try{if(allowChunkReload(window.sessionStorage,'sa.chunk-recovery:'+window.location.pathname))window.location.reload();}catch{/* Storage may be blocked in private browsers; keep the manual retry. */}}
 },[error]);
 return <main className="siteStatus" role="alert"><h1>This page could not load.</h1><p>Please try again. A payment or access change should be checked in your records before you repeat it.</p>{error.digest&&<small>Support reference: {error.digest}</small>}<button type="button" className="button" onClick={()=>startTransition(()=>{router.refresh();reset();})}>Try again</button><a href="/">Return to Singh Academy</a></main>;
}
