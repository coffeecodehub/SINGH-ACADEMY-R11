/** Local browser fixture server. Generated database only; no public deployment endpoint. */
import {isolatedDatabase,testEnvironment} from './isolation.js';
const isolated=isolatedDatabase('sa_v46_browser_test_');testEnvironment();
const mongoose=(await import('mongoose')).default;
const {createApp}=await import('../src/app.js');
await mongoose.connect(isolated.uri,{dbName:isolated.dbName,autoIndex:false,serverSelectionTimeoutMS:10000});
for(const M of Object.values(mongoose.models))await M.createIndexes();
// TEST ONLY: real credentials for synthetic accounts in the generated browser DB.
// This module is never imported by src/server.js and refuses a non-test database above.
const bcrypt=(await import('bcryptjs')).default;
const User=mongoose.model('User');
const browserPasswordHash=await bcrypt.hash('Browser-Only-Fixture-2026!',12);
await User.create([
 {name:'Browser Client Admin',email:'client-admin@browser-fixture.invalid',passwordHash:browserPasswordHash,role:'client_admin',status:'active',country:'US',emailVerified:true},
 {name:'Browser Super Admin',email:'super-admin@browser-fixture.invalid',passwordHash:browserPasswordHash,role:'super_admin',status:'active',country:'US',emailVerified:true},
 {name:'Browser Pakistan Learner',email:'pk-student@browser-fixture.invalid',passwordHash:browserPasswordHash,role:'student',status:'active',country:'PK',emailVerified:true},
 {name:'Browser US Learner',email:'us-student@browser-fixture.invalid',passwordHash:browserPasswordHash,role:'student',status:'active',country:'US',emailVerified:true},
 {name:'Browser Removal Learner',email:'removal-student@browser-fixture.invalid',passwordHash:browserPasswordHash,role:'student',status:'active',country:'US',emailVerified:true},
 {name:'Browser Export Client Admin',email:'client-export-admin@browser-fixture.invalid',passwordHash:browserPasswordHash,role:'client_admin',status:'active',country:'US',emailVerified:true},
]);
const server=createApp().listen(5000,'127.0.0.1',()=>console.log('Isolated browser test API listening on localhost:5000.'));
let closing=false;async function stop(){if(closing)return;closing=true;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));try{await isolated.cleanup(mongoose);}finally{await mongoose.disconnect();process.exit();}}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
