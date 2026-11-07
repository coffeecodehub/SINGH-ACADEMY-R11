import {subscriptionClock} from './subscriptionClock';
export type PaidAccess={confirmed:boolean;status:string;startsAt:string|null;endsAt:string|null;cancelledAt:string|null;noExpiry:boolean;durationDays:number|null;remainingDays:number|null;remainingPercent:number|null;serverNow:string;dayCountBasis?:string};
/** Advance only an already confirmed display snapshot; never use provider dates. */
export function paidAccessClock(access:PaidAccess,now=new Date()):PaidAccess{
 if(!access.confirmed||['unknown','pending','cancelled'].includes(access.status))return access;
 if(access.noExpiry)return {...access,status:access.startsAt&&new Date(access.startsAt)>now?'scheduled':'lifetime'};
 if(access.status==='expired')return access;
 const clock=subscriptionClock({status:'active',startsAt:access.startsAt,endsAt:access.endsAt},now);
 if(typeof clock.remainingDays!=='number'||typeof clock.durationDays!=='number')return access;
 return {...access,status:clock.effectiveStatus,durationDays:clock.durationDays,remainingDays:clock.remainingDays,remainingPercent:Math.max(0,Math.min(100,clock.remainingDays/clock.durationDays*100))};
}
export function paidAccessDate(value:string|null|undefined){return value&&Number.isFinite(new Date(value).getTime())?new Date(value).toISOString().slice(0,10):'Not recorded';}
