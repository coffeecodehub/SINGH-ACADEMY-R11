/** Opt-in external scan probes. Never reads/uploads any learner, invoice or CMS file.
 * No DB connection, no startup probe, no new HTTP route and no background API usage.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import os from 'node:os';
import {setTimeout as pause} from 'node:timers/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {uploadScanConfiguration,usableScannerKey} from '../utils/uploadScanConfig.js';
import {scanFile} from '../services/uploadScan.js';
const args=new Set(process.argv.slice(2));
const root=fileURLToPath(new URL('../../..',import.meta.url));
const report={version:JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version,
  startedAt:new Date().toISOString(),status:'running',handoverReady:false,
  mode:args.has('--remote')?'external-probe':'configuration-only',
  scope:'Only this executing machine/environment. Not proof of Hostinger reachability when run on a local PC, nor a guarantee against unknown malware.',checks:[]};
let directory;
try{
 for(const arg of args)if(!['--remote','--test-rejection'].includes(arg))throw new Error('Use scan:check [--remote] [--test-rejection].');
 if(args.has('--test-rejection')&&!args.has('--remote'))throw new Error('--test-rejection requires explicit --remote.');
 const config=uploadScanConfiguration(process.env);
 const configured=config.provider==='cloudmersive'?usableScannerKey(config.apiKey):Boolean(process.env.CLAMAV_HOST);
 report.provider=config.provider;report.maxFileBytes=config.provider==='cloudmersive'?config.maxFileBytes:undefined;
 report.checks.push({name:'Selected scanner configuration (not connectivity)',passed:config.errors.length===0&&configured&&config.required});
 if(config.errors.length||!configured||!config.required)throw new Error('Select/configure the scanner and require scanning before running the probe. No secret values are printed.');
 if(args.has('--remote')){
  console.log('Sending synthetic probe content only to the configured scanner. This uses provider quota; no user files are sent.');
  directory=await fs.mkdtemp(path.join(os.tmpdir(),'sa-scanner-probe-'));
  const file=path.join(directory,'clean.png');
  await fs.writeFile(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lS8AAAAASUVORK5CYII=','base64'),{mode:0o600});
  const result=await scanFile(file,{mime:'image/png'});
  report.checks.push({name:'Synthetic benign image receives explicit clean verdict',passed:result.status==='clean',engine:result.engine});
  if(result.status!=='clean')throw new Error('The scanner did not return an explicit clean verdict.');
  if(args.has('--test-rejection')){
   // Evaluation keys permit only one call per second. No automatic POST retries.
   await pause(1100);
   const marker=path.join(directory,'antivirus-test.txt');
   // Inert EICAR antivirus-test marker, not executable malware. Split so this source archive
   // does not itself contain the contiguous detection signature. Never bypass application upload rules.
   const text=['X5O!P%@AP[4','\\PZX54(P^)7CC)7}','$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join('');
   await fs.writeFile(marker,text,{mode:0o600});
   let rejected=false;
   try{await scanFile(marker,{mime:'text/plain'});}catch(error){
    if(error.status===400&&(error.code==='UPLOAD_INFECTED'||/rejected by the malware scanner/.test(error.message)))rejected=true;
    else throw error;
   }
   report.checks.push({name:'Inert antivirus-test marker is rejected (not timeout/auth failure)',passed:rejected});
   if(!rejected)throw new Error('Scanner accepted the inert antivirus-test marker; do not enable public uploads.');
  }
 }else console.log('Configuration only. Run scan:check -- --remote --test-rejection to test the actual scanner using two synthetic probes.');
 report.status='passed';
}catch(error){report.status='failed';report.error=error.code?.startsWith('UPLOAD_')?error.code:'SCANNER_CHECK_FAILED';console.error('Scanner check failed; review the backend scanner settings, subscribed limits and provider availability. No file was published.');process.exitCode=1;}
finally{
 if(directory)await fs.rm(directory,{recursive:true,force:true});
 report.finishedAt=new Date().toISOString();await fs.mkdir(path.join(root,'qa'),{recursive:true});
 await fs.writeFile(path.join(root,'qa/upload-scan-checks.json'),JSON.stringify(report,null,2)+'\n');
 console.log('Upload scanner '+report.mode+': '+report.status.toUpperCase()+'. Report: qa/upload-scan-checks.json');
}
