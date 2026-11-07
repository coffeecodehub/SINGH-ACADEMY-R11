import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 title:{type:String,required:true,maxlength:180},description:{type:String,default:'',maxlength:4000},
 videoUrl:{type:String,required:true,maxlength:2048},videoFileId:{type:String,default:null},
 teaserSeconds:{type:Number,min:10,max:20,default:15},published:{type:Boolean,default:false},
 order:{type:Number,min:0,max:10000,default:0},revision:{type:Number,default:1,min:1},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'},updatedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({published:1,order:1,createdAt:-1});
export default mongoose.models.VideoReview||mongoose.model('VideoReview',schema);
