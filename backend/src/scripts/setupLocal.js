/** Dependency-free, non-destructive environment setup. No secrets are printed. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {localhostDevelopment} from '../utils/localUploadMode.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),file=path.join(root,'.env');
let content=fs.existsSync(file)?fs.readFileSync(file,'utf8'):fs.readFileSync(path.join(root,'.env.example'),'utf8');
const defaults={AUTH_SECRET:()=>crypto.randomBytes(48).toString('hex'),CLIENT_ADMIN_PASSWORD:()=>crypto.randomBytes(24).toString('base64url'),SUPER_ADMIN_PASSWORD:()=>crypto.randomBytes(24).toString('base64url')};
const placeholder=v=>!v||/GENERAT(?:E|ED)[_ -]?(?:BY|WITH)|CHANGE[_ -]?ME|YOUR_|REPLACE[_ -]?WITH/i.test(v);
let changed=false;
for(const[key,generate]of Object.entries(defaults)){
 const re=new RegExp('^'+key+'=(.*)$','m'),match=content.match(re);
 if(!match){content+='\n'+key+'='+generate()+'\n';changed=true;}
 else if(placeholder(match[1].trim().replace(/^['"]|['"]$/g,''))){content=content.replace(re,key+'='+generate());changed=true;}
}
for(const[key,value]of Object.entries({DEPLOYMENT_STAGE:'development',TRUST_PROXY_HOPS:'0',MAX_UPLOAD_MB:'250',MAX_CONCURRENT_UPLOADS:'2',UPLOAD_SCAN_REQUIRED:'false',MONGO_MAX_POOL:'20',ONLINE_PAYMENTS_ENABLED:'false',PAYMENTS_REQUIRE_BOTH:'false',PAYMENT_WEBHOOK_BASE_URL:'',STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:'',PAYPAL_MODE:'sandbox',PAYPAL_CLIENT_ID:'',PAYPAL_CLIENT_SECRET:'',PAYPAL_MERCHANT_ID:'',PAYPAL_WEBHOOK_ID:''})){
 if(!new RegExp('^'+key+'=','m').test(content)){content+='\n'+key+'='+value+'\n';changed=true;}
}
// Normal setup opts an explicitly local development file into unscanned uploads.
// Preserve an existing false flag, every scanner credential, and every hosted file.
const uploadSettings=parseEnv(content);
if(!Object.hasOwn(uploadSettings,'LOCAL_UPLOADS_UNSCANNED')&&localhostDevelopment(uploadSettings)&&localhostDevelopment({...uploadSettings,...process.env})){
 content+='\nLOCAL_UPLOADS_UNSCANNED=true\n';changed=true;
}
// V44 example SMTP settings were placeholders, not an actual service.
content=content.replace(/^SMTP_HOST=smtp\.example\.com\s*$/m,'SMTP_HOST=');
if(fs.existsSync(file)&&changed)fs.copyFileSync(file,file+'.before-v54-'+Date.now());
fs.writeFileSync(file,content,{mode:0o600});
console.log('backend/.env is ready. Database URI and non-placeholder credentials were preserved.');
console.log('Open .env locally: set MONGODB_URI and review both admin emails/passwords. No secret was printed.');
console.log('Use Atlas or a replica set for business writes. Follow START-HERE-WINDOWS.md for database/index preparation; seed a brand-new development database only when needed. Existing databases need a reviewed upgrade, not an automatic migration.');
console.log('Sign-in uses email and password. Authenticator setup and account email-verification gates are retired.');
console.log('Without SMTP in development, welcome/reset messages are local backend-console previews only.');
