/** One operator command: npm run payments:live
 * NEVER reads/rewrites .env, connects to MongoDB, starts the server, enables
 * Hostinger checkout, creates a charge, issues refunds or changes the UI.
 * Credentials are entered without echo and passed only to one child process.
 */
import {verifyPaymentUiScope} from './verify-payment-scope.mjs';
import {paymentOrigin,webhookUrl} from '../backend/src/utils/paymentWebhookPolicy.js';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';import readline from 'node:readline';
const root=fileURLToPath(new URL('../',import.meta.url));
const backend=path.join(root,'backend'),reportFile=path.join(root,'qa','payment-live-readiness.json');
const secretNames=['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID','PAYPAL_MERCHANT_ID'];
function masked(label){
 if(!process.stdin.isTTY||!process.stdout.isTTY)throw new Error('Use an interactive PowerShell/Terminal. Do not pipe credentials or put them in command history.');
 return new Promise((resolve,reject)=>{
  let value='';readline.emitKeypressEvents(process.stdin);process.stdin.setRawMode(true);process.stdin.resume();process.stdout.write(label+': ');
  const clean=()=>{process.stdin.removeListener('keypress',key);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};
  const key=(text,k={})=>{
   if(k.ctrl&&k.name==='c'){clean();reject(new Error('Cancelled. No checkout was enabled.'));return;}
   if(k.name==='return'||k.name==='enter'){clean();resolve(value.trim());value='';return;}
   if(k.name==='backspace'){value=value.slice(0,-1);return;}
   if(k.ctrl&&k.name==='u'){value='';return;}
   if(text&&!k.ctrl&&!k.meta&&!text.startsWith('\u001b')&&value.length+text.length<=4096)value+=text.replace(/[\r\n\x00-\x1f\x7f]/g,'');
  };
  process.stdin.on('keypress',key);
 });
}
async function confirmation(message){
 const rl=readline.createInterface({input:process.stdin,output:process.stdout});
 try{return await new Promise(resolve=>rl.question(message,answer=>resolve(answer.trim())));}finally{rl.close();}
}
function runNode(args,env=process.env){const p=spawnSync(process.execPath,args,{cwd:root,env,stdio:'inherit'});if(p.error)throw new Error('Node process could not start.');return p.status??1;}
function install(){
 if(fs.existsSync(path.join(backend,'node_modules/stripe/package.json'))&&fs.existsSync(path.join(backend,'node_modules/dotenv/package.json')))return;
 console.log('Installing the existing locked backend dependencies. No app startup scripts are run.');
 const npmCli=process.env.npm_execpath;
 if(!npmCli)throw new Error('Start with npm run payments:live so the locked dependency installer is available.');
 if(runNode([npmCli,'ci','--prefix',backend,'--ignore-scripts','--no-audit','--no-fund'])!==0)throw new Error('Dependency installation failed. No payment request was created.');
}
const temporary={...process.env};
try{
 if(process.argv.includes('--help')){
  console.log('Run npm run payments:live in a terminal. It runs payment regression tests, asks for the actual HTTPS webhook origin, privately prompts for six LIVE values, and verifies provider registration. PayPal event additions need a separate explicit confirmation.');
 }else{
  if(![22,24].includes(Number(process.versions.node.split('.')[0])))throw new Error('Use Node.js 22 or 24 for this project.');
  if(!process.stdin.isTTY)throw new Error('This command requires an interactive terminal for hidden credential entry.');
  console.log('\nSINGH ACADEMY — LIVE PAYMENT CONFIGURATION CHECK\n');
  console.log('Hostinger checkout stays OFF. Your sandbox .env stays unchanged.');
  verifyPaymentUiScope();
  install();
  if(runNode(['--test','backend/test/payments-live-readiness.test.js','backend/test/payments-live-safety.test.js'])!==0)throw new Error('Payment regression tests failed. No credentials requested and no provider calls made.');
  const webhookOrigin=paymentOrigin(temporary.PAYMENT_WEBHOOK_BASE_URL||await confirmation('Actual HTTPS webhook origin (public host only, for example https://singhacademy.com): '));
  if(!webhookOrigin.startsWith('https://'))throw new Error('Supply the actual HTTPS webhook origin without a path, credentials, query or fragment.');
  console.log('\nPaste each LIVE value and press Enter. Nothing is displayed while you type.');
  console.log('Use exactly the values saved in Hostinger. Backspace deletes; Ctrl+U clears.');
  for(const name of secretNames){
   const value=await masked(name);
   if(!value)throw new Error(name+' was empty. Rerun and supply the client\'s LIVE value.');
   temporary[name]=value;
  }
  Object.assign(temporary,{NODE_ENV:'production',DEPLOYMENT_STAGE:'production',ONLINE_PAYMENTS_ENABLED:'false',PAYMENTS_REQUIRE_BOTH:'true',PAYPAL_MODE:'live',FRONTEND_URL:'https://singhacademy.com',FRONTEND_URLS:'https://singhacademy.com',PUBLIC_API_URL:'/api',PAYMENT_WEBHOOK_BASE_URL:webhookOrigin});
  // The checker imports pure validators and provider helpers only, not the server/database.
  const args=[path.join(backend,'src/scripts/checkPayments.js'),'--no-env','--live','--allow-disabled','--remote','--strict-webhooks','--report='+reportFile];
  fs.rmSync(reportFile,{force:true});
  let status=runNode(args,temporary),report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):null;
  const onlyMissingPayPal=report?.checks.filter(x=>x.status==='FAIL').every(x=>x.message.startsWith('paypal: webhook is missing required events:'));
  if(status!==0&&report?.paypalRepairAvailable&&onlyMissingPayPal){
   console.log(report.paypalUnavailableEvents?.length?'\nThe missing documented event is not in the API catalog. You may authorize ONE subscription request; a rejection remains a failure.':'\nPayPal\'s own API advertises the missing event(s). The dashboard selection is not required.');
   console.log('Target: '+webhookUrl(temporary,'paypal'));
   console.log('This optional action updates ONLY the existing webhook event list, preserving its ID, URL and current events. No payment is created.');
   const answer=await confirmation('Type ADD PAYPAL EVENTS to authorize this subscription update, or press Enter to leave it unchanged: ');
   if(answer==='ADD PAYPAL EVENTS'){fs.rmSync(reportFile,{force:true});status=runNode([...args,'--repair-paypal-webhook'],temporary);report=fs.existsSync(reportFile)?JSON.parse(fs.readFileSync(reportFile,'utf8')):null;}
  }
  console.log('\nSanitized report: qa/payment-live-readiness.json');
  if(status===0&&report?.status==='passed'){
   console.log('CONFIGURATION CHECK PASSED — not a live transaction test.');
   console.log('Next: deploy the payment-only backend changes, then authorize checkout activation in hPanel and validate a legitimate purchase plus signed delivery/access/receipt.');
   console.log('Do not use test cards in live mode. Do not resubmit a payment if its status is uncertain.');
  }else{
   console.log('NOT READY. Keep ONLINE_PAYMENTS_ENABLED=false in Hostinger. Share only the sanitized report; never share keys.');process.exitCode=1;
  }
 }
}catch(error){console.error('STOP: '+error.message);process.exitCode=1;}
finally{for(const name of secretNames)delete temporary[name];}
