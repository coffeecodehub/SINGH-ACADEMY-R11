import {resolveVideoSource,type VideoSource} from './video';
export type VideoReview={_id:string;title:string;description:string;videoUrl:string;teaserSeconds:number;order:number;previewRendition?:string;published?:boolean;videoFileId?:string|null;revision?:number};
/** Older saved teasers can be shorter; every displayed preview now lasts 15–20s. */
export function reviewPreviewSeconds(value:unknown=15){const seconds=Number(value);return Number.isFinite(seconds)?Math.min(20,Math.max(15,Math.trunc(seconds))):15;}
export function reviewPlaybackUrl(url:string,kind:'preview'|'poster',rendition?:string){
 const match=url.match(/^\/api\/media\/([a-f0-9]{24})(?:\?portal=(?:student|client_admin|super_admin))?$/);
 if(!match)return kind==='preview'?url:undefined;
 // A mounted player keeps one immutable byte source even if processing finishes
 // between its HTTP Range requests. Unprepared/CMS previews keep the original.
 return url+(url.includes('?')?'&':'?')+kind+'=1'+(kind==='preview'?'&rendition='+(/^[a-f0-9]{24}$/.test(rendition||'')?rendition:match[1]):'');
}
export function reviewPoster(source:VideoSource,url:string){
 if(source.kind==='native')return reviewPlaybackUrl(url,'poster');
 if(source.provider==='youtube'){const id=new URL(source.src).pathname.split('/').pop();if(/^[a-zA-Z0-9_-]{11}$/.test(id||''))return 'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg';}
 return undefined;
}
/** Other social pages remain genuine external links, never fabricated players. */
export function reviewVideoSource(url:string):VideoSource|null{
 // The page CMS also supports explicitly named public static media. Review
 // creation still enforces its separate backend upload/HTTPS publication policy.
 const localFile=/^\/(?!\/)[a-zA-Z0-9_./%-]+\.(?:mp4|webm|mov)(?:[?#][^\s]*)?$/i.test(url)&&!/%(?:2f|5c|00)/i.test(url)&&!url.split(/[?#]/)[0].split('/').includes('..');
 if(!localFile&&!/^\/api\/media\/[a-f0-9]{24}(?:\?portal=(?:student|client_admin|super_admin))?$/.test(url)){
  try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)return null;}catch{return null;}
 }
 const source=resolveVideoSource(url);if(!source)return null;
 if(source.kind==='embed'&&!['youtube','vimeo','tiktok','instagram'].includes(source.provider))return {kind:'external',src:url,provider:'external'};
 return source;
}
export function reviewEmbedUrl(source:VideoSource,preview:boolean,seconds:number,origin='',autoStart=true){
 if(source.kind!=='embed')return source.src;
 // Let the muted provider start its own playback as well as using its ready API.
 // Preview startup must not depend solely on delivery of a third-party message.
 if(source.provider==='instagram')return source.src;
 const url=new URL(source.src);url.hash='';url.searchParams.set('autoplay',autoStart?'1':'0');
 if(source.provider==='youtube'){
  url.searchParams.set('enablejsapi','1');url.searchParams.set('playsinline','1');url.searchParams.set('mute',preview?'1':'0');url.searchParams.set('controls',preview?'0':'1');
  if(origin)url.searchParams.set('origin',origin);
  if(preview){url.searchParams.set('start','0');url.searchParams.set('end',String(reviewPreviewSeconds(seconds)));url.searchParams.set('loop','1');url.searchParams.set('playlist',url.pathname.split('/').pop()||'');}
 }else if(source.provider==='tiktok'){
  url.searchParams.set('muted',preview?'1':'0');url.searchParams.set('controls',preview?'0':'1');url.searchParams.set('loop',preview?'1':'0');url.searchParams.set('rel','0');
 }else if(source.provider==='vimeo'){
  url.searchParams.set('muted',preview?'1':'0');url.searchParams.set('playsinline','1');url.searchParams.set('controls',preview?'0':'1');url.searchParams.set('loop',preview?'1':'0');url.searchParams.set('autopause',preview?'0':'1');url.searchParams.set('dnt','1');
 }
 return url.href;
}
