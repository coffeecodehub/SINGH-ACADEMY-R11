import Course from '../models/Course.js';
import Enrollment from '../models/Enrollment.js';
import {businessError} from '../utils/business.js';
/** Membership access lives in its owned Subscription term. These rows ONLY keep
 * library/history identities. Never overwrite/extend an individual paid grant,
 * a manual grant or a record from another payment environment. */
export async function syncMembershipCourseEnrollments({userId,startsAt,endsAt,invoice=null,testMode=false,session=null,reason='Active Academy membership'}){
 const start=new Date(startsAt),end=new Date(endsAt);
 if(!startsAt||!endsAt||!Number.isFinite(+start)||!Number.isFinite(+end)||end<=start)throw businessError('Valid membership start and end dates are required.',409);
 const courses=await Course.find({published:true}).select('slug').session(session).lean();let changed=0,preserved=0;
 for(const course of courses){
  const existing=await Enrollment.findOne({user:userId,courseSlug:course.slug}).session(session);
  if(existing){preserved++;continue;}
  await Enrollment.findOneAndUpdate({user:userId,courseSlug:course.slug},{$setOnInsert:{user:userId,courseSlug:course.slug,
   status:'active',accessStartsAt:start,accessExpiresAt:end,source:'membership',invoice:invoice||null,reason,testMode:Boolean(testMode)}},
   {upsert:true,new:true,runValidators:true,session});changed++;
 }
 return {changed,preserved,total:courses.length};
}
