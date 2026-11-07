'use client';
import FeedbackNotice from '../feedback/FeedbackNotice';
import {useEffect,useRef,useState} from 'react';
import {downloadStudentsCsv} from '../../lib/studentExport';
import {isAbortError} from '../../lib/api';

export default function StudentExportButton(){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function download(){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
  const request=new AbortController();controller.current=request;
  try{await downloadStudentsCsv(request.signal);if(!request.signal.aborted)setMessage('Student CSV downloaded.');}
  catch(error:any){if(!request.signal.aborted&&!isAbortError(error))setError(error.message||'The student list could not be exported.');}
  finally{lock.current=false;if(!request.signal.aborted)setBusy(false);}
 }
 return <><button type="button" className="bizButton" disabled={busy} aria-busy={busy} title="Download all registered students across all pages, independent of the current search." onClick={download}>{busy?'Exporting students…':'Export all students CSV'}</button>{error&&<FeedbackNotice variant="error" onDismiss={()=>setError('')}>{error}</FeedbackNotice>}{message&&<FeedbackNotice variant="success" onDismiss={()=>setMessage('')}>{message}</FeedbackNotice>}</>;
}
