'use client';
import {useEffect,useState} from 'react';
import {useAuth} from '../components/auth/AuthProvider';
import {apiFetch} from './api';
export function useMembershipAccess(){
 const {user,ready}=useAuth(),id=user?.role==='student'?String(user.id):'';
 const [state,setState]=useState({owner:'',active:false,endsAt:''}),[revision,setRevision]=useState(0);
 useEffect(()=>{
  if(!ready||!id){setState({owner:'',active:false,endsAt:''});return;}
  const controller=new AbortController();
  apiFetch('/payments/membership-status',{signal:controller.signal}).then(d=>{if(!controller.signal.aborted)setState({owner:id,active:d.membershipActive===true,endsAt:d.membershipEndsAt||''});}).catch(()=>{/* A failed check is not evidence that an existing membership ended. The stored expiry still bounds the label. */});
  return()=>controller.abort();
 },[id,ready,revision]);
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('focus',refresh);window.addEventListener('online',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('online',refresh);};},[]);
 useEffect(()=>{
  if(!state.active||!state.endsAt)return;
  const remaining=new Date(state.endsAt).getTime()-Date.now();
  if(!Number.isFinite(remaining))return;
  const expire=()=>{if(new Date(state.endsAt).getTime()<=Date.now())setState(old=>old.owner===state.owner&&old.endsAt===state.endsAt?{...old,active:false}:old);setRevision(n=>n+1);};
  // Mark stale access inactive before rechecking. A failed expiry request must not loop every 50 ms.
  const timer=setTimeout(expire,Math.max(0,Math.min(remaining+50,2147483647)));
  return()=>clearTimeout(timer);
 },[state.owner,state.active,state.endsAt,revision]);
 return {active:state.owner===id&&!!id&&state.active&&new Date(state.endsAt).getTime()>Date.now(),endsAt:state.owner===id?state.endsAt:''};
}
