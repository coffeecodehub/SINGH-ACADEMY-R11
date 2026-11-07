/** Additive review uniqueness preparation. Never removes records or old indexes. */
import {equivalentIndex} from '../utils/indexPolicy.js';
export async function prepareReviewIndexes(collection,{apply=false}={}) {
 let indexes=[];
 try { indexes=await collection.listIndexes().toArray(); }
 catch(error) { if(error.code!==26&&error.codeName!=='NamespaceNotFound')throw error; }
 const key={user:1},options={name:'one_review_per_student',unique:true};
 if(indexes.some(index=>equivalentIndex(index,key,options)))return {status:'passed',readOnly:!apply,created:false,duplicateUsers:[],message:'Review uniqueness is already enforced.'};
 const duplicates=await collection.aggregate([
  {$group:{_id:'$user',count:{$sum:1}}},{$match:{count:{$gt:1}}},{$sort:{count:-1}},{$limit:21},
 ]).toArray();
 const duplicateUsers=duplicates.map(row=>({userId:String(row._id),count:row.count}));
 if(duplicateUsers.length)return {status:'blocked',readOnly:!apply,created:false,duplicateUsers,truncated:duplicateUsers.length===21,message:'Duplicate reviews need manual review before adding uniqueness. No records or indexes were changed.'};
 if(!apply)return {status:'missing',readOnly:true,created:false,duplicateUsers:[],message:'No duplicates found. Review the database target before running with --apply.'};
 // Building the unique index is itself the atomic final check: a concurrent
 // duplicate insert makes Mongo reject it rather than accepting a weak index.
 await collection.createIndex(key,options);
 return {status:'passed',readOnly:false,created:true,duplicateUsers:[],message:'Full student-review uniqueness added. Existing indexes and records were retained.'};
}
