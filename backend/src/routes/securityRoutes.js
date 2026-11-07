import {Router} from 'express';
import bcrypt from 'bcryptjs';
import AuthSession from '../models/AuthSession.js';
import {requireAuth} from '../middleware/auth.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {confirmIdentity} from '../services/identity.js';
import {issueSession,revokeUserSessions} from '../services/sessions.js';
import {audit} from '../services/audit.js';
import {passwordError} from '../utils/security.js';
const r=Router();r.use(requireAuth);
const scope=req=>req.authPortal==='super_admin'?'super_auth':req.authPortal==='client_admin'?'client_auth':'student_auth';
const err=(message,status=400)=>Object.assign(new Error(message),{status});
r.get('/',async(req,res)=>{
 const sessions=await AuthSession.find({user:req.user._id,portal:req.authPortal,revokedAt:null,expiresAt:{$gt:new Date()}}).select('_id createdAt lastSeenAt expiresAt userAgent networkId').sort({lastSeenAt:-1}).limit(30).lean();
 res.json({success:true,currentSessionId:req.authSession._id,sessions});
});
r.use(rateLimit('security-write',20,900000),rateLimit('security-account',20,900000,{authenticated:true}));
r.post('/sessions/revoke',async(req,res)=>{
 await confirmIdentity(req);const id=req.body?.sessionId;
 const query={user:req.user._id,portal:req.authPortal,revokedAt:null};
 if(id==='others')query._id={$ne:req.authSession._id};else if(typeof id==='string'&&/^[0-9a-f]{24}$/.test(id))query._id=id;else throw err('Select a valid session.');
 await AuthSession.updateMany(query,{$set:{revokedAt:new Date()}});await audit(req,{scope:scope(req),action:'auth.sessions_revoked',targetUser:req.user._id});res.json({success:true,message:'Selected sessions have been signed out.'});
});
r.post('/password',async(req,res)=>{
 const user=await confirmIdentity(req),error=passwordError(req.body?.newPassword);if(error)throw err(error);
 user.passwordHash=await bcrypt.hash(req.body.newPassword,12);user.tokenVersion=Number(user.tokenVersion||0)+1;await user.save();
 await revokeUserSessions(user._id);await audit(req,{scope:scope(req),action:'auth.password_changed',targetUser:user._id});await issueSession(req,res,user,req.authPortal);res.json({success:true,message:'Password updated. Other sessions were signed out.'});
});
// Legacy clients receive an explicit retired-feature response, never a setup secret.
for(const action of ['setup','enable','disable'])r.post('/mfa/'+action,(req,res)=>res.status(410).json({success:false,code:'FEATURE_RETIRED',message:'Authenticator setup is not part of this Academy sign-in flow.'}));
export default r;
