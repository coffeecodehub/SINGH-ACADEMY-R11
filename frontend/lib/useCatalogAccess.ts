'use client';
import {useCallback,useEffect,useState} from 'react';
import {useAuth} from '../components/auth/AuthProvider';
import {accountEpoch,apiFetch,isAbortError} from './api';

type AccessTerm={startsAt:string;endsAt:string|null};
type CourseTerm=AccessTerm&{courseSlug:string};
type SectionTerm=AccessTerm&{sectionSlug:string};
export type CatalogCoverage=AccessTerm&{type:'course'|'section'|'membership'|'free';label:string};
type Snapshot={owner:string;checked:boolean;error:string;membershipActive:boolean;membershipEndsAt:string|null;courseAccesses:CourseTerm[];sectionAccesses:SectionTerm[];offset:number};
const empty:Snapshot={owner:'',checked:false,error:'',membershipActive:false,membershipEndsAt:null,courseAccesses:[],sectionAccesses:[],offset:0};
const date=(value:unknown)=>typeof value==='string'&&Number.isFinite(new Date(value).getTime())?new Date(value).getTime():null;
const active=(term:AccessTerm,now:number)=>{const start=date(term.startsAt),end=date(term.endsAt);return start!==null&&start<=now&&(term.endsAt===null||end!==null&&end>now);};

/** Lightweight owned access metadata only; no lesson/progress or shared cache. */
export function useCatalogAccess(){
 const {user,ready}=useAuth(),id=user?.role==='student'?String(user.id||user._id||''):'';
 const scope=id?[id,user?.country||'',accountEpoch('student')].join(':'):'';
 const [state,setState]=useState<Snapshot>(empty),[revision,setRevision]=useState(0),[clock,setClock]=useState(0);
 const refresh=useCallback(()=>setRevision(value=>value+1),[]);
 useEffect(()=>{
  if(!ready||!id){setState(empty);return;}
  const controller=new AbortController();
  apiFetch('/payments/membership-status',{signal:controller.signal}).then(value=>{
   if(!Array.isArray(value.courseAccesses)||!Array.isArray(value.sectionAccesses))throw new Error('Your access could not be confirmed. Please retry.');
   if(controller.signal.aborted)return;
   const serverTime=date(value.serverNow);
   setState({owner:scope,checked:true,error:'',membershipActive:value.membershipActive===true,membershipEndsAt:value.membershipEndsAt||null,
    courseAccesses:value.courseAccesses,sectionAccesses:value.sectionAccesses,offset:serverTime===null?0:serverTime-Date.now()});
  }).catch(error=>{
   if(controller.signal.aborted||isAbortError(error))return;
   setState(previous=>({...(previous.owner===scope?previous:empty),owner:scope,error:error.message||'Unable to check your access. Please retry.'}));
  });
  return()=>controller.abort();
 },[id,scope,ready,revision]);
 useEffect(()=>{
  const visible=()=>{if(document.visibilityState==='visible'&&navigator.onLine)refresh();};
  window.addEventListener('focus',visible);window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);
  const interval=setInterval(visible,30000);
  return()=>{window.removeEventListener('focus',visible);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);clearInterval(interval);};
 },[refresh]);
 const current=state.owner===scope&&!!id?state:empty,now=Date.now()+current.offset;
 useEffect(()=>{
  if(state.owner!==scope||!id)return;
  const at=Date.now()+state.offset,ends=[state.membershipActive?state.membershipEndsAt:null,...state.courseAccesses.map(term=>term.endsAt),...state.sectionAccesses.map(term=>term.endsAt)].map(date).filter((end):end is number=>end!==null&&end>at);
  if(!ends.length)return;
  const timer=setTimeout(()=>{setClock(value=>value+1);refresh();},Math.min(Math.min(...ends)-at,2147483647));
  return()=>clearTimeout(timer);
 },[state,scope,id,clock,refresh]);
 const membershipActive=current.membershipActive&&date(current.membershipEndsAt)!==null&&new Date(current.membershipEndsAt!).getTime()>now;
 const membership=():CatalogCoverage|null=>membershipActive?{type:'membership',label:'Membership Access',startsAt:'',endsAt:current.membershipEndsAt}:null;
 function sectionAccess(product:string|{slug?:string}):CatalogCoverage|null{
  const slug=typeof product==='string'?product:product?.slug;
  const term=current.sectionAccesses.find(item=>item.sectionSlug===slug&&active(item,now));
  return term?{...term,type:'section',label:'Section Access'}:membership();
 }
 function courseAccess(product:{slug?:string;sectionSlug?:string;accessType?:string}):CatalogCoverage|null{
  if(product?.accessType==='free')return {type:'free',label:'Free Course',startsAt:'',endsAt:null};
  const term=current.courseAccesses.find(item=>item.courseSlug===product?.slug&&active(item,now));
  if(term)return {...term,type:'course',label:'Course Access'};
  if(product?.sectionSlug){const section=current.sectionAccesses.find(item=>item.sectionSlug===product.sectionSlug&&active(item,now));if(section)return {...section,type:'section',label:'Section Access'};}
  return membership();
 }
 return {scope,checking:!ready||!!id&&!current.checked&&!current.error,unavailable:!!id&&!current.checked&&!!current.error,error:current.error,membershipActive,courseAccess,sectionAccess,refresh};
}
