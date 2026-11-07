import mongoose from 'mongoose';
import {normalizeZoomUrl} from '../utils/events.js';
const announcement=new mongoose.Schema({id:String,signature:String,status:{type:String,enum:['queued','sending','complete','cancelled']},publishedAt:Date,lastUserId:mongoose.Schema.Types.ObjectId,updated:Boolean,queued:{type:Number,default:0},leaseToken:String,leaseUntil:Date},{_id:false});
const schema=new mongoose.Schema({webinarAnnouncement:{type:announcement,select:false},title:{type:String,required:true},slug:{type:String,required:true,unique:true},type:{type:String,enum:['event','webinar'],default:'event'},zoomUrl:{type:String,default:'',validate:{validator(value){try{normalizeZoomUrl(value);return true;}catch{return false;}},message:'Use an approved HTTPS Zoom link.'}},date:Date,location:String,description:{type:String,maxlength:12000},image:String,imageFileId:String,mapUrl:String,status:{type:String,enum:['draft','published'],default:'draft'}},{timestamps:true});
schema.pre('validate',function(){if(this.type==='webinar'&&this.status==='published'&&!this.zoomUrl)this.invalidate('zoomUrl','Published webinars require a Zoom link.');});
schema.index({status:1,date:1});
schema.index({imageFileId:1});
export default mongoose.models.Event||mongoose.model('Event',schema);
