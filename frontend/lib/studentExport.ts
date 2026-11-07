import {API_URL,ApiError,requestHeaders,currentPortal,accountEpoch,boundaryMarker,explicitlyLoggedOut} from './api';

/** Export is independent of roster search/pagination and never caches contact data. */
export async function downloadStudentsCsv(signal?:AbortSignal){
 const portal=currentPortal(),epoch=accountEpoch(portal),marker=boundaryMarker(portal);
 if(explicitlyLoggedOut(portal))throw new ApiError('Please sign in to export students.',401,'SESSION_REQUIRED');
 const timeout=AbortSignal.timeout(120000);
 const response=await fetch(API_URL+'/admin/students/export.csv',{credentials:'include',headers:requestHeaders({},portal),cache:'no-store',signal:signal?AbortSignal.any([signal,timeout]):timeout});
 if(!response.ok){let message='The student list could not be exported.';try{message=(await response.json()).message||message;}catch{}throw new ApiError(message,response.status);}
 if(!/^text\/csv(?:;|$)/i.test(response.headers.get('content-type')||''))throw new ApiError('The server did not return a CSV file. Please retry.',502);
 const blob=await response.blob();
 if(signal?.aborted||epoch!==accountEpoch(portal)||marker!==boundaryMarker(portal))throw new DOMException('The account changed before the export finished.','AbortError');
 const suggested=response.headers.get('content-disposition')?.match(/filename="?([^";]+)"?/i)?.[1]||'singh-academy-students.csv';
 const filename=suggested.replace(/[^a-zA-Z0-9_.-]/g,'_');
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download=filename;
 try{document.body.appendChild(anchor);anchor.click();}finally{anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
 return {filename};
}
