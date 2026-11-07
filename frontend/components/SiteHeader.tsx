'use client';
import AcademyImage from './AcademyImage';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useState,useEffect,useRef} from 'react';
import {useAuth} from './auth/AuthProvider';
import {loginDestination,publicPage} from '../lib/pagePolicy';
import {useHydrated} from '../lib/useHydrated';
import {confirmPageLeave} from '../lib/leaveGuard';
import FeedbackNotice from './feedback/FeedbackNotice';

const links=[['Home','/home'],['About','/about'],['Team','/team'],['Reviews','/reviews'],['Video Reviews','/video-reviews'],['Academy Plans','/academy'],['Events','/events'],['Contact','/contact']];

/** Navigation layout is responsive; page and API access are verified separately. */
export default function SiteHeader({landing=false}:{landing?:boolean}){
  const {user,ready,logout,signingOut:providerSigningOut}=useAuth();
  // SSR account data can paint before this header has JavaScript listeners.
  // Keep action buttons disabled until hydration, rather than accepting an
  // inert Logout click. SSR and the first hydration render both see false.
  const hydrated=useHydrated();
  const signOutLock=useRef(false);
  const activeAccount=useRef('');activeAccount.current=ready&&user?String(user.id||user._id)+':'+user.role:'';
  // The same verified account state is shown on every public page.
  const displayUser = user;
  const displayReady = ready;
  const [menu,setMenu]=useState(false),[signingOut,setSigningOut]=useState(false),[logoutError,setLogoutError]=useState('');
  const pathname=usePathname()||'/';
  const headerRef=useRef<HTMLElement>(null);
  useEffect(()=>{setMenu(false);},[pathname]);
  useEffect(()=>{if(!menu)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMenu(false);headerRef.current?.querySelector<HTMLButtonElement>('.menuButton')?.focus();}};const outside=(event:PointerEvent)=>{if(!headerRef.current?.contains(event.target as Node))setMenu(false);};document.addEventListener('keydown',key);document.addEventListener('pointerdown',outside);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',outside);};},[menu]);
  async function signOut(){
    if(!hydrated||!ready||!user||providerSigningOut||signOutLock.current)return;
    const account=activeAccount.current;signOutLock.current=true;
    try{if(!await confirmPageLeave()||activeAccount.current!==account)return;setSigningOut(true);setLogoutError('');await logout();}
    catch{setLogoutError('Server sign-out needs a retry. Returning to the landing page…');}
    finally{signOutLock.current=false;setSigningOut(false);}
  }
  return <header className="nav" ref={headerRef} data-auth-controls-ready={hydrated?'true':'false'}>
    <Link prefetch={false} className="brand" href={displayUser?'/home':'/'}><span className="logoShell"><AcademyImage src="/singh-academy-logo-clean.png" alt="Singh Academy"/></span><span>SINGH ACADEMY</span></Link>
    <nav id="academy-public-navigation" aria-label="Main navigation" className={menu?'open':''}>{links.map(([label,href])=>{
      const catalog=href==='/academy'&&/^\/(?:academy|courses|sections)(?:\/|$)/.test(pathname);
      const active=!landing&&(catalog||pathname===href||(href!=='/home'&&pathname.startsWith(href+'/')));
      return <Link prefetch={false} key={href} className={active?'navActive':''} href={displayReady&&!displayUser&&!publicPage(href)?loginDestination(href):href} onClick={()=>setMenu(false)}>{label}</Link>
    })}{displayReady&&displayUser?.role==='student'&&<Link prefetch={false} className={(pathname.startsWith('/my-course')||pathname.startsWith('/learn/'))?'navActive':''} href="/my-course" onClick={()=>setMenu(false)}>My Courses</Link>}{displayReady&&displayUser?.role==='student'&&<Link prefetch={false} className={pathname==='/billing'?'navActive':''} href="/billing" onClick={()=>setMenu(false)}>My Billing</Link>}</nav>
    <div className="actions">{!displayReady?<span className="authPlaceholder" aria-label="Checking session"/>:displayUser?<><span className="userChip"><span className="userDot">{String(displayUser.name||'U')[0]}</span><span className="userNameText">{String(displayUser.name).split(' ')[0]}</span></span><button type="button" className="authBtn logoutBtn" disabled={!hydrated||!ready||signingOut||providerSigningOut} aria-busy={signingOut||providerSigningOut} title={logoutError||undefined} onClick={signOut}>{signingOut||providerSigningOut?'Signing out…':'Logout'}</button>{logoutError&&<FeedbackNotice variant="error" className="saFeedbackHeader">{logoutError}</FeedbackNotice>}</>:<><Link prefetch={false} className="authBtn signInBtn" href="/login">Sign In</Link><Link prefetch={false} className="authBtn registerBtn" href="/register">Register</Link></>}
      <button type="button" disabled={!hydrated} aria-controls="academy-public-navigation" aria-label="Toggle navigation" aria-expanded={menu} className="menuButton" onClick={()=>setMenu(!menu)}>{menu?'×':'☰'}</button>
    </div>
  </header>
}
