/** Tolerate malformed historical CMS settings without crashing every page/image. */
import heroPhotos from './heroPhotos.json';
export function websiteConfig(value:any){
 const text:Record<string,string>={};
 if(value?.text&&typeof value.text==='object'&&!Array.isArray(value.text))for(const [key,v] of Object.entries(value.text))if(typeof v==='string')text[key]=v;
 const heroes=heroPhotos as {landing?:{src:string}|null;home?:{src:string}|null};
 const images=Array.isArray(value?.images)?value.images.filter((i:any)=>{
  if(!i||typeof i.key!=='string'||typeof i.src!=='string'||typeof i.url!=='string')return false;
  const original=i.key==='image-075'?heroes.landing:i.key==='image-077'?heroes.home:null;
  // A new source photograph replaces the old hero slot. Never let an unrelated
  // text save rebase a stale override's OLD URL onto its new source identity.
  return !original?.src||i.src===original.src;
 }):[];
 return {text,images};
}
