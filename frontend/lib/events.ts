/** A Zoom join URL is distinct from a general event location link. */
export function zoomMeetingUrl(value:unknown):string {
 if(typeof value!=='string'||value.length>2048||!value.trim())return '';
 try{
  const url=new URL(value.trim()),host=url.hostname.toLowerCase();
  const zoom=host==='zoom.us'||host.endsWith('.zoom.us')||host==='zoom.com'||host.endsWith('.zoom.com');
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&zoom?url.href:'';
 }catch{return '';}
}

export function eventDate(value:unknown):Date|null {
 if(typeof value!=='string'||!value)return null;
 const date=new Date(value);return Number.isNaN(date.getTime())?null:date;
}
