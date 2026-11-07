import {httpError} from './cmsValidation.js';
export const approvedReviewQuery=()=>({status:'approved',approvedBy:{$type:'objectId'},approvedAt:{$type:'date'}});
export function reviewStatusQuery(status){
 if(status==='approved')return approvedReviewQuery();
 if(status==='pending')return {$or:[{status:'pending'},{status:'approved',$or:[{approvedBy:{$not:{$type:'objectId'}}},{approvedAt:{$not:{$type:'date'}}}]}]};
 return {status};
}
export function adminReviewDTO(item){
 const raw=typeof item.toObject==='function'?item.toObject():item,{approvedBy,approvedAt,...out}=raw;
 const proof=approvedBy&&typeof approvedBy==='object'&&approvedBy._bsontype==='ObjectId'&&approvedAt instanceof Date&&Number.isFinite(+approvedAt);
 return raw.status==='approved'&&!proof?{...out,status:'pending',legacyApprovalRequired:true}:out;
}
/** Numeric revision guards edits even when timestamps share the same millisecond. */
export function reviewWriteGuard(body){
 const revision=body?.revision,updatedAt=typeof body?.updatedAt==='string'?new Date(body.updatedAt):null;
 if(!Number.isSafeInteger(revision)||revision<0||!updatedAt||!Number.isFinite(+updatedAt))throw httpError(409,'Reload the review before deciding or saving changes.');
 return {updatedAt,...(revision===0?{$or:[{revision:0},{revision:{$exists:false}}]}:{revision})};
}
