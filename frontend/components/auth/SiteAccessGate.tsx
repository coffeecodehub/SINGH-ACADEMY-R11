'use client';
import {Fragment,useEffect,useRef} from 'react';
import Link from 'next/link';
import {usePathname,useRouter} from 'next/navigation';
import {useAuth} from './AuthProvider';
import {publicPage,loginDestination} from '../../lib/pagePolicy';
import {replaceAuthDocument,logoutDestination} from '../../lib/authNavigation';
/** Server middleware and Express enforce access; this boundary protects cached
 * client transitions and clears only private page state when the owner changes. */
export default function SiteAccessGate({children}:{children:React.ReactNode}){
 const path=usePathname()||'/',router=useRouter();
 const {user,ready,sessionError,refresh,signedOut,signingOut,portal}=useAuth();
 const open=publicPage(path),redirected=useRef('');
 useEffect(()=>{
  if(open||!ready||user||signingOut){redirected.current='';return;}
  const target=signedOut?logoutDestination(portal):loginDestination(path,window.location.search);
  if(redirected.current===target)return;redirected.current=target;
  if(signedOut)replaceAuthDocument(target);else router.replace(target);
 },[open,ready,user?.id,signingOut,signedOut,portal,path,router]);
 if(open)return <>{children}</>;
 if(!ready||!user)return <main className="contentWrap" role="status" aria-live="polite"><p>{signingOut?'Signing out securely…':sessionError?'Reconnecting securely to your account…':signedOut?'Returning to Singh Academy…':ready?'Opening sign in…':'Checking your session…'}</p>{sessionError?<button type="button" className="pill" onClick={()=>void refresh()}>Retry connection</button>:<Link prefetch={false} className="pill" href={signedOut?'/':loginDestination(path)}>Continue →</Link>}</main>;
 // No owner key around the entire RootLayout: remounting streamed auth/header
 // subtrees during hydration caused the original placeholder/link mismatch.
 return <Fragment key={portal+':'+user.id}>{children}</Fragment>;
}
