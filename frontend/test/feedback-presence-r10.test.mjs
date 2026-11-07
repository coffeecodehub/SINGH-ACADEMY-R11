import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {compileModule} from './compile.mjs';
import fs from 'node:fs';
const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),{renderToStaticMarkup}=require('react-dom/server');
const {reconcileFeedbackPresentation:reconcile}=compileModule('../lib/feedbackPresence.ts');
test('closing retains the same presentation identity and queued successors wait without delaying the decision',async()=>{
 const first={privateRecord:'first'},second={privateRecord:'second'};const initial={value:first,key:'first',scope:'owner:a',leaving:false};let resolved=false;const action=Promise.resolve().then(()=>{resolved=true;});
 const exiting=reconcile(initial,second,'second','owner:a');assert.equal(exiting.value,first);assert.equal(exiting.leaving,true);assert.equal(exiting.key,'first');await action;assert.equal(resolved,true);assert.equal(exiting.value,first);
});
test('scope invalidation drops outgoing content synchronously and idle reconciliation is stable',()=>{
 const privateRecord={record:'private'},initial={value:privateRecord,key:'one',scope:'owner:a',leaving:false};const changed=reconcile(initial,null,'','owner:b');assert.equal(changed.value,null);assert.equal(changed.leaving,false);assert.equal(changed.scope,'owner:b');assert.equal(reconcile(changed,null,'','owner:b'),changed);
});
test('reopening the same keyed presentation cancels its exit without creating another dialog identity',()=>{
 const original={record:'saved'},updated={record:'updated'},closing=reconcile({value:original,key:'one',scope:'owner:a',leaving:false},null,'','owner:a');const reopened=reconcile(closing,updated,'one','owner:a');assert.equal(reopened.value,updated);assert.equal(reopened.key,'one');assert.equal(reopened.leaving,false);
});
test('retained dialog children keep their caller React context, form identifiers and input names',()=>{
 const imports={react:React,'react/jsx-runtime':jsx},presence=compileModule('../components/feedback/FeedbackPresence.tsx',{imports}),Dialog=compileModule('../components/feedback/FeedbackDialog.tsx',{imports:{...imports,'./FeedbackPresence':presence}}).default;
 const UploadContext=React.createContext('wrong root context');function ContextField(){const upload=React.useContext(UploadContext);return React.createElement('form',{id:'caller-form'},React.createElement('label',null,upload,React.createElement('input',{name:'original-field',defaultValue:upload})));}
 const html=renderToStaticMarkup(React.createElement(UploadContext.Provider,{value:'caller upload tracker'},React.createElement(presence.default,null,React.createElement(Dialog,{open:true,title:'Contextful form',onCancel(){}},React.createElement(ContextField)))));
 assert.match(html,/caller upload tracker/);assert.doesNotMatch(html,/wrong root context/);assert.match(html,/id="caller-form"/);assert.match(html,/name="original-field"/);assert.equal((html.match(/<dialog\b/g)||[]).length,1);
});
test('ordinary business forms retain the original header/body markup and normal/wide classes through the shared primitive',()=>{
 const imports={react:React,'react/jsx-runtime':jsx},presence=compileModule('../components/feedback/FeedbackPresence.tsx',{imports}),native=compileModule('../components/feedback/FeedbackDialog.tsx',{imports:{...imports,'./FeedbackPresence':presence}});
 const {Dialog}=compileModule('../components/business/ui.tsx',{imports:{...imports,'../feedback/FeedbackDialog':native}});
 const child=React.createElement('form',{id:'original-business-form'},React.createElement('input',{name:'original-customer-field'}));
 for(const wide of [false,true]){
  const html=renderToStaticMarkup(React.createElement(Dialog,{title:'Original form title',subtitle:'Original form subtitle',onClose(){},wide},child)),label=html.match(/aria-labelledby="([^"]+)"/)?.[1];
  assert.ok(label);assert.ok(html.includes(`<h2 id="${label}">Original form title</h2>`));assert.match(html,/<dialog[^>]+class="[^"]*\bbizModal\b/);assert.equal(/\bbizModalWide\b/.test(html),wide);
  assert.match(html,/<div class="bizModalHead"><div><h2/);assert.match(html,/<p>Original form subtitle<\/p>/);assert.match(html,/<button[^>]+class="bizIconButton"[^>]+aria-label="Close dialog"/);assert.match(html,/<div class="bizModalBody"><form id="original-business-form"><input name="original-customer-field"/);
  assert.doesNotMatch(html,/saFeedbackDialogBody|saFeedbackDialogMessage|saFeedbackFormClose/);assert.equal((html.match(/<dialog\b/g)||[]).length,1);
 }
});
test('scoped business form chrome matches R9 declarations while feedback headings stay scoped to decision cards',()=>{
 const business=fs.readFileSync(new URL('../components/business/business.css',import.meta.url),'utf8'),feedback=fs.readFileSync(new URL('../components/feedback/feedback.css',import.meta.url),'utf8');
 const declarations=body=>Object.fromEntries(body.split(';').filter(Boolean).map(part=>{const at=part.indexOf(':');return[part.slice(0,at).trim(),part.slice(at+1).trim()];}));
 const original=declarations([...business.matchAll(/\.bizModal\{([^{}]+)\}/g)][0][1]),restored=declarations(feedback.match(/\.saFeedbackDialog\.bizModal\{([^{}]+)\}/)[1]);
 for(const [property,value]of Object.entries(original))assert.equal(restored[property],value,property+' must retain the R9 form value');
 assert.equal(restored['max-width'],'none','UA dialog max-width must not clamp the declared desktop/mobile form widths');
 assert.ok(feedback.includes('.saFeedbackDialog.bizModal.bizModalWide{width:min(1140px,calc(100vw - 38px))}'));assert.match(feedback,/@media\(max-width:760px\)\{\.saFeedbackDialog\.bizModal,\.saFeedbackDialog\.bizModal\.bizModalWide\{width:calc\(100vw - 20px\);max-height:calc\(100dvh - 24px\);border-radius:11px\}\}/);
 assert.ok(feedback.includes('.saFeedbackDialogBody>h2{'));assert.doesNotMatch(feedback,/\.saFeedbackDialog h2\{|\.saFeedbackFormClose\{|\.saFeedbackFormDialog \.bizModalBody\{/);
});
