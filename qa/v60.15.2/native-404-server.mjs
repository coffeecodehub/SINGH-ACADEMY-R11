/** Isolated HTTP transport for the actual response helper, not the Next router. */
import fs from 'node:fs';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
const root=process.argv[2];
const {compileModule}=await import(pathToFileURL(root+'/frontend/test/compile.mjs'));
const helper=compileModule('../lib/server/retiredNotFound.ts');
const oldCss=fs.readFileSync(root+'/frontend/app/styles.css','utf8');
const main='<main class="siteStatus"><p>404</p><h1>Page not found</h1><p>This address may have changed. Your academy is still here.</p><a class="button" href="/">Return to Singh Academy</a></main>';
const baseline='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+oldCss+'</style></head><body>'+main+'</body></html>';
const server=http.createServer(async(req,res)=>{
 if(req.url==='/baseline'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(baseline);return;}
 const response=helper.retiredNotFoundResponse(req.method==='HEAD');
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
});
server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));
process.on('SIGTERM',()=>{server.closeAllConnections();server.close(()=>process.exit(0));});
