import {safeStudentNext} from './studentDestination';
export {safeStudentNext};
/** A single document replacement at credential boundaries discards Next's old
 * private RSC/router cache. Normal page navigation remains client-side. */
export function replaceAuthDocument(destination:string){
 if(typeof window==='undefined')return;
 const url=new URL(destination,window.location.origin);
 if(url.origin!==window.location.origin)throw new Error('Invalid authentication destination.');
 window.location.replace(url.pathname+url.search+url.hash);
}
export function logoutDestination(portal:string){return portal==='client_admin'?'/admin/login':portal==='super_admin'?'/super-admin/login':'/';}
