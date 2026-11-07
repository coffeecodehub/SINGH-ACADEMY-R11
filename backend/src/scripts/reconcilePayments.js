import 'dotenv/config';
import mongoose from 'mongoose';
import {connectDB} from '../config/db.js';
import {assertEnvironment} from '../utils/deployment.js';
import CheckoutOrder from '../models/CheckoutOrder.js';
import {syncCheckout,reconcileCreation,bindRecoveredCheckout} from '../services/onlineCheckout.js';
const args=process.argv.slice(2),get=name=>args.find(x=>x.startsWith(name+'='))?.slice(name.length+1);
const limit=Math.max(1,Math.min(200,Number(get('--limit')||50)||50));
let ok=0,failed=0;
try{
 assertEnvironment();await connectDB();
 const id=get('--order'),providerId=get('--provider-order');
 if(providerId){
  if(!id||!args.includes('--bind-verified-reference'))throw new Error('Binding needs --order=<id> --provider-order=<id> --bind-verified-reference. Provider truth is checked without capture.');
  const result=await bindRecoveredCheckout(id,providerId);console.log(JSON.stringify({order:String(result._id),status:result.status}));
 }else{
  const rows=await CheckoutOrder.find({...(id?{_id:id}:{}),status:{$in:['creating','pending']}}).sort({createdAt:1}).limit(limit).select('_id provider status providerOrderId').lean();
  console.log('Reconciling saved checkouts. Missing-ID discovery is read-only unless --recover-creation is supplied.');
  for(const row of rows)try{
   const result=row.providerOrderId?await syncCheckout(row._id,{capture:row.provider==='paypal'&&args.includes('--capture-approved-paypal')}):await reconcileCreation(row._id,{allowReplay:args.includes('--recover-creation')});
   console.log(JSON.stringify({order:String(row._id),provider:row.provider,status:result.status,recoveryRequired:Boolean(result.recoveryRequired)}));ok++;
  }catch(error){console.error(JSON.stringify({order:String(row._id),error:error.code||'RECONCILIATION_FAILED',message:error.message}));failed++;}
  console.log(JSON.stringify({checked:ok,failed}));if(failed)process.exitCode=1;
 }
}finally{await mongoose.disconnect();}
