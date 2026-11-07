 'use client';
import {useEffect,useState} from 'react';
import {useAuth} from '../components/auth/AuthProvider';
import {apiFetch} from './api';
import {createCompletionFeed} from './completionFeed';
let ownerKey='',feed:ReturnType<typeof createCompletionFeed>|null=null,detach:()=>void=()=>{};
function dispose(){detach();detach=()=>{};feed?.dispose();feed=null;ownerKey='';}
function getFeed(owner:string){
 if(feed&&ownerKey===owner)return feed;
 dispose();ownerKey=owner;
 feed=createCompletionFeed({load:async(ids,signal)=>(await apiFetch('/certificates/status?ids='+ids.join(','),{signal})).items,visible:()=>document.visibilityState==='visible'&&navigator.onLine});
 const current=feed,wake=()=>current.wake(),boundary=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.portal==='student')dispose();};
 window.addEventListener('focus',wake);window.addEventListener('online',wake);window.addEventListener('sa:certificates-updated',wake);window.addEventListener('sa:auth-boundary',boundary);document.addEventListener('visibilitychange',wake);
 let channel:BroadcastChannel|null=null;try{channel=new BroadcastChannel('sa-certificate-invalidation');channel.onmessage=wake;}catch{}
 detach=()=>{window.removeEventListener('focus',wake);window.removeEventListener('online',wake);window.removeEventListener('sa:certificates-updated',wake);window.removeEventListener('sa:auth-boundary',boundary);document.removeEventListener('visibilitychange',wake);channel?.close();};
 return current;
}
export function notifyCertificateChange(){if(typeof window==='undefined')return;window.dispatchEvent(new Event('sa:certificates-updated'));try{const channel=new BroadcastChannel('sa-certificate-invalidation');channel.postMessage({changed:true});channel.close();}catch{}}
export function useLiveCompletion(initial:any){
 const{user,portal}=useAuth(),owner=user?.role==='student'&&portal==='student'?String(user.id):'',id=String(initial?._id||'');
 const[state,setState]=useState({owner,id,item:initial,error:''});
 useEffect(()=>{
  if(!owner||!id)return;
  const current=getFeed(owner),unsubscribe=current.subscribe(id,initial,(item,error)=>setState({owner,id,item,error}));
  return()=>{unsubscribe();if(current.size===0&&feed===current)dispose();};
 },[owner,id]);
 return state.owner===owner&&state.id===id?{completion:state.item||initial,statusError:state.error}:{completion:initial,statusError:''};
}
