/** Controlled DOM/navigation cases for the observer itself, not application
 * auth or provider mocks. The original 44 application-browser cases remain.
 */
import {test,expect,type BrowserContext} from '@playwright/test';
import {waitForSignedOutPage} from './helpers/signed-out-page';
import {readSignedOutSnapshot,signedOutSnapshotState} from './helpers/signed-out-snapshot.mjs';
const origin='http://127.0.0.1:3108';
const header=(ready=true)=>`<header class="nav" data-auth-controls-ready="${ready}"><a href="/login">Sign In</a><a href="/register">Register</a></header>`;
const form='<form class="authCard"><label>Email<input name="email" type="email"></label><label>Password<input name="password" type="password"></label><button type="submit">Sign in →</button></form>';
const html=(body:string)=>'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Controlled guest-observer document</title></head><body>'+body+'</body></html>';
async function documents(context:BrowserContext,landing:string,login=form){
 await context.route(origin+'/**',route=>{
  if(route.request().resourceType()!=='document')return route.continue();
  return route.fulfill({status:200,contentType:'text/html; charset=utf-8',headers:{'Cache-Control':'no-store'},body:html(new URL(route.request().url()).pathname==='/login'?login:landing)});
 });
}
test('V60.12.3 observer accepts one visible guest header with a hidden streaming copy',async({page,context})=>{
 await documents(context,`<div hidden>${header(false)}</div><main>${header()}</main>`);
 await waitForSignedOutPage(page,{expectedPath:'/',navigate:()=>page.goto('/')});
 const snapshot=await page.evaluate(readSignedOutSnapshot);
 expect(snapshot.totalHeaders).toBe(2);expect(snapshot.headers).toHaveLength(1);
 expect(signedOutSnapshotState(snapshot,{origin})).toBe('ready:landing');
});
test('V60.12.3 observer re-evaluates the login form after a delayed landing-to-login redirect',async({page,context})=>{
 await documents(context,header(false));
 await waitForSignedOutPage(page,{navigate:async()=>{
  await page.goto('/');
  // Controlled navigation delay recreates the reported race. The helper uses
  // its usual bounded condition polling, not a fixed sleep or a longer timeout.
  await page.evaluate(()=>{setTimeout(()=>location.replace('/login?next=%2Fteam'),150);});
 }});
 await expect(page).toHaveURL(origin+'/login?next=%2Fteam');
 await expect(page.getByLabel('Email',{exact:true})).toBeVisible();
});
test('V60.12.3 observer fails a genuine persistent TWO-visible-header rendering bug',async({page,context})=>{
 await documents(context,header(false)+header());await page.goto('/');
 const snapshot=await page.evaluate(readSignedOutSnapshot);
 expect(snapshot.headers).toHaveLength(2);
 expect(signedOutSnapshotState(snapshot,{origin})).toBe('pending:visible-header-count=2');
 await expect(waitForSignedOutPage(page,{expectedPath:'/'})).rejects.toThrow(/visible-header-count=2/);
});
test('V60.12.3 observer refuses signed-in controls and preserves exact logout landing destination',async({page,context})=>{
 await documents(context,header()+'<span class="userChip">Previous account</span><button class="logoutBtn">Logout</button>');
 await page.goto('/');let snapshot=await page.evaluate(readSignedOutSnapshot);
 expect(signedOutSnapshotState(snapshot,{origin})).toBe('pending:account-ui-still-present');
 await page.goto('/login?next=%2Fteam');snapshot=await page.evaluate(readSignedOutSnapshot);
 expect(signedOutSnapshotState(snapshot,{origin,expectedPath:'/'})).toBe('pending:wrong-guest-destination');
 await waitForSignedOutPage(page,{expectedPath:'/login'});
});
