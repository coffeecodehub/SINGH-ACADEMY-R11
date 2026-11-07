'use client';
import {useEffect,useState} from 'react';
import {paidAccessClock,paidAccessDate,type PaidAccess} from '../../lib/paidAccessClock';
import './paid-access-indicator.css';

export default function PaidAccessIndicator({access:input,renewHref,compact=false}:{access?:PaidAccess|null;renewHref?:string|null;compact?:boolean}){
 const [at,setAt]=useState<Date|null>(null),[info,setInfo]=useState(false);
 useEffect(()=>{
  if(!input)return;
  const base=Date.now(),server=Date.parse(input.serverNow),tick=()=>setAt(new Date((Number.isFinite(server)?server:base)+Date.now()-base)),visible=()=>{if(document.visibilityState==='visible')tick();};
  tick();const timer=setInterval(visible,30000);window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{clearInterval(timer);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[input]);
 const access=input?(at?paidAccessClock(input,at):input):null,state=access?.status||'unknown',known=typeof access?.remainingDays==='number',lifetime=access?.noExpiry===true&&state!=='cancelled',date=paidAccessDate(access?.cancelledAt||access?.endsAt);
 const label=lifetime?'No scheduled expiry':state==='pending'?'Awaiting payment':state==='cancelled'?'Cancelled':state==='expired'?'Expired':state==='scheduled'?'Days in next term':known&&access?.remainingDays===0?'Access ends today':known?'Days remaining':'Dates not recorded';
 const percent=lifetime?100:typeof access?.remainingPercent==='number'?access.remainingPercent:0;
 const explanation='The confirmed paid access end date is shown in UTC. The day counter changes at UTC midnight; access ends at its exact recorded time. Disabling automatic renewal keeps the paid term. A future charge date does not extend access.';
 const href=typeof renewHref==='string'&&renewHref.startsWith('/')&&!renewHref.startsWith('//')?renewHref:null;
 return <div className={'paidAccessIndicator'+(compact?' paidAccessIndicator--compact':'')} data-paid-access-state={state}>
  <div className="paidAccessCircle" role="img" aria-label={lifetime?'No scheduled expiry':known?`${access!.remainingDays} days remaining. ${label}.`:`Paid access: ${label}.`}>
   <svg className="paidAccessRing" viewBox="0 0 100 100" aria-hidden="true"><circle className="paidAccessTrack" cx="50" cy="50" r="44"/><circle className="paidAccessFill" cx="50" cy="50" r="44" pathLength="100" strokeDasharray={`${Math.max(0,Math.min(100,percent))} 100`}/></svg>
   <div className="paidAccessCircleText"><svg className="paidAccessCalendar" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v5m8-5v5M4 11h16m-11 4h2m2 0h2m-6 3h2"/></svg><strong>{lifetime?'∞':known?access!.remainingDays:'—'}</strong><span>{label}</span></div>
  </div>
  <div className="paidAccessDetails"><div className="paidAccessHeading">Expiration date <button type="button" className="paidAccessInfo" aria-label="About expiration date" aria-expanded={info} onClick={()=>setInfo(value=>!value)}><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M10 9v5m0-8v1" strokeWidth="1.7"/></svg></button></div><strong className="paidAccessDate">{lifetime?'No scheduled expiry':state==='pending'?'Awaiting confirmation':date}</strong>{href&&!lifetime&&state!=='pending'&&<a className="paidAccessRenew" href={href}>Renew</a>}{info&&<p className="paidAccessExplanation" role="note">{explanation}</p>}</div>
 </div>;
}
