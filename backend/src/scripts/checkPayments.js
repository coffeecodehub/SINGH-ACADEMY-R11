/** Direct CLI. --allow-disabled validates a candidate configuration WITHOUT
 * enabling checkout. --no-env is used by the masked live verification wizard.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPaymentChecks} from '../services/paymentReadiness.js';
const args=process.argv.slice(2);
const allowed=new Set(['--remote','--strict-webhooks','--allow-disabled','--live','--repair-paypal-webhook','--no-env','--help']);
let result;
try{
 for(const arg of args)if(!allowed.has(arg)&&!arg.startsWith('--env-file=')&&!arg.startsWith('--report='))throw new Error('Unknown payment-check option. Run with --help.');
 if(args.includes('--help')){
  console.log('payments:check [--remote --strict-webhooks] [--allow-disabled] [--live] [--env-file=PRIVATE_FILE] [--no-env] [--report=FILE]');
  console.log('--repair-paypal-webhook: explicitly authorizes requesting documented missing PayPal events to the configured existing URL. Does not create charges or enable checkout.');
 }else{
  const selected=args.find(x=>x.startsWith('--env-file='));
  if(selected&&args.includes('--no-env'))throw new Error('--env-file and --no-env cannot be combined.');
  if(!args.includes('--no-env')){
   const {default:dotenv}=await import('dotenv');
   const file=selected?path.resolve(selected.slice(11)):fileURLToPath(new URL('../../.env',import.meta.url));
   const loaded=dotenv.config({path:file});
   if(selected&&loaded.error)throw new Error('The explicitly selected environment file could not be read.');
  }
  result=await runPaymentChecks({remote:args.includes('--remote'),strict:args.includes('--strict-webhooks'),allowDisabled:args.includes('--allow-disabled'),expectLive:args.includes('--live'),repairPayPalWebhook:args.includes('--repair-paypal-webhook')});
  const output=args.find(x=>x.startsWith('--report='));
  if(output){const file=path.resolve(output.slice(9));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{mode:0o600});}
  if(result.status!=='passed')process.exitCode=1;
 }
}catch(error){
 const {redactPaymentMessage}=await import('../utils/paymentWebhookPolicy.js');
 console.error('FAIL '+redactPaymentMessage(error?.message,process.env));process.exitCode=1;
}
