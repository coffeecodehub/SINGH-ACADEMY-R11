/** Billing presentation only. These snapshots never authorize or extend access. */
import {subscriptionDisplay} from './subscriptionDisplay.js';
import {validAccessDate,invoiceGrantEligible,invoiceCourseGrants,effectiveGrant} from './courseEntitlements.js';
const same=(a,b)=>a!=null&&b!=null&&String(a)===String(b);
const productField=kind=>kind==='course'?'courseSlug':kind==='section'?'sectionSlug':'planName';
const iso=value=>validAccessDate(value)?.toISOString()||null;

export function paidAccessDisplay(grant,{now=new Date(),pending=false,cancelledAt=null}={}){
 const cancellation=iso(cancelledAt),base={confirmed:false,status:pending?'pending':'unknown',startsAt:null,endsAt:null,cancelledAt:cancellation,noExpiry:false,durationDays:null,remainingDays:null,remainingPercent:null,serverNow:new Date(now).toISOString(),dayCountBasis:'utc-calendar'};
 const start=validAccessDate(grant?.startsAt),end=validAccessDate(grant?.endsAt),noExpiry=grant?.noExpiry===true&&grant?.endsAt==null;
 if(!start||(!noExpiry&&(!end||end<=start)))return cancellation?{...base,status:'cancelled',remainingDays:0,remainingPercent:0}:base;
 const known={...base,confirmed:true,startsAt:start.toISOString(),endsAt:end?.toISOString()||null,noExpiry};
 if(cancellation)return {...known,status:'cancelled',remainingDays:0,remainingPercent:0};
 if(noExpiry)return {...known,status:start>now?'scheduled':'lifetime'};
 const clock=subscriptionDisplay({status:'active',startsAt:start,endsAt:end},now);
 return {...known,status:clock.effectiveStatus,durationDays:clock.durationDays,remainingDays:clock.remainingDays,remainingPercent:clock.remainingPercent};
}

/** Only saved, fulfilled financial evidence supplies a displayed interval.
 * Cancellation can retain the historical interval without restoring its grant. */
export function invoiceDisplayGrant(invoice,{history=[invoice],includeCancelled=false}={}){
 if(!invoice)return null;
 const evidence=includeCancelled&&validAccessDate(invoice.accessCancelledAt)?{...invoice,accessRevokedAt:null,grantSuppressed:false}:invoice;
 if(!invoiceGrantEligible(evidence))return null;
 if(invoice.kind==='course'){
  const rows=history.map(row=>same(row._id,invoice._id)?evidence:row);
  return invoiceCourseGrants(rows).grants.find(grant=>same(grant.invoice,invoice._id))||null;
 }
 const explicit=invoice.grantVersion===1,start=validAccessDate(explicit?invoice.grantStartsAt:invoice.accessStartsAt),end=validAccessDate(explicit?invoice.grantExpiresAt:invoice.accessExpiresAt),noExpiry=(explicit?invoice.grantNoExpiry:invoice.noScheduledExpiry)===true;
 if(!start||(noExpiry?(explicit?invoice.grantExpiresAt:invoice.accessExpiresAt)!=null:!end||end<=start))return null;
 return {startsAt:start,endsAt:noExpiry?null:end,noExpiry,testMode:invoice.testMode===true,active:true};
}

export function invoicePaidAccess(invoice,{owner,kind,product,testMode,history,now=new Date(),cancelledAt}={}){
 if(!invoice||owner!=null&&!same(invoice.user,owner)||kind&&invoice.kind!==kind||product&&invoice[productField(kind||invoice.kind)]!==product||testMode!==undefined&&Boolean(invoice.testMode)!==Boolean(testMode))return paidAccessDisplay(null,{now});
 return paidAccessDisplay(invoiceDisplayGrant(invoice,{history,includeCancelled:true}),{now,cancelledAt:cancelledAt||invoice.accessCancelledAt});
}

/** Check every link again even when a database adapter returns unexpected rows.
 * Provider dates/status and unpaid checkout snapshots are never financial evidence. */
export function agreementPaidAccess(userId,agreement,order,invoices,{now=new Date()}={}){
 const linked=agreement&&order&&same(agreement.user,userId)&&same(order.user,userId)&&same(order._id,agreement.checkoutOrder)&&same(order.billingAgreement,agreement._id)&&order.provider===agreement.provider&&order.environment===agreement.environment&&order.kind===agreement.kind&&order.product===agreement.product;
 if(!linked)return paidAccessDisplay(null,{now});
 if(['creating','pending'].includes(order.status))return paidAccessDisplay(null,{now,pending:true});
 const source=agreement.renewalSetup===true||order.renewalSetup===true?agreement.sourceInvoiceId||order.sourceInvoiceId:null;
 const owned=invoices.filter(invoice=>same(invoice.user,userId)&&invoice.kind===agreement.kind&&invoice[productField(agreement.kind)]===agreement.product&&Boolean(invoice.testMode)===(agreement.environment==='test'));
 const candidates=owned.filter(invoice=>same(invoice.billingAgreement,agreement._id)||same(invoice._id,source)||order.status==='paid'&&same(invoice._id,order.invoice));
 const cancellation=agreement.accessCancelledAt;
 const grants=candidates.flatMap(invoice=>{const grant=invoiceDisplayGrant(invoice,{history:owned,includeCancelled:Boolean(cancellation)});return grant?[grant]:[];});
 const current=effectiveGrant(grants,now,{includeScheduled:true});
 const latest=current?null:grants.filter(grant=>grant.endsAt).sort((a,b)=>+b.endsAt-+a.endsAt)[0];
 return paidAccessDisplay(current?{startsAt:current.accessStartsAt,endsAt:current.accessExpiresAt,noExpiry:current.accessExpiresAt===null}:latest,{now,cancelledAt:cancellation});
}

export function legacyPaidAccess(term,userId,{now=new Date()}={}){
 const access=invoicePaidAccess(term.invoice,{owner:userId,kind:'membership',product:term.plan,testMode:term.testMode,now,cancelledAt:term.accessCancelledAt});
 if(access.confirmed&&['cancelled','past_due','expired'].includes(term.status))return {...access,status:term.status==='cancelled'?'cancelled':term.status==='expired'?'expired':'unknown',remainingDays:term.status==='past_due'?null:0,remainingPercent:term.status==='past_due'?null:0};
 return access;
}
