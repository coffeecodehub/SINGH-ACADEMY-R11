import mongoose from 'mongoose';
import Course from '../models/Course.js';
import Module from '../models/Module.js';
import Lesson from '../models/Lesson.js';
import {courseSeeds} from '../data/courseSeeds.js';

export function seedLesson(tuple){
 const [title,authoredType='mixed',questions=[],resources=[]]=tuple;
 const type=({'self-assessment':'quiz','external-video':'video',reflection:'journal',reading:'resource'})[authoredType]||authoredType;
 return {title,type,questions,resources,completionRequired:true,...(authoredType==='external-video'&&resources[0]?.url?{videoUrl:resources[0].url}:{})};
}
export function validateCourseSeeds(seeds=courseSeeds){
 for(const seed of seeds){const {modules,...course}=seed;const error=new Course(course).validateSync();if(error)throw error;
  for(const [title,lessons] of modules){const error=new Module({course:new mongoose.Types.ObjectId(),title}).validateSync();if(error)throw error;
   for(const tuple of lessons){const error=new Lesson({...seedLesson(tuple),module:new mongoose.Types.ObjectId()}).validateSync();if(error)throw error;}
  }
 }
 return seeds;
}
/** Prevalidate the entire dataset, then commit each curriculum atomically.
 * Existing authored content is preserved. Explicit repair fills only missing titles. */
export async function seedCourseData({seeds=courseSeeds,repairMissing=false}={}){
 validateCourseSeeds(seeds);const results=[];
 for(const seed of seeds){
  const result=await mongoose.connection.transaction(async session=>{
   const {modules,...courseData}=seed;let course=await Course.findOne({slug:seed.slug}).session(session);
   if(course&&!repairMissing)return {slug:seed.slug,preserved:true,lessonsCreated:0};
   if(!course)course=(await Course.create([courseData],{session}))[0];let lessonsCreated=0;
   for(let mi=0;mi<modules.length;mi++){
    const [title,lessons]=modules[mi];let module=await Module.findOne({course:course._id,title}).session(session);
    if(!module)module=(await Module.create([{course:course._id,title,order:mi+1,sequential:true}],{session}))[0];
    for(let li=0;li<lessons.length;li++){
     const lesson=seedLesson(lessons[li]);if(await Lesson.exists({module:module._id,title:lesson.title}).session(session))continue;
     await Lesson.create([{module:module._id,...lesson,order:li+1}],{session});lessonsCreated++;
    }
   }
   return {slug:seed.slug,preserved:false,lessonsCreated};
  },{readPreference:'primary',writeConcern:{w:'majority'}});results.push(result);
 }
 return results;
}
