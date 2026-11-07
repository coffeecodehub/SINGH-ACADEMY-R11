/** LOCAL TEST ONLY. This server emulates the API to test browser cookie/stream behavior.
 * It is never imported by the app, has no real database/provider keys and cannot collect payments. */
import http from 'node:http';import {Readable} from 'node:stream';import fs from 'node:fs';import {createRequire} from 'node:module';
import {proxyApi} from '../../frontend/lib/server/apiProxy.mjs';
const require=createRequire(import.meta.url),ts=require(process.env.TYPESCRIPT_PATH||'../../frontend/node_modules/typescript');
const client=ts.transpileModule(fs.readFileSync(new URL('../../frontend/lib/api.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const sessions=new Map(),counts={},failures={};let serial=0;
const read=async req=>{const chunks=[];for await(const c of req)chunks.push(c);return Buffer.concat(chunks);};
const json=(res,data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store'});res.end(JSON.stringify(data));};
const upstream=http.createServer(async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;counts[path]=(counts[path]||0)+1;
 if(failures[path]>0){failures[path]--;return json(res,{success:false,message:'Temporary fixture outage'},503);}
 const token=String(req.headers.cookie||'').match(/sa_student_v45=([^;]+)/)?.[1],user=sessions.get(token)||null;
 if(path==='/api/auth/login'){
  const body=JSON.parse((await read(req)).toString()),key=String(++serial).padStart(64,'a'),who={id:body.id,name:body.id,role:'student'};sessions.set(key,who);
  res.setHeader('Set-Cookie',[`sa_student_v45=${key}; HttpOnly; Path=/api; SameSite=Lax; Domain=backend.invalid; Max-Age=600`]);
  return json(res,{success:true,user:who});
 }
 if(path==='/api/auth/session')return json(res,{success:true,user});
 if(path==='/api/auth/logout'){sessions.delete(token);res.setHeader('Set-Cookie','sa_student_v45=; HttpOnly; Path=/api; SameSite=Lax; Max-Age=0');return json(res,{success:true});}
 if(path==='/api/content/team')return json(res,{success:true,team:[{_id:'faculty-one',name:'Faculty One'}]});
 if(path==='/api/courses/demo/enroll'||path==='/api/payments/mine/invoices'){
  if(!user)return json(res,{success:false,code:'SESSION_REQUIRED',message:'Sign in'},401);
  return json(res,{success:true,user:user.id,items:[{owner:user.id}]});
 }
 return json(res,{success:false,message:'Fixture route missing'},404);
});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));const target=`http://127.0.0.1:${upstream.address().port}`;
const frontend=http.createServer(async(req,res)=>{
 try{
  if(req.url==='/__fixture/state'){if(req.method==='POST'){const data=JSON.parse((await read(req)).toString());Object.assign(failures,data.failures||{});}return json(res,{counts,failures});}
  if(req.url.startsWith('/api/')){
   const hasBody=!['GET','HEAD'].includes(req.method),request=new Request(`http://127.0.0.1:${frontend.address().port}${req.url}`,{method:req.method,headers:req.headers,...(hasBody?{body:Readable.toWeb(req),duplex:'half'}:{})});
   const result=await proxyApi(request,{env:{NODE_ENV:'test',API_PROXY_TARGET:target}});res.statusCode=result.status;
   for(const[k,v]of result.headers)if(k!=='set-cookie')res.setHeader(k,v);const cookies=result.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
   if(result.body)Readable.fromWeb(result.body).pipe(res);else res.end();return;
  }
  res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});res.end(`<!doctype html><title>Local gateway test fixture</title><main>Local test only</main><script>window.process={env:{}};const exports={};${client};window.sa=exports;window.sessionChecks=0;window.addEventListener('sa:session-check',()=>window.sessionChecks++);</script>`);
 }catch(e){json(res,{success:false,message:e.message},500);}
});
await new Promise(resolve=>frontend.listen(0,'127.0.0.1',resolve));console.log(JSON.stringify({front:`http://127.0.0.1:${frontend.address().port}`,target}));
for(const s of ['SIGTERM','SIGINT'])process.on(s,()=>{frontend.closeAllConnections();upstream.closeAllConnections();frontend.close();upstream.close();process.exit(0);});
