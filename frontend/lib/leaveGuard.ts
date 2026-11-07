/** Shared by lesson drafts, client links, explicit Back controls and logout. */
const guards=new Set<()=>boolean|Promise<boolean>>();
let deciding:Promise<boolean>|null=null,replaying:HTMLAnchorElement|null=null;
export function confirmPageLeave(){
 if(deciding)return Promise.resolve(false);
 const snapshot=Array.from(guards);
 const decision=(async()=>{for(const guard of snapshot){if(!guards.has(guard)||!await guard())return false;}return true;})();
 deciding=decision;return decision.finally(()=>{if(deciding===decision)deciding=null;});
}
export function isPageLinkNavigation(event:MouseEvent){
 if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return false;
 const target=event.target as Element|null,anchor=target?.closest?.('a[href]') as HTMLAnchorElement|null;
 if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return false;
 try{const next=new URL(anchor.href,window.location.href||window.location.origin),current=new URL(window.location.href||window.location.pathname,window.location.origin);return next.origin===current.origin&&(next.pathname!==current.pathname||next.search!==current.search);}catch{return false;}
}
function linkClick(event:MouseEvent){
 if(!isPageLinkNavigation(event)||!guards.size)return;
 const anchor=(event.target as Element|null)?.closest?.('a[href]') as HTMLAnchorElement|null;
 if(!anchor||anchor===replaying)return;
 event.preventDefault();event.stopImmediatePropagation();
 const href=anchor.href,from=window.location.href;
 void confirmPageLeave().then(approved=>{if(!approved||!anchor.isConnected||anchor.href!==href||window.location.href!==from)return;replaying=anchor;try{anchor.click();}finally{replaying=null;}});
}
function beforeUnload(event:BeforeUnloadEvent){if(guards.size){event.preventDefault();event.returnValue='';}}
export function registerLeaveGuard(guard:()=>boolean|Promise<boolean>){
 guards.add(guard);
 if(guards.size===1&&typeof document!=='undefined'&&typeof window!=='undefined'){document.addEventListener('click',linkClick,true);window.addEventListener('beforeunload',beforeUnload);}
 return ()=>{guards.delete(guard);if(!guards.size&&typeof document!=='undefined'&&typeof window!=='undefined'){document.removeEventListener('click',linkClick,true);window.removeEventListener('beforeunload',beforeUnload);}};
}
