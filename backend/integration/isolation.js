/** Destructive test cleanup is confined to a newly generated, reserved database name. */
import crypto from 'node:crypto';
export function isolatedDatabase(prefix='sa_v46_test_'){
 const uri=process.env.TEST_MONGODB_URI;
 if(!uri)throw new Error('Set TEST_MONGODB_URI to a dedicated test replica set. Production MONGODB_URI is never used by this suite.');
 let u;try{u=new URL(uri);}catch{throw new Error('Invalid TEST_MONGODB_URI.');}
 if(!['mongodb:','mongodb+srv:'].includes(u.protocol)||!/^\/[a-zA-Z0-9_-]*_test$/.test(u.pathname))throw new Error('TEST_MONGODB_URI must explicitly name a database ending in _test. Use a dedicated test server/account.');
 const dbName=prefix+crypto.randomBytes(8).toString('hex');
 return {uri,dbName,async cleanup(mongoose){if(mongoose.connection.name!==dbName||!/^sa_v46_(?:browser_)?test_[a-f0-9]{16}$/.test(dbName))throw new Error('Refusing test cleanup outside the generated test database.');await mongoose.connection.dropDatabase();}};
}
export function testEnvironment(){
 // Dedicated CI fixtures must never inherit real provider/mail credentials.
 for(const name of ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_SECRET','PAYPAL_WEBHOOK_ID','PAYPAL_MERCHANT_ID','SMTP_USER','SMTP_PASS','CLOUDMERSIVE_API_KEY'])delete process.env[name];
 process.env.ONLINE_PAYMENTS_ENABLED='false';
 Object.assign(process.env,{NODE_ENV:'test',DEPLOYMENT_STAGE:'development',PAYPAL_CREATE_REPLAY_SECONDS:'0',SA_REQUIRE_PROXY_IDENTITY:'false',SA_PROXY_SHARED_SECRET:'',ASSESSMENT_SECRET:'',AUTH_SECRET:crypto.randomBytes(48).toString('hex'),MFA_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),FRONTEND_URL:'http://localhost:3000',FRONTEND_URLS:'http://localhost:3000',REQUIRE_ADMIN_MFA:'true',TRUST_PROXY_HOPS:'0',UPLOAD_SCAN_REQUIRED:'false',UPLOAD_SCAN_PROVIDER:'clamav',CLAMAV_HOST:'',UPLOADS_ENABLED:'true',CLOUDMERSIVE_MAX_FILE_BYTES:'3500000',UPLOAD_SCAN_TIMEOUT_MS:'120000',SMTP_HOST:'',HTTP_ACCESS_LOGS:'false'});
}
