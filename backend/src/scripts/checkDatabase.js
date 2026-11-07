import 'dotenv/config';import fs from 'node:fs';import path from 'node:path';import mongoose from 'mongoose';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../..',import.meta.url));
const apply=process.argv.includes('--apply');
let report={status:'failed',readOnly:!apply,startedAt:new Date().toISOString()};
try{
 const uri=process.env.MONGODB_URI||process.env.MONGO_URI;if(!uri)throw new Error('MONGODB_URI is required. Its value will not be printed.');
 mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);
 await mongoose.connect(uri,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});report.databaseName=mongoose.connection.name;
 const {databaseIndexReport}=await import('../services/databaseIndexes.js');
 report={...report,...await databaseIndexReport({apply})};
 console.log(JSON.stringify({readOnly:!apply,status:report.status,missing:report.entries.filter(x=>x.status==='missing').map(x=>({collection:x.collection,key:x.key,conflicting:x.conflicting}))},null,2));
 if(report.status!=='passed')process.exitCode=1;
}catch(error){report.error=error.code?String(error.code):error.name;console.error('Database index check/prepare failed:',report.error);process.exitCode=1;}
finally{await mongoose.disconnect();fs.mkdirSync(path.join(root,'qa'),{recursive:true});fs.writeFileSync(path.join(root,'qa','database-indexes.json'),JSON.stringify(report,null,2)+'\n');}
