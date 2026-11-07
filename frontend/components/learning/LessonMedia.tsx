'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import AcademyImage from '../AcademyImage';
import {portalMediaUrl} from '../../lib/api';
import {autoplayVideoSource,resolveVideoSource} from '../../lib/video';
import {createPlayerFrameGate} from '../../lib/playerFrameGate';

/** Prepare the visible player once. A provider iframe's DOM load is NOT the
 * player's ready event. Play intent survives slow readiness without reloading
 * the iframe or repeatedly starting the video. No provider console is muted. */
export default function LessonMedia({url,poster,lazy=false}:{url:string;poster?:string;lazy?:boolean}){
 const source=resolveVideoSource(url),posterSrc=poster?portalMediaUrl(poster):'';
 const video=useRef<HTMLVideoElement>(null),frame=useRef<HTMLIFrameElement>(null),wrapper=useRef<HTMLDivElement>(null);
 const intent=useRef(false),playerReady=useRef(false);
 const [started,setStarted]=useState(false),[loaded,setLoaded]=useState(false),[slow,setSlow]=useState(false),[failure,setFailure]=useState(false),[blocked,setBlocked]=useState(false),[near,setNear]=useState(!lazy),[retry,setRetry]=useState(0);
 const controllable=source?.kind==='embed'&&['youtube','vimeo'].includes(source.provider);
 const frameKey=url+':'+retry;
 const [documentGeneration,setDocumentGeneration]=useState('');
 const frameGate=useMemo(()=>createPlayerFrameGate(frame,
  controllable&&source?new URL(source.src).origin:null),[url,retry,controllable]);
 const send=(data:object)=>frameGate.send(data);
 const command=()=>send(source?.provider==='youtube'?{event:'command',func:'playVideo',args:[]}:{method:'play'});
 const handshake=()=>{
  if(!source||playerReady.current)return;
  if(source.provider==='youtube')send({event:'listening',id:'academy-lesson-player'});
  else if(source.provider==='vimeo')send({method:'ping'});
 };
 useEffect(()=>{
  intent.current=false;playerReady.current=false;setStarted(false);setLoaded(false);setSlow(false);setFailure(false);setBlocked(false);
 },[url]);
 useEffect(()=>{
  if(!lazy||near)return;
  if(typeof IntersectionObserver==='undefined'){setNear(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:'100px'});
  if(wrapper.current)observer.observe(wrapper.current);return()=>observer.disconnect();
 },[lazy,near]);
 useEffect(()=>{
  if(!near||loaded||blocked)return;
  const timer=setTimeout(()=>setSlow(true),12000);return()=>clearTimeout(timer);
 },[near,loaded,blocked,retry,url]);
 useEffect(()=>{
  if(!controllable||!source||!near)return;
  const receive=(event:MessageEvent)=>{
   if(!frameGate.matchesMessage(event))return;
   let data=event.data;
   try{if(typeof data==='string'){if(data.length>100000)return;data=JSON.parse(data);}}catch{return;}
   if(!data||typeof data!=='object')return;
   const youtube=source.provider==='youtube';
   const ready=youtube?data.event==='onReady'||data.event==='initialDelivery':data.event==='ready'||data.method==='ping';
   if(ready){
    // A verified provider message may arrive before the iframe load callback.
    // Accept it only from this connected frame and the exact provider origin.
    if(!frame.current||!frameGate.markLoaded(frame.current))return;
    setDocumentGeneration(frameKey);
    const first=!playerReady.current;playerReady.current=true;setLoaded(true);setSlow(false);
    if(first){
     if(youtube){for(const name of ['onStateChange','onError','onAutoplayBlocked'])send({event:'command',func:'addEventListener',args:[name]});}
     else {for(const name of ['play','playing','pause','bufferstart','bufferend','error'])send({method:'addEventListener',value:name});}
     // URL has start=0 / #t=0s. Do NOT seek Vimeo before input: its SDK
     // documents that setCurrentTime before initial play can start playback.
     if(intent.current)command();
    }
   }
   const state=youtube?(data.event==='onStateChange'?data.info:data.event==='infoDelivery'?data.info?.playerState:undefined):undefined;
   if((youtube&&state===1)||(!youtube&&['play','playing'].includes(data.event))){setStarted(true);setLoaded(true);setFailure(false);setSlow(false);setBlocked(false);}
   if((youtube&&state===3)||(!youtube&&data.event==='bufferstart'))setLoaded(false);
   if((youtube&&[0,2,5].includes(state))||(!youtube&&['pause','bufferend'].includes(data.event)))setLoaded(true);
   const blockedPlay=youtube?data.event==='onAutoplayBlocked':data.event==='error'&&data.data?.method==='play'&&data.data?.name==='NotAllowedError';
   if(blockedPlay){intent.current=false;setBlocked(true);setLoaded(true);setSlow(false);}
   else if((youtube&&data.event==='onError')||(!youtube&&data.event==='error'&&['ready','loadVideo','play'].includes(data.data?.method))){intent.current=false;setFailure(true);setLoaded(false);}
  };
  window.addEventListener('message',receive);
  return()=>window.removeEventListener('message',receive);
 },[url,controllable,near,retry,frameGate]);
 useEffect(()=>{
  // Start the retry budget AFTER the provider document has loaded, never while
  // its window is still academy-origin about:blank. Slow network time must not
  // consume all handshake attempts. Player commands still wait for API ready.
  if(!controllable||!near||documentGeneration!==frameKey||playerReady.current)return;
  let attempts=1;
  handshake();
  const timer=setInterval(()=>{if(playerReady.current||attempts>=12){clearInterval(timer);return;}attempts++;handshake();},500);
  return()=>clearInterval(timer);
 },[url,controllable,near,retry,frameGate,documentGeneration,frameKey]);
 if(!source)return null;
 if(source.kind==='external')return <a className="lessonExternalVideo" href={source.src} target="_blank" rel="noopener noreferrer"><span className="playCircle">↗</span><strong>Open video resource</strong><small>This provider does not allow a standard embedded player. Open the approved source in a new tab.</small></a>;
 const play=()=>{
  intent.current=true;setStarted(true);setNear(true);setLoaded(false);setSlow(false);setFailure(false);setBlocked(false);
  if(source.kind==='native'&&video.current){
   try{if(video.current.currentTime<.1)video.current.currentTime=0;}catch{}
   void video.current.play().catch(()=>{setBlocked(true);setLoaded(true);});
  }else if(controllable&&playerReady.current)command();
 };
 const showPlayer=near&&(source.kind==='native'||controllable||!posterSrc||started);
 let embed=source.kind==='embed'?source.src:'';
 if(controllable&&source.provider==='youtube'){const u=new URL(embed);u.searchParams.set('enablejsapi','1');embed=u.href;}
 else if(source.kind==='embed'&&started&&!controllable)embed=autoplayVideoSource(source);
 return <div className="lessonMediaFrame" ref={wrapper}>
  {showPlayer&&(source.kind==='native'?<video key={url+':'+retry} ref={video} controls playsInline preload="metadata" src={portalMediaUrl(source.src)} poster={posterSrc||undefined}
   onLoadedMetadata={e=>{try{e.currentTarget.currentTime=0;}catch{}if(intent.current)void e.currentTarget.play().catch(()=>{setBlocked(true);setLoaded(true);});}}
   onWaiting={()=>setLoaded(false)} onLoadedData={()=>setLoaded(true)} onCanPlay={()=>setLoaded(true)} onPlaying={()=>{setLoaded(true);setSlow(false);setBlocked(false);setStarted(true);}} onError={()=>setFailure(true)}/>
   :<iframe key={url+':'+retry} ref={frame} src={embed} title={`${source.provider} course video`} loading="eager" referrerPolicy="strict-origin-when-cross-origin"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    onLoad={event=>{if(controllable){if(frameGate.markLoaded(event.currentTarget))setDocumentGeneration(frameKey);}else setLoaded(true);}} onError={()=>setFailure(true)}/>)}
  {posterSrc&&!started&&<button type="button" className="lessonVideoPoster" onClick={play} aria-label="Play video"><AcademyImage src={posterSrc} alt="Video thumbnail" priority={!lazy}/><span className="lessonVideoPosterPlay">▶</span></button>}
  {(failure||blocked||(showPlayer&&!loaded&&(started||!posterSrc)))&&<div className="lessonMediaStatus" role="status">
   {!failure&&!blocked&&<i aria-hidden="true"/>}<span>{failure?'Video is unavailable.':blocked?'Press Play in the video player to continue.':slow?'The video provider is taking longer to respond.':'Loading video…'}</span>
   {(slow||failure)&&<><button type="button" onClick={()=>{playerReady.current=false;setFailure(false);setBlocked(false);setSlow(false);setLoaded(false);setRetry(n=>n+1);}}>Retry player</button>{source.kind==='embed'&&<a href={source.src} target="_blank" rel="noopener noreferrer">Open player ↗</a>}</>}
  </div>}
 </div>;
}
