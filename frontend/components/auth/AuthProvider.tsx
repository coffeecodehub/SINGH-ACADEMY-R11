'use client';
import FeedbackNotice from '../feedback/FeedbackNotice';
import {createContext,useContext,useEffect,useMemo,useState,useCallback,useRef} from 'react';
import {usePathname} from 'next/navigation';
import {apiFetch,ApiError,isAbortError,portalForPath,Portal,accountEpoch,invalidateAccountRequests,beginExplicitLogout,boundaryMarker,explicitlyLoggedOut} from '../../lib/api';
import {useHydrated} from '../../lib/useHydrated';
import {replaceAuthDocument,logoutDestination} from '../../lib/authNavigation';
import {markLogoutConfirmed,logoutNeedsRetry,syncLogoutCookie} from '../../lib/authBoundary';
import {AUTH_BOUNDARY_PREFIX} from '../../lib/authBoundary';
type AuthState={user:any;enrollment:any;ready:boolean;setupRequired:boolean;portal:Portal;sessionError:string;signedOut:boolean;signingOut:boolean;refresh:()=>Promise<void>;logout:()=>Promise<void>};
type State={portal:Portal|null;user:any;enrollment:any;ready:boolean;setupRequired:boolean;error:string;signedOut:boolean;signingOut:boolean};
const initial:State={portal:null,user:null,enrollment:null,ready:false,setupRequired:false,error:'',signedOut:false,signingOut:false};
type ContextValue=AuthState&{hydrationState:State};
const AuthContext=createContext<ContextValue>({user:null,enrollment:null,ready:false,setupRequired:false,portal:'student',sessionError:'',signedOut:false,signingOut:false,hydrationState:initial,refresh:async()=>{},logout:async()=>{}});
export function AuthProvider({children,initialSession=null}:{children:React.ReactNode;initialSession?:any}){
 const pathname=usePathname()||'/',portal=portalForPath(pathname),generation=useRef(0),lastCheck=useRef(0),failedChecks=useRef(0);
 const seed=useRef<State>(initialSession?.portal===portal&&initialSession?.verified===true?{...initial,portal,user:initialSession.user||null,ready:true}:initialSession?.user&&initialSession.user.role===initialSession.portal?{...initial,portal:initialSession.portal,user:initialSession.user,ready:true}:initial);
 const [state,setState]=useState<State>(seed.current),[checking,setChecking]=useState(false),[logoutError,setLogoutError]=useState('');
 const activePortal=useRef(portal);activePortal.current=portal;

 const stateRef=useRef(state);stateRef.current=state;
 const flight=useRef<{portal:Portal;controller:AbortController;promise:Promise<void>}|null>(null);
 const logoutFlights=useRef(new Map<Portal,Promise<void>>());
 const clearLocal=useCallback(()=>{
  generation.current++;flight.current?.controller.abort();flight.current=null;setChecking(false);
  setState({portal,user:null,enrollment:null,ready:true,setupRequired:false,error:'',signedOut:explicitlyLoggedOut(portal),signingOut:logoutFlights.current.has(portal)});
 },[portal]);
 const check=useCallback((force=false):Promise<void>=>{
  if(explicitlyLoggedOut(portal)){syncLogoutCookie(portal);clearLocal();return Promise.resolve();}
  if(!force&&flight.current?.portal===portal)return flight.current.promise;
  flight.current?.controller.abort();const controller=new AbortController(),ticket=++generation.current,marker=boundaryMarker(portal);
  setChecking(true);lastCheck.current=Date.now();
  const promise=(async()=>{try{
   const d=await apiFetch('/auth/session?compact=1',{headers:{'X-SA-Portal':portal},signal:controller.signal});
   if(!('user' in d))throw new ApiError('Unable to confirm your session. Please retry.',502);
   if(ticket!==generation.current||explicitlyLoggedOut(portal)||boundaryMarker(portal)!==marker)return;
   if(d.user&&d.user.role!==portal)throw new ApiError('The session does not belong to this portal. Please sign in again.',401,'SESSION_REQUIRED');
   lastCheck.current=Date.now();failedChecks.current=0;
   if(stateRef.current.portal===portal&&stateRef.current.user?.id!==d.user?.id)invalidateAccountRequests(portal);
   setState(old=>{
    const sameUser=old.portal===portal&&JSON.stringify(old.user)===JSON.stringify(d.user||null);
    const sameEnrollment=old.portal===portal&&JSON.stringify(old.enrollment)===JSON.stringify(d.enrollment||null);
    return {portal,user:sameUser?old.user:d.user||null,enrollment:sameEnrollment?old.enrollment:d.enrollment||null,ready:true,setupRequired:false,error:'',signedOut:false,signingOut:false};
   });
  }catch(error:any){
   if(isAbortError(error)||ticket!==generation.current||explicitlyLoggedOut(portal))return;
   if(error instanceof ApiError&&error.status===401&&error.code==='SESSION_REQUIRED'){invalidateAccountRequests(portal);clearLocal();}
   else {failedChecks.current++;setState(old=>({...old,portal,error:'Connection interrupted. Reconnecting to your account…'}));}
  }finally{if(ticket===generation.current){flight.current=null;setChecking(false);}}})();
  flight.current={portal,controller,promise};return promise;
 },[portal,clearLocal]);
 const refresh=useCallback(()=>check(true),[check]);
 const logout=useCallback(():Promise<void>=>{
  const existing=logoutFlights.current.get(portal);if(existing)return existing;
  const logoutMarker=beginExplicitLogout(portal);clearLocal();setLogoutError('');
  setState(old=>({...old,signedOut:true,signingOut:true}));
  const promise=(async()=>{
   try{
    const result=await apiFetch('/auth/logout',{method:'POST',headers:{'X-SA-Portal':portal}});
    if(result?.success!==true||result?.signedOut!==true||(result.portal&&result.portal!==portal))throw new ApiError('Server sign-out was not confirmed.',502,'LOGOUT_UNCONFIRMED');
    if(boundaryMarker(portal)===logoutMarker)markLogoutConfirmed(portal);
   }catch(error){
    if(activePortal.current===portal&&boundaryMarker(portal)===logoutMarker)setLogoutError('Signed out in this browser. Server sign-out is not confirmed. Retry sign-out before using a shared device.');
    throw error;
   }finally{
    logoutFlights.current.delete(portal);
    if(activePortal.current===portal&&boundaryMarker(portal)===logoutMarker){
     clearLocal();
     // Navigate here, not in an unmounted header or a competing access gate.
     // The pending-revocation marker survives navigation if the network failed.
     replaceAuthDocument(logoutDestination(portal));
    }
   }
  })();logoutFlights.current.set(portal,promise);return promise;
 },[portal,clearLocal]);

 useEffect(()=>{
  const bootstrapped=initialSession?.portal===portal&&stateRef.current.portal===portal&&stateRef.current.ready;
  setState(old=>old.portal===portal?old:{...initial,portal});lastCheck.current=bootstrapped?Date.now():0;setLogoutError('');if(explicitlyLoggedOut(portal)){syncLogoutCookie(portal);clearLocal();if(logoutNeedsRetry(portal))setLogoutError('Signed out in this browser. Server sign-out is not confirmed. Retry sign-out before using a shared device.');}else if(!bootstrapped)void check();
  const verify=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.portal===portal&&d.epoch===accountEpoch(portal))void check();};
  const focused=()=>{if(explicitlyLoggedOut(portal)){clearLocal();return;}if(document.visibilityState==='visible'&&(typeof navigator==='undefined'||navigator.onLine!==false)&&Date.now()-lastCheck.current>30000)void check();};
  const signedIn=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.portal!==portal||d.user?.role!==portal||explicitlyLoggedOut(portal))return;generation.current++;flight.current?.controller.abort();flight.current=null;setChecking(false);setLogoutError('');lastCheck.current=Date.now();setState({portal,user:d.user,enrollment:null,ready:true,setupRequired:false,error:'',signedOut:false,signingOut:false});};
  const boundary=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.portal===portal&&d.kind==='logout')clearLocal();};
  const changed=(event:StorageEvent)=>{
   if(event.key!==AUTH_BOUNDARY_PREFIX+portal&&event.key!==null)return;
   invalidateAccountRequests(portal);
   if(explicitlyLoggedOut(portal)){clearLocal();return;}
   // Another tab's explicit login is not trusted identity; re-read the HttpOnly session.
   generation.current++;flight.current?.controller.abort();flight.current=null;setState({...initial,portal});void check(true);
  };
  const restored=(event:PageTransitionEvent)=>{
   if(explicitlyLoggedOut(portal)){clearLocal();return;}
   if(event.persisted){generation.current++;flight.current?.controller.abort();flight.current=null;setState({...initial,portal});void check(true);}
  };
  const heartbeat=setInterval(focused,5*60000);
  window.addEventListener('sa:authenticated',signedIn);window.addEventListener('sa:session-check',verify);window.addEventListener('sa:auth-boundary',boundary);
  window.addEventListener('storage',changed);window.addEventListener('pageshow',restored);window.addEventListener('focus',focused);window.addEventListener('online',focused);document.addEventListener('visibilitychange',focused);
  return()=>{generation.current++;flight.current?.controller.abort();flight.current=null;clearInterval(heartbeat);window.removeEventListener('sa:authenticated',signedIn);window.removeEventListener('sa:session-check',verify);window.removeEventListener('sa:auth-boundary',boundary);window.removeEventListener('storage',changed);window.removeEventListener('pageshow',restored);window.removeEventListener('focus',focused);window.removeEventListener('online',focused);document.removeEventListener('visibilitychange',focused);};
 },[portal,check,clearLocal]);
 useEffect(()=>{if(!state.error||explicitlyLoggedOut(portal))return;const timer=setTimeout(()=>{if(typeof navigator==='undefined'||navigator.onLine!==false)void check();},Math.min(60000,5000*2**Math.min(failedChecks.current,4)));return()=>clearTimeout(timer);},[state.error,checking,check,portal]);
 const value=useMemo(()=>({user:state.portal===portal?state.user:null,enrollment:state.portal===portal?state.enrollment:null,ready:state.portal===portal&&state.ready,setupRequired:state.portal===portal&&state.setupRequired,sessionError:state.portal===portal?state.error:'',signedOut:state.portal===portal&&state.signedOut,signingOut:state.portal===portal&&state.signingOut,hydrationState:seed.current,portal,refresh,logout}),[state,portal,refresh,logout]);
 return <AuthContext.Provider value={value}>{(logoutError||value.sessionError)&&<FeedbackNotice variant="warning"><span>{logoutError||value.sessionError} </span><button type="button" className="pill" disabled={checking} onClick={()=>{if(logoutError)void logout().catch(()=>{});else void refresh();}}>{logoutError?'Retry sign-out':checking?'Reconnecting…':'Retry connection'}</button></FeedbackNotice>}{children}</AuthContext.Provider>;
}
export function useAuth():AuthState{
 const value=useContext(AuthContext),hydrated=useHydrated(),seed=value.hydrationState;
 // Every component hydrates using the request's original snapshot, even if a
 // session effect resolved while a nested Suspense boundary was still pending.
 if(!hydrated)return {...value,user:seed.portal===value.portal?seed.user:null,enrollment:seed.portal===value.portal?seed.enrollment:null,ready:seed.portal===value.portal&&seed.ready,setupRequired:false,sessionError:seed.portal===value.portal?seed.error:'',signedOut:false,signingOut:false};
 return value;
}
