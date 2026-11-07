/** UTC calendar display only. Never used to authorize paid access. */
export function subscriptionClock(term:any,now=new Date()){
 const valid=(v:any)=>v!=null&&v!==''&&Number.isFinite(new Date(v).getTime());
 if(!valid(term.startsAt)||!valid(term.endsAt)||!valid(now))return term;
 const start=new Date(term.startsAt).getTime(),end=new Date(term.endsAt).getTime(),at=now.getTime(),day=86400000;
 if(end<=start)return term;
 const state=term.status==='cancelled'?'cancelled':term.status==='past_due'?'past_due':term.status==='expired'?'expired':term.status!=='active'?'needs_review':at>=end?'expired':at<start?'scheduled':'active';
 const durationDays=Math.max(1,Math.ceil((end-start)/day));
 const remainingDays=state==='needs_review'?null:['cancelled','past_due','expired'].includes(state)?0:state==='scheduled'?durationDays:Math.max(0,durationDays-Math.max(0,Math.floor(at/day)-Math.floor(start/day)));
 return {...term,effectiveStatus:state,durationDays,remainingDays,dayCountBasis:'utc-calendar'};
}
