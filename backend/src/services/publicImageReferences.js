import Course from '../models/Course.js';
import TeamMember from '../models/TeamMember.js';
import Event from '../models/Event.js';
import SiteContent from '../models/SiteContent.js';
import Section from '../models/Section.js';
import PageSection from '../models/PageSection.js';
import {catalogCache} from './catalogCache.js';

const normalizedId=value=>{const id=String(value??'').toLowerCase();return /^[a-f0-9]{24}$/.test(id)?id:null;};
const defaults={Course,TeamMember,Event,SiteContent,Section,PageSection};
const maxRecords=512;

/** Only publication references are shared. Authentication, file purpose and
 * private entitlement checks remain in mediaRoutes before any bytes are sent. */
export function createPublicImageReferenceService({models=defaults,cache=catalogCache,batchSize=32,parallel=2,maxPending=512,schedule=fn=>setTimeout(fn,3)}={}){
 const queued=new Map();let active=0,scheduled=false;
 const filters=ids=>[
  {published:true,$or:[{thumbnailFileId:{$in:ids}},{'gallery.fileId':{$in:ids}}]},
  {active:true,imageFileId:{$in:ids}},
  {status:'published',imageFileId:{$in:ids}},
  {key:'websiteContent','value.images.fileId':{$in:ids}},
  {published:true,archivedAt:null,thumbnailFileId:{$in:ids}},
  {blocks:{$elemMatch:{published:true,$or:[{imageFileId:{$in:ids}},{gallery:{$elemMatch:{imageFileId:{$in:ids},imageUrl:{$in:ids.map(id=>'/api/media/'+id)}}}}]}}}
 ];
 const entries=[
  [models.Course,'thumbnailFileId gallery.fileId'],[models.TeamMember,'imageFileId'],
  [models.Event,'imageFileId'],[models.SiteContent,'value.images.fileId'],
  [models.Section,'thumbnailFileId'],[models.PageSection,'blocks.published blocks.imageFileId blocks.gallery.imageFileId blocks.gallery.imageUrl']
 ];
 async function read(ids){
  const queries=filters(ids),wanted=new Set(ids),found=new Set();
  const add=value=>{const id=String(value??'');if(wanted.has(id))found.add(id);};
  const records=await Promise.all(entries.map(([model,fields],index)=>model.find(queries[index]).select(fields).limit(maxRecords).lean()));
  for(const doc of records[0]){add(doc.thumbnailFileId);for(const image of doc.gallery||[])add(image.fileId);}
  for(const doc of [...records[1],...records[2]])add(doc.imageFileId);
  for(const doc of records[3])for(const image of doc.value?.images||[])add(image.fileId);
  for(const doc of records[4])add(doc.thumbnailFileId);
  for(const doc of records[5])for(const block of doc.blocks||[]){
   if(block.published!==true)continue;
   add(block.imageFileId);
   for(const image of block.gallery||[])if(image.imageUrl==='/api/media/'+String(image.imageFileId))add(image.imageFileId);
  }
  // A highly repeated image must not make a bounded projection silently hide a
  // different public image. Saturated collections get exact point checks only
  // for unresolved IDs, sequentially to avoid flooding the database pool.
  const saturated=records.flatMap((docs,index)=>docs.length===maxRecords?[index]:[]);
  for(const id of ids){
   if(found.has(id))continue;
   const exact=filters([id]);
   for(const index of saturated){if(await entries[index][0].exists(exact[index])){found.add(id);break;}}
  }
  return found;
 }
 function start(){
  scheduled=false;
  while(active<parallel&&queued.size){
   const jobs=[...queued.entries()].slice(0,batchSize);
   for(const [id]of jobs)queued.delete(id);
   active++;
   read(jobs.map(([id])=>id)).then(found=>{for(const [id,job]of jobs)job.resolve(found.has(id));},error=>{for(const [,job]of jobs)job.reject(error);}).finally(()=>{active--;requestStart();});
  }
 }
 function requestStart(){if(!scheduled&&queued.size&&active<parallel){scheduled=true;schedule(start);}}
 function queue(id){
  if(queued.has(id))return queued.get(id).promise;
  if(queued.size>=maxPending)return Promise.reject(Object.assign(new Error('Public image metadata is busy. Please retry.'),{status:503}));
  let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  queued.set(id,{promise,resolve,reject});requestStart();return promise;
 }
 return async value=>{const id=normalizedId(value);return id?cache.get('public-photo:'+id,()=>queue(id),5000):false;};
}

export const isPublicImageReference=createPublicImageReferenceService();
