import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},sectionSlug:{type:String,required:true},
 invoice:{type:mongoose.Schema.Types.ObjectId,ref:'Invoice',required:true},
 startsAt:{type:Date,required:true},endsAt:{type:Date,required:true},
 status:{type:String,enum:['active','revoked'],default:'active'},testMode:{type:Boolean,default:false}
},{timestamps:true});
schema.index({user:1,sectionSlug:1,invoice:1},{unique:true});
schema.index({user:1,status:1,sectionSlug:1,startsAt:1,endsAt:1});
export default mongoose.models.SectionAccess||mongoose.model('SectionAccess',schema);
