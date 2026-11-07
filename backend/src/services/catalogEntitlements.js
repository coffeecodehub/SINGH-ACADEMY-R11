import Course from '../models/Course.js';
import Subscription from '../models/Subscription.js';
import {effectiveCourseEnrollment,effectiveCourseEnrollments} from './courseEntitlements.js';
import {effectiveSectionAccess,effectiveSectionAccesses} from './sectionAccess.js';
import {realAccessFilter} from '../utils/commerce.js';
import {businessError} from '../utils/business.js';

function accessEnvironment(environment){return realAccessFilter().testMode?'live':environment;}
async function activeMembership(userId,{session=null,now=new Date(),environment}={}){
 const mode=accessEnvironment(environment);
 return Subscription.findOne({user:userId,status:'active',...(mode?{testMode:mode==='test'?true:{$ne:true}}:{}),...realAccessFilter(),startsAt:{$lte:now},endsAt:{$gt:now}}).select('startsAt endsAt testMode').sort({endsAt:-1}).session(session).lean();
}
/** Small owned metadata only: no curriculum/progress reads or authorization cache. */
export async function catalogAccessSnapshot(userId,{now=new Date()}={}){
 const [courses,sections,membership]=await Promise.all([
  effectiveCourseEnrollments(userId,{now}),effectiveSectionAccesses(userId,{now}),activeMembership(userId,{now})
 ]);
 return {membershipActive:Boolean(membership),membershipEndsAt:membership?.endsAt||null,
  courseAccesses:courses.map(row=>({courseSlug:row.courseSlug,startsAt:row.accessStartsAt,endsAt:row.accessExpiresAt})),
  sectionAccesses:sections.map(row=>({sectionSlug:row.sectionSlug,startsAt:row.accessStartsAt,endsAt:row.accessExpiresAt})),serverNow:now};
}
/** Checkout uses the same owned grants as learning. An individual course does
 * not cover its whole section, and financial environments never merge. */
export async function activePurchaseCoverage(userId,kind,product,{session=null,now=new Date(),environment}={}){
 if(!['course','section'].includes(kind))return null;
 const mode=accessEnvironment(environment);
 if(kind==='course'){
  const course=await Course.findOne({slug:product,published:true}).select('sectionSlug').session(session).lean();
  if(!course)return null;
  const direct=await effectiveCourseEnrollment(userId,product,session,{now,environment:mode});
  if(direct)return {type:'course',access:direct};
  if(course.sectionSlug){const section=await effectiveSectionAccess(userId,course.sectionSlug,session,{now,environment:mode});if(section)return {type:'section',access:section};}
 }else{
  const section=await effectiveSectionAccess(userId,product,session,{now,environment:mode});
  if(section)return {type:'section',access:section};
 }
 const membership=await activeMembership(userId,{session,now,environment:mode});
 return membership?{type:'membership',access:membership}:null;
}
export async function assertNoActivePurchase(userId,kind,product,options={}){
 if(!await activePurchaseCoverage(userId,kind,product,options))return;
 const error=businessError('Your active access already includes this '+(kind==='section'?'section':'course')+'. Open it to continue learning. You can purchase access again after it expires.',409);
 error.code='ACTIVE_ACCESS_EXISTS';throw error;
}
