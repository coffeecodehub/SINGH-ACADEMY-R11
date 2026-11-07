import {httpError} from './cmsValidation.js';
export const PAGE_SECTION_LIMIT=30;
export const PAGE_SECTION_TYPES=['text','image','video','call-to-action','gallery'];
export function pageKey(value){
 if(typeof value!=='string'||!/^[a-z][a-z0-9-]{0,99}$/.test(value)||/(?:^|--)(?:admin|super-admin|api|checkout|billing|learn|login|register|reset-password)(?:--|$)/.test(value))throw httpError(400,'Choose a supported public page path.');
 return value;
}
function text(value,label,max=500){if(value==null)return '';if(typeof value!=='string'||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)||/<\/?[a-z][^>]*>/i.test(value))throw httpError(400,`${label} must be plain text, up to ${max} characters.`);return value.trim();}
export function contentUrl(value,label='Link'){
 const raw=text(value,label,2000);if(!raw)return '';
 if(/^\/(?!\/)[a-zA-Z0-9_./%?#=&+-]*$/.test(raw)&&!/%(?:2f|5c|00)/i.test(raw)&&!raw.split(/[?#]/)[0].split('/').includes('..'))return raw;
 try{const u=new URL(raw);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}
 throw httpError(400,`${label} needs a local path or HTTPS URL without credentials.`);
}
export function contentVideoUrl(value){
 const raw=contentUrl(value,'Video URL');if(!raw)return '';
 if(/^\/api\/media\/[a-f0-9]{24}$/.test(raw)||/^\/(?!\/)[^?#]+\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(raw))return raw;
 const u=new URL(raw,'https://academy.invalid'),host=u.hostname.toLowerCase().replace(/^www\./,'');
 if(['youtube.com','youtube-nocookie.com','youtu.be','vimeo.com','player.vimeo.com','tiktok.com','instagram.com'].includes(host)||/\.(?:mp4|webm|mov)$/i.test(u.pathname))return raw;
 throw httpError(400,'Use an uploaded video, HTTPS MP4/WebM/MOV, YouTube, Vimeo, TikTok or Instagram URL.');
}
function mediaId(value,url,label){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!/^[a-f0-9]{24}$/i.test(value)||url!==`/api/media/${value}`)throw httpError(400,`${label} must match its uploaded media URL.`);
 return value;
}
export function validateImageEdit(value){
 if(value==null)return null;
 if(typeof value!=='object'||Array.isArray(value))throw httpError(400,'Invalid image crop settings.');
 const out={};for(const [key,min,max] of [['zoom',1,3],['x',-100,100],['y',-100,100],['brightness',60,140],['contrast',60,140]]){if(typeof value[key]!=='number'||!Number.isFinite(value[key])||value[key]<min||value[key]>max)throw httpError(400,'Invalid image crop settings.');out[key]=value[key];}
 if(!['original','4:3','1:1','3:4','16:9'].includes(value.aspect)||![0,90,180,270].includes(value.rotation)||typeof value.flipX!=='boolean'||typeof value.flipY!=='boolean')throw httpError(400,'Invalid image crop settings.');
 return {...out,aspect:value.aspect,rotation:value.rotation,flipX:value.flipX,flipY:value.flipY};
}
export function validateGallery(items,published){
 if(items==null)return [];
 if(!Array.isArray(items)||items.length>1000)throw httpError(400,'Invalid image gallery.');
 const ids=new Set();return items.flatMap(item=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw httpError(400,'Invalid gallery image.');
  const imageUrl=contentUrl(item.imageUrl,'Gallery image URL');if(!imageUrl)return [];
  const id=text(item.id,'Image identifier',80);if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||ids.has(id))throw httpError(400,'Gallery image identifiers must be unique.');ids.add(id);
  const imageAlt=text(item.imageAlt,'Image description',300);if(published&&!imageAlt)throw httpError(400,'Add alternative text for every image.');
  if(!['contain','cover'].includes(item.imageFit||'cover'))throw httpError(400,'Invalid gallery image fit.');
  const position={};for(const key of ['positionX','positionY']){const n=item[key]??50;if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100)throw httpError(400,'Image position must be between 0 and 100.');position[key]=n;}
  const originalUrl=contentUrl(item.originalUrl,'Original image URL');return [{id,imageUrl,imageAlt,imageFileId:mediaId(item.imageFileId,imageUrl,'Gallery image'),originalUrl,originalFileId:mediaId(item.originalFileId,originalUrl,'Original image'),imageEdit:validateImageEdit(item.imageEdit),title:text(item.title,'Image title',180),description:text(item.description,'Image caption',2000),imageFit:item.imageFit||'cover',...position}];
 });
}
export function validatePageSections(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||!Number.isSafeInteger(body.revision)||body.revision<0)throw httpError(400,'Reload this page editor before saving.');
 if(!Array.isArray(body.blocks)||body.blocks.length>PAGE_SECTION_LIMIT)throw httpError(400,`Use at most ${PAGE_SECTION_LIMIT} page sections.`);
 const ids=new Set();
 const blocks=body.blocks.map((item,index)=>{
  if(!item||typeof item!=='object'||Array.isArray(item))throw httpError(400,'Invalid page section.');
  const id=text(item.id,'Section identifier',80);
  if(!/^[a-zA-Z0-9_-]{8,80}$/.test(id)||ids.has(id))throw httpError(400,'Page section identifiers must be unique.');ids.add(id);
  if(!PAGE_SECTION_TYPES.includes(item.type)||typeof item.published!=='boolean')throw httpError(400,'Choose a valid section type and publication state.');
  const gallery=validateGallery(item.gallery,item.published);
  const title=text(item.title,'Section title',180),description=text(item.description,'Description',10000),imageUrl=contentUrl(item.imageUrl,'Image URL'),imageAlt=text(item.imageAlt,'Image description',300),videoUrl=contentVideoUrl(item.videoUrl),buttonLabel=text(item.buttonLabel,'Button label',80),buttonUrl=contentUrl(item.buttonUrl,'Button URL');
  if(item.published&&imageUrl&&!imageAlt)throw httpError(400,'Add alternative text for every image.');
  if(Boolean(buttonUrl)!==Boolean(buttonLabel))throw httpError(400,'A button needs both label and destination.');
  if(item.published&&!title&&!description&&!imageUrl&&!videoUrl&&!buttonUrl&&!gallery.length)throw httpError(400,'A published section needs content.');
  if(!['contain','cover'].includes(item.imageFit||'contain')||!['stack','split'].includes(item.layout||'stack')||!['left','center'].includes(item.align||'left')||!['cream','white','dark'].includes(item.theme||'cream'))throw httpError(400,'Invalid page section display settings.');
  if(!['start','after-hero','after-catalog','end'].includes(item.placement||'end')||!['grid','masonry','justified','portfolio','single','carousel'].includes(item.galleryLayout||'grid')||!['original','4:3','1:1','3:4','16:9'].includes(item.imageAspect||'4:3')||!Number.isSafeInteger(item.columns??3)||(item.columns??3)<1||(item.columns??3)>4)throw httpError(400,'Invalid gallery layout or page placement.');
  return {placement:item.placement||'end',galleryLayout:item.galleryLayout||'grid',columns:item.columns??3,imageAspect:item.imageAspect||'4:3',gallery,id,type:item.type,title,description,imageUrl,imageAlt,imageFileId:mediaId(item.imageFileId,imageUrl,'Image'),imageFit:item.imageFit||'contain',videoUrl,videoFileId:mediaId(item.videoFileId,videoUrl,'Video'),buttonLabel,buttonUrl,layout:item.layout||'stack',align:item.align||'left',theme:item.theme||'cream',published:item.published,order:index};
 });
 return {revision:body.revision,blocks};
}
export function publishedPageSections(doc){return (doc?.blocks||[]).filter(block=>block.published===true).map(({id,type,title,description,imageUrl,imageAlt,imageFit,videoUrl,buttonLabel,buttonUrl,layout,align,theme,order,placement,galleryLayout,columns,imageAspect,gallery})=>({id,type,title,description,imageUrl,imageAlt,imageFit,videoUrl,buttonLabel,buttonUrl,layout,align,theme,order,placement:placement||'end',galleryLayout:galleryLayout||'grid',columns:columns||3,imageAspect:imageAspect||'4:3',gallery:(gallery||[]).map(({id,imageUrl,imageAlt,imageFit,title,description,positionX,positionY})=>({id,imageUrl,imageAlt,imageFit,title,description,positionX,positionY}))})).sort((a,b)=>a.order-b.order);}
