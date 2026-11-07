'use client';
import {useRouter} from 'next/navigation';
import {confirmPageLeave} from '../../lib/leaveGuard';
export default function BackButton({fallback='/home',label='Back',mode='history'}:{fallback?:string;label?:string;mode?:'history'|'destination'}){
 const router=useRouter();
 return <button type="button" className="pageBack" onClick={async()=>{
  const from=window.location.href;
  if(!await confirmPageLeave()||window.location.href!==from)return;
  if(mode==='destination'){window.dispatchEvent(new CustomEvent('sa:navigation',{detail:{href:fallback}}));router.replace(fallback);}
  else if(window.history.length>1)router.back();
  else router.push(fallback);
 }}>← {label}</button>;
}
