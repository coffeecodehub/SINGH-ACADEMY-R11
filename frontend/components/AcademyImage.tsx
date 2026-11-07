 'use client';
import {useState,useEffect,useRef,type ImgHTMLAttributes} from 'react';
import manifestData from '../lib/image-manifest.json';
import {useWebsiteContent} from './WebsiteContent';
import {portalMediaUrl} from '../lib/api';
import {useHydrated} from '../lib/useHydrated';
import {academyImageVariants,retryImageSource} from '../lib/imageSources';
type Variant={src:string;width:number;height:number;bytes:number};
type ImageEntry={src:string;width:number;height:number;variants:Variant[]};
const manifest=manifestData as Record<string,ImageEntry>;
type Props=Omit<ImgHTMLAttributes<HTMLImageElement>,'src'> & {src?:string|null;priority?:boolean};
/** Preserve original CSS sizing. Try original imagery before a missing-image fallback;
 * a one-off variant/network failure must not permanently hide the saved photograph. */
export default function AcademyImage({src,alt='',priority=false,sizes,loading,decoding,width,height,onError,...rest}:Props){
 const website=useWebsiteContent(),hydrated=useHydrated(),supplied=typeof src==='string'?src:'',replacement=website.images?.find(i=>i.src===supplied);
 const raw=replacement?.url||supplied,local=raw.split('?')[0],entry=manifest[local],original=portalMediaUrl(raw,hydrated?undefined:'student');
 const variant=academyImageVariants(original),primary=entry?.src||variant?.src||original;
 const [state,setState]=useState({raw,src:'',stage:0,status:'loading'}),timer=useRef<ReturnType<typeof setTimeout>|null>(null),imageRef=useRef<HTMLImageElement|null>(null);
 const active=state.raw===raw?state:{raw,src:'',stage:0,status:'loading'};
 useEffect(()=>{
  // Cached/SSR images can finish before hydration or before this passive effect.
  // Keep an early load/error transition and synchronize the committed DOM image.
  const loaded=!!imageRef.current?.complete&&imageRef.current.naturalWidth>0;
  setState(old=>{
   const next=old.raw===raw?old:{raw,src:'',stage:0,status:'loading'};
   return loaded&&next.status!=='loaded'?{...next,status:'loaded'}:next;
  });
  return()=>{if(timer.current)clearTimeout(timer.current);};
 },[raw]);
 const logo=local.includes('logo-clean'),eager=priority||logo||loading==='eager';
 return <img {...rest} ref={imageRef} style={replacement&&(replacement.position||replacement.imageFit)?{...rest.style,...(replacement.position?{objectPosition:replacement.position}:{}),...(replacement.imageFit?{objectFit:replacement.imageFit}:{})}:rest.style} src={active.src||primary||undefined} alt={alt}
  data-image-state={active.status}
  srcSet={active.stage===0?(entry?entry.variants.map(v=>`${v.src} ${v.width}w`).join(', '):variant?.srcSet||rest.srcSet):undefined}
  sizes={sizes||(logo?'140px':priority?'100vw':'(max-width: 640px) 90vw, (max-width: 1100px) 45vw, 420px')}
  width={width} height={height} loading={loading||(eager?'eager':'lazy')} decoding={decoding||'async'} fetchPriority={priority?'high':rest.fetchPriority}
  onLoad={event=>{setState(old=>old.raw===raw&&old.status!=='loaded'?{...old,status:'loaded'}:old);rest.onLoad?.(event);}}
  onError={event=>{
   event.currentTarget.removeAttribute('srcset');
   if(active.stage===0&&original&&primary!==original){setState({raw,src:original,stage:1,status:'loading'});return;}
   if(active.stage<2&&original.startsWith('/')&&!original.startsWith('//')){setState({raw,src:active.src||original,stage:2,status:'loading'});timer.current=setTimeout(()=>setState(old=>old.raw===raw?{raw,src:retryImageSource(original),stage:3,status:'loading'}:old),300);return;}
   if(active.stage<4){const before=event.currentTarget.getAttribute('src');onError?.(event);const after=event.currentTarget.getAttribute('src');const placeholder=after&&after!==before?after:local.includes('team')?'/images/team/faculty-placeholder.jpg':'/images/courses/course-placeholder.jpg';setState({raw,src:placeholder,stage:4,status:'fallback'});}
   else setState(old=>({...old,status:'unavailable'}));
  }}/>
}
