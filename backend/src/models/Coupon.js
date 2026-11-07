import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 code:{type:String,required:true,unique:true},percentOff:{type:Number,required:true,min:1,max:100},
 kind:{type:String,enum:['course','section'],required:true},productSlug:{type:String,required:true},
 expiresAt:{type:Date,required:true},active:{type:Boolean,default:true},
 claimedOrder:{type:mongoose.Schema.Types.ObjectId,ref:'CheckoutOrder',default:null},
 claimedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null},claimedAt:Date,
 redeemedOrder:{type:mongoose.Schema.Types.ObjectId,ref:'CheckoutOrder',default:null},redeemedAt:{type:Date,default:null},
 createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User'}
},{timestamps:true});
schema.index({kind:1,productSlug:1,active:1});
export default mongoose.models.Coupon||mongoose.model('Coupon',schema);
