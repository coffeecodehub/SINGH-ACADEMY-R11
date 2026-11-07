'use client';
import AcademyImage from '../../../components/AcademyImage';
import Link from 'next/link';
import PriceOptions from '../../../components/catalog/PriceOptions';

import {useEffect,useRef,useState} from 'react';
import {useHydrated} from '../../../lib/useHydrated';
import {useParams,useRouter} from 'next/navigation';
import BackButton from '../../../components/layout/BackButton';
import SiteHeader from '../../../components/SiteHeader';
import SiteFooter from '../../../components/layout/SiteFooter';
import {apiFetch,isAbortError} from '../../../lib/api';
import {useAuth} from '../../../components/auth/AuthProvider';
import ApiLoadError from '../../../components/ApiLoadError';
import {courseAccessPresentation} from '../../../lib/courseAccessPresentation';
import {useCatalogAccess} from '../../../lib/useCatalogAccess';
import FeedbackNotice from '../../../components/feedback/FeedbackNotice';

/** Existing course detail layout; access checks lead to verified hosted checkout when required. */
export default function CourseDetail(){
 const params=useParams<{slug:string}>(); const router=useRouter(); const {user,ready}=useAuth();
 const catalog=useCatalogAccess(),hydrated=useHydrated();
 const startFlight=useRef<AbortController|null>(null),startGeneration=useRef(0),leaving=useRef(false);
 useEffect(()=>{startGeneration.current++;leaving.current=false;setEnrolling(false);return()=>{startGeneration.current++;startFlight.current?.abort();startFlight.current=null;};},[catalog.scope,params?.slug]);
 const[loadError,setLoadError]=useState(''),[revision,setRevision]=useState(0);
 const[loadedScope,setLoadedScope]=useState(''),[c,setC]=useState<any>(null),[modules,setModules]=useState<any[]>([]),[loading,setLoading]=useState(true),[enrolling,setEnrolling]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{if(!params?.slug)return;const controller=new AbortController();setLoading(true);setLoadError('');
 apiFetch(`/courses/${params.slug}`,{signal:controller.signal}).then(d=>{if(!d.course)throw new Error('The course response is incomplete.');if(!controller.signal.aborted){setC(d.course);setModules(d.modules||[]);setLoadedScope(catalog.scope);}}).catch(e=>{if(!isAbortError(e)&&!controller.signal.aborted)setLoadError(e.status===404?'This course is not published at this address. Return to Academy Plans or contact the Academy.':e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[params?.slug,catalog.scope,revision]);
 // Prepare only the route shell, never a payment or an enrollment. This avoids
 // making the first Start click pay for the learning route's entire cold load.
 useEffect(()=>{if(hydrated&&ready&&user&&c?.accessType==='free'&&c.slug===params.slug)router.prefetch?.(`/learn/${encodeURIComponent(params.slug)}`);},[hydrated,ready,user?.id,c?.slug,c?.accessType,params.slug,router]);
 async function openCourse(){
  if(!hydrated||!ready||enrolling||startFlight.current||leaving.current||!c||c.slug!==params.slug)return;
  const slug=encodeURIComponent(params.slug);
  if(!user){router.push(`/login?next=${encodeURIComponent(`/courses/${slug}`)}`);return;}
  const controller=new AbortController(),ticket=startGeneration.current;
  startFlight.current=controller;setEnrolling(true);setMessage('');
  const current=()=>!controller.signal.aborted&&ticket===startGeneration.current;
  const enter=(href:string)=>{if(!current())return;leaving.current=true;window.dispatchEvent(new CustomEvent('sa:navigation',{detail:{href}}));router.push(href);};
  try{
   if(c.accessType==='free'){
    await apiFetch(`/courses/${slug}/enroll`,{method:'POST',signal:controller.signal});
    enter(`/learn/${slug}`);return;
   }
   const data=await apiFetch(`/payments/access/${slug}`,{signal:controller.signal});
   if(!current())return;
   if(data.hasAccess){
    if(!data.enrollment)await apiFetch(`/courses/${slug}/enroll`,{method:'POST',signal:controller.signal});
    enter(`/learn/${slug}`);
   }else{catalog.refresh();enter(c.accessType==='membership'?'/academy':`/checkout?course=${slug}`);}
  }catch(error:any){if(current()&&!isAbortError(error))setMessage(error.message||'Unable to open this course right now.');}
  finally{
   if(startFlight.current===controller)startFlight.current=null;
   // Remain busy until the route changes; resetting here enabled repeat clicks
   // while Next was still preparing the learning page.
   if(current()&&!leaving.current)setEnrolling(false);
  }
 }
 if(loading||!loadError&&loadedScope!==catalog.scope)return <main><SiteHeader/><section className="innerHero"><BackButton fallback="/academy" label="Back to Academy Plans"/><h1>Loading course…</h1></section><SiteFooter/></main>;
 if(loadError||!c)return <main><SiteHeader/><section className="innerHero"><BackButton fallback="/academy" label="Back to Academy Plans"/><h1>Course temporarily unavailable</h1><ApiLoadError message={loadError||'Unable to load the course.'} onRetry={()=>setRevision(n=>n+1)}/></section><SiteFooter/></main>;
 const coverage=catalog.courseAccess(c),access=courseAccessPresentation(c,coverage||false),checking=c.accessType!=='free'&&(catalog.checking||catalog.unavailable);
 return <main><SiteHeader/><section className="courseDetailHero"><div className="courseBackRow"><BackButton fallback="/academy" label="Back to Academy Plans"/>{c.sectionSlug&&<nav className="catalogBreadcrumb" aria-label="Breadcrumb"><Link href="/academy">Academy Plans</Link><span aria-hidden="true">/</span><Link href={`/sections/${encodeURIComponent(c.sectionSlug)}`}>Course section</Link><span aria-hidden="true">/</span><span aria-current="page">{c.title}</span></nav>}</div><div><AcademyImage priority className="courseCoverImage" src={c.thumbnail||'/images/courses/course-placeholder.jpg'} alt={c.title}/><span className="kicker">SINGH ACADEMY COURSE</span><h1>{c.title}</h1><p>{c.shortDescription||c.description}</p><div className="courseFacts"><span><b>{c.instructor}</b></span><span>{modules.length} modules</span><span>Videos • readings • reflections • resources</span></div></div><aside className="enrollPanel"><span className="kicker">COURSE ACCESS</span><h3>{access.title}</h3><p>{access.description}</p>{!coverage&&!checking&&<PriceOptions product={c} kind="course" checkout/>}{catalog.unavailable&&<ApiLoadError message={catalog.error} onRetry={catalog.refresh}/>}<button type="button" className="button" aria-busy={enrolling} disabled={!hydrated||enrolling||!ready||checking} onClick={openCourse}>{enrolling?access.busy:checking?'Checking access…':access.button}</button>{message&&<FeedbackNotice variant="error">{message}</FeedbackNotice>}<small>{access.note}</small>{c.sectionSlug&&<p>This course is also included with active access to its section. <Link href={`/sections/${encodeURIComponent(c.sectionSlug)}`}>Explore the full section →</Link></p>}</aside></section><section className="contentWrap courseCurriculum"><div><span className="kicker">CURRICULUM</span><h2>Course → Modules → Lessons</h2><p>Explore the published course modules, lessons and learning activities.</p></div><div className="moduleList">{modules.length?modules.map((m:any,i:number)=><article className="moduleCard" key={m._id||m.title}><div><span>{String(i+1).padStart(2,'0')}</span><h3>{m.title}</h3></div><p>{m.lessons?.length||0} lessons • sequential learning</p></article>):<div className="emptyState"><b>Course content coming soon.</b><p>No module data has been published for this course yet.</p></div>}</div></section><SiteFooter/></main>}
