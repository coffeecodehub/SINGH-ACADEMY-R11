import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {fileURLToPath} from 'node:url';
import {ensureEnrollmentIndexes,validEnrollmentCompoundIndex} from '../src/utils/enrollmentIndexes.js';
import {requireGateway,realAccessFilter} from '../src/utils/commerce.js';
import {checkEnvironment} from '../src/utils/deployment.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const sandbox=()=>({NODE_ENV:'production',DEPLOYMENT_STAGE:'review',ONLINE_PAYMENTS_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_abcdef12345',STRIPE_WEBHOOK_SECRET:'whsec_abcdef12345',PAYPAL_MODE:'sandbox',PAYPAL_CLIENT_ID:'abcdef12345',PAYPAL_CLIENT_SECRET:'abcdefSecret12345',PAYPAL_WEBHOOK_ID:'webhookFixture123'});
const productionBase=()=>({...sandbox(),AUTH_SECRET:crypto.randomBytes(48).toString('hex'),MFA_ENCRYPTION_KEY:crypto.randomBytes(32).toString('hex'),MONGODB_URI:'mongodb+srv://user:pass@cluster.example.invalid/singh_academy',FRONTEND_URL:'https://review.academy.test',FRONTEND_URLS:'https://review.academy.test',PUBLIC_API_URL:'/api',REQUIRE_ADMIN_MFA:'true',SMTP_HOST:'smtp.academy.test',EMAIL_FROM:'Academy <mail@academy.test>',UPLOAD_SCAN_REQUIRED:'true',CLAMAV_HOST:'scanner',PAYMENT_WEBHOOK_BASE_URL:'https://api-review.academy.test'});

test('V60.4 fresh Atlas database initializes enrollment index when collection does not yet exist',async()=>{
 let created=null,calls=0;
 const missing=Object.assign(new Error('ns does not exist: singh_academy.enrollments'),{code:26,codeName:'NamespaceNotFound'});
 const collection={async indexes(){calls++;throw missing;},async createIndex(key,options){created={key,options};return options.name;},async dropIndex(){assert.fail('Fresh collection must not try to drop an index.');}};
 const dropped=await ensureEnrollmentIndexes(collection);
 assert.deepEqual(dropped,[]);assert.ok(calls>=2);assert.deepEqual(created,{key:{user:1,courseSlug:1},options:{unique:true,name:'user_1_courseSlug_1'}});assert.equal(validEnrollmentCompoundIndex({key:created.key,...created.options}),true);
});

test('V60.4 public client review allows sandbox providers but blocks live credentials',()=>{
 assert.equal(requireGateway('stripe',sandbox()).environment,'test');
 assert.deepEqual(realAccessFilter(sandbox()),{});
 const live={...sandbox(),STRIPE_SECRET_KEY:'sk_live_abcdef12345'};
 assert.throws(()=>requireGateway('stripe',live),{status:503});
});

test('V60.4 review deployment validates sandbox checkout without weakening live-production rule',()=>{
 const review=checkEnvironment(productionBase());
 assert.equal(review.review,true);assert.equal(review.errors.filter(x=>/sandbox|test payment|live production checkout/i.test(x)).length,0);
 const liveStage=checkEnvironment({...productionBase(),DEPLOYMENT_STAGE:'production'});
 assert.ok(liveStage.errors.some(x=>/sandbox\/test payment credentials/i.test(x)));
});

test('V60.4 learner records are scoped to each user, never globally unique by course',()=>{
 const enrollment=read('backend/src/models/Enrollment.js'),subscription=read('backend/src/models/Subscription.js'),progress=read('backend/src/models/Progress.js'),attempt=read('backend/src/models/CourseAttempt.js'),completion=read('backend/src/models/CourseCompletion.js');
 assert.match(enrollment,/schema\.index\(\{user:1,courseSlug:1\},\{unique:true\}\)/);assert.doesNotMatch(enrollment,/schema\.index\(\{courseSlug:1\},\{unique:true\}\)/);
 assert.match(subscription,/user:\{type:mongoose\.Schema\.Types\.ObjectId/);assert.match(subscription,/schema\.index\(\{user:1,status:1,startsAt:1,endsAt:1\}\)/);
 assert.match(progress,/schema\.index\(\{user:1,lesson:1\},\{unique:true\}\)/);
 assert.match(attempt,/schema\.index\(\{user:1,course:1,number:1\},\{unique:true\}\)/);
 assert.match(completion,/schema\.index\(\{user:1,course:1\},\{unique:true\}\)/);
 for(const model of ['CheckoutOrder','Payment','Invoice'])assert.match(read(`backend/src/models/${model}.js`),/user:\{type:mongoose\.Schema\.Types\.ObjectId/);
});

test('V60.4 lesson editor accepts embed blocks and common social video providers with safe external fallback',()=>{
 const editor=read('frontend/components/cms/LessonEditor.tsx'),player=read('frontend/app/learn/[course]/page.tsx'),video=read('frontend/lib/video.ts'),csp=read('frontend/middleware.ts');
 assert.match(editor,/\['rich_text','video','embed'/);assert.match(editor,/Video \/ social URL/);assert.match(editor,/LessonVideoPreview url=\{b\.url\}/);
 assert.match(player,/\['video','embed'\]\.includes\(b\.type\)/);assert.match(read('frontend/components/learning/LessonMedia.tsx'),/lazy\?:boolean/);assert.match(player,/LessonMedia/);
 for(const provider of ['facebook','streamable','wistia','vidyard','twitch'])assert.match(video,new RegExp(`provider:'${provider}'`));
 assert.match(video,/provider:'external'/);assert.match(csp,/https:\/\/www\.facebook\.com/);assert.match(csp,/https:\/\/player\.twitch\.tv/);
});

test('V60.4 footer has a standalone Contact column while existing footer navigation remains',()=>{
 const footer=read('frontend/components/layout/SiteFooter.tsx');
 assert.match(footer,/className="footerContactColumn"/);assert.match(footer,/footer-012","Contact"/);assert.match(footer,/mailto:/);assert.match(footer,/tel:/);assert.match(footer,/google\.com\/maps\/search/);
 assert.match(footer,/footer-004","Explore"/);assert.match(footer,/footer-009","Learn"/);assert.match(footer,/footer-013","Account"/);
});

test('V60.4 user-facing async actions expose busy state without changing idle labels',()=>{
 for(const file of ['frontend/app/login/page.tsx','frontend/app/register/page.tsx','frontend/app/contact/page.tsx','frontend/app/reviews/page.tsx','frontend/app/courses/[slug]/page.tsx','frontend/app/checkout/page.tsx','frontend/app/checkout/return/page.tsx'])assert.match(read(file),/aria-busy=/,file);
 assert.match(read('frontend/app/styles.css'),/button\[aria-busy="true"\]::after/);
});

test('V60.4 release stays on the patched Next 15 maintenance line and overrides the audited PostCSS floor',()=>{
 const pkg=JSON.parse(read('frontend/package.json'));
 assert.equal(pkg.dependencies.next,'15.5.29');assert.equal(pkg.overrides?.next?.postcss,'8.5.23');
 const workflow=read('.github/workflows/quality.yml');assert.doesNotMatch(workflow,/npm install --prefix/);assert.match(workflow,/must be generated\/reviewed locally and committed/);assert.match(workflow,/exit 1/);assert.match(workflow,/npm ci --prefix/);assert.match(workflow,/npm run verify/);
});
