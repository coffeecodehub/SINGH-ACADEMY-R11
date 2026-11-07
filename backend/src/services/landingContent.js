import {teamCategories,compareTeam} from '../utils/teamCategories.js';
import Course from '../models/Course.js';
import Section from '../models/Section.js';
import TeamMember from '../models/TeamMember.js';
import Review from '../models/Review.js';
import {catalogCache} from './catalogCache.js';
import {mediaUrl} from '../utils/media.js';
import {approvedReviewQuery} from '../utils/reviews.js';
/** Public landing summaries only. Never expose lessons, answers, user IDs or billing. */
export async function landingContent(req){
 const [courses,sections,team,reviews]=await Promise.all([
  catalogCache.get('landing:courses',()=>Course.find({published:true}).select('title slug sectionSlug thumbnail thumbnailFileId thumbnailFit thumbnailPositionX thumbnailPositionY thumbnailZoom instructor shortDescription description level estimatedWeeks accessType featured').sort({featured:-1,createdAt:-1}).limit(24).lean()),
  catalogCache.get('landing:sections',()=>Section.find({published:true,archivedAt:null}).select('title slug shortDescription description thumbnail thumbnailFileId order').sort({order:1,title:1,_id:1}).limit(24).lean()),
  catalogCache.get('landing:team',()=>TeamMember.find({active:true}).select('name title role category categories order image imageFileId imageFit imagePositionX imagePositionY imageZoom affiliation bio').sort({order:1,name:1}).limit(60).lean()),
  catalogCache.get('landing:reviews',()=>Review.find(approvedReviewQuery()).select('name rating message createdAt updatedAt').sort({updatedAt:-1,createdAt:-1}).limit(20).lean())
 ]);
 const pick=(item,keys)=>Object.fromEntries(keys.split(' ').filter(k=>item[k]!==undefined).map(k=>[k,item[k]]));
 const courseKeys='_id title slug sectionSlug thumbnailFit thumbnailPositionX thumbnailPositionY thumbnailZoom instructor shortDescription description level estimatedWeeks accessType featured';
 const sectionKeys='_id title slug shortDescription description order';
 const teamKeys='_id name title role category categories order imageFit imagePositionX imagePositionY imageZoom affiliation bio';
 // Landing metadata is shared by public pages. Keep prices out even if a caller
 // has a session; authenticated pricing belongs to /sections and /courses.
 return {sections:sections.map(section=>({...pick(section,sectionKeys),thumbnail:mediaUrl(req,section.thumbnailFileId,section.thumbnail)})),courses:courses.map(c=>({...pick(c,courseKeys),thumbnail:mediaUrl(req,c.thumbnailFileId,c.thumbnail)})),team:team.slice().sort(compareTeam).map(m=>({...pick(m,teamKeys),categories:teamCategories(m),image:mediaUrl(req,m.imageFileId,m.image)})),reviews:reviews.map(x=>pick(x,'_id name rating message createdAt updatedAt'))};
}
