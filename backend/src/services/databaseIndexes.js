import VideoReview from '../models/VideoReview.js';
import User from '../models/User.js';import AuthSession from '../models/AuthSession.js';import RateLimit from '../models/RateLimit.js';
import CheckoutOrder from '../models/CheckoutOrder.js';import Invoice from '../models/Invoice.js';import Payment from '../models/Payment.js';import Refund from '../models/Refund.js';
import Subscription from '../models/Subscription.js';import Enrollment from '../models/Enrollment.js';import GatewayEvent from '../models/GatewayEvent.js';
import StudentNotification from '../models/StudentNotification.js';import CourseAttempt from '../models/CourseAttempt.js';import LessonSubmission from '../models/LessonSubmission.js';
import CourseCompletion from '../models/CourseCompletion.js';import Progress from '../models/Progress.js';
import Section from '../models/Section.js';import Coupon from '../models/Coupon.js';import SectionAccess from '../models/SectionAccess.js';
import BillingAgreement from '../models/BillingAgreement.js';import Review from '../models/Review.js';
import {requiredIndexPlan} from '../utils/indexPolicy.js';
export const indexedModels=[User,AuthSession,RateLimit,CheckoutOrder,Invoice,Payment,Refund,Subscription,Enrollment,GatewayEvent,StudentNotification,CourseAttempt,LessonSubmission,CourseCompletion,Progress,Section,Coupon,SectionAccess,BillingAgreement,Review,VideoReview];
export async function databaseIndexReport({apply=false,criticalOnly=false}={}){
 const entries=[],models=new Map(indexedModels.map(m=>[m.collection.name,m]));
 for(const model of indexedModels){
  let actual=[];try{actual=await model.collection.listIndexes().toArray();}catch(e){if(e.code!==26&&e.codeName!=='NamespaceNotFound')throw e;}
  entries.push(...requiredIndexPlan(model,actual).filter(item=>!criticalOnly||item.options.unique||item.options.expireAfterSeconds!=null));
 }
 // Inspect ALL conflicts before any additions. Never drop/sync indexes or delete
 // duplicate financial records. A duplicate-key build error also stops further additions.
 const conflicts=entries.some(item=>item.status==='missing'&&item.conflicting.length);
 let error=null;
 if(apply&&!conflicts){for(const item of entries.filter(x=>x.status==='missing')){
  try{await models.get(item.collection).collection.createIndex(item.key,item.options);item.status='created';}
  catch(e){item.status='failed';item.error=String(e.code||e.name);error='An additive index build failed; no indexes or records were deleted.';break;}
 }}
 return {checkedAt:new Date().toISOString(),readOnly:!apply,status:entries.every(x=>['present','created'].includes(x.status))?'passed':'failed',
  ...(conflicts?{error:'Existing indexes have conflicting options. No indexes were added or dropped; review manually.'}:error?{error}:{}),entries};
}
export async function assertCriticalIndexes(){
 const report=await databaseIndexReport({criticalOnly:true});
 if(report.status!=='passed')throw new Error('Required database uniqueness/TTL indexes are not verified. Run npm --prefix backend run db:check, then review/add missing indexes with db:prepare -- --apply. No production data was reset.');
 return report;
}
