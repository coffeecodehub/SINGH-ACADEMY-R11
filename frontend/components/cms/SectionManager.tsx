'use client';
import FeedbackPresence from '../feedback/FeedbackPresence';
import FeedbackNotice from '../feedback/FeedbackNotice';
import {useEffect,useState} from 'react';
import {apiFetch,portalMediaUrl} from '../../lib/api';
import {Check,Field,MediaField,UploadContext,UploadFieldset,useDirty} from './Fields';
import AdminConfirm,{adminSaved} from './AdminConfirm';
import RegionalPricingEditor from './RegionalPricingEditor';
import {normalizeRegionalPricing} from './regionalPricing';
import './catalog-admin.css';
const freshSection=()=>({title:'',slug:'',shortDescription:'',description:'',thumbnail:'',thumbnailFileId:null,published:false,order:0,currency:'USD',price:'',accessMonths:1,pricing:[]});
export default function SectionManager({onDirtyChange}:{onDirtyChange?:(dirty:boolean)=>void}){
 const[items,setItems]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[status,setStatus]=useState('all'),[revision,setRevision]=useState(0),[editing,setEditing]=useState<any>(null),[archive,setArchive]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{const c=new AbortController();setLoading(true);setError('');apiFetch('/admin/sections',{signal:c.signal}).then(d=>{if(!c.signal.aborted){if(!Array.isArray(d.items))throw new Error('Section list could not be loaded.');setItems(d.items);}}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();},[revision]);
 async function remove(){if(!archive||busy)return;setBusy(true);setError('');try{await apiFetch('/admin/sections/'+archive._id,{method:'DELETE'});setArchive(null);setRevision(n=>n+1);setMessage('Section archived. Existing purchase and access history is preserved.');adminSaved('Section archived successfully.');}catch(e:any){setError(e.message);}finally{setBusy(false);}}
 const editor=editing?<SectionEditor key={editing._id||'new'} initial={editing} onDirtyChange={onDirtyChange} onClose={()=>{setEditing(null);onDirtyChange?.(false);}} onSaved={()=>{setEditing(null);onDirtyChange?.(false);setRevision(n=>n+1);setMessage('Section saved. Assign courses through the course editor.');}}/>:null;
 const shown=items.filter(item=>(status==='all'||Boolean(item.published)===(status==='published'))&&`${item.title} ${item.slug} ${item.shortDescription||''}`.toLowerCase().includes(search.toLowerCase()));
 return <FeedbackPresence contain>{editor||<section key="section-list" className="panel catalogManager" aria-label="Manage course sections">
  <div className="catalogManagerHeader"><div><h2>Course sections</h2><p>Sell access to a group of courses. A section purchase covers its published courses for the purchased term.</p></div><button type="button" className="primary" onClick={()=>setEditing(freshSection())}>＋ Add section</button></div>
  {message&&<FeedbackNotice variant="success" onDismiss={()=>setMessage('')}>{message}</FeedbackNotice>}{error&&<FeedbackNotice variant="error" onDismiss={()=>setError('')}>{error} <button type="button" className="edit" onClick={()=>setRevision(n=>n+1)}>Retry</button></FeedbackNotice>}
  <div className="toolbar"><label>Find section<input className="field" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Title or slug"/></label><label>Status<select className="field" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All sections</option><option value="published">Published</option><option value="draft">Draft</option></select></label><button type="button" className="edit" disabled={loading} onClick={()=>setRevision(n=>n+1)}>Refresh</button></div>
  {loading?<p role="status">Loading sections…</p>:shown.length?<div className="sectionAdminCards">{shown.map(item=><article className="sectionAdminCard" key={item._id}>{item.thumbnail&&<img src={portalMediaUrl(item.thumbnail)} alt={item.title} loading="lazy"/>}<div><span className="status">{item.published?'Published':'Draft'}</span><h3>{item.title}</h3><small>{item.slug} · order {item.order||0}</small><p>{item.shortDescription||item.description||'No description yet.'}</p><div className="cmsActions"><button type="button" className="edit" onClick={()=>setEditing(item)}>Edit section</button>{item.published&&<a className="edit" href={'/sections/'+encodeURIComponent(item.slug)} target="_blank" rel="noopener noreferrer">View section ↗</a>}<button type="button" className="danger" onClick={()=>setArchive(item)}>Archive</button></div></div></article>)}</div>:!error&&<p>No matching sections. Add a section, then assign courses to it.</p>}
  <AdminConfirm open={Boolean(archive)} title={`Archive ${archive?.title||'section'}?`} message="This hides the section from new purchases. Existing purchase and access records are preserved." busy={busy} onCancel={()=>setArchive(null)} onConfirm={remove}/>
 </section>}</FeedbackPresence>;
}
export function SectionEditor({initial,onClose,onSaved,onDirtyChange}:any){
 const[value,setValue]=useState(initial),[busy,setBusy]=useState(false),[uploads,setUploads]=useState(0),[error,setError]=useState(''),[confirmSave,setConfirmSave]=useState(false);
 const{mayClose}=useDirty(value,onDirtyChange,uploads>0||busy);
 const patch=(part:any)=>setValue((old:any)=>({...old,...part}));
 async function save(){if(busy||uploads)return;setError('');try{
  const title=String(value.title||'').trim();if(!title||title.length>180)throw new Error('Section title must contain 1–180 characters.');
  const slug=String(value.slug||'').trim();if(slug&&!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error('Use lowercase letters, numbers and hyphens for the section URL slug.');
  const order=Number(value.order??0);if(!Number.isInteger(order)||order<0)throw new Error('Display order must be a non-negative whole number.');
  const body={title,slug,shortDescription:value.shortDescription||'',description:value.description||'',thumbnail:value.thumbnail||'',thumbnailFileId:value.thumbnailFileId||null,published:Boolean(value.published),order,...normalizeRegionalPricing(value)};
  setBusy(true);await apiFetch('/admin/sections'+(value._id?'/'+value._id:''),{method:value._id?'PUT':'POST',body:JSON.stringify(body)});setConfirmSave(false);adminSaved('Section saved successfully.');onSaved();
 }catch(e:any){setError(e.message);}finally{setBusy(false);}}
 return <section className="panel catalogManager"><div className="builderTitle"><div><h2>{value._id?'Edit section':'New section'}</h2><p>Save a draft, assign courses, then publish when ready.</p></div><button type="button" className="pill" disabled={busy||uploads>0} onClick={async()=>{if(await mayClose())onClose();}}>Cancel</button></div>
  {error&&<FeedbackNotice variant="error" onDismiss={()=>setError('')}>{error}</FeedbackNotice>}
  <UploadContext.Provider value={delta=>setUploads(n=>Math.max(0,n+delta))}><UploadFieldset className="cmsFieldset" disabled={busy} uploading={uploads>0}><div className="formGrid">
   <Field label="Section title" value={value.title} onChange={(title:string)=>patch({title})}/><Field label="URL slug (leave blank to generate)" value={value.slug} disabled={Boolean(value._id)} onChange={(slug:string)=>patch({slug})}/>
   <Field label="Short description" type="textarea" wide value={value.shortDescription} onChange={(shortDescription:string)=>patch({shortDescription})}/><Field label="Description" type="textarea" wide value={value.description} onChange={(description:string)=>patch({description})}/>
   <Field label="Display order" type="number" min="0" step="1" value={value.order??0} onChange={(order:number)=>patch({order})}/><Check label="Published / available for purchase" checked={value.published} onChange={(published:boolean)=>patch({published})}/>
   <MediaField label="Section cover image" uploadPath="/admin/sections/upload" url={value.thumbnail} fileId={value.thumbnailFileId} onChange={(media:any)=>patch({thumbnail:media.url,thumbnailFileId:media.fileId})}/>
   <small className="wide">The original uploaded image is kept. Preview and section cards fit the full image without stretching; use a clear, high-resolution cover.</small>
   <RegionalPricingEditor value={value} onChange={patch} disabled={busy||uploads>0}/>
  </div></UploadFieldset></UploadContext.Provider>
  <div className="builderActions"><button type="button" className="primary" disabled={busy||uploads>0} onClick={()=>setConfirmSave(true)}>{busy?'Saving…':uploads?'Uploading…':value.published?'Save and publish section':'Save draft section'}</button></div>
  <AdminConfirm open={confirmSave} title={value.published?'Publish section changes?':'Save section draft?'} message={value.published?'Students can purchase this section at its configured country price. Existing paid terms keep their purchase history.':'This section stays hidden from new public purchases until published.'} busy={busy} onCancel={()=>setConfirmSave(false)} onConfirm={save}/>
 </section>;
}
