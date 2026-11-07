'use client';
import FeedbackNotice from '../feedback/FeedbackNotice';
import {useEffect,useRef,useState} from 'react';
import {downloadAdminCsv} from '../../lib/adminExport';
import {isAbortError} from '../../lib/api';
export default function AdminExportButton({kind,query={},label='Export matching records (Excel CSV)'}:{kind:string;query?:Record<string,string>;label?:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function download(){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');const request=new AbortController();controller.current=request;
  try{await downloadAdminCsv(kind,query,request.signal);if(!request.signal.aborted)setMessage('Excel-compatible CSV downloaded.');}
  catch(e:any){if(!request.signal.aborted&&!isAbortError(e))setError(e.message||'The records could not be exported.');}
  finally{lock.current=false;if(!request.signal.aborted)setBusy(false);}
 }
 return <><button type="button" className="bizButton" disabled={busy} aria-busy={busy} title="Download all matching rows across every page. CSV opens in Excel." onClick={download}>{busy?'Exporting…':label}</button>{error&&<FeedbackNotice variant="error" onDismiss={()=>setError('')}>{error}</FeedbackNotice>}{message&&<FeedbackNotice variant="success" onDismiss={()=>setMessage('')}>{message}</FeedbackNotice>}</>;
}
