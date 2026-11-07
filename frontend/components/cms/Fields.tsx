'use client';
import AcademyImage from '../AcademyImage';
import CropMediaField from './CropMediaField';

import {Children,cloneElement,isValidElement,createContext,useContext,useEffect,useRef,useState,type ReactNode,type ReactElement} from 'react';
import {API_URL,requestHeaders,portalMediaUrl,portalMediaDownloadUrl} from '../../lib/api';
import {adminUpload} from '../../lib/adminUpload';
import {feedback} from '../../lib/feedback';
import {useFeedbackPresence} from '../feedback/FeedbackPresence';
import FeedbackNotice from '../feedback/FeedbackNotice';
export type RecordData = Record<string,any>;
export const UploadContext=createContext<(delta:number)=>void>(()=>{});
export function clean(value:RecordData){const {_id,__v,createdAt,updatedAt,module,course,...body}=value;return body;}
export function Field({label,value,onChange,type='text',wide=false,options,disabled=false,min,max,step,placeholder}:any){
  return <label className={wide?'wide':''}>{label}{options?<select className="field" disabled={disabled} value={value??''} onChange={e=>onChange(e.target.value)}>{options.map((x:any)=>{const [v,t]=Array.isArray(x)?x:[x,x];return <option key={v} value={v}>{t}</option>})}</select>:type==='textarea'?<textarea className="field tall" placeholder={placeholder} value={value??''} disabled={disabled} onChange={e=>onChange(e.target.value)}/>:<input className="field" placeholder={placeholder} type={type} value={value??''} min={min} max={max} step={step} disabled={disabled} onChange={e=>onChange(type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value)}/>}</label>;
}
export function Check({label,checked,onChange,disabled=false}:any){return <label className="check"><input type="checkbox" disabled={disabled} checked={Boolean(checked)} onChange={e=>onChange(e.target.checked)}/>{label}</label>}
export function useDirty(value:any,onDirty?:((dirty:boolean)=>void),blocking=false){
  const [saved,setSaved]=useState(()=>JSON.stringify(value));
  const present=useFeedbackPresence()?.present!==false;
  const dirty=present&&(JSON.stringify(value)!==saved||blocking);
  const closeState=useRef<{snapshot:string;blocking:boolean;present:boolean}|null>(null);closeState.current={snapshot:JSON.stringify(value),blocking:blocking||!present,present};
  useEffect(()=>{closeState.current={snapshot:JSON.stringify(value),blocking:blocking||!present,present};return()=>{closeState.current=null;};},[]);
  useEffect(()=>{onDirty?.(dirty);return ()=>onDirty?.(false)},[dirty,onDirty]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty&&closeState.current?.present){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn)},[dirty]);
  return {dirty,markSaved:(next:any)=>setSaved(JSON.stringify(next)),mayClose:async()=>{const before=closeState.current;if(!before||before.blocking)return false;if(dirty&&!await feedback.confirm({title:'Discard unsaved changes?',message:'Discard unsaved changes?',variant:'warning',confirmLabel:'Discard changes'}))return false;return !!closeState.current&&!closeState.current.blocking&&closeState.current.snapshot===before.snapshot;}};
}
export function MediaField({label='Image',url='',fileId=null,onChange,kind='image',cropEnabled=false,originalUrl='',originalFileId=null,imageEdit=null,disabled=false,uploadPath='/admin/upload'}:any){
  const notify=useContext(UploadContext),[busy,setBusy]=useState(false),[error,setError]=useState(''),[local,setLocal]=useState(''),[progress,setProgress]=useState(0),[processing,setProcessing]=useState(false);
  const alive=useRef(true),abort=useRef<AbortController|null>(null),xhrRef=useRef<XMLHttpRequest|null>(null);
  useEffect(()=>{alive.current=true;return ()=>{alive.current=false;abort.current?.abort();xhrRef.current?.abort()}},[]);
  useEffect(()=>()=>{if(local)URL.revokeObjectURL(local)},[local]);
  async function upload(file:File){
    if(!file.size){setError('Choose a non-empty file.');return;}
    if(kind==='image'&&!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){setError('Use a JPG, PNG, WebP or GIF image.');return}
    setError('');setBusy(true);setProgress(0);setProcessing(false);notify(1);if(kind==='image')setLocal(URL.createObjectURL(file));abort.current=new AbortController();
    let heartbeat:ReturnType<typeof setInterval>|null=null;
    try{
      const body=new FormData();body.append('file',file);
      // Keep the admin session active during large uploads. This request is deliberately separate from the upload stream.
      heartbeat=setInterval(()=>{fetch(`${API_URL}/auth/session`,{credentials:'include',headers:requestHeaders(),cache:'no-store'}).catch(()=>{});},4*60*1000);
      const transferMedia=async()=>{const response=await adminUpload(API_URL+uploadPath,{body,headers:requestHeaders({method:'POST',body}),signal:abort.current!.signal,onProgress:value=>{if(alive.current){setProgress(value.percent);setProcessing(value.processing);}}});let data:any;try{data=await response.json();}catch{throw new Error('The upload server returned an invalid response.');}if(!response.ok||data.success!==true)throw new Error(data.message||`Upload failed (${response.status}).`);return data;};
      const d:any=kind==='image'||kind==='video'?await transferMedia():await new Promise((resolve,reject)=>{
        const xhr=new XMLHttpRequest();xhrRef.current=xhr;xhr.open('POST',API_URL+uploadPath);xhr.withCredentials=true;xhr.timeout=0;
        requestHeaders({method:'POST',body}).forEach((v,k)=>xhr.setRequestHeader(k,v));
        xhr.upload.onprogress=e=>{if(alive.current&&e.lengthComputable)setProgress(Math.max(1,Math.min(99,Math.round(e.loaded/e.total*100))));};
        xhr.onload=()=>{let data:any={};try{data=xhr.responseText?JSON.parse(xhr.responseText):{};}catch{return reject(new Error('The upload server returned an invalid response.'));}if(xhr.status<200||xhr.status>=300)return reject(new Error(data.message||`Upload failed (${xhr.status}).`));resolve(data);};
        xhr.onerror=()=>reject(new Error('Upload connection failed. Check your network and try again.'));
        xhr.ontimeout=()=>reject(new Error('The upload connection timed out. Check the hosting connection and retry the original file.'));
        xhr.onabort=()=>reject(Object.assign(new Error('Upload cancelled.'),{name:'AbortError'}));
        abort.current?.signal.addEventListener('abort',()=>xhr.abort(),{once:true});xhr.send(body);
      });
      if(alive.current){setProgress(100);setProcessing(false);onChange({url:d.url,fileId:d.fileId,fileName:d.name,mime:d.mime});}
    }
    catch(e:any){if(alive.current){setError(e.name==='AbortError'?'Upload cancelled.':e.message);setLocal('')}}
    finally{if(heartbeat)clearInterval(heartbeat);xhrRef.current=null;if(alive.current){setBusy(false);setLocal('');setTimeout(()=>alive.current&&setProgress(0),700)}notify(-1)}
  }
  if(cropEnabled&&kind==='image')return <CropMediaField {...{label,url,fileId,originalUrl,originalFileId,imageEdit,onChange,notify,disabled}}/>;
  return <div className="cmsMedia wide"><b>{label}</b>{kind==='image'&&(local||url)&&<AcademyImage className="cmsImagePreview" src={local||portalMediaUrl(url)} alt={`${label} preview`}/>}{kind==='video'&&url&&fileId&&<video className="cmsVideoPreview" src={portalMediaUrl(url)} controls preload="metadata"/>}{busy&&<div className="cmsUploadProgress" role="progressbar" aria-label={`Uploading ${label}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={processing?undefined:progress}><i style={{width:`${progress}%`}}/><span>{processing?'Transfer complete. Securely scanning and saving…':progress?`${progress}% uploaded`:'Preparing upload…'}</span></div>}<div className="cmsActions"><label className="cmsUploadLabel">{url?'Replace file':'Upload file'}<input aria-label={`Upload ${label}`} type="file" disabled={busy||disabled} accept={kind==='image'?'image/jpeg,image/png,image/webp,image/gif':kind==='video'?'video/mp4,video/webm,video/quicktime':'.pdf,.doc,.docx'} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)upload(file)}}/></label>{busy&&<button type="button" className="danger" data-cms-upload-cancel="true" onClick={()=>{abort.current?.abort();xhrRef.current?.abort();}}>Cancel upload</button>}{url&&<><a className="edit" href={portalMediaUrl(url)} target="_blank" rel="noopener noreferrer">Open file ↗</a>{fileId&&kind==='document'&&<a className="edit" href={portalMediaDownloadUrl(url)} download>Download file ↓</a>}<button type="button" className="danger" disabled={busy||disabled} onClick={()=>onChange({url:'',fileId:null,fileName:'',mime:''})}>Remove file</button></>}</div><small>{busy?'Large uploads stay signed in and show real transfer progress. Keep this tab open until processing finishes.':`${kind==='image'?'JPG, PNG, WebP, GIF':kind==='video'?'MP4, WebM or MOV · original video duration is not limited.':'PDF, DOC or DOCX'} · changes apply when you save.`}</small>{error&&<FeedbackNotice variant="error" onDismiss={()=>setError('')}>{error}</FeedbackNotice>}</div>;
}
export function Questions({value=[],onChange,disabled=false}:any){
  const patch=(i:number,part:any)=>onChange(value.map((q:any,n:number)=>n===i?{...q,...part}:q));
  return <UploadFieldset uploading={disabled} className="cmsFieldset wide"><div className="questionBox wide"><div className="cmsActions"><b>Quiz / self-assessment questions</b><button type="button" className="edit" onClick={()=>onChange([...value,{prompt:'',kind:'long-text',required:true,points:1,options:[]}])}>＋ Add question</button></div>{value.map((q:any,i:number)=><div className="contentBlockCard" key={i}><div className="cmsActions"><b>Question {i+1}</b><button type="button" className="danger" onClick={()=>onChange(value.filter((_:any,j:number)=>j!==i))}>Delete question</button></div><div className="formGrid"><Field label="Question" value={q.prompt} wide onChange={(prompt:string)=>patch(i,{prompt})}/><Field label="Answer type" value={q.kind} onChange={(kind:string)=>patch(i,{kind,correctAnswer:''})} options={[['long-text','Long text'],['short-text','Short text'],['rating','Rating'],['multiple-choice','MCQ — one answer'],['multiple-select','MSQ — multiple answers'],['true-false','True / False'],['file','File upload']]}/><Field label="Points" type="number" min="0" value={q.points??1} onChange={(points:number)=>patch(i,{points})}/>{['multiple-choice','multiple-select'].includes(q.kind)&&<Field label="Answer options (one per line)" type="textarea" wide value={(q.options||[]).join('\n')} onChange={(text:string)=>patch(i,{options:text.split('\n')})}/>}{['multiple-choice','multiple-select','true-false','short-text'].includes(q.kind)&&<Field label="Answer key (teacher reference; automatic grading not enabled)" wide value={String(q.correctAnswer??'')} options={q.kind==='true-false'?[['','No answer key'],['true','True'],['false','False']]:undefined} onChange={(correctAnswer:string)=>patch(i,{correctAnswer})}/>}<Check label="Required question" checked={q.required!==false} onChange={(required:boolean)=>patch(i,{required})}/></div></div>)}</div></UploadFieldset>;
}
export function Resources({value=[],onChange,disabled=false}:any){return <UploadFieldset uploading={disabled} className="cmsFieldset wide"><div className="wide"><b>Learning resources</b>{value.map((x:any,i:number)=><div className="contentBlockCard" key={i}><div className="formGrid"><Field label="Resource label" value={x.label} onChange={(label:string)=>onChange(value.map((a:any,j:number)=>j===i?{...a,label}:a))}/><Field label="Resource URL" value={x.url} onChange={(url:string)=>onChange(value.map((a:any,j:number)=>j===i?{...a,url,fileId:null}:a))}/><MediaField label={`Resource ${i+1}`} kind="document" url={x.url} fileId={x.fileId} onChange={(p:any)=>onChange(value.map((a:any,j:number)=>j===i?{...a,...p}:a))}/></div><button type="button" className="danger" onClick={()=>onChange(value.filter((_:any,j:number)=>j!==i))}>Remove resource</button></div>)}<button type="button" className="edit" onClick={()=>onChange([...value,{label:'',url:'',kind:'link'}])}>＋ Add resource</button></div></UploadFieldset>}

export function MoneyField({label,value,onChange,currency='USD',disabled=false}:any){return <label>{label} ({currency==='USD'?'$ USD':currency})<span className="cmsMoneyInput"><span aria-hidden="true">{currency==='USD'?'$':currency}</span><input className="field" type="number" disabled={disabled} min="0" step="0.01" value={value??''} onChange={e=>onChange(e.target.value===''?'':Number(e.target.value))}/></span></label>;}

/** Uploads lock editable controls without disabling their own cancellation button.
 * Native fieldset disabling is reserved for the actual save operation. */
export function UploadFieldset({children,uploading=false,disabled=false,className}:{children:ReactNode;uploading?:boolean;disabled?:boolean;className?:string}){
 function lock(nodes:ReactNode):ReactNode{return Children.map(nodes,node=>{
  if(!isValidElement(node))return node;
  const element=node as ReactElement<any>,props:any={};
  const native=typeof element.type==='string'&&['input','select','textarea','button'].includes(element.type);
  const custom=[Field,Check,MoneyField,MediaField,Questions,Resources].includes(element.type as any);
  if(uploading&&(native||custom)&&!element.props['data-cms-upload-cancel'])props.disabled=true;
  if(element.props.children!==undefined)props.children=lock(element.props.children);
  return cloneElement(element,props);
 });}
 return <fieldset className={className} disabled={disabled} aria-busy={uploading||disabled}>{lock(children)}</fieldset>;
}
