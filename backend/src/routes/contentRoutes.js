import {compareTeam,teamCategories,teamCategoryFilter} from '../utils/teamCategories.js';
import {Router} from 'express';
import TeamMember from '../models/TeamMember.js';
import SiteContent from '../models/SiteContent.js';
import Event from '../models/Event.js';
import {mediaUrl} from '../utils/media.js';
import {catalogCache} from '../services/catalogCache.js';
import {landingContent} from '../services/landingContent.js';
import {publicEvent} from '../utils/events.js';
const r=Router();
r.get('/landing',async(req,res)=>{res.set('Cache-Control','private, no-store');res.json({success:true,...await landingContent(req)});});
const sortTeam=compareTeam;
const publicCache=res=>res.set('Cache-Control','private, no-store');
r.get('/team',async(req,res)=>{
  publicCache(res);const q={active:true};
  if(req.query.category && ['founder','faculty','board','core'].includes(String(req.query.category))) Object.assign(q,teamCategoryFilter(String(req.query.category)));
  const team=await catalogCache.get('team:'+JSON.stringify(q),async()=>{
    const members=await TeamMember.find(q).select('-imageOriginal -imageOriginalFileId -imageEdit').lean();
    return members.sort(sortTeam);
  });
  res.json({success:true,team:team.map(({imageOriginal,imageOriginalFileId,imageEdit,...m})=>({...m,categories:teamCategories(m),image:mediaUrl(req,m.imageFileId,m.image)}))});
});
r.get('/events',async(req,res)=>{publicCache(res);const events=await catalogCache.get('events',()=>Event.find({status:'published'}).sort({date:1,createdAt:-1}).lean());res.json({success:true,events:events.map(e=>({...publicEvent(e),image:mediaUrl(req,e.imageFileId,e.image)}))});});
r.get('/site',async(req,res)=>{
  publicCache(res);
  // Do not expose future private/system settings through this public endpoint.
  const docs=await catalogCache.get('site',()=>SiteContent.find({key:{$in:['membershipPlans','footerSocial','websiteContent']}}).lean());
  // This metadata endpoint is cached by public pages. Prices belong to the authenticated catalog.
  res.json({success:true,content:Object.fromEntries(docs.map(x=>[x.key,x.key==='membershipPlans'&&Array.isArray(x.value)?x.value.filter(p=>p.active!==false).map(({key,name,description,features,durationMonths})=>({key,name,description,features,durationMonths})):x.value]))});
});
export default r;
