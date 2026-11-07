'use client';
import {useEffect,useState,useCallback,useSyncExternalStore} from 'react';
import {apiFetch,isAbortError,invalidatePublicApi,publicApiSnapshot,publicApiScope,subscribePublicApi} from './api';
import {usePublicInitialArray} from '../components/PublicInitialData';
const serverSnapshot=()=>null;
/** Preserve last successfully loaded PUBLIC content on a transient refresh failure. */
export function usePublicResource<T=any>(path:string,field:string){
 // Hydration retains the server's initial array; client navigation can render
 // prefetched account-bound content immediately, before the request effect.
 const cached=useSyncExternalStore(subscribePublicApi,()=>publicApiSnapshot(path)||null,serverSnapshot),scope=publicApiScope(path);
 const requestInitial=usePublicInitialArray(path,field);
 const [initial]=useState<T[]|null>(()=>requestInitial);
 const [revision,setRevision]=useState(0);
 const [state,setState]=useState<{path:string;scope:string;field:string;data:T[];loading:boolean;loaded:boolean;error:string}>(()=>({path,scope,field,data:initial||[],loading:initial===null,loaded:initial!==null,error:''}));
 const retry=useCallback(()=>{invalidatePublicApi();setRevision(x=>x+1);},[]);
 useEffect(()=>{
  if(!path)return;
  const controller=new AbortController();
  const cached=publicApiSnapshot(path);if(Array.isArray(cached?.[field]))setState({path,scope,field,data:cached[field],loading:false,loaded:true,error:''});
  setState(old=>old.scope===scope&&old.field===field?{...old,loading:!old.loaded,error:''}:{path,scope,field,data:[],loading:true,loaded:false,error:''});
  apiFetch(path,{signal:controller.signal}).then(d=>{if(!Array.isArray(d[field]))throw new Error('The service returned incomplete content. Please retry.');if(!controller.signal.aborted)setState({path,scope,field,data:d[field],loading:false,loaded:true,error:''});}).catch(e=>{if(!isAbortError(e)&&!controller.signal.aborted)setState(old=>({...old,path,scope,field,loading:false,error:e.message||'Unable to load content.'}));});
  return()=>controller.abort();
 },[path,field,scope,revision]);
 useEffect(()=>{const focused=()=>{if(document.visibilityState==='visible'&&navigator.onLine)setRevision(x=>x+1);};const changed=(event:Event)=>{invalidatePublicApi(event);setRevision(x=>x+1);};const timer=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)setRevision(x=>x+1);},30000);document.addEventListener('visibilitychange',focused);window.addEventListener('online',focused);window.addEventListener('focus',focused);window.addEventListener('sa-website-content',changed);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',focused);window.removeEventListener('online',focused);window.removeEventListener('focus',focused);window.removeEventListener('sa-website-content',changed);};},[]);
 const current=state.scope===scope&&state.field===field?state:{path,scope,field,data:[] as T[],loading:true,loaded:false,error:''};
 return {...current,...((!current.loaded||initial!==null&&current.data===initial)&&Array.isArray(cached?.[field])?{data:cached[field] as T[],loading:false,loaded:true}:{}),retry};
}
