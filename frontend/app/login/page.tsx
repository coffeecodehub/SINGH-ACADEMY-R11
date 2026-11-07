'use client';
import FeedbackNotice from '../../components/feedback/FeedbackNotice';
import AcademyImage from '../../components/AcademyImage';

import Link from 'next/link';
import {FormEvent,useEffect,useState,useRef} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import '../auth.css';
import BackButton from '../../components/layout/BackButton';
import PasswordField from '../../components/auth/PasswordField';
import {apiFetch,safeStudentNext} from '../../lib/api';
import {replaceAuthDocument} from '../../lib/authNavigation';
import {useAuth} from '../../components/auth/AuthProvider';
export default function Login(){
 const router=useRouter(),{user,ready,sessionError,signedOut}=useAuth(),q=useSearchParams();
 const submitLock=useRef(false),navigating=useRef(false);
 const go=(target:string)=>{if(navigating.current)return;navigating.current=true;replaceAuthDocument(target);};
 const [email,setEmail]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{if(ready&&user?.role==='student'&&!signedOut&&!submitLock.current)go(safeStudentNext(q.get('next')));},[ready,user?.id,signedOut,q]);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(submitLock.current)return;submitLock.current=true;setError('');setLoading(true);const f=new FormData(e.currentTarget);try{await apiFetch('/auth/login',{method:'POST',headers:{'X-SA-Portal':'student'},body:JSON.stringify({email:f.get('email'),password:f.get('password')})});go(safeStudentNext(q.get('next')));}catch(err:any){setError(err.message);}finally{if(!navigating.current){submitLock.current=false;setLoading(false);}}}
 if((!ready&&!sessionError)||user?.role==='student')return <main className="authLoading" role="status">Checking student session…</main>;
 return <main className="authPage"><section className="authVisual"><Link href="/" className="authBrand"><AcademyImage src="/singh-academy-logo-clean.png" alt="Singh Academy"/><b>SINGH ACADEMY</b></Link><div><span>STUDENT ACCESS</span><h1>Sign in to enroll and start learning.</h1><p>Your learning account is separate from staff and website administration.</p></div></section><section className="authPanel"><form className="authCard" onSubmit={submit}><BackButton fallback="/" label="Back" mode="destination"/><span className="authKicker">STUDENT PORTAL</span><h2>Sign in</h2><label>Email<input name="email" required type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} autoComplete="username" placeholder="you@example.com"/></label><PasswordField name="password" label="Password"/><div className="authRow"><span/><Link href="/forgot-password">Forgot password?</Link></div>{error&&<FeedbackNotice variant="error">{error}</FeedbackNotice>}<button type="submit" className="authButton" aria-busy={loading} disabled={loading}>{loading?'Signing in…':'Sign in →'}</button><p className="authSwitch">New to Singh Academy? <Link href={"/register?next="+encodeURIComponent(safeStudentNext(q.get('next')))}>Create an account</Link></p></form></section></main>;
}
