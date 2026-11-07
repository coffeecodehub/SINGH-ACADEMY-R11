import {httpError} from './cmsValidation.js';
function plain(value,label,maximum,required=false){
 if(typeof value!=='string'||value.length>maximum||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)||/<\/?[a-z][^>]*>/i.test(value))throw httpError(400,label+' must be bounded plain text.');
 const text=value.trim();if(required&&!text)throw httpError(400,label+' is required.');return text;
}
export function reviewRevision(value){if(!Number.isSafeInteger(value)||value<1)throw httpError(400,'Reload the video review before saving or deleting.');return value;}
export function validateVideoReview(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw httpError(400,'Supply a video review.');
 const title=plain(body.title,'Title',180,true),description=plain(body.description??'','Description',4000),videoUrl=plain(body.videoUrl,'Video URL',2048,true);
 if(typeof body.published!=='boolean')throw httpError(400,'Choose whether this review is published.');
 const teaserSeconds=body.teaserSeconds??15,order=body.order??0;
 if(!Number.isInteger(teaserSeconds)||teaserSeconds<10||teaserSeconds>20)throw httpError(400,'Choose a teaser between 10 and 20 seconds.');
 if(!Number.isInteger(order)||order<0||order>10000)throw httpError(400,'Display order must be a whole number from 0 to 10000.');
 let videoFileId=null;
 const local=videoUrl.match(/^\/api\/media\/([a-f0-9]{24})$/);
 if(local){videoFileId=local[1];if(body.videoFileId!==videoFileId)throw httpError(400,'The video identifier must match its uploaded URL.');}
 else{
  let url;try{url=new URL(videoUrl);}catch{throw httpError(400,'Use an uploaded video or a complete HTTPS video/social URL.');}
  if(url.protocol!=='https:'||url.username||url.password||body.videoFileId)throw httpError(400,'External video links must use HTTPS without credentials or an uploaded file identifier.');
 }
 return {title,description,videoUrl,videoFileId,teaserSeconds,published:body.published,order};
}
export function publicVideoReview(item,previewRendition){const uploaded=item.videoUrl?.match(/^\/api\/media\/([a-f0-9]{24})$/);return {_id:String(item._id),title:item.title,description:item.description||'',videoUrl:item.videoUrl,teaserSeconds:item.teaserSeconds||15,order:item.order||0,...(uploaded?{previewRendition:typeof previewRendition==='string'&&/^[a-f0-9]{24}$/.test(previewRendition)?previewRendition:uploaded[1]}:{})};}
export function adminVideoReview(item){return {...publicVideoReview(item),videoFileId:item.videoFileId||null,published:item.published===true,revision:item.revision,updatedAt:item.updatedAt};}
