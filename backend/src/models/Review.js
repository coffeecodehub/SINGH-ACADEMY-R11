import mongoose from 'mongoose';
const schema=new mongoose.Schema({user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},name:{type:String,required:true},rating:{type:Number,min:1,max:5,required:true},message:{type:String,required:true,trim:true,maxlength:2000},status:{type:String,enum:['pending','approved','rejected'],default:'pending'},revision:{type:Number,min:0,default:0,validate:Number.isSafeInteger},approvedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},approvedAt:{type:Date,default:null}},{timestamps:true});
schema.index({status:1,createdAt:-1});
// One review per student. New and edited submissions require administrator approval.
// Existing duplicate data must be reviewed before the additive migration runs.
schema.index({user:1},{name:'one_review_per_student',unique:true});
export default mongoose.models.Review||mongoose.model('Review',schema);
