/** TEST-ONLY guest synchronization for Back/Refresh and sibling-tab logout.
 * The old helper read page.url() once, then waited on that page's selector even
 * after a redirect. It also selected hidden streaming copies of header.nav.
 * Observe the CURRENT document atomically instead. A persistent second VISIBLE
 * header, wrong route/origin or stale authenticated control still fails.
 */
import {expect,type Page,type Request,type Frame} from '@playwright/test';
import {readSignedOutSnapshot,createSignedOutStability} from './signed-out-snapshot.mjs';
const origin='http://127.0.0.1:3108';
type Options={expectedPath?:'/'|'/login'|'either';navigate?:()=>Promise<unknown>};
export async function waitForSignedOutPage(page:Page,{expectedPath='either',navigate}:Options={}){
 const pending=new Set<Request>();let navigationEpoch=0;
 const requested=(request:Request)=>{
  if(request.isNavigationRequest()&&request.resourceType()==='document'&&request.frame()===page.mainFrame()){
   pending.add(request);navigationEpoch++;
  }
 };
 const finished=(request:Request)=>{pending.delete(request);};
 const navigated=(frame:Frame)=>{if(frame===page.mainFrame())navigationEpoch++;};
 const stable=createSignedOutStability({origin,expectedPath});
 page.on('request',requested);page.on('requestfinished',finished);page.on('requestfailed',finished);page.on('framenavigated',navigated);
 try{
  // Attach BEFORE Back/Refresh/the other tab's click, so a provisional document
  // request is not mistaken for an already settled old landing page.
  if(navigate)await navigate();
  await expect.poll(async()=>{
   const before=navigationEpoch;
   let snapshot:ReturnType<typeof readSignedOutSnapshot>;
   try{snapshot=await page.evaluate(readSignedOutSnapshot);}
   catch(error){
    // A document replacing its JS context is not a terminal assertion failure.
    // Only this evaluation race is polled again; real click/reload/network
    // errors, page closure and unrelated JS errors are NOT swallowed.
    const message=typeof error==='object'&&error!==null&&'message' in error&&typeof error.message==='string'?error.message:'';
    if(!page.isClosed()&&/Execution context was destroyed|Cannot find context with specified id/.test(message)){
     navigationEpoch++;
     return 'pending:document-context-replaced';
    }
    throw error;
   }
   return stable(snapshot,{pendingDocuments:pending.size+(before===navigationEpoch?0:1),navigationEpoch});
  },{message:'Same-origin guest document, hydrated public controls, no visible account UI or duplicate visible header',timeout:5000}).toMatch(/^ready:(landing|login)$/);
 }finally{
  page.off('request',requested);page.off('requestfinished',finished);page.off('requestfailed',finished);page.off('framenavigated',navigated);
 }
}
