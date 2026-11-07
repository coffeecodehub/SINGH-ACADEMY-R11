import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const hash=rel=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,rel))).digest('hex');

test('student auth is instant with 8-character minimum and no email-verification gate',()=>{
 const auth=read('backend/src/controllers/authController.js'),routes=read('backend/src/routes/authRoutes.js'),register=read('frontend/app/register/page.tsx'),login=read('frontend/app/login/page.tsx');
 assert.match(auth,/passwordError\(password,8\)/);
 assert.match(auth,/emailVerified:false/);
 assert.match(auth,/autoLogin:true,verificationRequired:false/);
 assert.doesNotMatch(auth,/EMAIL_VERIFICATION_REQUIRED/);
 assert.doesNotMatch(routes,/resend-verification|\/verify'/);
 assert.match(register,/replaceAuthDocument\(next\)/);assert.match(register,/safeStudentNext\(q\.get\('next'\)\)/);
 assert.doesNotMatch(login,/Resend verification|EMAIL_VERIFICATION_REQUIRED/);
});

test('My Courses keeps enrollment records and active membership also exposes the whole published library',()=>{
 const routes=read('backend/src/routes/courseRoutes.js'),detail=read('frontend/app/courses/[slug]/page.tsx'),model=read('backend/src/models/Enrollment.js');
 const mine=routes.slice(routes.indexOf("r.get('/enrolled/mine'"),routes.indexOf("r.get('/:slug'"));
 assert.match(mine,/effectiveCourseEnrollments\(req\.user\._id/);
 assert.match(mine,/Subscription\.findOne/);
 assert.match(mine,/explicitMembershipRows/);assert.doesNotMatch(mine,/Course\.find\(membership\?\{published:true\}/);
 assert.match(routes,/r\.post\('\/:slug\/enroll'/);
 assert.match(detail,/const slug=encodeURIComponent\(params\.slug\)/);
 assert.match(detail,/apiFetch\(`\/courses\/\$\{slug\}\/enroll`,\{method:'POST',signal:controller\.signal\}\)/);
 assert.match(model,/membership','free'/);
});

test('reviews await administrator approval and public list is uncached',()=>{
 const controller=read('backend/src/controllers/reviewController.js'),page=read('frontend/app/reviews/page.tsx');
 assert.match(controller,/Cache-Control','no-store/);
 assert.match(controller,/status:'pending'/);assert.match(controller,/awaiting administrator approval/);assert.match(controller,/catalogCache\.clear\(\)/);
 assert.match(controller,/name:review\.name,rating:review\.rating,message:review\.message/);
 assert.match(page,/d\.review\.status==='approved'/);
 assert.match(page,/after admin approval/);
});

test('both admins moderate review visibility while client review text remains read-only',()=>{
 const portal=read('frontend/components/business/BusinessPortal.tsx'),component=read('frontend/components/business/AdminReviews.tsx'),client=read('backend/src/routes/academyAdminRoutes.js'),admin=read('backend/src/routes/adminRoutes.js');
 assert.match(portal,/items:\['students','subscriptions','purchases','forms','reviews'\]/);
 for(const section of ['content_overview','courses','team','events','plans','reviews','social','website','sections','coupons','page_sections'])assert.ok(portal.includes("'"+section+"'"),section+' remains available in the appropriate admin workspace');
 assert.match(portal,/AdminReviews readOnly=\{!isSuper\}/);
 assert.match(component,/Client Admin can moderate visibility; review text remains read-only/);
 assert.match(component,/Super Admin can also edit review details/);
 assert.match(component,/Awaiting approval/);
 assert.match(client,/r\.get\('\/reviews'/);
 assert.match(admin,/r\.patch\('\/reviews\/:id',requireRole\('super_admin'\)/);
 assert.match(admin,/r\.patch\('\/reviews\/:id\/status',requireRole\('client_admin','super_admin'\)/);
 assert.match(admin,/r\.delete\('\/reviews\/:id',requireRole\('super_admin'\)/);
});

test('certificate redesign keeps approved assets and secure issuance surfaces while allowing the requested V60.8 approved-artwork template',()=>{
 const source=read('backend/src/services/certificatePdf.js');
 assert.match(source,/SINGH ACADEMY/);
 assert.match(source,/CERTIFICATE OF COMPLETION/);
 assert.match(source,/Completion acknowledged and certificate issued by Singh Academy/);
 assert.match(source,/\/ThemeArtwork/);
 assert.match(source,/Authorized Signature - Singh Academy/);
 assert.match(source,/Certificate Service - /);
 const theme=JSON.parse(read('backend/src/assets/certificate-theme-v608.json'));
 assert.equal(theme.id,'singh-approved-gold-v608'); // Approved design identity is independent of release versions.
 // Visual assets stay frozen; requested live-status surfaces are behavior-tested separately.
 const routes=read('backend/src/routes/certificateRoutes.js');
 assert.match(routes,/r\.use\(requireAuth\)/);
 assert.match(routes,/r\.post\('\/admin\/:id\/issue',requireRole\('client_admin'\)/);
 assert.match(routes,/req\.user\.role==='student'\?\{user:req\.user\._id\}/);
 assert.match(routes,/item\.status!=='issued'/);
 const unchanged={
  'backend/src/assets/certificate-logo-original.png':'fbfcc3260a9d4784703e4c7be03f2b440224383cdb5c888a572a93defbb886d0',
  'backend/src/assets/certificate-signature.png':'94f1226a2a520c79370e839e0c367c105265a52351fd8e7e869efa959fe39418',
 };
 for(const [file,sum] of Object.entries(unchanged))assert.equal(hash(file),sum,file);
});
