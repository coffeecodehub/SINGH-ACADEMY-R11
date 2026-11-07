const invalid=()=>Object.assign(new Error('Use a complete HTTPS Zoom link on zoom.us or zoom.com.'),{status:400});
export function normalizeZoomUrl(value){
 if(value==null||value==='')return '';
 if(typeof value!=='string'||value.length>2048)throw invalid();
 let url;try{url=new URL(value.trim());}catch{throw invalid();}
 const allowed=['zoom.us','zoom.com'].some(host=>url.hostname===host||url.hostname.endsWith('.'+host));
 if(url.protocol!=='https:'||url.username||url.password||url.port||!allowed)throw invalid();return url.href;
}
/** Explicit public fields prevent administrative/private fields from leaking. */
export function publicEvent(event){
 const keys='_id title slug date location description image imageFileId mapUrl status createdAt updatedAt';
 const out=Object.fromEntries(keys.split(' ').filter(key=>event[key]!==undefined).map(key=>[key,event[key]]));
 out.type=event.type==='webinar'?'webinar':'event';out.zoomUrl='';
 if(out.type==='webinar'){try{out.zoomUrl=normalizeZoomUrl(event.zoomUrl);}catch{/* Old invalid links remain hidden until corrected by an administrator. */}}
 return out;
}
