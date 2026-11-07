import 'dotenv/config';
import mongoose from 'mongoose';
import {seedCourseData,validateCourseSeeds} from '../services/courseSeeding.js';
if(!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
validateCourseSeeds();
try{
 await mongoose.connect(process.env.MONGODB_URI);
 const results=await seedCourseData({repairMissing:process.argv.includes('--repair-missing')});
 for(const result of results)console.log(result.preserved?`Preserved existing course: ${result.slug}`:`Seeded ${result.slug}: ${result.lessonsCreated} missing lessons added.`);
 console.log('Course seed complete.');
}finally{await mongoose.disconnect();}
