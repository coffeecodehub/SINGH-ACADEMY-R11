import mongoose from 'mongoose';
const money={type:Number,min:0,validate:Number.isSafeInteger};
const schema=new mongoose.Schema({
 testMode:{type:Boolean,default:false},origin:{type:String,enum:['manual','online_checkout','recurring','coupon'],default:'manual'},
 number:{type:String,required:true,unique:true},user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
 kind:{type:String,enum:['course','section','membership'],required:true},title:{type:String,required:true},courseSlug:String,sectionSlug:String,planName:String,
 durationMonths:Number,accessDays:Number,accessExpiresAt:Date,noScheduledExpiry:{type:Boolean,default:false},accessStartsAt:{type:Date,required:true},currency:{type:String,required:true},
 creditedMinor:{...money,default:0},totalMinor:{...money,required:true,min:0},paidMinor:{...money,default:0},dueAt:{type:Date,required:true,index:true},
 renewalOf:{type:mongoose.Schema.Types.ObjectId,ref:'Subscription'},lastReminderAt:Date,voidReason:String,
 status:{type:String,enum:['open','paid','void'],default:'open',index:true},paidAt:Date,voidedAt:Date,
 fulfillmentAt:Date,createdBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true},
 // V60.15: this invoice's independent contribution, not cumulative enrollment dates.
 grantVersion:{type:Number,default:0},grantStartsAt:Date,grantExpiresAt:Date,grantNoExpiry:{type:Boolean,default:false},grantSuppressed:{type:Boolean,default:false},accessRevokedAt:Date,accessCancelledAt:Date,accessCancellationReason:{type:String,enum:['owner_immediate','account_removed']},
 providerInvoiceKey:{type:String,unique:true,sparse:true},billingAgreement:{type:mongoose.Schema.Types.ObjectId,ref:'BillingAgreement'},discountFull:Boolean,coupon:{type:mongoose.Schema.Types.ObjectId,ref:'Coupon'},subtotalMinor:Number,discountMinor:Number,notes:{type:String,maxlength:1000},requestKey:{type:String,required:true,unique:true},requestFingerprint:{type:String,required:true}
},{timestamps:true,optimisticConcurrency:true});
schema.pre('validate',function(){if(this.totalMinor===0&&!(this.origin==='coupon'&&this.discountFull&&this.coupon&&this.subtotalMinor>0&&this.discountMinor===this.subtotalMinor))this.invalidate('totalMinor','Zero invoices require validated full-discount evidence.');});
schema.index({user:1,createdAt:-1});
schema.index({user:1,kind:1,courseSlug:1,paidAt:1});
schema.index({renewalOf:1},{unique:true,partialFilterExpression:{renewalOf:{$type:'objectId'},status:'open'}});
schema.index({status:1,currency:1,dueAt:1});
export default mongoose.models.Invoice||mongoose.model('Invoice',schema);
