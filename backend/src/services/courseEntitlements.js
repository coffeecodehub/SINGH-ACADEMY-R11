import Invoice from '../models/Invoice.js';
import Enrollment from '../models/Enrollment.js';
import {realAccessFilter} from '../utils/commerce.js';
import {invoiceCourseGrants,manualEnrollmentGrants,environmentGrants,effectiveGrant} from '../utils/courseEntitlements.js';

/** Always read owned financial evidence. No cross-request/user authorization cache.
 * Invoice grants and membership Subscription terms are independent sources;
 * legacy cumulative enrollment dates are never financial evidence. */
export async function loadCourseEntitlements(userId,{courseSlug,session=null,environment}={}) {
 const owned={user:userId,...(courseSlug?{courseSlug}:{} )};
 const invoiceQuery=()=>Invoice.find({...owned,kind:'course'}).select('_id user courseSlug kind status paidAt createdAt fulfillmentAt origin totalMinor paidMinor creditedMinor testMode accessStartsAt accessExpiresAt noScheduledExpiry durationMonths accessDays grantVersion grantStartsAt grantExpiresAt grantNoExpiry grantSuppressed accessRevokedAt discountFull coupon subtotalMinor discountMinor').session(session).lean();
 const enrollmentQuery=()=>Enrollment.find(owned).select('_id user courseSlug source status accessStartsAt accessExpiresAt invoice testMode +baseGrant').session(session).lean();
 // The MongoDB driver does not support parallel operations on one transaction.
 // Parallelize independent reads only OUTSIDE a transaction.
 const [invoices,enrollments]=session?[await invoiceQuery(),await enrollmentQuery()]:await Promise.all([invoiceQuery(),enrollmentQuery()]);
 const derived=invoiceCourseGrants(invoices);
 const mode=environment||((realAccessFilter().testMode)?'live':'all');
 const grants=environmentGrants([...derived.grants,...enrollments.flatMap(manualEnrollmentGrants)],mode);
 return {grants,issues:derived.issues,enrollments};
}
export async function effectiveCourseEnrollment(userId,courseSlug,session=null,{environment,now=new Date(),includeScheduled=false}={}) {
 const data=await loadCourseEntitlements(userId,{courseSlug,session,environment});
 const value=effectiveGrant(data.grants,now,{includeScheduled});
 if(!value)return null;
 const row=data.enrollments.find(e=>e.courseSlug===courseSlug);
 return {...value,...(row?{_id:row._id}:{}),user:userId};
}
export async function effectiveCourseEnrollments(userId,{session=null,now=new Date(),environment}={}) {
 const data=await loadCourseEntitlements(userId,{session,environment});
 const groups=new Map();for(const grant of data.grants){if(!groups.has(grant.courseSlug))groups.set(grant.courseSlug,[]);groups.get(grant.courseSlug).push(grant);}
 const rows=new Map(data.enrollments.map(e=>[e.courseSlug,e]));
 return [...groups].flatMap(([slug,grants])=>{const g=effectiveGrant(grants,now);return g?[{...g,user:userId,...(rows.has(slug)?{_id:rows.get(slug)._id}:{})}]:[];});
}
/** Retain a provable non-financial base grant before the display row is updated.
 * Paid invoices remain the source of every purchased interval. */
export function baseGrantSnapshot(row){
 if(row?.baseGrant)return row.baseGrant;
 if(!row||row.invoice||!['legacy','free','complimentary'].includes(row.source||'legacy'))return undefined;
 return {source:row.source||'legacy',status:row.status,accessStartsAt:row.accessStartsAt,
  accessExpiresAt:row.accessExpiresAt??null,testMode:row.testMode===true,grantedBy:row.grantedBy,reason:row.reason};
}
