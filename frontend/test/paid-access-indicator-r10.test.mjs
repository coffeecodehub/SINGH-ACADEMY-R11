import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
import {paidAccessDisplay} from '../../backend/src/utils/paidAccessDisplay.js';
const subscription=compileModule('../lib/subscriptionClock.ts'),clock=compileModule('../lib/paidAccessClock.ts',{imports:{'./subscriptionClock':subscription}});
const nodes=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(nodes):typeof tree==='object'?[tree,...nodes(tree.props?.children)]:[],text=tree=>tree==null||typeof tree==='boolean'?'':Array.isArray(tree)?tree.map(text).join(' '):typeof tree==='object'?text(tree.props?.children):String(tree);
const start='2026-10-03T20:30Z',end='2027-10-03T20:30Z';
for(const at of ['2026-10-03T23:59:59Z','2026-10-04T00:00Z','2027-10-03T00:00Z','2027-10-03T20:30Z'])test('browser/API confirmed UTC countdown parity '+at,()=>{
 const original=paidAccessDisplay({startsAt:start,endsAt:end},{now:new Date('2026-10-03T21:00Z')}),server=paidAccessDisplay({startsAt:start,endsAt:end},{now:new Date(at)}),browser=clock.paidAccessClock(original,new Date(at));
 for(const field of ['status','remainingDays','durationDays','remainingPercent'])assert.equal(browser[field],server[field]);
});
test('unconfirmed/pending/cancelled display snapshots cannot be advanced into paid access',()=>{
 for(const status of ['unknown','pending','cancelled']){const input={confirmed:status==='cancelled',status,remainingDays:status==='cancelled'?0:null,startsAt:start,endsAt:end};assert.equal(clock.paidAccessClock(input,new Date('2026-10-04')),input);}
 assert.equal(clock.paidAccessDate('2026-10-03T23:30:00-05:00'),'2026-10-04');assert.equal(clock.paidAccessDate('bad'),'Not recorded');
});
function fixture(access,props={}){
 const h=hookHarness(),b=browserGlobals(),date=Date.parse(access?.serverNow||'2026-10-04T12:00Z');class FixedDate extends Date{constructor(value=date){super(value);}static now(){return date;}}
 const Indicator=compileModule('../components/billing/PaidAccessIndicator.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../../lib/paidAccessClock':clock},globals:{...b,...h.globals,Date:FixedDate}}).default;
 h.mount(()=>Indicator({access,...props}));return h;
}
test('teal ring has a calendar, accessible count, exact UTC expiry, controlled info and eligible Renew link',async t=>{
 const access=paidAccessDisplay({startsAt:start,endsAt:end},{now:new Date('2026-10-04T12:00Z')}),h=fixture(access,{renewHref:'/checkout?course=course-a&renewalSetup=1'});t.after(()=>h.cleanup());await h.settle();
 assert.match(text(h.tree),/Expiration date/);assert.match(text(h.tree),/2027-10-03/);assert.match(text(h.tree),/364/);
 assert.equal(nodes(h.tree).find(node=>node.props?.className==='paidAccessCalendar').type,'svg');
 const ring=nodes(h.tree).find(node=>node.props?.role==='img');assert.match(ring.props['aria-label'],/364 days remaining/);
 assert.equal(nodes(h.tree).find(node=>node.type==='a').props.href,'/checkout?course=course-a&renewalSetup=1');
 const info=nodes(h.tree).find(node=>node.type==='button');assert.equal(info.props['aria-expanded'],false);info.props.onClick();await h.settle();assert.match(text(h.tree),/future charge date does not extend access/);assert.equal(nodes(h.tree).find(node=>node.type==='button').props['aria-expanded'],true);
});
test('pending/unknown/lifetime/cancelled states show honest dates and safe renewal choices',async t=>{
 const cases=[
  {access:paidAccessDisplay(null,{now:new Date('2026-10-04'),pending:true}),match:/Awaiting confirmation/,link:false},
  {access:paidAccessDisplay(null,{now:new Date('2026-10-04')}),match:/Not recorded/,link:true},
  {access:paidAccessDisplay({startsAt:start,endsAt:null,noExpiry:true},{now:new Date('2026-10-04')}),match:/No scheduled expiry/,link:false},
  {access:paidAccessDisplay({startsAt:start,endsAt:end},{now:new Date('2026-10-04'),cancelledAt:'2026-10-04T09:00Z'}),match:/2026-10-04/,link:true}
 ];
 for(const item of cases){const h=fixture(item.access,{renewHref:'/academy'});t.after(()=>h.cleanup());await h.settle();assert.match(text(h.tree),item.match);assert.equal(nodes(h.tree).some(node=>node.type==='a'),item.link);}
 const unsafe=fixture(cases[1].access,{renewHref:'//outside.test'});t.after(()=>unsafe.cleanup());await unsafe.settle();assert.equal(nodes(unsafe.tree).some(node=>node.type==='a'),false);
});
