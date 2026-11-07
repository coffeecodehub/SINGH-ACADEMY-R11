/** Read-only; reports counts, never URI/passwords or student records. Run against the same ENV as Hostinger. */
import 'dotenv/config';import mongoose from 'mongoose';
import Course from '../models/Course.js';import TeamMember from '../models/TeamMember.js';import Module from '../models/Module.js';import Lesson from '../models/Lesson.js';import StudentNotification from '../models/StudentNotification.js';
try{
 const uri=process.env.MONGODB_URI||process.env.MONGO_URI;if(!uri)throw new Error('MONGODB_URI missing');
 // Explicitly suppress automatic collection/index creation in this read-only diagnostic.
 await mongoose.connect(uri,{autoIndex:false,autoCreate:false,maxPoolSize:2,serverSelectionTimeoutMS:10000,connectTimeoutMS:10000});
 const [courses,publishedCourses,team,activeTeam,modules,publishedLessons,emailStates]=await Promise.all([Course.countDocuments(),Course.countDocuments({published:true}),TeamMember.countDocuments(),TeamMember.countDocuments({active:true}),Module.countDocuments(),Lesson.countDocuments({published:{$ne:false}}),StudentNotification.aggregate([{$group:{_id:'$emailState',count:{$sum:1}}}])]);
 console.log(JSON.stringify({database:mongoose.connection.name,courses,publishedCourses,team,activeTeam,modules,publishedLessons,emailStates},null,2));
 if(!publishedCourses||!activeTeam)console.warn('Zero published courses/active team: check the exact Atlas database name and publish/active flags in Admin. Do NOT seed over an existing client database.');
}catch(error){console.error('Content diagnosis failed:',error.code||error.name);process.exitCode=1;}finally{await mongoose.disconnect();}
