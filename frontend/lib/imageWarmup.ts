import manifestData from './image-manifest.json';
import {academyImageVariants,COURSE_CARD_SIZES,TEAM_CARD_SIZES} from './imageSources';
import {portalMediaUrl} from './api';

type Picture={src:string;srcSet?:string;sizes:string};
type ImageLike={src:string;srcset:string;sizes:string;decoding:string;fetchPriority:string;onload:((...args:any[])=>void)|null;onerror:((...args:any[])=>void)|null;decode?:()=>Promise<void>};
type Job={picture:Picture;key:string;valid:()=>boolean};
const manifest=manifestData as Record<string,{src:string;variants:{src:string;width:number}[]}>;

/** A small prefetch budget for published catalog photos, never private learning
 * records. Same srcset/sizes as the real card, no fetch/cache-busting duplicate. */
export function createImageWarmer({makeImage=()=>new Image() as ImageLike,clock=Date.now,parallel=2,limit=12,deadline=8000}={}){
 const seen=new Map<string,number>(),queue:Job[]=[];let active=0;
 const drain=()=>{
  while(active<parallel&&queue.length){
   const job=queue.shift()!;
   if(!job.valid()){seen.delete(job.key);continue;}
   active++;
   let image:ImageLike,finished=false,timer:ReturnType<typeof setTimeout>|undefined;
   const finish=(ok:boolean)=>{
    if(finished)return;finished=true;if(timer)clearTimeout(timer);
    if(image){image.onload=null;image.onerror=null;}
    if(ok)seen.set(job.key,clock()+240000);else seen.delete(job.key);
    active--;drain();
   };
   try{
    image=makeImage();image.decoding='async';image.fetchPriority='low';image.sizes=job.picture.sizes;
    image.onload=()=>{if(image.decode)void image.decode().catch(()=>{}).finally(()=>finish(true));else finish(true);};
    image.onerror=()=>finish(false);
    timer=setTimeout(()=>{if(image){image.onload=null;image.onerror=null;try{image.src='data:,';}catch{}}finish(false);},deadline);
    if(job.picture.srcSet)image.srcset=job.picture.srcSet;
    image.src=job.picture.src;
   }catch{finish(false);}
  }
 };
 return {
  warm(pictures:Picture[],valid=()=>true){
   if(!valid())return;
   for(const [key,until]of seen)if(until<=clock())seen.delete(key);
   for(const picture of pictures){
    // Do not prefetch external signed URLs, downloads, staff or arbitrary API data.
    if(!picture.src.startsWith('/')||picture.src.startsWith('//')||/[\\\x00-\x1f]/.test(picture.src))continue;
    const u=new URL(picture.src,'https://academy.invalid');
    if(u.pathname.startsWith('/api/')&&!/^\/api\/media\/[a-f0-9]{24}$/i.test(u.pathname))continue;
    if(u.searchParams.has('download')||u.searchParams.has('portal'))continue;
    const key=picture.src+'|'+(picture.srcSet||'')+'|'+picture.sizes;
    if(seen.has(key)||queue.length+active>=8)continue;
    if(seen.size>=limit){const oldest=[...seen].find(([,until])=>Number.isFinite(until));if(oldest)seen.delete(oldest[0]);else continue;}
    seen.set(key,Infinity);queue.push({picture,key,valid});
   }
   drain();
  },
  stats:()=>({active,queued:queue.length,remembered:seen.size})
 };
}
const warmer=createImageWarmer();
export function canWarmCatalogImages(){
 if(typeof window==='undefined'||typeof navigator==='undefined'||navigator.onLine===false||document.visibilityState!=='visible')return false;
 const connection=(navigator as any).connection;
 return !connection?.saveData&&!/^(slow-)?2g$/.test(connection?.effectiveType||'');
}
export function catalogPictures(path:string,data:any,replacements:{src:string;url?:string}[]=[]):Picture[]{
 if(path.startsWith('/page-sections/')&&Array.isArray(data?.blocks)){
  const blocks=[...data.blocks].sort((a,b)=>Number(b.placement==='start')-Number(a.placement==='start'));
  return blocks.flatMap(block=>[
   ...(block.imageUrl?[{source:block.imageUrl,sizes:'(max-width: 760px) 90vw, 1100px'}]:[]),
   ...(block.gallery||[]).filter((image:any)=>image.imageUrl).map((image:any)=>({source:image.imageUrl,sizes:block.galleryLayout==='single'?'(max-width: 760px) 90vw, 900px':block.galleryLayout==='carousel'?'(max-width: 760px) 85vw, 700px':'(max-width: 480px) 90vw, (max-width: 760px) 44vw, '+Math.round(1100/(block.columns||3))+'px'}))
  ]).slice(0,3).flatMap(({source,sizes})=>picture(source,sizes));
 }
 const team=path==='/content/team',items=path==='/courses'?data?.courses:path==='/sections'?data?.sections:team?data?.team:path==='/content/events'?data?.events:null;
 if(!Array.isArray(items))return [];
 return items.slice(0,team?4:3).flatMap(item=>{
  const supplied=path==='/courses'||path==='/sections'?item?.thumbnail:item?.image;
  return picture(supplied,team?TEAM_CARD_SIZES:COURSE_CARD_SIZES);
 });
 function picture(supplied:any,sizes:string):Picture[]{
  if(typeof supplied!=='string'||!supplied)return [];
  const raw=replacements.find(i=>i.src===supplied)?.url||supplied;
  const mapped=portalMediaUrl(raw,'student'),entry=manifest[raw.split('?')[0]],variants=academyImageVariants(mapped);
  return [{src:entry?.src||variants?.src||mapped,srcSet:entry?.variants.map(v=>`${v.src} ${v.width}w`).join(', ')||variants?.srcSet,sizes}];
 }
}
export function warmCatalogImages(path:string,data:any,replacements:{src:string;url?:string}[]=[],valid=()=>true){
 if(!canWarmCatalogImages())return;
 warmer.warm(catalogPictures(path,data,replacements),()=>canWarmCatalogImages()&&valid());
}
