import 'dotenv/config';
import mongoose from 'mongoose';
import {prepareReviewIndexes} from '../services/reviewIndexes.js';
const apply=process.argv.includes('--apply');
try {
 const uri=process.env.MONGODB_URI||process.env.MONGO_URI;
 if(!uri)throw new Error('A database target is required; its value will not be printed.');
 await mongoose.connect(uri,{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000});
 const result=await prepareReviewIndexes(mongoose.connection.db.collection('reviews'),{apply});
 console.log(JSON.stringify({databaseName:mongoose.connection.name,...result},null,2));
 if(result.status!=='passed')process.exitCode=1;
} catch(error) {
 console.error('Review index preparation failed:',error.code||error.name);
 process.exitCode=1;
} finally { await mongoose.disconnect(); }
