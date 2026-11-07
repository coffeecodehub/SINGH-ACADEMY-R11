export const DAY=86400000;
export function inReminderWindow(term,now=new Date()){
 if(!term.startsAt||!term.endsAt||!now)return false;
 const start=new Date(term.startsAt).getTime(),end=new Date(term.endsAt).getTime(),at=new Date(now).getTime();
 return term.status==='active'&&Number.isFinite(start)&&Number.isFinite(end)&&end>start&&start<=at&&end>at&&end-at<=7*DAY;
}
export function coversRenewal(term,next){
 if(!term.endsAt||!next.startsAt||!next.endsAt)return false;
 const end=new Date(term.endsAt).getTime(),start=new Date(next.startsAt).getTime(),until=new Date(next.endsAt).getTime();
 return String(next._id)!==String(term._id)&&String(next.user)===String(term.user)&&next.status==='active'&&Boolean(next.testMode)===Boolean(term.testMode)&&Number.isFinite(start)&&Number.isFinite(until)&&start<=end&&until>end;
}
export function subscriptionNotice(term,type,now=new Date()){
 if(!['subscription_confirmed','subscription_expiring'].includes(type))throw new Error('Invalid subscription notification type.');
 if(!term.startsAt||!term.endsAt||!now)throw new Error('Subscription dates need review.');
 const date=x=>new Date(x).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
 const end=new Date(term.endsAt),start=new Date(term.startsAt),at=new Date(now);if(!Number.isFinite(end.getTime())||!Number.isFinite(start.getTime())||!Number.isFinite(at.getTime())||end<=start)throw new Error('Subscription dates need review.');
 const plan=String(term.plan||'Academy membership').slice(0,200),days=Math.max(0,Math.ceil((end-at)/DAY));
 const prefix=term.testMode?'Sandbox — ':'';
 return {user:term.user,subscription:term._id,dedupeKey:`${type}:${term._id}`+(type==='subscription_expiring'?':'+end.toISOString():''),type,plan,termEnd:end,testMode:term.testMode===true,
  title:prefix+(type==='subscription_confirmed'?'Congratulations! Your subscription is confirmed.':`Your subscription expires in ${days} ${days===1?'day':'days'}.`),
  message:type==='subscription_confirmed'?`${plan} has been purchased successfully. Your access ${start>at?'starts':'started'} on ${date(start)} and ends on ${date(end)} (UTC). View your plan, invoice and receipt in My Billing.`:`Your ${plan} access ends on ${date(end)} (UTC). ${days} ${days===1?'day remains':'days remain'}. Renew from My Billing to continue learning. This reminder does not charge your card.`,
  link:'/billing?section=plans',emailState:'queued',nextAttemptAt:at};
}

/** Purchase notices use the verified invoice snapshot, never browser-entered amounts or owner IDs. */
export function coursePurchaseNotice(order,invoice,now=new Date()){
 if(order.kind!=='course'||invoice.kind!=='course'||String(order.user)!==String(invoice.user)||invoice.status!=='paid')throw new Error('Verified course invoice required.');
 const date=value=>value?new Date(value).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}):'No scheduled expiry';
 const title=String(invoice.title||order.title||'Course').slice(0,200),testMode=invoice.testMode===true;
 return {user:invoice.user,invoice:invoice._id,checkoutOrder:order._id,courseSlug:order.product,courseTitle:title,
 dedupeKey:`course_purchased:${invoice._id}`,type:'course_purchased',testMode,termEnd:invoice.accessExpiresAt,
 title:(testMode?'Sandbox — ':'')+'Congratulations! Your course purchase is confirmed.',
 message:`${title} has been purchased successfully. Invoice ${invoice.number}: ${invoice.currency} ${(invoice.totalMinor/100).toFixed(2)}. Access starts ${date(invoice.accessStartsAt)} and ends ${date(invoice.accessExpiresAt)} (UTC). Your invoice and payment receipt are available in My Billing.`,
 link:'/billing?section=invoices&invoice='+invoice._id,emailState:'queued',nextAttemptAt:now};
}
export function welcomeNotice(user,now=new Date()){
 return {user:user._id,dedupeKey:`welcome:${user._id}`,type:'welcome',testMode:false,title:'Welcome to Singh Academy',
 message:`Hello ${String(user.name||'Student').slice(0,120)}, welcome to Singh Academy. Your student account is ready. Explore courses and Academy Plans, then continue your learning from My Courses.`,
 link:'/home',emailState:'queued',nextAttemptAt:now};
}
export function sandboxEmailAllowed(email,env=process.env){
 if(env.SEND_SANDBOX_EMAILS!=='true'||(env.DEPLOYMENT_STAGE||(env.NODE_ENV==='production'?'production':'development'))==='production')return false;
 return (env.SANDBOX_EMAIL_ALLOWLIST||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean).includes(String(email).toLowerCase());
}
