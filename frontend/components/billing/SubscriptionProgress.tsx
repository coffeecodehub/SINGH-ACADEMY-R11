'use client';
import {useEffect,useState} from 'react';
import {subscriptionClock} from '../../lib/subscriptionClock';
export default function SubscriptionProgress({term:input}:{term:any}){
 const [clock,setClock]=useState<{base:number;at:number|null}>(()=>({base:0,at:null}));
 useEffect(()=>{const base=Date.now(),server=new Date(input.serverNow).getTime(),tick=()=>setClock({base,at:(Number.isFinite(server)?server:base)+(Date.now()-base)});tick();const visible=()=>{if(document.visibilityState==='visible')tick();};const timer=setInterval(visible,30000);document.addEventListener('visibilitychange',visible);window.addEventListener('focus',visible);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visible);window.removeEventListener('focus',visible);};},[input.serverNow,input.startsAt,input.endsAt]);
 const term=clock.at===null?input:subscriptionClock(input,new Date(clock.at));
 const known=typeof term.remainingDays==='number'&&typeof term.durationDays==='number',state=term.effectiveStatus;
 const elapsed=known?(state==='expired'?term.durationDays:['scheduled','cancelled','past_due'].includes(state)?0:Math.max(0,Math.min(term.durationDays,term.durationDays-term.remainingDays))):0;
 const percent=known&&term.durationDays>0?Math.max(0,Math.min(100,elapsed/term.durationDays*100)):0;
 return <div className={'billingProgressRing '+(state==='expired'?'isComplete':'')} role="img" aria-label={known?`${term.remainingDays} days remaining. ${elapsed} of ${term.durationDays} days elapsed. ${state}.`:'Subscription dates are not recorded.'}><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="billingRingTrack" cx="60" cy="60" r="49"/><circle className="billingRingFill" cx="60" cy="60" r="49" pathLength="100" strokeDasharray={`${percent} 100`} style={{opacity:percent>0?1:0}}/></svg><div><strong>{known?term.remainingDays:'—'}</strong><span>{state==='expired'?'Term completed':state==='scheduled'?'Days in next term':state==='cancelled'?'Cancelled':state==='past_due'?'Past due':term.remainingDays===0?'Access ends today':'Days remaining'}</span></div><small>{known?`${elapsed} / ${term.durationDays} days elapsed`:'Dates not recorded'}</small></div>;
}
