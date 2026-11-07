/** Read-only configuration/DB readiness. Not an external payment, penetration,
 * edge-header or email-inbox test. Never enables live payments automatically. */
import 'dotenv/config';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import mongoose from 'mongoose';
import {checkEnvironment} from '../utils/deployment.js';import {usableProxySecret} from '../utils/proxyIdentity.js';
const root=fileURLToPath(new URL('../../..',import.meta.url)),report={startedAt:new Date().toISOString(),status:'running',readOnly:true,handoverApproved:false,checks:[],remainingAcceptance:['Validate the configured hosting edge overwrites the selected client-IP header; two clients get distinct signed fingerprints','Actual Stripe test and PayPal sandbox purchase/cancel/switch/refund, signed webhooks, invoice/access and inbox','Cloudmersive/private ClamAV actual clean/rejection probes and hosted upload acceptance, including size/quota limits','Both CI Node jobs on the same commit/lockfiles','Backup/restore rehearsal, deployed media and final HTTPS domain acceptance']};
try{
 const env=checkEnvironment(process.env);report.checks.push({name:'Hosted production-mode configuration',passed:env.production&&process.env.NODE_ENV==='production'&&env.errors.length===0,errors:env.errors});
 report.checks.push({name:'Require trusted proxy identity for browser writes',passed:process.env.SA_REQUIRE_PROXY_IDENTITY==='true'&&usableProxySecret(process.env.SA_PROXY_SHARED_SECRET)});
 const uri=process.env.MONGODB_URI||process.env.MONGO_URI;if(!uri)throw new Error('MONGODB_URI missing');
 mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);await mongoose.connect(uri,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});report.databaseName=mongoose.connection.name;
 const hello=await mongoose.connection.db.admin().command({hello:1});report.checks.push({name:'Transaction-capable deployment',passed:Boolean(hello.setName||hello.msg==='isdbgrid')});
 const {databaseIndexReport}=await import('../services/databaseIndexes.js');const indexes=await databaseIndexReport();report.checks.push({name:'All declared critical/performance indexes',passed:indexes.status==='passed',missing:indexes.entries.filter(x=>x.status!=='present').map(x=>({collection:x.collection,key:x.key,conflicting:x.conflicting}))});
 // These reports must have been produced against this same operator-selected DB.
 // Do not treat an old local report as proof of current remote state.
 report.status=report.checks.every(x=>x.passed)?'passed':'failed';if(report.status!=='passed')process.exitCode=1;
}catch(e){report.status='failed';report.error=String(e.code||e.name);process.exitCode=1;}
finally{await mongoose.disconnect();report.finishedAt=new Date().toISOString();fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa/handover-readiness.json'),JSON.stringify(report,null,2)+'\n');console.log('Read-only configuration/index readiness: '+report.status.toUpperCase()+'. Also run access:audit against the SAME selected DB. External acceptance remains required.');}
