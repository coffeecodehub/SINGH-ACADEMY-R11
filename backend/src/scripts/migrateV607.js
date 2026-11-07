/** Additive only. No seeds, user edits, financial rewrites, session resets or PDF regeneration. */
import 'dotenv/config';import mongoose from 'mongoose';import {connectDB} from '../config/db.js';
import StudentNotification from '../models/StudentNotification.js';
try{await connectDB();await StudentNotification.createCollection().catch(error=>{if(error.code!==48&&error.codeName!=='NamespaceExists')throw error;});await StudentNotification.createIndexes();console.log('V60.7 notification indexes ready. Existing users, invoices, payments, access, progress and certificates were not changed.');}
catch(error){console.error('V60.7 index initialization failed:',error.code||error.name);process.exitCode=1;}
finally{await mongoose.disconnect();}
