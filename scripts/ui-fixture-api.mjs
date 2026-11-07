/** TEST-ONLY loopback API for the actual Next browser suite. No imports from the
 * production backend, database, SMTP or provider SDKs. Never deploy this file
 * as the application entrypoint. The production API never mounts these controls. */
import {createServer} from 'node:http';
import crypto from 'node:crypto';
export const CONTROL_HEADER='x-sa-ui-fixture';
export const CONTROL_VALUE='local-synthetic-tests-only';
const learner={id:'111111111111111111111111',_id:'111111111111111111111111',role:'student',name:'Jinjua Test',email:'learner@example.invalid',emailVerified:true,country:'US'};
const other={...learner,id:'333333333333333333333333',_id:'333333333333333333333333',name:'Second Learner',email:'other@example.invalid'};
const free={_id:'222222222222222222222222',slug:'free-demo',title:'Free Learning Test',accessType:'free',description:'Controlled test course.',published:true,instructor:'Academy Faculty'};
const paid={...free,_id:'444444444444444444444444',slug:'paid-demo',title:'Paid Learning Test',accessType:'one_time'};
const section={_id:'666666666666666666666666',slug:'academy-section',title:'Published Learning Section',published:true,currency:'USD',price:299,accessMonths:12};
const sectionCourse={...paid,_id:'555555555555555555555555',slug:'section-course-demo',title:'Section Learning Test',sectionSlug:section.slug};
const completionId='cccccccccccccccccccccccc';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createUiFixtureApi(){
 const sessions=new Map(),orders=new Map(),enrollments=new Map(),agreements=new Map(),calls=[],invoices=[],payments=[],terms=[],sectionTerms=[],notices=[];
 let sequence=0,config;
 function reset(){sessions.clear();sessions.set('b'.repeat(64),learner);orders.clear();enrollments.clear();agreements.clear();calls.length=0;invoices.length=0;payments.length=0;terms.length=0;sectionTerms.length=0;notices.length=0;sequence=0;config={createMode:'normal',createDelayMs:0,confirmDelayMs:0,confirmAfter:1,confirmFailures:0,certIssued:false};}
 reset();
 async function read(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>50000)throw Error('Fixture input too large');}return text?JSON.parse(text):{};}
 function publicOrder(order){const {key,user,confirmationCount,approvalUrl,approved,replacementKey,...view}=order;return view;}
 function publicAgreement(item){const {user,...view}=item,active=(['active','paused'].includes(item.status)||item.status==='trialing'&&item.renewalSetup===true)&&Date.parse(item.currentPeriodEnd)>Date.now();return {...view,renewalControlMode:item.provider==='paypal'?'suspend':'cancel_at_period_end',canEnableRenewal:active&&item.autoRenew===false&&(item.provider==='paypal'?item.status==='paused':item.cancelAtPeriodEnd===true),canDisableRenewal:active&&item.autoRenew===true&&!item.cancelAtPeriodEnd,canEndDisabledAgreement:item.provider==='paypal'&&item.status==='paused'&&item.autoRenew===false,renewalConsentFingerprint:'fixture-renewal-'+item._id,renewalActionPending:false};}
 function seedAgreement(state){agreements.clear();if(state==='empty')return;const id='ffffffffffffffffffffffff';agreements.set(id,{_id:id,user:learner.id,title:section.title,kind:'section',product:section.slug,provider:'stripe',status:state==='ended'?'cancelled':'active',autoRenew:state==='active',cancelAtPeriodEnd:state!=='active',currentPeriodEnd:new Date(Date.now()+(state==='ended'?-1:30)*86400000).toISOString(),intervalMonths:12,currency:'USD',amountMinor:29900});}
 function paidCoverage(owner,kind,product){return [...orders.values()].filter(order=>order.user===owner&&order.kind===kind&&order.product===product&&order.status==='paid'&&!order.renewalSetup&&order.autoRenew!==true).sort((a,b)=>Date.parse(b.accessExpiresAt)-Date.parse(a.accessExpiresAt))[0]||null;}
 function setupTiming(owner,kind,product){const order=paidCoverage(owner,kind,product);if(!order)return {canSetup:false,renewalSetup:false,billingStartsAt:null,reason:'An owned paid purchase is required.'};const end=Date.parse(order.accessExpiresAt),active=end>Date.now(),remaining=end-Date.now();return {order,renewalSetup:active,billingStartsAt:active?new Date(Math.ceil(end/1000)*1000).toISOString():null,canSetup:Number.isFinite(end)&&(!active||remaining>=2*86400000&&remaining<=730*86400000),reason:!Number.isFinite(end)?'Paid access dates are unavailable.':active&&remaining<2*86400000?'Renewal setup requires at least 48 hours of remaining paid access.':active&&remaining>730*86400000?'The first renewal is too far in the future.':''};}
 function setupItems(owner){const products=new Map();for(const order of orders.values())if(order.user===owner&&order.status==='paid'&&!order.renewalSetup&&!order.autoRenew&&['course','section'].includes(order.kind))products.set(order.kind+':'+order.product,order);return [...products].flatMap(([key,order])=>{if([...agreements.values()].some(item=>item.user===owner&&item.kind===order.kind&&item.product===order.product&&!['cancelled','expired'].includes(item.status)))return [];const timing=setupTiming(owner,order.kind,order.product),query=new URLSearchParams({[order.kind]:order.product,option:'annual',...(timing.renewalSetup?{renewalSetup:'1'}:{})}),amountMinor=order.kind==='section'?29900:14900;return [{key,kind:order.kind,product:order.product,title:order.title,testMode:true,accessExpiresAt:order.accessExpiresAt,amountMinor,currency:'USD',intervalMonths:12,renewalSetup:timing.renewalSetup,billingStartsAt:timing.billingStartsAt,amountDueNowMinor:timing.renewalSetup?0:amountMinor,canSetup:timing.canSetup,unavailableReason:timing.reason,setupUrl:'/checkout?'+query.toString(),availableProviders:{stripe:true,paypal:true},providerUnavailableReasons:{}}];});}
 function ownedAccess(owner){
  const now=Date.now(),activeTerm=term=>Date.parse(term.startsAt)<=now&&Date.parse(term.endsAt)>now;
  const membership=terms.filter(term=>term.user===owner&&term.status==='active'&&activeTerm(term)).sort((a,b)=>Date.parse(b.endsAt)-Date.parse(a.endsAt))[0];
  const courseAccesses=[...orders.values()].filter(order=>order.user===owner&&order.kind==='course'&&order.status==='paid'&&!order.renewalSetup&&Date.parse(order.accessStartsAt)<=now&&Date.parse(order.accessExpiresAt)>now).map(order=>({courseSlug:order.product,startsAt:order.accessStartsAt,endsAt:order.accessExpiresAt}));
  const sectionAccesses=sectionTerms.filter(term=>term.user===owner&&activeTerm(term)).map(term=>({sectionSlug:term.sectionSlug,startsAt:term.startsAt,endsAt:term.endsAt}));
  return {membershipActive:!!membership,membershipEndsAt:membership?.endsAt||null,courseAccesses,sectionAccesses,serverNow:new Date(now).toISOString()};
 }
 function fixtureQuote(body,owner){const amount=body.kind==='section'?29900:14900,timing=body.renewalSetup===true?setupTiming(owner,body.kind,body.product):null;return {kind:body.kind,product:body.product,optionKey:body.optionKey,subtotalMinor:amount,discountMinor:0,amountMinor:amount,renewalAmountMinor:amount,currency:'USD',durationMonths:12,autoRenew:body.autoRenew===true,renewalSetup:body.renewalSetup===true,billingStartsAt:timing?.billingStartsAt||null,amountDueNowMinor:timing?0:amount,noPaymentRequired:false,availableProviders:{stripe:true,paypal:true},providerUnavailableReasons:{},fingerprint:timing?'fixture-setup:'+body.kind+':'+body.product+':'+timing.billingStartsAt:'fixture-authoritative-quote'};}
 function settle(order){
  if(order.status!=='pending')return;
  if(order.renewalSetup){order.status='renewal_ready';order.setupConfirmedAt=new Date().toISOString();const item=agreements.get(order.billingAgreement);Object.assign(item,{status:order.provider==='paypal'?'active':'trialing',autoRenew:true,cancelAtPeriodEnd:false,currentPeriodStart:order.setupConfirmedAt,currentPeriodEnd:order.billingStartsAt,billingStartsAt:order.billingStartsAt,setupConfirmedAt:order.setupConfirmedAt});return;}
  order.status='paid';order.paidAt=new Date().toISOString();order.accessStartsAt=order.paidAt;order.accessExpiresAt=new Date(Date.now()+365*86400000).toISOString();
  const invoice={_id:order._id,number:'SA-FIXTURE-'+order._id,user:order.user,title:order.title,kind:order.kind,currency:'USD',totalMinor:order.amountMinor,paidMinor:order.amountMinor,balanceMinor:0,status:'paid',effectiveStatus:'paid',testMode:true,paidAt:order.paidAt,createdAt:order.paidAt,accessStartsAt:order.accessStartsAt,accessExpiresAt:order.accessExpiresAt};
  invoices.push(invoice);payments.push({_id:order._id,user:order.user,invoice,amountMinor:order.amountMinor,currency:'USD',provider:order.provider,status:'paid',testMode:true,paidAt:order.paidAt,attachments:[]});notices.push({user:order.user,order:order._id,type:'purchase_confirmation',testOnly:true});
  if(order.billingAgreement)Object.assign(agreements.get(order.billingAgreement),{status:'active',currentPeriodStart:order.accessStartsAt,currentPeriodEnd:order.accessExpiresAt});
  if(order.kind==='membership'){terms.push({_id:order._id,user:order.user,plan:order.product,status:'active',effectiveStatus:'active',startsAt:order.accessStartsAt,endsAt:order.accessExpiresAt,durationMonths:12,priceMinor:order.amountMinor,currency:'USD',invoice,testMode:true});for(const course of [free,paid])enrollments.set(order.user+'|'+course.slug,course);}
  else if(order.kind==='section'){sectionTerms.push({_id:order._id,user:order.user,sectionSlug:order.product,startsAt:order.accessStartsAt,endsAt:order.accessExpiresAt,invoice:invoice._id});enrollments.set(order.user+'|'+sectionCourse.slug,{...sectionCourse,sectionAccess:true});}
  else enrollments.set(order.user+'|'+order.product,paid);
 }
 const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','private, no-store');
  const json=(body,status=200)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  try{
   const url=new URL(req.url,'http://127.0.0.1'),path=url.pathname,method=req.method||'GET';
   if(path.startsWith('/__fixture/')){
    if(req.headers[CONTROL_HEADER]!==CONTROL_VALUE)return json({success:false},403);
    if(path==='/__fixture/reset'&&method==='POST'){reset();return json({success:true});}
    if(path==='/__fixture/config'&&method==='POST'){
     const body=await read(req);
     for(const k of ['createDelayMs','confirmDelayMs','confirmAfter','confirmFailures'])if(body[k]!==undefined){if(!Number.isSafeInteger(body[k])||body[k]<0||body[k]>10000)return json({success:false},400);config[k]=body[k];}
     if(body.createMode!==undefined){if(!['normal','lost','creating','expired'].includes(body.createMode))return json({success:false},400);config.createMode=body.createMode;}
     if(typeof body.certIssued==='boolean')config.certIssued=body.certIssued;
     if(body.agreementState!==undefined){if(!['empty','active','off','ended'].includes(body.agreementState))return json({success:false},400);seedAgreement(body.agreementState);}
     return json({success:true});
    }
    if((path==='/__fixture/approve'||path==='/__fixture/settle')&&method==='POST'){const body=await read(req),order=[...orders.values()].find(o=>o._id===body.id);if(!order)return json({success:false},404);order.approved=true;if(path.endsWith('/settle'))settle(order);return json({success:true});}
    if(path==='/__fixture/legacy-membership'&&method==='POST'){const body=await read(req),id=(++sequence).toString(16).padStart(24,'0'),key='historical-membership-'+id,order={_id:id,key,user:learner.id,provider:'stripe',environment:'test',kind:'membership',product:'Historical Annual',title:'Historical Academy Membership',currency:'USD',amountMinor:29900,status:'pending',confirmationCount:0,durationMonths:12,autoRenew:false,approved:true,approvalUrl:'https://checkout.stripe.com/c/pay/sa-ui-'+id};orders.set(learner.id+':'+key,order);if(body.paid!==false)settle(order);return json({success:true,order:publicOrder(order),key});}
    if(path==='/__fixture/expire-paid-access'&&method==='POST'){
     const body=await read(req),order=[...orders.values()].find(item=>item._id===body.id&&item.status==='paid'&&!item.renewalSetup);if(!order)return json({success:false,message:'Paid fixture order not found'},404);
     order.accessStartsAt=new Date(Date.now()-366*86400000).toISOString();order.paidAt=order.accessStartsAt;order.accessExpiresAt=new Date(Date.now()-86400000).toISOString();
     for(const item of invoices)if(item._id===order._id)Object.assign(item,{accessStartsAt:order.accessStartsAt,accessExpiresAt:order.accessExpiresAt,paidAt:order.paidAt,createdAt:order.paidAt});
     for(const item of payments)if(item._id===order._id)item.paidAt=order.paidAt;
     for(const item of sectionTerms)if(item._id===order._id)Object.assign(item,{startsAt:order.accessStartsAt,endsAt:order.accessExpiresAt});
     for(const item of agreements.values())if(item.user===order.user&&item.kind===order.kind&&item.product===order.product&&item.provider==='paypal'&&item.status==='paused'){item.currentPeriodEnd=order.accessExpiresAt;if(item.renewalSetup)item.billingStartsAt=order.accessExpiresAt;}
     return json({success:true,order:publicOrder(order)});
    }
    if(path==='/__fixture/state')return json({success:true,calls,orders:[...orders.values()].map(o=>({...publicOrder(o),user:o.user,key:o.key})),invoices,payments,terms,sectionTerms,agreements:[...agreements.values()].map(publicAgreement),notices});
    return json({success:false},404);
   }
   const cookies=(req.headers.cookie||'').split(';').map(x=>x.trim()),tokens=cookies.filter(x=>x.startsWith('sa_student_v45=')).map(x=>x.slice(15));
   const user=cookies.includes('sa_logout_student=1')||req.headers['x-sa-portal']&&req.headers['x-sa-portal']!=='student'?null:tokens.map(t=>sessions.get(t)).find(Boolean)||null;
   calls.push({method,path,user:user?.id||null,key:req.headers['idempotency-key']||null});
   if(path==='/api/video-reviews')return json({success:true,items:[]});
   if(path==='/api/auth/countries')return json({success:true,countries:[{code:'US',name:'United States'},{code:'PK',name:'Pakistan'},{code:'BR',name:'Brazil'}]});
   if(path.startsWith('/api/page-sections/'))return json({success:true,blocks:[]});
   if(path==='/api/auth/session'){
    if(cookies.includes('sa_ui_unavailable=1'))return json({success:false,message:'Controlled SSR outage'},503);
    return json({success:true,user,enrollment:null,portal:'student',setupRequired:false});
   }
   if(path==='/api/auth/login'&&method==='POST'){
    const body=await read(req),account=body.email===learner.email?learner:body.email===other.email?other:null;
    if(!account||body.password!=='TestPassword123!')return json({success:false,message:'Invalid fixture credentials'},401);
    for(const token of tokens)sessions.delete(token);const token=crypto.randomBytes(32).toString('hex');sessions.set(token,account);
    res.setHeader('Set-Cookie',[`sa_student_v45=${token}; Path=/; HttpOnly; SameSite=Lax`,'sa_logout_student=; Path=/; Max-Age=0; SameSite=Lax']);
    return json({success:true,user:account,setupRequired:false});
   }
   if(path==='/api/auth/logout'&&method==='POST'){
    for(const token of tokens)sessions.delete(token);
    res.setHeader('Set-Cookie',['sa_student_v45=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax','sa_student_v45=; Path=/api; Max-Age=0; HttpOnly; SameSite=Lax','sa_logout_student=1; Path=/; Max-Age=604800; SameSite=Lax']);
    return json({success:true,signedOut:true,portal:'student'});
   }
   if(path==='/api/health'||path==='/api/health/ready')return json({success:true,testFixture:true});
   if(path==='/api/content/site')return json({success:true,content:{membershipPlans:[],websiteContent:{text:{},images:[]},footerSocial:{}}});
   if(path==='/api/content/landing')return json({success:true,sections:[{_id:section._id,slug:section.slug,title:section.title,published:true}],courses:[free,paid],team:[],reviews:[]});
   if(path==='/api/payments/methods')return json({success:true,methods:{stripe:{enabled:true,environment:'test'},paypal:{enabled:true,environment:'test'}}});
   if(!user)return json({success:false,code:'SESSION_REQUIRED',message:'Sign in to the test fixture'},401);
   if(path==='/api/sections')return json({success:true,sections:[section]});
   if(path==='/api/sections/'+section.slug)return json({success:true,section,courses:[sectionCourse],access:sectionTerms.some(term=>term.user===user.id)?{active:true}:null});
   if(path==='/api/payments/mine/agreements')return json({success:true,items:[...agreements.values()].filter(item=>item.user===user.id).map(publicAgreement),setupItems:setupItems(user.id)});
   const renewal=path.match(/^\/api\/payments\/mine\/agreements\/([a-f0-9]{24})\/(cancel|resume|end)$/);
   if(renewal&&method==='POST'){
    const item=agreements.get(renewal[1]);if(!item||item.user!==user.id)return json({success:false,message:'Agreement not found'},404);const body=await read(req);
    if(renewal[2]==='end'){
     if(item.provider!=='paypal'||item.autoRenew!==false||!['paused','cancelled'].includes(item.status))return json({success:false,message:'Disable the PayPal agreement before ending it.'},409);
     item.status='cancelled';item.cancelAtPeriodEnd=false;return json({success:true,item:publicAgreement(item)});
    }
    if(!(['active','paused'].includes(item.status)||item.status==='trialing'&&item.renewalSetup===true)||Date.parse(item.currentPeriodEnd)<=Date.now())return json({success:false,message:'The agreement ended. A new checkout is required.'},409);
    if(renewal[2]==='resume'&&(body.termsAccepted!==true||body.consentFingerprint!==publicAgreement(item).renewalConsentFingerprint))return json({success:false,message:'Fresh renewal consent is required'},409);
    item.autoRenew=renewal[2]==='resume';item.cancelAtPeriodEnd=item.provider==='paypal'?false:!item.autoRenew;if(item.provider==='paypal')item.status=item.autoRenew?'active':'paused';return json({success:true,item:publicAgreement(item)});
   }
   if(path==='/api/payments/quote'&&method==='POST'){const body=await read(req);if(body.kind==='membership')return json({success:false,message:'New Academy-wide memberships are no longer sold.'},410);if(body.couponCode)return json({success:false,message:'Coupon is not available in this fixture'},409);if(body.renewalSetup===true){const timing=setupTiming(user.id,body.kind,body.product);if(!body.autoRenew||!timing.renewalSetup||!timing.canSetup)return json({success:false,message:timing.reason||'Paid access has ended; use a regular checkout.'},409);}return json({success:true,quote:fixtureQuote(body,user.id)});}
   if(path==='/api/payments/catalog'){
    const kind=url.searchParams.get('kind'),product=url.searchParams.get('product'),course=product===free.slug?free:product===sectionCourse.slug?sectionCourse:paid;
    if(kind==='membership')return json({success:false,message:'New Academy-wide memberships are no longer sold.'},410);
    const valid=kind==='course'&&[free.slug,paid.slug,sectionCourse.slug].includes(product)||kind==='section'&&product===section.slug;if(!valid)return json({success:false,message:'Fixture product not found'},404);
    return json({success:true,purchase:{kind,product,title:kind==='section'?section.title:course.title,sectionSlug:kind==='course'?course.sectionSlug||'':'',free:kind==='course'&&course.accessType==='free',offers:kind==='course'&&course.accessType==='free'?[]:[{key:'annual',label:'12 months',durationMonths:12,currency:'USD',amountMinor:kind==='course'?14900:29900}]}});
   }
   if(path==='/api/payments/checkout/release'&&method==='POST'){
    const order=orders.get(user.id+':'+(req.headers['idempotency-key']||''));
    if(!order)return json({success:false,message:'Earlier checkout not identified'},409);
    if(['paid','renewal_ready'].includes(order.status))return json({success:true,released:false,order:publicOrder(order)});
    if(order.status==='creating')return json({success:false,message:'Earlier payment is still being prepared'},409);
    order.cancellationRequested=true;
    if(order.status==='pending')order.status=order.provider==='stripe'?'expired':'cancelled';
    order.replacementKey ||= crypto.randomUUID();
    return json({success:true,released:true,order:publicOrder(order),replacementKey:order.replacementKey});
   }
   if(path==='/api/payments/checkout'&&method==='POST'){
    const body=await read(req),key=req.headers['idempotency-key'];
    if(!/^[-_a-zA-Z0-9]{16,128}$/.test(key||'')||!['stripe','paypal'].includes(body.provider))return json({success:false,message:'Invalid fixture checkout'},400);
    if(body.product===free.slug)return json({success:false,message:'Free courses do not need checkout'},409);
    const mapKey=user.id+':'+key;let order=orders.get(mapKey);
    if(body.kind==='membership'&&!order)return json({success:false,message:'New Academy-wide memberships are no longer sold.'},410);
    if(!order&&(body.optionKey!=='annual'||!(body.kind==='course'&&body.product===paid.slug||body.kind==='section'&&body.product===section.slug)))return json({success:false,message:'Unknown stored fixture offer'},400);
    if(order&&(order.kind!==body.kind||order.product!==body.product||order.provider!==body.provider||Boolean(order.renewalSetup)!==Boolean(body.renewalSetup)))return json({success:false,message:'Different purchase for this key'},409);
    if(order?.cancellationRequested||order&&['expired','cancelled','failed'].includes(order.status))return json({success:false,message:'Earlier checkout is closed'},409);
    if(!order){let timing;
     if(body.autoRenew===true&&[...agreements.values()].some(item=>item.user===user.id&&item.kind===body.kind&&item.product===body.product&&!['cancelled','expired'].includes(item.status)))return json({success:false,message:'An existing renewal agreement already manages this product.'},409);
     if(body.renewalSetup===true){timing=setupTiming(user.id,body.kind,body.product);if(!body.autoRenew||body.termsAccepted!==true||body.couponCode||!timing.renewalSetup||!timing.canSetup||body.quoteFingerprint!==fixtureQuote(body,user.id).fingerprint)return json({success:false,message:'Owned paid access, current setup quote and renewal consent are required.'},409);}
     const id=(++sequence).toString(16).padStart(24,'0');order={_id:id,key,user:user.id,provider:body.provider,environment:'test',kind:body.kind,product:body.product,title:body.kind==='section'?section.title:paid.title,currency:'USD',amountMinor:body.kind==='section'?29900:14900,status:config.createMode==='creating'?'creating':config.createMode==='expired'?'expired':'pending',confirmationCount:0,durationMonths:12,autoRenew:body.autoRenew===true,...(body.autoRenew?{billingAgreement:'a'+id.slice(1)}:{}),...(timing?{renewalSetup:true,billingStartsAt:timing.billingStartsAt,amountDueNowMinor:0}:{}),approvalUrl:body.provider==='stripe'?'https://checkout.stripe.com/c/pay/sa-ui-'+id:'https://www.sandbox.paypal.com/checkoutnow?token=sa-ui-'+id};orders.set(mapKey,order);
     if(order.billingAgreement)agreements.set(order.billingAgreement,{_id:order.billingAgreement,user:user.id,title:order.title,kind:order.kind,product:order.product,provider:body.provider,status:'creating',autoRenew:true,cancelAtPeriodEnd:false,renewalSetup:!!timing,billingStartsAt:timing?.billingStartsAt,currentPeriodEnd:timing?.billingStartsAt,currency:'USD',amountMinor:order.amountMinor,intervalMonths:order.durationMonths});}
    await pause(config.createDelayMs);
    if(config.createMode!=='normal')return json({success:false,message:'Controlled lost checkout response'},504);
    return json({success:true,order:publicOrder(order),...(order.status==='pending'?{url:order.approvalUrl}:{})});
   }
   if(path==='/api/payments/checkout-status'){
    const order=orders.get(user.id+':'+(req.headers['idempotency-key']||''));
    return json({success:true,found:!!order,order:order?publicOrder(order):null,url:order?.status==='pending'&&!order.cancellationRequested?order.approvalUrl:null,creationPending:order?.status==='creating'});
   }
   const match=path.match(/^\/api\/payments\/orders\/([a-f0-9]{24})(\/confirm)?$/);
   if(match){
    const order=[...orders.values()].find(o=>o._id===match[1]&&o.user===user.id);if(!order)return json({success:false,message:'Checkout not found'},404);
    if(match[2]&&method==='POST'){
     await pause(config.confirmDelayMs);if(config.confirmFailures>0){config.confirmFailures--;return json({success:false,message:'Controlled provider status outage'},503);}
     if(order.status==='pending'&&!order.cancellationRequested&&order.approved&&++order.confirmationCount>=config.confirmAfter)settle(order);
    }
    return json({success:true,order:publicOrder(order)});
   }
   const billing=path.match(/^\/api\/payments\/mine\/(plans|invoices|payments)$/);
   if(billing){const items=(billing[1]==='plans'?terms:billing[1]==='invoices'?invoices:payments).filter(x=>x.user===user.id);return json({success:true,items,total:items.length,page:1,pageSize:20});}
   if(path==='/api/content/team')return json({success:true,team:[]});
   if(path==='/api/content/events')return json({success:true,events:[]});
   if(path==='/api/reviews')return json({success:true,reviews:[]});
   if(path==='/api/courses')return json({success:true,courses:[free,paid,sectionCourse]});
   if(path==='/api/courses/enrolled/mine')return json({success:true,courses:[...enrollments.entries()].filter(([k])=>k.startsWith(user.id+'|')).map(([,c])=>({...c,progress:0}))});
   if(path==='/api/certificates/status')return json({success:true,items:[{_id:completionId,courseSlug:free.slug,courseTitle:free.title,status:config.certIssued?'issued':'pending',...(config.certIssued?{certificateNumber:'SA-UI-FIXTURE'}:{})}]});
   const courseMatch=path.match(/^\/api\/courses\/(free-demo|paid-demo|section-course-demo)(\/(enroll|learn))?$/);
   if(courseMatch){
    const course=courseMatch[1]===free.slug?free:courseMatch[1]===sectionCourse.slug?sectionCourse:paid,key=user.id+'|'+course.slug;
    if(!courseMatch[2])return json({success:true,course,modules:[]});
    if(courseMatch[3]==='enroll'&&method==='POST'){
     if(course.accessType!=='free'&&!enrollments.has(key)&&!terms.some(t=>t.user===user.id))return json({success:false,message:'Payment required'},403);
     enrollments.set(key,course);return json({success:true,enrollment:{user:user.id,courseSlug:course.slug}});
    }
    if(courseMatch[3]==='learn'){if(!enrollments.has(key)&&course.accessType!=='free')return json({success:false,message:'Enrollment required'},403);return json({success:true,course,modules:[],completedLessonIds:[],attempt:{number:1}});}
   }
   if(path==='/api/payments/membership-status')return json({success:true,...ownedAccess(user.id)});
   const accessMatch=path.match(/^\/api\/payments\/access\/([^/]+)$/);
   if(accessMatch){
    const course=[free,paid,sectionCourse].find(item=>item.slug===accessMatch[1]);if(!course)return json({success:false,message:'Fixture course not found'},404);
    const owned=ownedAccess(user.id),hasAccess=course.accessType==='free'||owned.membershipActive||owned.courseAccesses.some(term=>term.courseSlug===course.slug)||owned.sectionAccesses.some(term=>term.sectionSlug===course.sectionSlug);
    return json({success:true,hasAccess,enrollment:enrollments.has(user.id+'|'+course.slug)?{user:user.id,courseSlug:course.slug}:null});
   }
   if(path.startsWith('/api/notifications')||path.startsWith('/api/student-notifications'))return json({success:true,items:[],unread:0});
   return json({success:false,message:'UI fixture endpoint not provided: '+path},404);
  }catch(error){json({success:false,message:'Fixture error: '+error.message},500);}
 });
 return server;
}
