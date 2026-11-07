import mongoose from 'mongoose';
const schema=new mongoose.Schema({
 user:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true},checkoutOrder:{type:mongoose.Schema.Types.ObjectId,ref:'CheckoutOrder',required:true,unique:true},
 activeKey:{type:String,unique:true,sparse:true},provider:{type:String,enum:['stripe','paypal'],required:true},environment:{type:String,enum:['test','live'],required:true},providerSubscriptionId:String,providerCustomerId:String,providerProductId:String,providerPlanId:String,providerStartAt:Date,providerNextBillingAt:Date,providerOutstandingMinor:Number,providerFailedPayments:Number,
 kind:{type:String,enum:['course','section','membership'],required:true},product:{type:String,required:true},title:{type:String,required:true},country:String,
 currency:{type:String,required:true},amountMinor:{type:Number,min:1,validate:Number.isSafeInteger,required:true},intervalMonths:{type:Number,min:1,max:36,validate:Number.isInteger,required:true},
 status:{type:String,enum:['creating','incomplete','trialing','active','past_due','cancelled','unpaid','paused'],default:'creating'},autoRenew:{type:Boolean,default:true},cancelAtPeriodEnd:{type:Boolean,default:false},renewalSetup:{type:Boolean,default:false},billingStartsAt:Date,setupConfirmedAt:Date,
 currentPeriodStart:Date,currentPeriodEnd:Date,firstProviderInvoiceId:String,lastProviderInvoiceId:String,cancelledAt:Date,termsAcceptedAt:{type:Date,required:true},renewalConsentedAt:Date,
 sourceInvoiceId:{type:mongoose.Schema.Types.ObjectId,ref:'Invoice'},accessCancellationRequestedAt:Date,accessCancelledAt:Date,providerCancelledAt:Date,
 // Retained until a provider read confirms the requested change. A fresh key is
 // needed for each toggle: Stripe must not replay an earlier cancellation after
 // the owner has explicitly enabled renewal again.
 renewalOperation:{type:new mongoose.Schema({id:{type:String,required:true},autoRenew:{type:Boolean,required:true},action:{type:String,enum:['enable','disable','end','cancel_access']},startedAt:{type:Date,required:true}},{_id:false}),default:undefined},
},{timestamps:true,optimisticConcurrency:true});
schema.index({provider:1,environment:1,providerSubscriptionId:1},{unique:true,partialFilterExpression:{providerSubscriptionId:{$type:'string'}}});
schema.index({user:1,createdAt:-1});
schema.path('intervalMonths').validate(function(value){return this.provider!=='paypal'||value<=12;},'PayPal recurring intervals must be 1–12 months.');
export default mongoose.models.BillingAgreement||mongoose.model('BillingAgreement',schema);
