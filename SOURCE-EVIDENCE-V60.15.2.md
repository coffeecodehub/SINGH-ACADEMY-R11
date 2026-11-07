# V60.15.2 — source evidence

Basis: original V60.15.1 ZIP plus the user-provided integration log.

## Original frontend/app/free-resources/page.tsx

```text
1: import {notFound} from 'next/navigation';
2: export default function RemovedPage(){notFound();}
```

## Original frontend/app/resources/page.tsx

```text
1: import {notFound} from 'next/navigation';
2: export default function RemovedPage(){notFound();}
```

## Original frontend/app/layout.tsx

```text
1: import './styles.css';
2: import {WebsiteContentProvider} from '../components/WebsiteContent';
3: import {Suspense} from 'react';
4: import {headers} from 'next/headers';
5: import {AuthProvider} from '../components/auth/AuthProvider';
6: import SiteAccessGate from '../components/auth/SiteAccessGate';
7: import NavigationFeedback from '../components/NavigationFeedback';
8: import CatalogWarmup from '../components/CatalogWarmup';
9: import {SNAPSHOT_HEADER} from '../lib/server/pageSession';
10: export const dynamic='force-dynamic';
11: export const metadata={title:'Singh Academy | Master the Art of Resolution',description:'Executive education in negotiation, mediation, leadership and cross-cultural communication.'};
12: export default async function RootLayout({children}:{children:React.ReactNode}){
13:  const raw=(await headers()).get(SNAPSHOT_HEADER);let initialSession=null;
14:  try{if(raw)initialSession=JSON.parse(decodeURIComponent(raw));}catch{}
15:  return <html lang="en" data-scroll-behavior="smooth"><body><AuthProvider initialSession={initialSession}><Suspense fallback={null}><NavigationFeedback/></Suspense><SiteAccessGate><WebsiteContentProvider><Suspense fallback={<div role="status" style={{padding:40}}>Loading Singh Academy…</div>}>{children}</Suspense><CatalogWarmup/></WebsiteContentProvider></SiteAccessGate></AuthProvider></body></html>;
16: }
```

## Original frontend/app/loading.tsx

```text
1: /** Stable server/client loading shell for route compilation/network waits. */
2: export default function Loading(){return <main className="contentWrap" role="status" aria-live="polite"><p>Opening your page…</p></main>;}
```

## Original scripts/start-browser-stack.mjs

```text
1: /** Starts only the isolated test API plus a previously built frontend. No deployment credentials. */
2: import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
3: const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
4: if(!process.env.TEST_MONGODB_URI)throw new Error('TEST_MONGODB_URI is required for browser tests; use the local test replica set.');
5: const children=[];let stopping=false;
6: function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),3000).unref();}
7: function child(command,args,cwd,mode){const p=spawn(command,args,{cwd,env:{...process.env,NODE_ENV:mode,DEPLOYMENT_STAGE:mode==='production'?'review':'development',SA_REQUIRE_PROXY_IDENTITY:'false',SA_PROXY_SHARED_SECRET:'',SA_PROXY_CLIENT_IP_HEADER:'',SA_PROXY_CLIENT_IP_VERIFIED:'false',PORT:'3000',HOSTNAME:'127.0.0.1',NEXT_PUBLIC_API_URL:'/api',API_PROXY_TARGET:'http://127.0.0.1:5000',API_PROXY_ALLOW_LOCAL_TEST_ONLY:'true'},stdio:'inherit'});children.push(p);p.on('error',()=>stop(1));p.on('exit',code=>{if(!stopping)stop(code||1);});return p;}
8: child(process.execPath,['integration/browserServer.js'],path.join(root,'backend'),'test');
9: child(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000'],path.join(root,'frontend'),'production');
10: process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
```

## Updated frontend/app/free-resources/[[...retired]]/route.ts

```text
1: import {retiredNotFoundResponse} from '../../../lib/server/retiredNotFound';
2: 
3: // Tombstone for the removed page and any old deep links. Route Handlers bypass
4: // RootLayout/loading/Suspense, so the transport status is a genuine 404.
5: // Existing middleware still checks a guest's session before reaching this route.
6: export const dynamic = 'force-dynamic';
7: export function GET() { return retiredNotFoundResponse(); }
8: export function HEAD() { return retiredNotFoundResponse(true); }
```

## Updated frontend/app/resources/[[...retired]]/route.ts

```text
1: import {retiredNotFoundResponse} from '../../../lib/server/retiredNotFound';
2: 
3: // Tombstone for the removed page and any old deep links. Route Handlers bypass
4: // RootLayout/loading/Suspense, so the transport status is a genuine 404.
5: // Existing middleware still checks a guest's session before reaching this route.
6: export const dynamic = 'force-dynamic';
7: export function GET() { return retiredNotFoundResponse(); }
8: export function HEAD() { return retiredNotFoundResponse(true); }
```

## Updated frontend/lib/server/retiredNotFound.ts

```text
1: /** A script-free terminal document for retired resource URLs only.
2:  * Mirrors the existing app/not-found.tsx copy and its approved status styles.
3:  * Never interpolate URL, query, cookie or account data into this document.
4:  * Native Response is deliberate: notFound() below a streamed layout can retain
5:  * HTTP 200 even while displaying the not-found UI. GET and HEAD agree on 404.
6:  */
7: const document = `<!doctype html>
8: <html lang="en"><head><meta charset="utf-8">
9: <meta name="viewport" content="width=device-width, initial-scale=1">
10: <meta name="robots" content="noindex">
11: <title>Page not found | Singh Academy</title>
12: <style>
13: *{box-sizing:border-box}
14: body{margin:0;background:#f7f5f0;color:#1a1917;font-family:Arial,Helvetica,sans-serif}
15: .button{display:inline-block;background:#9b663d;color:white;text-decoration:none;padding:16px 22px;border-radius:10px;font-weight:700;cursor:pointer}
16: a{touch-action:manipulation;-webkit-tap-highlight-color:transparent}
17: .siteStatus{min-height:70vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px;text-align:center;gap:16px}
18: .siteStatus h1{font-size:clamp(24px,4vw,38px);margin:0}
19: .siteStatus p{max-width:560px;line-height:1.7;color:#58675f}
20: </style></head><body>
21: <main class="siteStatus"><p>404</p><h1>Page not found</h1><p>This address may have changed. Your academy is still here.</p><a class="button" href="/">Return to Singh Academy</a></main>
22: </body></html>`;
23: 
24: export function retiredNotFoundResponse(head = false): Response {
25:   return new Response(head ? null : document, {
26:     status: 404,
27:     headers: {
28:       'Content-Type': 'text/html; charset=utf-8',
29:       'Cache-Control': 'private, no-store',
30:       'X-Robots-Tag': 'noindex',
31:       'X-Content-Type-Options': 'nosniff',
32:       'X-Frame-Options': 'DENY',
33:       'Referrer-Policy': 'strict-origin-when-cross-origin',
34:     },
35:   });
36: }
```

## Updated scripts/standalone-files.mjs

```text
1: /** Prepare only generated standalone output for the DB-backed browser gate.
2:  * No build, dependency, .env or application source is rewritten. The project
3:  * Dockerfile uses this same artifact and explicitly includes public/static.
4:  */
5: import fs from 'node:fs';
6: import path from 'node:path';
7: 
8: export function prepareStandalone(frontend) {
9:   const app = path.resolve(frontend);
10:   const build = path.join(app, '.next');
11:   const standalone = path.join(build, 'standalone');
12:   const server = path.join(standalone, 'server.js');
13:   const required = [path.join(build, 'BUILD_ID'), server];
14:   for (const file of required) {
15:     if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
16:       throw new Error('Standalone frontend build is missing. Run npm run verify:release successfully before verify:integration. Missing: ' + path.relative(app, file));
17:     }
18:   }
19:   const copies = [
20:     [path.join(app, 'public'), path.join(standalone, 'public')],
21:     [path.join(build, 'static'), path.join(standalone, '.next', 'static')],
22:   ];
23:   // Validate all inputs before writing any output. Never silently use next start.
24:   for (const [source, target] of copies) {
25:     if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
26:       throw new Error('Standalone asset source is missing: ' + path.relative(app, source) + '. Rebuild with npm run verify:release.');
27:     }
28:     if (fs.lstatSync(source).isSymbolicLink() || (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())) {
29:       throw new Error('Standalone assets must be ordinary directories, not symbolic links.');
30:     }
31:   }
32:   if (fs.lstatSync(standalone).isSymbolicLink()) throw new Error('Standalone output must not be a symbolic link.');
33:   for (const [source, target] of copies) fs.cpSync(source, target, {recursive: true, force: true});
34:   return {server, cwd: app};
35: }
```

## Updated scripts/start-browser-stack.mjs

```text
1: /** Starts only the isolated test API plus a previously built frontend. No deployment credentials. */
2: import {prepareStandalone} from './standalone-files.mjs';
3: import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawn} from 'node:child_process';
4: const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
5: if(!process.env.TEST_MONGODB_URI)throw new Error('TEST_MONGODB_URI is required for browser tests; use the local test replica set.');
6: const standalone=prepareStandalone(path.join(root,'frontend'));
7: const children=[];let stopping=false;
8: function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');setTimeout(()=>process.exit(code),3000).unref();}
9: function child(command,args,cwd,mode){const p=spawn(command,args,{cwd,env:{...process.env,NODE_ENV:mode,DEPLOYMENT_STAGE:mode==='production'?'review':'development',SA_REQUIRE_PROXY_IDENTITY:'false',SA_PROXY_SHARED_SECRET:'',SA_PROXY_CLIENT_IP_HEADER:'',SA_PROXY_CLIENT_IP_VERIFIED:'false',PORT:'3000',HOSTNAME:'127.0.0.1',NEXT_PUBLIC_API_URL:'/api',API_PROXY_TARGET:'http://127.0.0.1:5000',API_PROXY_ALLOW_LOCAL_TEST_ONLY:'true'},stdio:'inherit'});children.push(p);p.on('error',()=>stop(1));p.on('exit',code=>{if(!stopping)stop(code||1);});return p;}
10: child(process.execPath,['integration/browserServer.js'],path.join(root,'backend'),'test');
11: child(process.execPath,[standalone.server],standalone.cwd,'production');
12: process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
```

## Interpretation and boundaries

The old page stubs already throw notFound, so a route-manifest entry is NOT evidence
that demo content was returned. The log proves the final response status was 200 and
the test required 404. The async root layout plus loading/Suspense is consistent with
Next's documented streamed not-found semantics; the prior trace body was not supplied
and the exact old Next response was not re-executed here.

The replacement handlers construct a terminal status-404 Response without rendering
that layout, and include HEAD. Guest checks still run through unchanged middleware.
Original public-portals 404 expectation and every old browser case are retained.

References inspected (official Next.js docs):

- `https://nextjs.org/docs/app/api-reference/file-conventions/not-found`
- `https://nextjs.org/docs/15/app/getting-started/route-handlers-and-middleware`
- `https://nextjs.org/docs/15/app/api-reference/config/next-config-js/output`

A fresh real Next run is still required to verify routing, middleware, RSC fallback,
headers and standalone packaging together. Helper tests are not that full run.
