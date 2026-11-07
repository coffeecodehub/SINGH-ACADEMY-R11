import {proxyTarget} from './apiProxy.mjs';
import {pagePortal,publicPage,loginDestination} from '../pagePolicy';
import {safeStudentNext} from '../studentDestination';
const cookies={student:'sa_student_v45',client_admin:'sa_client_admin_v45',super_admin:'sa_super_admin_v45'};
export const SNAPSHOT_HEADER='x-sa-verified-page-session';
export type PageSession={portal:'student'|'client_admin'|'super_admin';user:any;setupRequired:boolean;verified?:boolean};
/** Authoritative per request. No global session caching, and no browser bootstrap
 * header is trusted. Root/auth pages also get a deterministic guest snapshot. */
export async function pageSession(request:Request,env:Record<string,string|undefined>=process.env,fetcher:typeof fetch=fetch):Promise<{session?:PageSession;redirect?:string;unavailable?:boolean}>{
 const url=new URL(request.url),path=url.pathname,open=publicPage(path);
 const entry=['/','/login','/register','/admin/login','/super-admin/login'].includes(path);
 if(open&&!entry)return {};
 const portal=pagePortal(path),cookie=request.headers.get('cookie')||'';
 const guest:PageSession={portal,user:null,setupRequired:false,verified:true};
 const values=cookie.split(';').map(x=>x.trim()).filter(x=>x.startsWith(cookies[portal]+'='));
 const signedOut=cookie.split(';').some(x=>x.trim()==='sa_logout_'+portal+'=1');
 if(signedOut||!values.some(x=>/^[a-f0-9]{64}$/.test(x.slice(x.indexOf('=')+1))))return open?{session:guest}:{redirect:loginDestination(path,url.search)};
 try{
  const target=proxyTarget(env,url.origin),headers=new Headers({'Accept':'application/json','Cookie':cookie,'X-SA-Portal':portal});
  const response=await fetcher(target+'/api/auth/session?compact=1',{headers,cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(10000)});
  if(response.status===401)return open?{session:guest}:{redirect:loginDestination(path,url.search)};
  if(!response.ok)return open?{}:{unavailable:true};
  const data=await response.json();
  if(data?.success!==true||!('user' in data))return open?{}:{unavailable:true};
  if(!data.user||data.user.role!==portal)return open?{session:guest}:{redirect:loginDestination(path,url.search)};
  const {id,_id,name,email,role,country,emailVerified,mfaEnabled,createdAt,lastLoginAt}=data.user;
  if(typeof id!=='string'||!id)return open?{}:{unavailable:true};
  if(entry){
   if(portal==='student')return {redirect:path==='/'?'/home':safeStudentNext(url.searchParams.get('next'))};
   return {redirect:portal==='client_admin'?'/admin':'/super-admin'};
  }
  return {session:{portal,user:{id,_id,name,email,role,country,emailVerified,mfaEnabled,createdAt,lastLoginAt},setupRequired:false,verified:true}};
 }catch{return open?{}:{unavailable:true};}
}
