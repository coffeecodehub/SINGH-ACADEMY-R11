# V60.15 implementation source references

These are references to the supplied current source, not proof of live deployment. Exact textual changes are in the accompanying evidence ZIP/SOURCE.patch.

## `backend/src/utils/courseEntitlements.js`

- Line 30: `export function invoiceCourseGrants(invoices) {`
- Line 85: `export function manualEnrollmentGrants(enrollment) {`
- Line 104: `export function effectiveGrant(grants,now=new Date(),{includeScheduled=false}={}) {`

## `backend/src/services/courseEntitlements.js`

- Line 9: `export async function loadCourseEntitlements(userId,{courseSlug,session=null,environment}={}) {`
- Line 21: `export async function effectiveCourseEnrollment(userId,courseSlug,session=null,{environment,now=new Date(),includeScheduled=false}={}) {`
- Line 22: `const data=await loadCourseEntitlements(userId,{courseSlug,session,environment});`
- Line 28: `export async function effectiveCourseEnrollments(userId,{session=null,now=new Date(),environment}={}) {`
- Line 29: `const data=await loadCourseEntitlements(userId,{session,environment});`
- Line 36: `export function baseGrantSnapshot(row){`

## `backend/src/services/membershipEnrollments.js`

- Line 7: `export async function syncMembershipCourseEnrollments({userId,startsAt,endsAt,invoice=null,testMode=false,session=null,reason='Active Academy membership'}){`
- Line 13: `if(existing){preserved++;continue;}`

## `backend/src/services/onlineCheckout.js`

- Line 45: `async function makeRemote(order,user,{allowReplay=true}={}){`
- Line 50: `{$set:{creationClaim:claim,creationClaimUntil:new Date(+now+90000)}},{new:true}).select('+creationPayload +creationCredentialFingerprint +approvalUrl');`
- Line 66: `{$set:{creationAttemptedAt:now,lastCreationAttemptedAt:now,creationCredentialFingerprint:fingerprint,creationPayload:payload,expiresAt:claimed.expiresAt}},{new:true}).select('+creationPayload +creationCredentialFingerprint');`
- Line 72: `const configuredPayPalSeconds=Number(process.env.PAYPAL_CREATE_REPLAY_SECONDS||0);`
- Line 75: `const replaySafe=sameCredential&&claimed.creationPayload&&age>=0&&age<horizon;`
- Line 104: `const result=await makeRemote(order,user,{allowReplay});return result.order;`
- Line 108: `export async function bindRecoveredCheckout(orderId,providerOrderId){`
- Line 128: `if(order){if(order.cancelRequestedAt&&order.status!=='paid')throw businessError('The previous checkout is being closed. Choose a payment method again to check its status.',409);if(order.requestFingerprint!==fp)throw businessError('This checkout key belongs to another purchase.',409);if(order.status==='paid')return {order:publicOrder(order)};if(['expired','failed','cancelled'].includes(order.status))throw businessError('Start a new checkout from the course page.',409);return makeRemote(order,req.user);}`
- Line 145: `return makeRemote(order,req.user);`
- Line 186: `const invoice=await one(Invoice,{number:'SA-ONLINE-'+String(order._id).toUpperCase(),user:user._id,kind:order.kind,title:order.title,courseSlug:order.kind==='course'?order.product:undefined,planName:order.kind==='membership'?order.product:undefined,accessDays:order.accessDays,durationMonths:order.durationMonths,accessStartsAt:start,accessExpiresAt:expires,noScheduledExpiry:expires===null,grantVersion:1,grantStartsAt:order.kind==='course'?grantStart:start,grantExpiresAt:expires,grantNoExpiry:expires===null,grantSuppressed,renewalOf:order.renewal`
- Line 213: `}finally{await releaseCheckoutOperation(claimed);}`
- Line 232: `async function releaseCheckoutOperation(order){`
- Line 241: `export async function releaseCheckout(req){`
- Line 252: `await makeRemote(original,req.user);`
- Line 284: `}finally{await releaseCheckoutOperation(claimed);}`

## `backend/src/services/gatewayRefunds.js`

- Line 36: `const locked=await User.findOneAndUpdate({_id:payment.user,role:'student'},{$inc:{commerceVersion:1}},{new:true,session});`
- Line 40: `payment.refundedMinor=refunded;await payment.save({session});invoice.creditedMinor=(invoice.creditedMinor||0)+evidence.amountMinor;if(invoice.creditedMinor>=invoice.totalMinor)invoice.accessRevokedAt=new Date();await invoice.save({session});`

## `backend/src/utils/assessments.js`

- Line 21: `return 'a1_'+crypto.createHmac('sha256',key).update('singh-assessment-public-v1:'+version).digest('hex');`

## `backend/src/utils/deployment.js`

- Line 17: `if (['review','production'].includes(stage)&&env.NODE_ENV!=='production') errors.push('Hosted review/production requires NODE_ENV=production. Do not use the development runtime on a public deployment.');`
- Line 43: `if(env.SA_REQUIRE_PROXY_IDENTITY==='true'&&!usableProxySecret(env.SA_PROXY_SHARED_SECRET))errors.push('SA_REQUIRE_PROXY_IDENTITY requires SA_PROXY_SHARED_SECRET shared only by frontend/backend servers.');`
- Line 44: `if(production&&env.SA_REQUIRE_PROXY_IDENTITY!=='true')warnings.push('Trusted frontend client-IP attribution has not been enforced. Verify the hosting edge before live handover; never blindly trust browser forwarding headers.');`
- Line 45: `if(env.PAYPAL_CREATE_REPLAY_SECONDS!==undefined&&(!/^\d+$/.test(env.PAYPAL_CREATE_REPLAY_SECONDS)||Number(env.PAYPAL_CREATE_REPLAY_SECONDS)>18000))errors.push('PAYPAL_CREATE_REPLAY_SECONDS must be 0..18000; set nonzero only within confirmed merchant/API idempotency retention.');`

## `backend/src/middleware/proxyIdentity.js`

- Line 1: `import {verifyProxyIdentity} from '../utils/proxyIdentity.js';`
- Line 4: `export function proxyIdentity(req,res,next){`
- Line 6: `const required=process.env.SA_REQUIRE_PROXY_IDENTITY==='true'&&!['GET','HEAD','OPTIONS'].includes(req.method);`
- Line 7: `if(!payload&&!signature){if(required)return res.status(503).json({success:false,code:'PROXY_IDENTITY_REQUIRED',message:'The trusted website connection is not configured. Contact the Academy.'});return next();}`
- Line 8: `const ip=verifyProxyIdentity(payload,signature,{method:req.method,path:req.originalUrl,`

## `frontend/lib/server/apiProxy.mjs`

- Line 1: `import {signProxyIdentity,singleClientIp,usableProxySecret} from './proxyIdentity.mjs';`
- Line 25: `const proxyKey=env.SA_PROXY_SHARED_SECRET,ipHeader=env.SA_PROXY_CLIENT_IP_HEADER;`
- Line 26: `if(proxyKey||ipHeader||env.SA_REQUIRE_PROXY_IDENTITY==='true'){`
- Line 29: `if(!usableProxySecret(proxyKey)||!ipHeader||!/^[-a-z0-9]+$/.test(ipHeader)||env.SA_PROXY_CLIENT_IP_VERIFIED!=='true')`
- Line 31: `const ip=singleClientIp(request.headers.get(ipHeader));`
- Line 33: `const proof=signProxyIdentity(ip,{method:request.method,path:incoming.pathname+incoming.search,`

## `backend/src/services/databaseIndexes.js`

- Line 8: `export async function databaseIndexReport({apply=false,criticalOnly=false}={}){`
- Line 25: `export async function assertCriticalIndexes(){`
- Line 26: `const report=await databaseIndexReport({criticalOnly:true});`

## `backend/src/controllers/authController.js`

- Line 27: `try{user=await User.create({name:name.trim(),email:e,passwordHash:await bcrypt.hash(password,12),role:'student',status:'active',emailVerified:false,verificationToken:null,verificationExpires:null,lastLoginAt:now,loginCount:1});}`

## `scripts/security-audit.mjs`

- Line 32: `// Retry only transport failures, never a complete report containing findings.`
- Line 59: `let result; item.attempts = [];`
- Line 60: `const maxAttempts = 1 + Math.min(2, Math.max(0, Math.floor(Number(retries) || 0)));`
- Line 61: `for (let attempt = 1; attempt <= maxAttempts; attempt++) {`
- Line 64: `item.attempts.push({attempt, exitCode: result.status ?? null, status: classified.status, transient});`
- Line 65: `fs.writeFileSync(path.join(qa, `${rawName}-attempt-${attempt}.json`), result.stdout || '', {mode: 0o600});`
- Line 66: `fs.writeFileSync(path.join(qa, `${rawName}-attempt-${attempt}.stderr.log`), result.stderr || result.error?.message || '', {mode: 0o600});`
- Line 68: `if (!transient || attempt === maxAttempts) break;`
- Line 69: `logger.log(`${scope} ${kind}: registry transport failed; retry ${attempt}/${maxAttempts-1}. No audit pass has been recorded.`);`
- Line 70: `sleep(attempt * 1500);`

## `scripts/integration-check.mjs`

- Line 9: `const report={version:JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).version,startedAt:new Date().toISOString(),status:'running',scope:'Isolated real MongoDB transactions and DB-backed browser tests. Provider/SMTP fixtures are not external acceptance.',handoverReady:false,checks:[]};`
- Line 16: `step('Docker availability',()=>command(['info'],true));`
- Line 24: `step('Real backend HTTP/transaction tests',()=>runNpm(['run','test:integration'],path.join(root,'backend'),{env}));`
- Line 26: `step('DB-backed browser checks',()=>runNpm(['run','test:browser'],path.join(root,'frontend'),{env}));`

