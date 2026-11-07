/** Actual My Billing rendering; fulfilled invoice ownership/date derivation has separate MongoDB coverage. */
import {test,expect} from '@playwright/test';
const origin='http://127.0.0.1:3108',id='a'.repeat(24),serverNow='2026-10-04T12:00:00.000Z';
const active={confirmed:true,status:'active',startsAt:'2026-10-03T20:30:00.000Z',endsAt:'2027-10-03T20:30:00.000Z',cancelledAt:null,noExpiry:false,durationDays:365,remainingDays:364,remainingPercent:364/365*100,serverNow,dayCountBasis:'utc-calendar'};
async function login(context:any){const response=await context.request.post(origin+'/api/auth/login',{headers:{'X-SA-CSRF':'1','X-SA-Portal':'student'},data:{email:'learner@example.invalid',password:'TestPassword123!'}});expect(response.ok()).toBe(true);}
for(const width of [390,1280])test('paid-access circles retain confirmed expiry when renewal is off at '+width+'px',async({context,page})=>{
 await page.setViewportSize({width,height:900});await login(context);
 const agreement={_id:id,kind:'course',product:'recurring-course',title:'Recurring paid course',provider:'paypal',status:'paused',autoRenew:false,cancelAtPeriodEnd:true,intervalMonths:12,amountMinor:1000,currency:'USD',currentPeriodEnd:'2099-01-01T00:00:00Z',paidAccess:active};
 const setup={key:'course:one-time',invoiceId:'b'.repeat(24),kind:'course',product:'one-time',title:'One-time paid course',accessExpiresAt:active.endsAt,amountMinor:1000,currency:'USD',intervalMonths:12,renewalSetup:true,amountDueNowMinor:0,canSetup:true,setupUrl:'/checkout?course=one-time&option=annual&renewalSetup=1&sourceInvoice='+'b'.repeat(24),availableProviders:{stripe:true},paidAccess:active};
 const pending={_id:'c'.repeat(24),kind:'course',product:'pending',title:'Unpaid pending course',provider:'stripe',status:'creating',autoRenew:true,intervalMonths:12,amountMinor:1000,currency:'USD',pendingCheckout:true};
 await context.route('**/api/payments/mine/agreements',route=>route.fulfill({json:{items:[agreement,pending],setupItems:[setup]}}));
 await context.route('**/api/payments/mine/plans?*',route=>route.fulfill({json:{items:[],total:0,page:1,pageSize:20}}));
 await page.goto('/billing');
 for(const title of [agreement.title,setup.title]){
  const card=page.locator('.billingAutoRenewals article').filter({has:page.getByRole('heading',{name:title,exact:true})}),circle=card.locator('.paidAccessIndicator');await circle.scrollIntoViewIfNeeded();
  await expect(circle).toHaveAttribute('data-paid-access-state','active');await expect(circle).toContainText('Expiration date');await expect(circle).toContainText('2027-10-03');await expect(circle.getByRole('img')).toHaveAttribute('aria-label',/364 days remaining/);await expect(circle.locator('.paidAccessCalendar')).toBeVisible();await expect(circle.locator('.paidAccessFill')).toHaveCSS('stroke','rgb(35, 174, 162)');
 }
 const purchase=page.locator('.billingAutoRenewals article').filter({has:page.getByRole('heading',{name:setup.title,exact:true})});await expect(purchase.getByRole('link',{name:'Renew',exact:true})).toHaveAttribute('href',setup.setupUrl);
 const unpaid=page.locator('.billingAutoRenewals article').filter({has:page.getByRole('heading',{name:pending.title,exact:true})});await expect(unpaid.locator('.paidAccessIndicator')).toHaveCount(0);
 await purchase.getByRole('button',{name:'About expiration date',exact:true}).click();await expect(purchase.getByRole('note')).toContainText('A future charge date does not extend access');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await expect(page).toHaveURL(/\/billing$/);
});
test('paid invoice circles distinguish lifetime access and confirmed immediate cancellation',async({context,page})=>{
 await login(context);await context.route('**/api/payments/mine/agreements',route=>route.fulfill({json:{items:[],setupItems:[]}}));
 const base={kind:'course',currency:'USD',totalMinor:1000,paidMinor:1000,balanceMinor:0,status:'paid',effectiveStatus:'paid',accessStartsAt:active.startsAt,paidAt:active.startsAt};
 const lifetime={...base,_id:'d'.repeat(24),number:'SA-LIFETIME',title:'Lifetime course',noScheduledExpiry:true,paidAccess:{...active,status:'lifetime',noExpiry:true,endsAt:null,durationDays:null,remainingDays:null,remainingPercent:null}};
 const cancelled={...base,_id:'e'.repeat(24),number:'SA-CANCELLED',title:'Cancelled course',accessCancelledAt:'2026-10-04T09:00:00.000Z',paidAccess:{...active,status:'cancelled',cancelledAt:'2026-10-04T09:00:00.000Z',remainingDays:0,remainingPercent:0}};
 await context.route('**/api/payments/mine/invoices?*',route=>route.fulfill({json:{items:[lifetime,cancelled],total:2,page:1,pageSize:20}}));await page.goto('/billing?section=invoices');
 const unlimited=page.locator('.billingInvoiceCard').filter({has:page.getByRole('heading',{name:lifetime.number,exact:true})});await expect(unlimited.locator('.paidAccessIndicator')).toContainText('No scheduled expiry');await expect(unlimited.getByRole('link',{name:'Renew',exact:true})).toHaveCount(0);
 const ended=page.locator('.billingInvoiceCard').filter({has:page.getByRole('heading',{name:cancelled.number,exact:true})});await expect(ended.locator('.paidAccessIndicator')).toHaveAttribute('data-paid-access-state','cancelled');await expect(ended.locator('.paidAccessIndicator')).toContainText('2026-10-04');await expect(ended.locator('.paidAccessCircle')).toHaveAttribute('aria-label',/0 days remaining/);
});
