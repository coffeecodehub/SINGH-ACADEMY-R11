import mongoose from 'mongoose';
import {COUNTRIES} from '../utils/countries.js';
const privateString={type:String,default:null,select:false};
const schema=new mongoose.Schema({
  name:{type:String,required:true,trim:true,maxlength:120},email:{type:String,required:true,unique:true,lowercase:true,trim:true,maxlength:254},
  passwordHash:{type:String,required:true,select:false},emailVerified:{type:Boolean,default:false},
  verificationToken:privateString,verificationExpires:{type:Date,default:null,select:false},
  resetPasswordToken:{...privateString,index:true},resetPasswordExpires:{type:Date,default:null,select:false},
  resetOtpHash:privateString,resetOtpExpires:{type:Date,default:null,select:false},resetOtpAttempts:{type:Number,default:0,select:false},resetOtpVerifiedAt:{type:Date,default:null,select:false},
  role:{type:String,enum:['student','client_admin','super_admin'],default:'student',index:true},
  status:{type:String,enum:['active','blocked'],default:'active',index:true},blockedReason:{type:String,select:false},
  // Access stops when removal is requested. The identity remains linked to its
  // financial/audit history; deletedAt is set only after provider billing closes.
  removalState:{type:String,enum:[null,'pending','removed'],default:null},removalRequestedAt:{type:Date,default:null},
  removalRequestedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null,select:false},removalReason:{type:String,maxlength:500,select:false},
  deletedAt:{type:Date,default:null,index:true},deletedBy:{type:mongoose.Schema.Types.ObjectId,ref:'User',default:null,select:false},
  phone:{type:String,maxlength:40},country:{type:String,trim:true,uppercase:true,default:'',enum:['',...COUNTRIES.map(country=>country.code)]},adminNotes:{type:String,maxlength:3000,select:false},
  commerceVersion:{type:Number,default:0,select:false},
  tokenVersion:{type:Number,default:0,select:false},lastLoginAt:{type:Date,default:null},loginCount:{type:Number,default:0},
  mfaEnabled:{type:Boolean,default:false},mfaSecret:privateString,mfaPendingSecret:privateString,
  mfaPendingExpires:{type:Date,default:null,select:false},mfaLastStep:{type:Number,default:-1,select:false},
  mfaRecoveryHashes:{type:[String],default:[],select:false}
},{timestamps:true});
schema.index({role:1,createdAt:-1});
export default mongoose.models.User||mongoose.model('User',schema);
