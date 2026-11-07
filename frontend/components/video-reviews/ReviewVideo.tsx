'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPlayerFrameGate} from '../../lib/playerFrameGate';
import {reviewVideoSource,reviewEmbedUrl,reviewPlaybackUrl,reviewPoster,reviewPreviewSeconds} from '../../lib/videoReviews';
import FeedbackNotice from '../feedback/FeedbackNotice';

/** Browser-native media / origin-checked provider messages, with no SDK scripts. */
export default function ReviewVideo({url,title,preview=true,seconds:requestedSeconds=15,paused=false,previewRendition,priorityPoster=false}:{url:string;title:string;preview?:boolean;seconds?:number;paused?:boolean;previewRendition?:string;priorityPoster?:boolean}){
 const seconds=reviewPreviewSeconds(requestedSeconds);
 const source=reviewVideoSource(url),origin=source?.kind==='embed'?new URL(source.src).origin:null;
 const frame=useRef<HTMLIFrameElement>(null),video=useRef<HTMLVideoElement>(null),wrapper=useRef<HTMLDivElement>(null),ready=useRef(false);
 const [mounted,setMounted]=useState(false),[near,setNear]=useState(!preview),[committed,setCommitted]=useState(false),[blocked,setBlocked]=useState(false),[failed,setFailed]=useState(false);
 const [embedSnapshot,setEmbedSnapshot]=useState<{key:string;src:string}|null>(null);
 const [visible,setVisible]=useState(!preview),[documentHidden,setDocumentHidden]=useState(false);
 const [showPoster,setShowPoster]=useState(true);
 // Review previews are requested media playback, independent of the OS setting
 // for decorative animation. Viewport, tab visibility and full-player pauses remain.
 const playbackPaused=paused||(preview&&(!visible||documentHidden));
 const poster=source?reviewPoster(source,url):undefined;
 const nativePreviewSrc=source?.kind==='native'&&preview?reviewPlaybackUrl(source.src,'preview',previewRendition):undefined;
 const frameKey=url+':'+preview+':'+seconds+(nativePreviewSrc?':'+nativePreviewSrc:'');
 const gate=useMemo(()=>createPlayerFrameGate(frame,origin,{serialize:source?.provider!=='tiktok'}),[frameKey,origin]);
 const send=(data:object)=>gate.send(data);
 const play=()=>send(source?.provider==='youtube'?{event:'command',func:'playVideo',args:[]}:source?.provider==='tiktok'?{type:'play','x-tiktok-player':true}:{method:'play'});
 const pause=()=>send(source?.provider==='youtube'?{event:'command',func:'pauseVideo',args:[]}:source?.provider==='tiktok'?{type:'pause','x-tiktok-player':true}:{method:'pause'});
 useEffect(()=>{setMounted(true);},[]);
 useEffect(()=>{const changed=()=>setDocumentHidden(document.visibilityState==='hidden');changed();document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
 useEffect(()=>{ready.current=false;setCommitted(false);setBlocked(false);setFailed(false);setShowPoster(true);},[frameKey]);
 useEffect(()=>{if(!committed||source?.kind!=='embed')return;const timer=setTimeout(()=>setShowPoster(false),1800);return()=>clearTimeout(timer);},[committed,frameKey]);
 useEffect(()=>{
  if(!mounted||!near||source?.kind!=='embed')return;
  // Capture autoplay only when this player mounts. Later modal/viewport
  // pauses use its API without reloading the iframe or losing playback state.
  // Wait for a visible, playable preview before pinning its URL. Otherwise a
  // near-viewport callback can pin autoplay=0 before visibility is known, and
  // a provider that never announces API readiness cannot start on its own.
  setEmbedSnapshot(current=>current?.key===frameKey||preview&&playbackPaused?current:{key:frameKey,src:reviewEmbedUrl(source,preview,seconds,window.location.origin,!playbackPaused)});
 },[frameKey,mounted,near,playbackPaused]);
 useEffect(()=>{
  if(!preview||near)return;if(typeof IntersectionObserver==='undefined'){setNear(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'200px'});
  if(wrapper.current)observer.observe(wrapper.current);return()=>observer.disconnect();
 },[preview,near]);
 useEffect(()=>{
  if(!preview||typeof IntersectionObserver==='undefined'){setVisible(true);return;}
  const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.target===wrapper.current)setVisible(entry.isIntersecting);},{threshold:0.05});
  if(wrapper.current)observer.observe(wrapper.current);return()=>observer.disconnect();
 },[preview,mounted]);
 useEffect(()=>{
  if(!near)return;
  if(source?.kind==='native'&&video.current){if(preview)video.current.muted=true;if(playbackPaused)video.current.pause();else void video.current.play().catch(()=>setBlocked(true));}
  else if(ready.current){if(playbackPaused)pause();else play();}
 },[url,playbackPaused,near,mounted]);
 useEffect(()=>{
  // An unready provider cannot acknowledge pause commands. Its frame is
  // detached below while paused; keep the already-cached poster for a return.
  if(preview&&playbackPaused&&source?.kind==='embed'&&!ready.current){setCommitted(false);setShowPoster(true);}
 },[preview,playbackPaused,frameKey]);
 useEffect(()=>{
  if(source?.kind!=='embed'||!mounted||!near||source.provider==='instagram')return;
  const youtube=source.provider==='youtube',tiktok=source.provider==='tiktok';
  const receive=(event:MessageEvent)=>{
   if(!gate.matchesMessage(event))return;let data=event.data;
   try{if(typeof data==='string'){if(data.length>100000)return;data=JSON.parse(data);}}catch{return;}
   if(!data||typeof data!=='object')return;
   if(tiktok&&data['x-tiktok-player']!==true)return;
   const isReady=youtube?['onReady','initialDelivery'].includes(data.event):tiktok?data.type==='onPlayerReady':data.event==='ready'||data.method==='ping';
   if(isReady&&frame.current&&gate.markLoaded(frame.current)){
    setCommitted(true);setShowPoster(false);
    if(!ready.current){
     ready.current=true;
     if(youtube){send({event:'command',func:preview?'mute':'unMute',args:[]});for(const event of ['onStateChange','onError','onAutoplayBlocked'])send({event:'command',func:'addEventListener',args:[event]});}
     else if(tiktok){send({type:preview?'mute':'unMute','x-tiktok-player':true});}
     else{send({method:'setVolume',value:preview?0:1});for(const event of ['timeupdate','ended','error'])send({method:'addEventListener',value:event});}
     // The iframe may already have started muted playback from its URL while
     // its API was loading. Apply the current modal/viewport state on ready,
     // including a pause requested before the provider could receive commands.
     if(playbackPaused)pause();else play();
    }
   }
   if(!ready.current)return;
   const current=youtube?data.info?.currentTime:tiktok?(data.type==='onCurrentTime'?data.value?.currentTime:undefined):data.event==='timeupdate'?data.data?.seconds:undefined;
   const ended=youtube?data.event==='onStateChange'&&data.info===0:tiktok?data.type==='onStateChange'&&data.value===0:data.event==='ended';
   if(preview&&!playbackPaused&&(ended||Number.isFinite(current)&&current>=seconds)){
    send(youtube?{event:'command',func:'seekTo',args:[0,true]}:tiktok?{type:'seekTo',value:0,'x-tiktok-player':true}:{method:'setCurrentTime',value:0});play();
   }
   if(youtube&&data.event==='onAutoplayBlocked'||!youtube&&data.event==='error'&&data.data?.name==='NotAllowedError')setBlocked(true);
   else if(youtube&&data.event==='onError'||!youtube&&data.event==='error')setFailed(true);
  };
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive);
 },[url,preview,seconds,playbackPaused,near,mounted,gate]);
 useEffect(()=>{
  if(!committed||ready.current||source?.kind!=='embed'||!['youtube','vimeo'].includes(source.provider))return;
  const hello=()=>send(source.provider==='youtube'?{event:'listening',id:'academy-video-review'}:{method:'ping'});
  hello();let attempts=1;const timer=setInterval(()=>{if(ready.current||attempts++>=12){clearInterval(timer);return;}hello();},500);
  return()=>clearInterval(timer);
 },[committed,gate,url]);
 if(!source)return <p role="status">This review video is unavailable.</p>;
 if(source.kind==='external')return preview?<div className="videoReviewExternalPreview"><span aria-hidden="true">↗</span><p>Watch this review at its original source.</p></div>:<a className="button" href={source.src} target="_blank" rel="noopener noreferrer">Open full video at source ↗</a>;
 const retryPlay=()=>{setBlocked(false);if(video.current)void video.current.play().catch(()=>setBlocked(true));else if(ready.current)play();};
 return <div className={'reviewVideo '+(preview?'reviewVideoPreview':'reviewVideoFull')} ref={wrapper}>
  {preview&&(near||priorityPoster)&&poster&&showPoster&&<img className="videoReviewPoster" src={poster} width={960} height={600} alt="" aria-hidden="true" loading="eager" decoding="async" fetchPriority={priorityPoster?'high':undefined}/>}
  {mounted&&near&&(source.kind==='native'?<video ref={video} src={preview?nativePreviewSrc:source.src} poster={poster} aria-label={preview?undefined:title} aria-hidden={preview||undefined} tabIndex={preview?-1:0} controls={!preview} autoPlay={!playbackPaused} muted={preview} loop={preview} playsInline preload={preview&&visible?'auto':'metadata'}
   onLoadedMetadata={event=>{try{event.currentTarget.currentTime=0;}catch{}if(preview)event.currentTarget.muted=true;if(!playbackPaused)void event.currentTarget.play().catch(()=>setBlocked(true));}}
   onTimeUpdate={event=>{if(preview&&event.currentTarget.currentTime>=seconds){try{event.currentTarget.currentTime=0;}catch{}if(!playbackPaused)void event.currentTarget.play().catch(()=>setBlocked(true));}}}
   onPlaying={()=>{setBlocked(false);setShowPoster(false);}} onError={()=>setFailed(true)}/>
   :embedSnapshot?.key===frameKey&&(!preview||!playbackPaused||ready.current)?<iframe key={frameKey} ref={frame} src={embedSnapshot.src} title={preview?title+' muted preview':title+' full video'} aria-hidden={preview||undefined} tabIndex={preview?-1:0} loading="eager" referrerPolicy="strict-origin-when-cross-origin" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
    onLoad={event=>{if(gate.markLoaded(event.currentTarget))setCommitted(true);}} onError={()=>setFailed(true)}/>:null)}
  {!mounted||!near?<span className="videoReviewPlaceholder" aria-hidden="true">▶</span>:null}
  {!preview&&source.provider==='instagram'&&<p className="videoReviewPlaybackNote">Instagram controls playback and availability. <a href={url} target="_blank" rel="noopener noreferrer">Open original video ↗</a></p>}
  {failed&&<FeedbackNotice variant="warning" className="videoReviewPlaybackNote">The video provider is unavailable. {preview?'Open the full review to retry.':<a href={source.src} target="_blank" rel="noopener noreferrer">Open video source ↗</a>}</FeedbackNotice>}
  {blocked&&!failed&&!preview&&<button type="button" className="pill videoReviewPlay" onClick={retryPlay}>Play full video</button>}
 </div>;
}
