/** Invoice-backed access grants. Enrollment rows are library/progress identities,
 * not a place to merge paid membership dates. No database/network side effects. */
import {addMonths,afterDays} from './business.js';

export function validAccessDate(value) {
 if(value===null||value===undefined||value==='')return null;
 const date=new Date(value);return Number.isFinite(+date)?date:null;
}
export function grantActive(grant,now=new Date()) {
 const start=validAccessDate(grant?.startsAt),end=validAccessDate(grant?.endsAt);
 return Boolean(grant&&grant.active!==false&&start&&start<=now&&
  (grant.noExpiry===true&&!end||end&&end>now));
}
function endFor(invoice,start) {
 if(Number.isInteger(invoice.durationMonths)&&invoice.durationMonths>=1&&invoice.durationMonths<=120)return addMonths(start,invoice.durationMonths);
 if(Number.isInteger(invoice.accessDays)&&invoice.accessDays>0&&invoice.accessDays<=36500)return afterDays(start,invoice.accessDays);
 return null;
}
export function fullyDiscountedInvoice(invoice){
 return invoice.origin==='coupon'&&invoice.discountFull===true&&Boolean(invoice.coupon)&&invoice.grantVersion===1&&
  Number.isSafeInteger(invoice.subtotalMinor)&&invoice.subtotalMinor>0&&invoice.discountMinor===invoice.subtotalMinor&&
  invoice.totalMinor===0&&invoice.paidMinor===0&&(invoice.creditedMinor??0)===0;
}
export function invoiceGrantEligible(invoice) {
 const money=fullyDiscountedInvoice(invoice)||(Number.isSafeInteger(invoice.totalMinor)&&invoice.totalMinor>0&&
  Number.isSafeInteger(invoice.paidMinor)&&invoice.paidMinor>=invoice.totalMinor&&
  Number.isSafeInteger(invoice.creditedMinor??0)&&(invoice.creditedMinor??0)>=0&&(invoice.creditedMinor??0)<invoice.totalMinor);
 return invoice.status==='paid'&&Boolean(validAccessDate(invoice.fulfillmentAt))&&money&&!invoice.accessRevokedAt&&invoice.grantSuppressed!==true;
}
/** Old invoices sometimes store the cumulative start of earlier course access.
 * Recover only a UNIQUE contribution interval justified by saved invoice terms.
 * Refunds do not erase the old interval used to interpret a later renewal.
 * Unknown/ambiguous records are reported, never given invented lifetime access. */
export function invoiceCourseGrants(invoices) {
 const ordered=[...invoices].sort((a,b)=>{
  const time=x=>+(validAccessDate(x.paidAt)||validAccessDate(x.createdAt)||new Date(0));
  return time(a)-time(b)||String(a._id).localeCompare(String(b._id));
 });
 const grants=[],issues=[],prior=new Map();
 for(const invoice of ordered){
  if(invoice.kind!=='course'||!invoice.courseSlug)continue;
  const key=[String(invoice.user),invoice.courseSlug,invoice.testMode===true?'test':'live'].join(':');
  const history=prior.get(key)||[];
  const start=validAccessDate(invoice.accessStartsAt),savedEnd=validAccessDate(invoice.accessExpiresAt);
  let from=null,end=null,noExpiry=false,issue='';
  if(invoice.grantSuppressed===true)continue;
  if(invoice.grantVersion===1){
   from=validAccessDate(invoice.grantStartsAt);end=validAccessDate(invoice.grantExpiresAt);noExpiry=invoice.grantNoExpiry===true;
   if(!from||(!noExpiry&&(!end||end<=from))||(noExpiry&&invoice.grantExpiresAt!=null))issue='Invalid explicit invoice grant interval';
  }else if(!start){issue='Missing invoice access start';}
  else if(invoice.noScheduledExpiry===true){from=start;noExpiry=true;}
  else {
   // Earlier manual invoices did not persist their end: a stored, explicit term
   // still determines it. An absent term is not treated as unlimited access.
   end=savedEnd||endFor(invoice,start);
   if(!end)issue='Missing invoice end and usable term';
   else {
    const candidates=[start,...history.map(x=>x.endsAt).filter(Boolean)];
    const matches=[...new Set(candidates.filter(x=>x>=start&&x<end&&
     endFor(invoice,x)?.getTime()===end.getTime()).map(Number))];
    if(matches.length===1)from=new Date(matches[0]);
    else if(!invoice.durationMonths&&!invoice.accessDays&&savedEnd&&savedEnd>start){
     // Legacy imported finite grant: exact stored dates, not a guessed renewal.
     from=start;
    }else issue=matches.length?'Ambiguous historical invoice contribution':'Stored invoice dates do not match its paid term';
   }
  }
  const snapshotEnd=savedEnd||end;
  if(snapshotEnd)history.push({endsAt:snapshotEnd});
  prior.set(key,history);
  if(issue){
   if(invoice.status==='paid'&&invoice.fulfillmentAt&&!invoice.accessRevokedAt&&(invoice.creditedMinor??0)<invoice.totalMinor)
    issues.push({invoiceId:String(invoice._id),courseSlug:invoice.courseSlug,reason:issue});
   continue;
  }
  if(invoice.status==='paid'&&invoice.fulfillmentAt&&!invoice.accessRevokedAt&&invoice.grantSuppressed!==true&&
    !fullyDiscountedInvoice(invoice)&&(!Number.isSafeInteger(invoice.totalMinor)||invoice.totalMinor<=0||!Number.isSafeInteger(invoice.paidMinor)||invoice.paidMinor<invoice.totalMinor||
      !Number.isSafeInteger(invoice.creditedMinor??0)||(invoice.creditedMinor??0)<0||(invoice.creditedMinor??0)>invoice.totalMinor))
    issues.push({invoiceId:String(invoice._id),courseSlug:invoice.courseSlug,reason:'Paid invoice has inconsistent monetary totals; no grant inferred'});
  if(!invoiceGrantEligible(invoice))continue;
  grants.push({key:'invoice:'+String(invoice._id),invoice:invoice._id,user:invoice.user,
   courseSlug:invoice.courseSlug,testMode:invoice.testMode===true,startsAt:from,endsAt:noExpiry?null:end,noExpiry,
   source:invoice.origin==='online_checkout'?'provider':'manual_payment',active:true});
 }
 return {grants,issues};
}
/** Only deliberately granted, non-invoice course access may use an enrollment
 * as evidence. A membership row NEVER grants access without its subscription. */
export function manualEnrollmentGrants(enrollment) {
 if(!enrollment)return [];
 const sources=[];
 if(!enrollment.invoice&&['legacy','free','complimentary'].includes(enrollment.source||'legacy'))sources.push(enrollment);
 if(enrollment.baseGrant)sources.push({...enrollment.baseGrant,user:enrollment.user,courseSlug:enrollment.courseSlug});
 return sources.flatMap((item,index)=>{
  if(item.status!=='active'||item.invoice||!['legacy','free','complimentary'].includes(item.source||'legacy'))return [];
  const start=validAccessDate(item.accessStartsAt),end=validAccessDate(item.accessExpiresAt);
  if(!start||(item.accessExpiresAt!=null&&!end)||(end&&end<=start))return [];
  return [{key:`manual:${enrollment._id}:${index}`,user:enrollment.user,courseSlug:enrollment.courseSlug,
   testMode:item.testMode===true,startsAt:start,endsAt:end,noExpiry:item.accessExpiresAt==null,
   source:item.source||'legacy',active:true}];
 });
}
export function environmentGrants(grants,environment) {
 return environment==='live'?grants.filter(g=>g.testMode!==true):environment==='test'?grants.filter(g=>g.testMode===true):grants;
}
/** Union ONLY contiguous grants of the SAME environment. A future renewal does
 * not bridge an unpaid gap; refunded/void/suppressed invoices are already gone. */
export function effectiveGrant(grants,now=new Date(),{includeScheduled=false}={}) {
 const active=grants.filter(g=>grantActive(g,now));
 let anchor=active.find(g=>!g.testMode)||active[0];
 if(!anchor&&includeScheduled)anchor=grants.filter(g=>g.active!==false&&g.startsAt>now)
  .sort((a,b)=>+a.startsAt-+b.startsAt)[0];
 if(!anchor)return null;
 const same=grants.filter(g=>g.active!==false&&g.testMode===anchor.testMode);
 let start=new Date(anchor.startsAt),end=anchor.noExpiry?null:new Date(anchor.endsAt),changed=true;
 while(changed){changed=false;for(const g of same){
  if((end===null||g.startsAt<=end)&&(g.noExpiry||g.endsAt>=start)){
   if(g.startsAt<start){start=new Date(g.startsAt);changed=true;}
   if(end!==null&&(g.noExpiry||g.endsAt>end)){end=g.noExpiry?null:new Date(g.endsAt);changed=true;}
  }
 }}
 return {status:'active',source:anchor.source,invoice:anchor.invoice||null,testMode:anchor.testMode,
  accessStartsAt:start,accessExpiresAt:end,courseSlug:anchor.courseSlug};
}
