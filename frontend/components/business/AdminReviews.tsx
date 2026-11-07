'use client';
import AdminExportButton from './AdminExportButton';
import {useEffect,useRef,useState} from 'react';
import {feedback} from '../../lib/feedback';
import {apiFetch} from '../../lib/api';
import {Badge,Dialog,Empty,Loading,Notice,stamp} from './ui';
import FeedbackPresence from '../feedback/FeedbackPresence';

export default function AdminReviews({readOnly=false}:{readOnly?:boolean}){
 const[data,setData]=useState<any>(null),[error,setError]=useState(''),[q,setQ]=useState(''),[status,setStatus]=useState(''),[rating,setRating]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[editing,setEditing]=useState<any>(null),[busy,setBusy]=useState(false);
 const endpoint=readOnly?'/academy-admin/reviews':'/admin/reviews';
 const current=useRef<any>(null),confirming=useRef(false);current.current={busy,data,editing,readOnly};
 useEffect(()=>{current.current={busy,data,editing,readOnly};return()=>{current.current=null;};},[]);
 useEffect(()=>{const c=new AbortController(),timer=setTimeout(()=>{const p=new URLSearchParams({page:String(page),pageSize:'25'});if(q.trim())p.set('q',q.trim());if(status)p.set('status',status);if(rating)p.set('rating',rating);setError('');apiFetch(endpoint+'?'+p,{signal:c.signal}).then(setData).catch(e=>{if(!c.signal.aborted)setError(e.message);});},180);return()=>{clearTimeout(timer);c.abort();};},[endpoint,q,status,rating,page,revision]);
 async function save(){if(!editing)return;setBusy(true);setError('');try{await apiFetch('/admin/reviews/'+editing._id,{method:'PATCH',body:JSON.stringify({name:editing.name,rating:Number(editing.rating),message:editing.message,status:editing.status,updatedAt:editing.updatedAt,revision:editing.revision??0})});setEditing(null);setRevision(n=>n+1);window.dispatchEvent(new CustomEvent('sa-admin-feedback',{detail:{message:'Review updated successfully.'}}));}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 async function moderate(item:any,nextStatus:'approved'|'rejected'){
  if(busy||!item||confirming.current)return;const before=current.current;confirming.current=true;let approved=false;try{approved=await feedback.confirm({title:nextStatus==='approved'?'Publish learner review?':'Hide learner review?',message:`${nextStatus==='approved'?'Approve and publish':'Reject and hide'} the review from ${item.name}?`,variant:'warning',confirmLabel:nextStatus==='approved'?'Approve review':'Reject review'});}finally{confirming.current=false;}
  const latest=current.current;if(!approved||!latest||latest.busy||latest.data!==before?.data||latest.readOnly!==before?.readOnly)return;
  setBusy(true);setError('');
  try{await apiFetch('/admin/reviews/'+encodeURIComponent(item._id)+'/status',{method:'PATCH',body:JSON.stringify({status:nextStatus,updatedAt:item.updatedAt,revision:item.revision??0})});setRevision(n=>n+1);window.dispatchEvent(new CustomEvent('sa-admin-feedback',{detail:{message:nextStatus==='approved'?'Review approved and published.':'Review rejected and hidden.'}}));}
  catch(e:any){setError(e.message);setRevision(n=>n+1);}finally{setBusy(false);}
 }
 async function remove(item:any){if(!item||busy||readOnly||confirming.current)return;const before=current.current;confirming.current=true;let approved=false;try{approved=await feedback.confirm({title:'Delete learner review?',message:`Delete review from ${item.name}? This cannot be undone.`,variant:'warning',confirmLabel:'Delete review'});}finally{confirming.current=false;}const latest=current.current;if(!approved||!latest||latest.busy||latest.readOnly||latest.editing!==before?.editing||latest.data!==before?.data)return;setBusy(true);setError('');try{await apiFetch('/admin/reviews/'+item._id,{method:'DELETE'});setEditing(null);setRevision(n=>n+1);window.dispatchEvent(new CustomEvent('sa-admin-feedback',{detail:{message:'Review deleted successfully.'}}));}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <>
  <div className="bizPanel">
   <div className="bizFilters">
    <label className="bizSearch">Search reviews<input type="search" value={q} onChange={e=>{setQ(e.target.value);setPage(1);}} placeholder="Reviewer or review text"/></label>
    <label>Rating<select value={rating} onChange={e=>{setRating(e.target.value);setPage(1);}}><option value="">All ratings</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} star{n===1?'':'s'}</option>)}</select></label>
    <label>Visibility<select value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="">All</option><option value="pending">Awaiting approval</option><option value="approved">Approved / visible</option><option value="rejected">Rejected / hidden</option></select></label>
    <button className="bizButton" onClick={()=>setRevision(n=>n+1)}>Refresh</button><AdminExportButton kind="reviews" query={{q,status,rating}}/>
   </div>
   {error&&<Notice error>{error}</Notice>}
   {!data?<Loading/>:data.items.length?<div className="bizTableWrap"><table className="bizTable"><thead><tr><th>Reviewer</th><th>Rating</th><th>Review</th><th>Submitted / updated</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>{data.items.map((x:any)=><tr key={x._id}><td><b>{x.name}</b></td><td><span aria-label={`${x.rating} out of 5 stars`}>{'★'.repeat(Number(x.rating||0))}{'☆'.repeat(Math.max(0,5-Number(x.rating||0)))}</span></td><td><small style={{display:'block',maxWidth:520,whiteSpace:'normal'}}>{x.message}</small></td><td>{stamp(x.updatedAt||x.createdAt)}</td><td><Badge value={x.status==='approved'?'active':x.status==='rejected'?'blocked':'pending'} label={x.status==='approved'?'Approved / visible':x.status==='rejected'?'Rejected / hidden':'Awaiting approval'}/></td><td><div className="bizActions">{x.status!=='approved'&&<button className="bizButton bizButtonSmall" disabled={busy} onClick={()=>void moderate(x,'approved')}>Approve</button>}{x.status!=='rejected'&&<button className="bizButton bizButtonSmall" disabled={busy} onClick={()=>void moderate(x,'rejected')}>Reject</button>}{!readOnly&&<button className="bizButton bizButtonSmall" disabled={busy} onClick={()=>setEditing({...x})}>Edit</button>}</div></td></tr>)}</tbody></table></div>:<Empty title="No reviews found" description="Learner reviews will appear here as soon as they are submitted."/>}
   <div className="bizPagination"><span>{data?.total||0} reviews</span><div className="bizActions"><button className="bizButton" disabled={page<=1} onClick={()=>setPage(n=>n-1)}>Previous</button><span>Page {page}</span><button className="bizButton" disabled={!data||page*data.pageSize>=data.total} onClick={()=>setPage(n=>n+1)}>Next</button></div></div>
  </div>
  <Notice>New and edited learner reviews await approval. Approve a review to publish it; reject it to keep it hidden. {readOnly?'Client Admin can moderate visibility; review text remains read-only.':'Super Admin can also edit review details or delete a review.'}</Notice>
  <FeedbackPresence>{editing&&!readOnly&&<Dialog key={String(editing._id)} title="Edit learner review" subtitle="Changes are reflected on the public Reviews page." onClose={()=>!busy&&setEditing(null)} busy={busy}>
   <div className="bizFormGrid">
    <label className="bizField">Reviewer name<input value={editing.name||''} maxLength={120} onChange={e=>setEditing((v:any)=>({...v,name:e.target.value}))}/></label>
    <label className="bizField">Rating<select value={editing.rating||5} onChange={e=>setEditing((v:any)=>({...v,rating:Number(e.target.value)}))}>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} star{n===1?'':'s'}</option>)}</select></label>
    <label className="bizField">Visibility<select value={['approved','rejected'].includes(editing.status)?editing.status:'pending'} onChange={e=>setEditing((v:any)=>({...v,status:e.target.value}))}><option value="pending">Awaiting approval</option><option value="approved">Approved / visible on website</option><option value="rejected">Hidden from website</option></select></label>
    <label className="bizField wide">Review<textarea value={editing.message||''} minLength={10} maxLength={2000} onChange={e=>setEditing((v:any)=>({...v,message:e.target.value}))}/></label>
   </div>
   <div className="bizFormActions"><button className="bizButton bizButtonDanger" disabled={busy} onClick={()=>remove(editing)}>Delete review</button><button className="bizButton" disabled={busy} onClick={()=>setEditing(null)}>Cancel</button><button className="bizButton bizButtonPrimary" disabled={busy||String(editing.name||'').trim().length<2||String(editing.message||'').trim().length<10} onClick={save}>{busy?'Saving…':'Save review'}</button></div>
  </Dialog>}</FeedbackPresence>
 </>;
}
