/** Starts only the isolated test API plus a previously built frontend. No deployment credentials. */
import {prepareStandalone} from './standalone-files.mjs';
import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!process.env.TEST_MONGODB_URI)throw new Error('TEST_MONGODB_URI is required for browser tests; use the local test replica set.');
const standalone=prepareStandalone(path.join(root,'frontend'));
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),3000).unref();}
function child(command,args,cwd,mode){const p=spawn(command,args,{cwd,env:{...process.env,NODE_ENV:mode,DEPLOYMENT_STAGE:mode==='production'?'review':'development',SA_REQUIRE_PROXY_IDENTITY:'false',SA_PROXY_SHARED_SECRET:'',SA_PROXY_CLIENT_IP_HEADER:'',SA_PROXY_CLIENT_IP_VERIFIED:'false',PORT:'3000',HOSTNAME:'127.0.0.1',NEXT_PUBLIC_API_URL:'/api',API_PROXY_TARGET:'http://127.0.0.1:5000',API_PROXY_ALLOW_LOCAL_TEST_ONLY:'true'},stdio:'inherit'});children.push(p);p.on('error',()=>stop(1));p.on('exit',code=>{if(!stopping)stop(code||1);});return p;}
child(process.execPath,['integration/browserServer.js'],path.join(root,'backend'),'test');
child(process.execPath,[standalone.server],standalone.cwd,'production');
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
