/** Explicit LOCAL Docker/real-Mongo gate. Never uses production MONGODB_URI.
 * Requires the existing dependencies/build from verify:release. Each invocation
 * owns a unique Compose project; cleanup never stops another user's services. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {runNpm} from './commands.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),project=`sa-check-${Date.now()}-${process.pid}`;
const env={...process.env,TEST_MONGODB_URI:'mongodb://127.0.0.1:27018/sa_test?replicaSet=rs0&directConnection=true',NEXT_PUBLIC_API_URL:'/api',NODE_ENV:'test',DEPLOYMENT_STAGE:'development',SA_REQUIRE_PROXY_IDENTITY:'false',SA_PROXY_SHARED_SECRET:'',SA_PROXY_CLIENT_IP_HEADER:'',SA_PROXY_CLIENT_IP_VERIFIED:'false'};
// Do not let a copied production URI or gateway secret become a test fallback.
for(const key of ['MONGODB_URI','MONGO_URI','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','PAYPAL_CLIENT_SECRET','PAYPAL_SECRET','PAYPAL_CLIENT_ID','PAYPAL_WEBHOOK_ID','SMTP_PASS','SMTP_USER','CLOUDMERSIVE_API_KEY'])delete env[key];
const report={version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,startedAt:new Date().toISOString(),status:'running',scope:'Isolated real MongoDB transactions and DB-backed browser tests. Provider/SMTP fixtures are not external acceptance.',handoverReady:false,checks:[]};
const file=path.join(root,'qa/integration-checks.json');fs.mkdirSync(path.dirname(file),{recursive:true});const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
const command=(args,quiet=false)=>{const r=spawnSync('docker',args,{cwd:root,env,encoding:'utf8',stdio:quiet?'pipe':'inherit',timeout:180000});if(r.error||r.status!==0)throw new Error('Docker command failed. Install/start Docker Desktop, ensure port 27018 is free, and inspect the error. Production database was not used.');return r.stdout;};
const compose=(args,quiet=false)=>command(['compose','-p',project,'-f','dev/test-mongo-compose.yml',...args],quiet);
const step=(name,action)=>{const item={name,status:'running'};report.checks.push(item);save();try{action();item.status='passed';}catch(e){item.status='failed';item.error=e.message;throw e;}finally{save();}};
let started=false;save();
try{
 step('Payment schema/fixture contracts (no database)',()=>runNpm(['run','test:contracts'],path.join(root,'backend'),{env}));
 step('Docker availability',()=>command(['info'],true));
 step('Start isolated test MongoDB',()=>{started=true;compose(['up','-d','--wait']);});
 step('Replica set and actual data filesystem',()=>{
  compose(['exec','-T','mongo','mongosh','--quiet','--eval',"rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]})"]);
  let primary=false;for(let i=0;i<45;i++){try{compose(['exec','-T','mongo','mongosh','--quiet','--eval','if (!db.hello().isWritablePrimary) quit(2)'],true);primary=true;break;}catch{}Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,2000);}
  if(!primary)throw new Error('Test replica set did not become writable within 90 seconds.');
  const df=compose(['exec','-T','mongo','df','-Pk','/data/db'],true);console.log(df);const line=df.trim().split('\n').at(-1).trim().split(/\s+/);if(Number(line[3])<786432)throw new Error('Test MongoDB data filesystem has less than 768 MiB free.');
 });
 step('Real backend HTTP/transaction tests',()=>runNpm(['run','test:integration'],path.join(root,'backend'),{env}));
 step('Install project Chromium',()=>runNpm(['exec','--no','--','playwright','install','chromium'],path.join(root,'frontend'),{env}));
 step('DB-backed browser checks',()=>runNpm(['run','test:browser'],path.join(root,'frontend'),{env}));
 report.status='passed';
}catch(e){console.error(e.message);report.status='failed';process.exitCode=1;}
finally{if(started){try{compose(['down','-v','--remove-orphans']);}catch{report.cleanup='failed';report.status='failed';process.exitCode=1;}}report.finishedAt=new Date().toISOString();save();console.log('Integration evidence: qa/integration-checks.json — '+report.status.toUpperCase());}
