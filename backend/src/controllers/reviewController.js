import Review from '../models/Review.js';
import {text,businessError} from '../utils/business.js';
import {catalogCache} from '../services/catalogCache.js';
import {approvedReviewQuery} from '../utils/reviews.js';
export async function listReviews(req,res){
 const reviews=await Review.find(approvedReviewQuery()).select('name rating message createdAt updatedAt').sort({updatedAt:-1,createdAt:-1}).limit(100).lean();
 res.set('Cache-Control','no-store');
 res.json({success:true,reviews});
}
export async function createReview(req,res){
 const rating=Number(req.body?.rating),message=text(req.body?.message,'Review',2000,10);
 if(!Number.isInteger(rating)||rating<1||rating>5)throw businessError('Choose a rating from 1 to 5.');
 const filter={user:req.user._id},update={$set:{name:req.user.name,rating,message,status:'pending',approvedBy:null,approvedAt:null},$inc:{revision:1}};
 let review;
 try{review=await Review.findOneAndUpdate(filter,update,{upsert:true,new:true,runValidators:true,setDefaultsOnInsert:true});}
 catch(error){
  // An initial concurrent upsert may lose to the unique user index. Update the
  // winner rather than inserting another review or returning 500.
  if(error.code!==11000)throw error;
  review=await Review.findOneAndUpdate(filter,update,{new:true,runValidators:true});
  if(!review)throw error;
 }
 const publicReview={_id:review._id,name:review.name,rating:review.rating,message:review.message,status:'pending',createdAt:review.createdAt,updatedAt:review.updatedAt};
 catalogCache.clear();
 res.set('Cache-Control','no-store');
 res.status(201).json({success:true,message:'Thank you. Your review is awaiting administrator approval.',review:publicReview});
}
