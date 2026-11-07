import SectionAccess from '../models/SectionAccess.js';
import Invoice from '../models/Invoice.js';
import {businessError} from '../utils/business.js';
import {realAccessFilter} from '../utils/commerce.js';
import {invoiceGrantEligible,validAccessDate,effectiveGrant,environmentGrants} from '../utils/courseEntitlements.js';

/** One immutable contribution per owned settled invoice; never a global subscription. */
export async function grantSectionAccess({userId,sectionSlug,startsAt,endsAt,invoice,testMode=false,session}){
 const start=validAccessDate(startsAt),end=validAccessDate(endsAt);
 if(!session||!userId||!invoice||typeof sectionSlug!=='string'||!sectionSlug||!start||!end||end<=start)throw businessError('A settled section invoice and valid access term are required.',409);
 const proof=await Invoice.findOne({_id:invoice,user:userId,kind:'section',sectionSlug}).session(session).lean();
 if(!proof||!invoiceGrantEligible(proof)||Boolean(proof.testMode)!==Boolean(testMode)||+validAccessDate(proof.grantStartsAt)!==+start||+validAccessDate(proof.grantExpiresAt)!==+end)throw businessError('The section invoice does not authorize this access term.',409);
 return SectionAccess.findOneAndUpdate({user:userId,sectionSlug,invoice},{$setOnInsert:{user:userId,sectionSlug,invoice,startsAt:start,endsAt:end,testMode:Boolean(testMode),status:'active'}},{upsert:true,new:true,runValidators:true,session});
}
export async function loadSectionGrants(userId,{sectionSlug,session=null,environment}={}){
 const rows=await SectionAccess.find({user:userId,status:'active',...(sectionSlug?{sectionSlug}:{}),...realAccessFilter()}).session(session).lean();
 if(!rows.length)return [];
 const invoices=await Invoice.find({_id:{$in:rows.map(row=>row.invoice)},user:userId,kind:'section'}).session(session).lean(),byId=new Map(invoices.map(invoice=>[String(invoice._id),invoice]));
 const grants=rows.flatMap(row=>{
  const invoice=byId.get(String(row.invoice)),start=validAccessDate(row.startsAt),end=validAccessDate(row.endsAt);
  if(!invoice||invoice.sectionSlug!==row.sectionSlug||Boolean(invoice.testMode)!==Boolean(row.testMode)||!invoiceGrantEligible(invoice)||!start||!end||end<=start||+validAccessDate(invoice.grantStartsAt)!==+start||+validAccessDate(invoice.grantExpiresAt)!==+end)return [];
  return [{key:'section:'+String(row._id),sectionSlug:row.sectionSlug,user:userId,invoice:row.invoice,courseSlug:row.sectionSlug,source:'section',testMode:row.testMode===true,startsAt:start,endsAt:end,noExpiry:false,active:true}];
 });
 const mode=environment||(realAccessFilter().testMode?'live':'all');return environmentGrants(grants,mode);
}
export async function effectiveSectionAccess(userId,sectionSlug,session=null,{now=new Date(),environment,includeScheduled=false}={}){
 const grants=await loadSectionGrants(userId,{sectionSlug,session,environment}),value=effectiveGrant(grants,now,{includeScheduled});
 return value?{...value,sectionSlug,user:userId}:null;
}
export async function effectiveSectionAccesses(userId,{session=null,now=new Date(),environment}={}){
 const grants=await loadSectionGrants(userId,{session,environment}),groups=new Map();
 for(const grant of grants){if(!groups.has(grant.sectionSlug))groups.set(grant.sectionSlug,[]);groups.get(grant.sectionSlug).push(grant);}
 return [...groups].flatMap(([sectionSlug,items])=>{const value=effectiveGrant(items,now);return value?[{...value,sectionSlug,user:userId}]:[];});
}
