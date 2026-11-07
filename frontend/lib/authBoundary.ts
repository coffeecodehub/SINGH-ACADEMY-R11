/** Browser-only, non-secret account boundary. Never stores a token or grants authentication.
 * An explicit logout survives Back/Forward, reloads and sibling tabs. Only an actual
 * successful credentials request may remove it; session GET responses cannot. */
export type BoundaryPortal='student'|'client_admin'|'super_admin';
export const AUTH_BOUNDARY_PREFIX='sa.auth.boundary.v608.';
const PENDING_PREFIX='sa.auth.logoutPending.v611.';
const pendingMemory:Partial<Record<BoundaryPortal,boolean>>={};
const memory:Partial<Record<BoundaryPortal,string>>={};
export function boundaryMarker(portal:BoundaryPortal):string{
 if(typeof window==='undefined')return '';
 try{const value=window.localStorage.getItem(AUTH_BOUNDARY_PREFIX+portal);if(value!==null){memory[portal]=value;return value;}}
 catch{/* Private mode/storage restrictions: keep the in-document boundary. */}
 return memory[portal]||'';
}
export function explicitlyLoggedOut(portal:BoundaryPortal):boolean{return boundaryMarker(portal).startsWith('logout:');}
export function syncLogoutCookie(portal:BoundaryPortal){
 if(typeof window==='undefined'||typeof document==='undefined'||!explicitlyLoggedOut(portal))return;
 document.cookie='sa_logout_'+portal+'=1; Path=/; SameSite=Lax; Max-Age=604800'+(window.location.protocol==='https:'?'; Secure':'');
}
function setPending(portal:BoundaryPortal,pending:boolean){pendingMemory[portal]=pending;try{if(pending)window.localStorage.setItem(PENDING_PREFIX+portal,'1');else window.localStorage.removeItem(PENDING_PREFIX+portal);}catch{}}
export function logoutNeedsRetry(portal:BoundaryPortal){try{return window.localStorage.getItem(PENDING_PREFIX+portal)==='1';}catch{return pendingMemory[portal]===true;}}
export function markLogoutConfirmed(portal:BoundaryPortal){setPending(portal,false);}
function write(portal:BoundaryPortal,kind:'login'|'logout'){
 const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2);
 const marker=`${kind}:${Date.now()}:${id}`;memory[portal]=marker;setPending(portal,kind==='logout');
 if(typeof window!=='undefined'){
  try{window.localStorage.setItem(AUTH_BOUNDARY_PREFIX+portal,marker);}catch{}
  if(typeof document!=='undefined'){const secure=window.location.protocol==='https:'?'; Secure':'';document.cookie='sa_logout_'+portal+'='+ (kind==='logout'?'1':'')+'; Path=/; SameSite=Lax; Max-Age='+(kind==='logout'?'604800':'0')+secure;}
  window.dispatchEvent(new CustomEvent('sa:auth-boundary',{detail:{portal,marker,kind}}));
 }
 return marker;
}
export function markExplicitLogout(portal:BoundaryPortal){if(explicitlyLoggedOut(portal)){setPending(portal,true);syncLogoutCookie(portal);return boundaryMarker(portal);}return write(portal,'logout');}
/** Invoke only after a successful login/register response, never during session polling. */
export function markExplicitLogin(portal:BoundaryPortal){return write(portal,'login');}
