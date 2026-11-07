/** Explicit local-only configuration helper. Never changes credentials or a hosted stage. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
const settings=Object.freeze({UPLOADS_ENABLED:'true',UPLOAD_SCAN_PROVIDER:'clamav',CLAMAV_HOST:'',UPLOAD_SCAN_REQUIRED:'false',ADMIN_MEDIA_MAX_UPLOAD_MB:'0'});
function loopback(raw){try{const u=new URL(raw);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{return false;}}
export function localUploadPlan(content,env={}){
 const file=dotenv.parse(content);
 for(const source of [file,env]){
  if(source.NODE_ENV&&source.NODE_ENV!=='development')throw new Error('Local uploads require NODE_ENV=development. Hosted/test settings are not changed.');
  if(source.DEPLOYMENT_STAGE&&source.DEPLOYMENT_STAGE!=='development')throw new Error('Local uploads require DEPLOYMENT_STAGE=development. Hosted stages are not changed.');
  for(const key of ['FRONTEND_URL','FRONTEND_URLS'])if(source[key]&&source[key].split(',').some(value=>!loopback(value.trim())))throw new Error('Local uploads require localhost frontend origins. Hosted origins are not changed.');
 }
 const origins=env.FRONTEND_URLS||env.FRONTEND_URL||file.FRONTEND_URLS||file.FRONTEND_URL;
 if(!origins)throw new Error('Configure a localhost FRONTEND_URL with npm run setup first.');
 // Exported old variables would override the updated file: do not falsely report a fix.
 for(const [key,value]of Object.entries(settings))if(env[key]!==undefined&&env[key]!==value)throw new Error('An exported upload setting overrides backend/.env. Open a fresh terminal without exported upload settings, then rerun.');
 const newline=content.includes('\r\n')?'\r\n':'\n';let output=content;
 for(const [key,value]of Object.entries(settings)){
  const expression=new RegExp('^(?:export\\s+)?'+key+'\\s*=.*$','gm');
  if(expression.test(output))output=output.replace(expression,key+'='+value);
  else output+=(output.endsWith('\n')?'':newline)+key+'='+value+newline;
 }
 return {content:output,changed:output!==content,settingNames:Object.keys(settings)};
}
export function configureLocalUploads({target,apply=false,env=process.env}={}){
 const stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('backend/.env must be an ordinary local file.');
 const source=fs.readFileSync(target,'utf8'),plan=localUploadPlan(source,env);
 if(!apply||!plan.changed)return {applied:apply,changed:plan.changed,settingNames:plan.settingNames};
 const suffix=Date.now()+'-'+crypto.randomBytes(5).toString('hex'),backup=target+'.uploads-local-backup-'+suffix,temporary=target+'.uploads-local-tmp-'+suffix;
 try{
  fs.writeFileSync(backup,source,{flag:'wx',mode:0o600});fs.writeFileSync(temporary,plan.content,{flag:'wx',mode:stat.mode&0o777});
  if(fs.readFileSync(target,'utf8')!==source)throw new Error('backend/.env changed during preparation. Nothing was overwritten; retry after closing the other editor.');
  fs.renameSync(temporary,target);
 }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
 return {applied:true,changed:true,settingNames:plan.settingNames,backupCreated:true};
}
