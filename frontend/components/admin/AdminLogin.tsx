'use client';
import FeedbackNotice from '../feedback/FeedbackNotice';
import AcademyImage from '../AcademyImage';

import Link from 'next/link';
import {FormEvent,useEffect,useState,useRef} from 'react';
import {useRouter} from 'next/navigation';
import {apiFetch} from '../../lib/api';
import {replaceAuthDocument} from '../../lib/authNavigation';
import {useAuth} from '../auth/AuthProvider';
import PasswordField from '../auth/PasswordField';
import '../../app/auth.css';
export default function AdminLogin({mode}:{mode:'client_admin'|'super_admin'}){
 const router=useRouter(),{user,ready,sessionError,signedOut}=useAuth(),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const submitLock=useRef(false),navigating=useRef(false);
 const go=()=>{if(navigating.current)return;navigating.current=true;replaceAuthDocument(destination);};
 const superMode=mode==='super_admin',destination=superMode?'/super-admin':'/admin';
 useEffect(()=>{if(ready&&user?.role===mode&&!signedOut&&!submitLock.current)go();},[ready,user?.id,mode,destination,signedOut]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(submitLock.current)return;submitLock.current=true;setError('');setLoading(true);const f=new FormData(e.currentTarget);try{
  await apiFetch(superMode?'/auth/super-admin/login':'/auth/admin/login',{method:'POST',headers:{'X-SA-Portal':mode},body:JSON.stringify({email:f.get('email'),password:f.get('password')})});
  go();
 }catch(e:any){setError(e.message||'Unable to sign in.');}finally{if(!navigating.current){submitLock.current=false;setLoading(false);}}}
 if(!ready&&!sessionError)return <main className="authLoading" role="status">Checking this portal’s session…</main>;
 return <main className="authPage"><section className="authVisual"><Link href="/" className="authBrand"><AcademyImage src="/singh-academy-logo-clean.png" alt="Singh Academy"/><b>SINGH ACADEMY</b></Link><div><span>{superMode?'BUILDER TEAM WORKSPACE':'CLIENT ACADEMY WORKSPACE'}</span><h1>{superMode?'Website control. Separate access.':'Your academy. One secure workspace.'}</h1><p>{superMode?'Manage academy content, courses, team and events. Business and customer records are restricted to Client Admin.':'Manage courses, team, events, Academy Plans, subscriptions, learner completions and certificates with a dedicated admin session.'}</p></div></section><section className="authPanel"><form className="authCard" onSubmit={submit}><Link href="/" className="backButton">← Back to website</Link><span className="authKicker">{superMode?'SUPER ADMIN':'CLIENT ADMIN'} · SECURE ACCESS</span><h2>{superMode?'Builder team sign in':'Academy admin sign in'}</h2><p>Only accounts assigned to this portal can sign in.</p><label>Email<input name="email" type="email" required maxLength={254} autoComplete="username" placeholder={superMode?'superadmin@singhacademy.com':'admin@singhacademy.com'}/></label><PasswordField name="password" label="Password"/>{error&&<FeedbackNotice variant="error">{error}</FeedbackNotice>}<button type="submit" className="authButton" aria-busy={loading} disabled={loading}>{loading?'Checking credentials…':'Open secure workspace →'}</button><p className="authSwitch"><Link href="/login">Student sign in</Link></p><small>Admin recovery: contact your authorized account owner. Student password recovery cannot reset admin accounts.</small></form></section></main>;
}
