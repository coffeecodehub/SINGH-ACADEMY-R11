/** Server-to-server network attribution, NOT authentication. Never accepts an
 * arbitrary browser X-Forwarded-For value. Edge header overwrite must be verified
 * by the operator before enabling it on the frontend deployment. */
import crypto from 'node:crypto';
import {isIP} from 'node:net';
export function usableProxySecret(value){return typeof value==='string'&&value.length>=32&&new Set(value).size>=8&&!/CHANGE.?ME|YOUR_|GENERATE_WITH|REPLACE_/i.test(value);}
function binding({method,path,origin='',portal='',key='',cookie=''}){
 return [method.toUpperCase(),path,origin,portal,key,crypto.createHash('sha256').update(cookie).digest('hex')];
}
export function signProxyIdentity(ip,context,secret,now=Date.now()){
 if(!usableProxySecret(secret)||!isIP(ip)||!context.path?.startsWith('/api/'))throw new Error('Invalid trusted proxy identity configuration.');
 const payload=Buffer.from(JSON.stringify([1,Math.floor(now/1000),ip,...binding(context)])).toString('base64url');
 return {payload,signature:crypto.createHmac('sha256',secret).update(payload).digest('hex')};
}
export function verifyProxyIdentity(payload,signature,context,secret,now=Date.now()){
 if(!usableProxySecret(secret)||typeof payload!=='string'||payload.length>4096||!/^[a-zA-Z0-9_-]+$/.test(payload)||typeof signature!=='string'||!/^[a-f0-9]{64}$/.test(signature))return null;
 const expected=crypto.createHmac('sha256',secret).update(payload).digest('hex');
 if(!crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
 try{
  const [version,timestamp,ip,...signed]=JSON.parse(Buffer.from(payload,'base64url').toString('utf8'));
  if(version!==1||!Number.isSafeInteger(timestamp)||Math.abs(Math.floor(now/1000)-timestamp)>60||!isIP(ip)||JSON.stringify(signed)!==JSON.stringify(binding(context)))return null;
  return ip;
 }catch{return null;}
}
export function singleClientIp(value){if(typeof value!=='string'||value.length>64||value.includes(','))return null;const ip=value.trim();return isIP(ip)?ip:null;}
