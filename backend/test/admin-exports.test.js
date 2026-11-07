import test from 'node:test';import assert from 'node:assert/strict';
import {exportQuery,csvLine,adminExportDefinition} from '../src/services/adminExports.js';
const now=new Date('2026-11-06T00:00:00Z');
test('export search is escaped and filter fields cannot become Mongo operators',()=>{
 const f=exportQuery('forms',{q:'.*',status:'new',role:'super_admin',fields:'passwordHash'}).filter;
 assert.equal(f.status,'new');assert.equal(f.$or[0].name.$regex,'\\.\\*');assert.equal(f.role,undefined);assert.equal(f.fields,undefined);
 for(const q of [{q:{$ne:null}},{status:['new']},{q:'x'.repeat(201)}])assert.throws(()=>exportQuery('forms',q),{status:400});
 assert.throws(()=>exportQuery('users'),{status:404});
});
test('every supported dataset validates status and projects explicit CSV columns',()=>{
 for(const kind of ['forms','reviews','purchases','section-purchases','subscriptions','certificates','requests'])assert.throws(()=>exportQuery(kind,{status:'invalid'},now),{status:400});
 assert.throws(()=>exportQuery('reviews',{rating:'0'}),{status:400});
 for(const kind of ['forms','reviews','purchases','section-purchases','subscriptions','certificates','notifications','requests']){
  const d=adminExportDefinition(kind,{},now);assert.ok(d.headers.length>3);assert.equal(d.headers.some(h=>/password|token|secret|verification/i.test(h)),false);
 }
});
test('purchase statuses and dates use UTC financial boundaries and course/section isolation',()=>{
 const course=exportQuery('purchases',{status:'overdue',from:'2026-11-01',to:'2026-11-06'},now).filter;
 assert.equal(course.kind,'course');assert.equal(course.status,'open');assert.equal(+course.dueAt.$lt,+now);assert.equal(course.createdAt.$lt.toISOString(),'2026-11-07T00:00:00.000Z');
 assert.equal(exportQuery('section-purchases',{},now).filter.kind,'section');
 assert.equal(exportQuery('purchases',{status:'partial'},now).filter.paidMinor.$gt,0);
 for(const q of [{from:'bad'},{from:'2026-11-07',to:'2026-11-01'}])assert.throws(()=>exportQuery('purchases',q,now),{status:400});
});
test('CSV export neutralizes formulas and normalizes legacy review visibility without leaking approval proof',()=>{
 assert.equal(csvLine(['=HYPERLINK("evil")','الطالب, "A"']), '"\'=HYPERLINK(""evil"")","الطالب, ""A"""\r\n');
 const d=adminExportDefinition('reviews'),row=d.row({name:'Lead',message:'Review',rating:5,status:'approved',approvedBy:null,approvedAt:null,passwordHash:'PRIVATE'});
 assert.equal(row[3],'pending');assert.equal(csvLine(row).includes('PRIVATE'),false);
 const purchase=adminExportDefinition('purchases',{},now).row({student:{name:'Lead',email:'lead@example.invalid',passwordHash:'PRIVATE'},kind:'course',title:'Example',currency:'USD',totalMinor:1234,paidMinor:1234,creditedMinor:0,status:'paid'});
 assert.equal(purchase[7],'12.34');assert.equal(csvLine(purchase).includes('PRIVATE'),false);
});
