import test from 'node:test';
import assert from 'node:assert/strict';
import {compileModule,browserGlobals} from './compile.mjs';
import {hookHarness} from './hooks.mjs';
const events=compileModule('../lib/events.ts');
const nodes=tree=>!tree?[]:Array.isArray(tree)?tree.flatMap(nodes):typeof tree==='object'?[tree,...(tree.type?.name==='FeedbackNotice'?nodes(tree.type(tree.props)):nodes(tree.props?.children))]:[];

for(const url of ['https://zoom.us/j/123','https://us02web.zoom.us/j/123?pwd=synthetic','https://meet.zoom.com/j/123'])test('webinar joining preserves an approved Zoom invitation '+url,()=>assert.equal(events.zoomMeetingUrl(url),url));
for(const url of ['javascript:alert(1)','http://zoom.us/j/123','https://zoom.us.evil.invalid/j/123','https://evilzoom.us/j/123','https://zoom.us@evil.invalid/j/123','https://person:password@zoom.us/j/123','https://zoom.us:8443/j/123'])test('webinar joining refuses unsafe or look-alike URL '+url,()=>assert.equal(events.zoomMeetingUrl(url),''));

function eventCard(event){const h=hookHarness(),mod=compileModule('../components/events/EventCard.tsx',{imports:{'react/jsx-runtime':h,'../AcademyImage':{default:'img'},'../../lib/events':events}});return nodes(mod.default({event}));}
test('event cards retain location actions while a future webinar has its own safe Zoom action',()=>{
 const normal=eventCard({title:'Workshop',type:'event',location:'Academy venue',mapUrl:'https://maps.google.com/?q=academy',description:'Workshop details'});
 assert.equal(normal.find(n=>n.type==='a').props.children,'View location ↗');
 const webinar=eventCard({title:'Online learning',type:'webinar',date:'2027-01-15T14:30:00.000Z',zoomUrl:'https://us02web.zoom.us/j/123?pwd=synthetic',description:'Agenda and discussion'});
 const link=webinar.find(n=>n.type==='a');assert.equal(link.props.children,'Join webinar on Zoom');assert.equal(link.props.target,'_blank');assert.equal(link.props.rel,'noopener noreferrer');assert.equal(webinar.find(n=>n.type==='time').props.dateTime,'2027-01-15T14:30:00.000Z');
 assert.ok(webinar.some(n=>n.props?.children==='Online · Zoom'));
});
test('past webinars and invalid legacy Zoom links never offer a misleading join action',()=>{
 for(const event of [{type:'webinar',date:'2025-01-15T14:30:00.000Z',zoomUrl:'https://zoom.us/j/123'},{type:'webinar',zoomUrl:'https://zoom.us.evil.invalid/j/123'}])assert.equal(eventCard(event).filter(n=>n.type==='a').length,0);
 assert.equal(events.eventDate('invalid date'),null);
});

function eventEditorFixture(initial){
 const list=hookHarness(),edit=hookHarness();let active=list;const calls=[];
 const react=Object.fromEntries(Object.keys(list.React).map(name=>[name,(...args)=>active.React[name](...args)]));
 const mod=compileModule('../components/cms/ContentCollection.tsx',{imports:{react,'react/jsx-runtime':list,'next/dynamic':{default:()=>()=>null},'../../lib/teamCategories':compileModule('../lib/teamCategories.ts'),'../../lib/events':events,'../AcademyImage':{default:'img'},'../../lib/api':{portalMediaUrl:x=>x,apiFetch:async(path,options)=>{if(options?.method){calls.push({path,method:options.method,body:JSON.parse(options.body)});return {success:true};}return {items:initial?[initial]:[],total:initial?1:0};}},'./Fields':{Field:'field',Check:'check',MediaField:'media',UploadFieldset:'fieldset',UploadContext:{Provider:'upload-provider'},clean:value=>{const {_id,...body}=value;return body;},useDirty:()=>({mayClose:()=>true})},'./AdminConfirm':{default:'confirm',adminSaved:()=>{}}},globals:{...browserGlobals(),setTimeout:(fn,ms)=>active.globals.setTimeout(fn,ms),clearTimeout:id=>active.globals.clearTimeout(id)}});
 list.mount(()=>mod.default({kind:'Events'}));
 return {calls,edit,async open(){list.run(200);await list.settle();nodes(list.tree).find(n=>n.type==='button'&&(initial?n.props.children==='Edit':String(n.props.children).includes('Add '))).props.onClick();await list.settle();let editor=list.tree;while(editor.type?.name==='FeedbackPresence')editor=editor.props.children;active=edit;edit.mount(()=>editor.type(editor.props));await edit.settle();},async field(label,value){nodes(edit.tree).find(n=>n.type==='field'&&n.props.label===label).props.onChange(value);await edit.settle();},async save(){await nodes(edit.tree).find(n=>n.type==='confirm').props.onConfirm();await edit.settle();},cleanup(){list.cleanup();edit.cleanup();}};
}
test('actual webinar editor rejects a look-alike URL before saving and submits the chosen session details',async t=>{
 const f=eventEditorFixture();t.after(()=>f.cleanup());await f.open();await f.field('Session type','webinar');await f.field('Event title','Professional webinar');await f.field('Status','published');await f.field('Webinar details','An administrator-authored agenda.');await f.field('Zoom joining link','https://zoom.us.evil.invalid/j/123');await f.save();assert.equal(f.calls.length,0);assert.ok(nodes(f.edit.tree).some(n=>n.props?.role==='alert'));
 await f.field('Zoom joining link','https://us02web.zoom.us/j/123?pwd=synthetic');await f.save();assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.type,'webinar');assert.equal(f.calls[0].body.description,'An administrator-authored agenda.');assert.equal(f.calls[0].body.zoomUrl,'https://us02web.zoom.us/j/123?pwd=synthetic');
});
test('switching an existing webinar back to an event clears the Zoom invitation',async t=>{
 const f=eventEditorFixture({_id:'event-one',title:'Existing webinar',type:'webinar',status:'draft',zoomUrl:'https://zoom.us/j/123'});t.after(()=>f.cleanup());await f.open();await f.field('Session type','event');await f.save();assert.equal(f.calls[0].method,'PATCH');assert.equal(f.calls[0].body.type,'event');assert.equal(f.calls[0].body.zoomUrl,'');
});

function exportFixture({portal='client_admin',response,changed=false}={}){
 let epoch=0,fetches=0,download,blob,revoked=false;const calls=[];
 class ApiError extends Error{constructor(message,status){super(message);this.status=status;}}
 const component=compileModule('../lib/studentExport.ts',{imports:{'./api':{API_URL:'/api',ApiError,currentPortal:()=>portal,accountEpoch:()=>epoch,boundaryMarker:()=>String(epoch),explicitlyLoggedOut:()=>false,requestHeaders:(_options,selected)=>new Headers({'X-SA-Portal':selected})}},globals:{fetch:async(url,options)=>{fetches++;calls.push({url,options});return response||{ok:true,headers:new Headers({'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="students-2026-11-06.csv"'}),blob:async()=>{if(changed)epoch++;return new Blob(['\uFEFFName,Email,Phone,Country,RegistrationDate,Status\r\nTest,test@example.invalid,,US,2026-11-06,active\r\n'],{type:'text/csv'});}};},URL:{createObjectURL:value=>{blob=value;return 'blob:students';},revokeObjectURL:()=>{revoked=true;}},document:{createElement:()=>({click(){download={href:this.href,filename:this.download};},remove(){}}),body:{appendChild(){}}},setTimeout:fn=>{fn();return 1;}}});
 return {run:()=>component.downloadStudentsCsv(),calls,get fetches(){return fetches;},get download(){return download;},get blob(){return blob;},get revoked(){return revoked;}};
}
for(const portal of ['client_admin','super_admin'])test('student export downloads all pages with server BOM and authenticated '+portal+' headers',async()=>{
 const f=exportFixture({portal});await f.run();assert.equal(f.calls[0].url,'/api/admin/students/export.csv');assert.equal(f.calls[0].options.credentials,'include');assert.equal(f.calls[0].options.cache,'no-store');assert.equal(f.calls[0].options.headers.get('X-SA-Portal'),portal);assert.equal(f.download.filename,'students-2026-11-06.csv');assert.deepEqual([...new Uint8Array(await f.blob.arrayBuffer()).slice(0,3)],[239,187,191]);assert.equal(f.revoked,true);
});
test('a changed admin session cannot download another account’s completed export',async()=>{const f=exportFixture({changed:true});await assert.rejects(f.run(),error=>error.name==='AbortError');assert.equal(f.download,undefined);});
test('failed or non-CSV exports never trigger a download',async()=>{
 const denied=exportFixture({response:{ok:false,status:403,json:async()=>({message:'Export not permitted.'})}});await assert.rejects(denied.run(),/Export not permitted/);assert.equal(denied.download,undefined);
 const html=exportFixture({response:{ok:true,headers:new Headers({'content-type':'text/html'})}});await assert.rejects(html.run(),/CSV file/);assert.equal(html.download,undefined);
});
test('export button prevents repeated clicks while awaiting the same request and reports failure',async t=>{
 const h=hookHarness();let reject,count=0;const pending=new Promise((_resolve,no)=>{reject=no;});
 const mod=compileModule('../components/business/StudentExportButton.tsx',{imports:{react:h.React,'react/jsx-runtime':h,'../../lib/studentExport':{downloadStudentsCsv:()=>{count++;return pending;}},'../../lib/api':{isAbortError:error=>error.name==='AbortError'}},globals:browserGlobals()});
 h.mount(()=>mod.default());t.after(()=>h.cleanup());const click=nodes(h.tree).find(n=>n.type==='button').props.onClick;const a=click(),b=click();await h.settle();assert.equal(count,1);assert.equal(nodes(h.tree).find(n=>n.type==='button').props.disabled,true);reject(new Error('Export temporarily unavailable.'));await Promise.all([a,b]);await h.settle();assert.equal(nodes(h.tree).find(n=>n.type==='button').props.disabled,false);assert.ok(nodes(h.tree).some(n=>n.props?.role==='alert'&&nodes(n).some(child=>child.props?.children==='Export temporarily unavailable.')));
});
