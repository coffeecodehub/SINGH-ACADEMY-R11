import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},
 provider:{type:String,enum:['stripe','paypal','discount'],required:true},environment:{type:String,enum:['test','live'],required:true},
 kind:{type:String,enum:['course','section','membership'],required:true},product:{type:String,required:true},title:{type:String,required:true},
 optionKey:{type:String,default:''},optionLabel:String,amountMinor:{type:Number,required:true,min:0,validate:Number.isSafeInteger},currency:{type:String,required:true},
 renewalOf:{type:mongoose.Schema.Types.ObjectId,ref:'Subscription'},
 accessDays:{type:Number,default:0},durationMonths:Number,sectionSlug:String,country:String,subtotalMinor:Number,discountMinor:{type:Number,default:0},couponId:{type:mongoose.Schema.Types.ObjectId,ref:'Coupon'},discountFull:{type:Boolean,default:false},autoRenew:{type:Boolean,default:false},renewalAmountMinor:Number,termsAcceptedAt:Date,billingAgreement:{type:mongoose.Schema.Types.ObjectId,ref:'BillingAgreement'},providerInvoiceId:String,
 renewalSetup:{type:Boolean,default:false},billingStartsAt:Date,setupConfirmedAt:Date,sourceInvoiceId:{type:mongoose.Schema.Types.ObjectId,ref:'Invoice'},accessCancelledAt:Date,
 status:{type:String,enum:['creating','pending','renewal_ready','paid','expired','failed','cancelled'],default:'creating',index:true},
 providerOrderId:String,providerProductId:String,providerPlanId:String,approvalUrl:{type:String,select:false},expiresAt:{type:Date,required:true},paidAt:Date,
 invoice:{type:mongoose.Schema.Types.ObjectId,ref:'Invoice'},payment:{type:mongoose.Schema.Types.ObjectId,ref:'Payment'},
 requestKey:{type:String,unique:true,required:true},requestFingerprint:{type:String,required:true,select:false},
 grantNote:String,accessStartsAt:Date,accessExpiresAt:Date,
 creationClaim:{type:String,select:false},creationClaimUntil:Date,
 // Immutable original provider request for bounded idempotent recovery.
 creationProtocolVersion:Number,creationAttemptedAt:Date,lastCreationAttemptedAt:Date,
 creationCredentialFingerprint:{type:String,select:false},creationPayload:{type:mongoose.Schema.Types.Mixed,select:false},recoveryRequired:{type:Boolean,default:false},recoveryReason:{type:String,select:false},
 operationClaim:{type:String,select:false},operationClaimUntil:Date,
 cancelRequestedAt:Date,captureAttemptedAt:Date,
 replacementKey:{type:String,select:false}
},{timestamps:true,optimisticConcurrency:true});
schema.pre('validate',function(){if(this.amountMinor===0&&!(this.provider==='discount'&&this.discountFull&&this.couponId&&this.subtotalMinor>0&&this.discountMinor===this.subtotalMinor))this.invalidate('amountMinor','Only a validated full-discount order may have a zero total.');});
schema.index({provider:1,environment:1,providerOrderId:1},{unique:true,partialFilterExpression:{providerOrderId:{$type:'string'}}});
schema.index({user:1,createdAt:-1});
export default mongoose.models.CheckoutOrder||mongoose.model('CheckoutOrder',schema);
